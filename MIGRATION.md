# Moving off Vercel

> **Read [CLOUDFLARE.md](./CLOUDFLARE.md) first — it supersedes this document
> where the two disagree.**
>
> Three things changed after this was written:
>
> 1. **Vercel is being kept**, as a backup that keeps receiving updates. So
>    `api/index.ts`, `vercel.json` and `scripts/build-vercel.mjs` are NOT
>    deleted — the table below saying "deleted, not ported" is out of date. The
>    Cloudflare build lives beside them as `npm run pages-build`.
> 2. **The Pages half is done.** `deploy/cloudflare/_redirects` and `_headers`
>    exist, and §4 below is built rather than planned.
> 3. **The API cannot go on Cloudflare Workers on a free plan.** Measured:
>    signing in costs 340 ms of CPU against a 10 ms free-tier budget. The
>    "Node host" this document recommends is still the right answer, and
>    CLOUDFLARE.md lists the free ones.

Written against the repository as it stands, not from a template — every file
path below is real and every claim was checked.

Two destinations are covered because they are the same journey:

1. **Cloudflare Pages + a Node host**, which you could do this month.
2. **The school server**, later.

Step for step, they are ~80% the same work. Do the first and the second stops
being a migration and becomes a DNS change.

---

## 1. What is actually tied to Vercel

Less than it feels like. The inventory, in full:

| Thing | Where | Portable? |
| :--- | :--- | :--- |
| `@vercel/blob` | `apps/backend/src/lib/blob.ts`, `routes/public.routes.ts`, `routes/registrations.routes.ts`, `apps/website/src/modules/payment-upload.js` | **No.** The only real lock-in. |
| Serverless entry | `api/index.ts` → `apps/backend/dist/serverless.js` | Deleted, not ported. |
| Routing / headers | `vercel.json` | Rewritten as Cloudflare `_redirects` + `_headers`. |
| Static composition | `scripts/build-vercel.mjs` | Splits in two. |
| Client IP | `x-vercel-forwarded-for` in `public.routes.ts:79` | One line. See §7. |

And what is **already portable**, which is the encouraging half:

- **The database.** `prisma/schema.prisma` is plain `provider = "postgresql"`
  reading `env("DATABASE_URL")`. No Vercel Postgres API, no Accelerate client.
- **The server.** `apps/backend/src/index.ts` is a normal long-lived Express
  server with `listen()` and SIGTERM handling — it already exists and is what
  you run in development. Only `serverless.ts` is the odd one out.
- **Auth.** JWT in an `Authorization` header. **There are no cookies anywhere in
  the backend.** This is why splitting the API onto another origin is cheap for
  you and expensive for most projects — no `SameSite=None`, no cookie domain,
  no CSRF rework. Just `CORS_ORIGIN`.
- **The public site.** `apps/website/vite.config.js` uses `base: './'`, so its
  assets resolve relative to wherever the document is served from. It does not
  care what origin or path it lands on.

---

## 2. Do storage first, and do it once

`@vercel/blob` is the only thing that has to be rewritten, and it has to be
rewritten *whatever* you move to — Cloudflare, Render, or the school's own box.

So write it against the **S3 API** rather than against any one provider.
Cloudflare R2 speaks S3. So does MinIO, which is what you would run on a school
server. So does every other object store you might ever be handed. Do it once
and the same code runs on Vercel today, on Cloudflare tomorrow, and in the
school's server room next year with a different `S3_ENDPOINT` and nothing else.

This is the single highest-value step on the page. Everything after it is
configuration.

### 2.1 What to install

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner --workspace apps/backend
npm uninstall @vercel/blob --workspace apps/backend --workspace apps/website
```

### 2.2 What each call becomes

| Now | Then |
| :--- | :--- |
| `issueSignedToken({operations:['put']})` + `handleUploadPresigned` | `getSignedUrl(s3, new PutObjectCommand({Bucket, Key, ContentType}), {expiresIn: 1800})` |
| `issueSignedToken({operations:['get']})` + `presignUrl` | `getSignedUrl(s3, new GetObjectCommand({Bucket, Key}), {expiresIn: 600})` |
| `uploadPresigned(...)` in the browser | `fetch(signedUrl, {method: 'PUT', body: file})` |

`lib/blob.ts` becomes the S3 client singleton instead of the auth-options
helper. Everything the routes do stays the same shape: the upload route hands
out a short-lived credential, the review route hands out a short-lived read.

### 2.3 Three things that genuinely change — decide these before you start

**a. The upload protocol becomes yours.** Today the browser and the server speak
the `@vercel/blob` client protocol (`blob.generate-presigned-url`,
`blob.upload-completed`). With S3 there is no protocol to speak: your endpoint
takes `{filename, contentType}` and returns `{uploadUrl, key}`. Simpler, and
`isHandleUploadBody` / `BLOB_EVENT_TYPES` in `public.routes.ts` disappear.

**b. Size can no longer be enforced by the credential.** A presigned `PUT`
signs the method, key and content type — not the length. `MAX_UPLOAD_BYTES` is
currently enforced *by the token*, so a client cannot exceed it. Afterwards you
get two weaker options, and should do both:

- refuse oversized files in `payment-upload.js` before requesting a URL
  (already there — it is the courtesy check, not the gate);
- `HeadObjectCommand` after the upload, server-side, and reject the
  registration if the object is too big.

Do not skip the second. The first is a client-side check and clients lie.

**c. Store the KEY, not the URL.** `Registration.paymentProofUrl` currently
holds a URL, and `isBlobStorageUrl()` in `apps/backend/src/schemas/index.ts`
guards it because a public form must never put an attacker-chosen link in front
of an admin. With signed reads the URL is generated fresh each time and is
worthless stored, so the column should hold the object key
(`payment-proof-9Kq2LmR4.png`) and the validator should check it is a plain key
this deployment could have issued — no scheme, no host, no `..`.

That is a schema change. **`prisma/schema.prisma` needs explicit sign-off before
anyone touches it** (project rule), and the migration is additive: add
`paymentProofKey`, backfill from the existing URLs, drop the old column in a
later migration once nothing reads it.

### 2.4 Progress bar

`payment-upload.js` draws an upload progress bar from
`onUploadProgress`. `fetch()` cannot report request progress. Either use
`XMLHttpRequest` (which can — `xhr.upload.onprogress`) or replace the bar with
an indeterminate spinner. XHR is fifteen lines and keeps the behaviour.

---

## 3. Split the deploy

Right now `scripts/build-vercel.mjs` composes three surfaces into one origin.
Only one of them needs a server:

```
apps/website     static files   →  Cloudflare Pages
apps/frontend    static files   →  Cloudflare Pages (under /admin)
apps/backend     needs Node     →  a container host
```

Cloudflare Pages runs **workerd, not Node**, so the API cannot go there —
Express, `express-rate-limit` and Prisma all assume Node. But static assets do
not run code, so the objection does not apply to the other two. You get
Cloudflare's free unlimited bandwidth for the bulk of the traffic and only need
a small paid box for the API.

Keep `build-vercel.mjs` — the composed `dist/` tree (site at the root, hub at
`/admin/`) is exactly what Pages wants to serve. Only the API leaves it.

---

## 4. Cloudflare Pages — the static half

1. **Create the project.** Connect the GitHub repo.
   - Build command: `npm run build --workspace apps/website && npm run build --workspace apps/frontend && node scripts/build-vercel.mjs`
   - Output directory: `dist`
   - Set **`NPM_FLAGS=--include=dev`**. Same trap as Vercel: `NODE_ENV=production`
     makes npm skip devDependencies, and Vite is one.

2. **Build-time env.** Only `VITE_`-prefixed variables matter here, and they are
   compiled into the bundle:
   - `VITE_API_BASE_URL` — now an absolute URL, e.g. `https://api.lrimun.lrischool.edu.np/api/v1`.
     Note it includes `/api/v1`; both the hub and the site read it that way
     (`apps/website/src/modules/register-page.js:47`).
   - `VITE_VAPID_PUBLIC_KEY` — unchanged.

3. **Translate `vercel.json` → `apps/website/public/_redirects`.** Cloudflare
   reads this file from the output root. The `/api/*` rewrite is gone — the API
   is a different origin now.

   ```
   /register        /register.html   200
   /admin           /admin/index.html 200
   /admin/*         /admin/index.html 200
   ```

   `200` means rewrite, not redirect. Order matters: first match wins, so keep
   the more specific rules above the wildcards. Cloudflare serves real files
   before consulting `_redirects`, so `/admin/assets/*` still resolves normally
   and needs no exclusion — the negative lookahead in the current `vercel.json`
   exists only because Vercel behaves differently.

4. **Translate the headers → `apps/website/public/_headers`.**

   ```
   /admin/*
     X-Robots-Tag: noindex, nofollow
     X-Frame-Options: DENY
     Referrer-Policy: same-origin

   /assets/build/*
     Cache-Control: public, max-age=31536000, immutable

   /admin/assets/*
     Cache-Control: public, max-age=31536000, immutable
   ```

Verify after deploying: `/`, `/register`, `/admin`, a deep link like
`/admin/delegates` (SPA fallback), and that `/admin` really carries the
noindex header.

---

## 5. The API — the half that needs Node

**Delete `api/index.ts`** and run `apps/backend` as the server it already is.
`npm run build --workspace apps/backend && node apps/backend/dist/index.js`.
`serverless.ts` can stay; it costs nothing and documents the other shape.

Whichever host you pick, the shape is the same:

- Build: `npm install --include=dev && npx prisma generate && npm run build --workspace apps/backend`
- Start: `node apps/backend/dist/index.js`
- Health check path: **`/health`**, not `/api/v1/health` — the versioned paths
  sit behind auth and answer 401.
- Port: reads `PORT` (`apps/backend/src/config/env.ts`), which every host sets.

Candidates, honestly:

| Host | Verdict |
| :--- | :--- |
| **Render** | Best fit. Runs the long-lived process natively. **Take the paid tier (~$7/mo)** — free web services cold-start 30–50s, which is unacceptable for a registration form, and free Postgres expires at 90 days. |
| **Google Cloud Run** | 2M requests/month free, real Node in a container, ~1–2s cold start. Good if you want managed-but-portable. Needs a Dockerfile. |
| **Oracle Cloud Always Free** | A genuinely free forever VM. **This is a rehearsal for the school server** — same nginx, same systemd, same TLS, same backups. Take it only if someone after you can maintain a Linux box. |
| **Fly.io / Koyeb** | Fine. No advantage over the above for this shape. |

### 5.1 Drop the serverless-only tuning

Two things exist purely because of Vercel and become wrong on a real server:

- **`?pgbouncer=true&connection_limit=1`** on `DATABASE_URL`. A single
  long-lived process wants a normal pool, not one connection.
- The global Prisma singleton in `lib/prisma.ts` stops being load-bearing. Leave
  it — it is harmless and correct either way.

---

## 6. Cutover

1. Deploy the API first, on its own subdomain (`api.lrimun.…`), with
   `CORS_ORIGIN` set to the Pages URL and `TRUST_PROXY=1`.
2. `curl https://api.…/health` → `{"status":"ok",…}`.
3. Deploy Pages with `VITE_API_BASE_URL` pointing at it.
4. Test in this order, because each depends on the last:
   - the public site loads;
   - **a real registration goes through** — this exercises CORS, rate limiting,
     and the client-IP change together;
   - **a screenshot uploads** — this is the new storage path;
   - `/admin` login;
   - **the screenshot is viewable in the review queue** — the signed read.
5. Move DNS. Keep the Vercel project alive for a week; it is your rollback.

---

## 7. Things that will bite

**The client IP.** `clientAddress()` in `public.routes.ts:79` prefers
`x-vercel-forwarded-for` because it is the one header Vercel sets and a client
cannot forge. That header does not exist anywhere else. Behind Cloudflare the
equivalent is **`cf-connecting-ip`**; behind your own nginx it is whatever nginx
sets. Get this wrong and every visitor shares one rate-limit bucket, or worse,
each request gets a fresh one and the limiter does nothing. It is one line, and
it is the single easiest thing on this page to forget.

**`CORS_ORIGIN` is a comma-separated allowlist** (`app.ts:20`) with
`credentials: true`. It needs the exact scheme and host, no trailing slash. A
CORS failure looks like "the form does nothing when I press send" — silent in
the UI, loud in the browser console.

**Migrations still need a direct connection.** `npx prisma migrate deploy` run
from your machine against the direct URL, never from the app. Same as today.

**Get a direct Postgres string before you need it.** For a `pg_dump` off Prisma
Postgres you need a real connection string, not the accelerated proxy URL. Some
managed providers only expose the proxy, and you find out on the day.

**`JWT_SECRET` and `JWT_REFRESH_SECRET` must carry across**, or every OC session
invalidates at cutover. Harmless, confusing, avoidable.

**Vite dev resolves extensionless paths** (`/register` → `register.html`) and so
does Cloudflare via `_redirects`. Nothing else does automatically. If you ever
serve the built site from plain nginx, that rule has to be written by hand — see
§8.

---

## 8. Later: the school server

If you have done everything above, this is what is left. Note how much is
already done.

**Same as before, no work:**

- The database. `pg_dump` → `pg_restore` → change `DATABASE_URL` → drop the
  pgbouncer params → `npx prisma migrate deploy` replays the history. Zero code
  changes.
- Storage. Point `S3_ENDPOINT` at **MinIO** running on the same box. The code
  written in §2 does not change.
- The API. `node apps/backend/dist/index.js` under systemd or pm2.
- The static files. `nginx` serving `dist/`.

**New, and genuinely yours now:**

1. **Verify the network before committing to anything else.** School firewalls
   routinely block inbound 443, and the connection may have a dynamic IP. Prove
   you can serve the public internet first. This kills more self-hosting plans
   than every technical problem combined.
2. **Backups.** A `pg_dump` cron writing off-site, and a *tested* restore. Your
   host does this invisibly today. The day it becomes your job is the day it
   stops happening.
3. **TLS.** Caddy does this with no configuration; nginx + certbot needs a renewal
   cron. Prefer Caddy unless someone insists.
4. **The nginx rewrite rules** — the `_redirects` from §4 by hand:
   ```nginx
   location = /register { try_files /register.html =404; }
   location /admin/ { try_files $uri $uri/ /admin/index.html; }
   ```
5. **`TRUST_PROXY=1`** and the client-IP header from §7, again, for your proxy.
6. **Who runs it after you.** Write this down somewhere that is not your head.
   A student-run conference inherits its infrastructure every year, and a box
   only one person understands is a box that dies with their graduation.

---

## 9. Doing nothing is also an option

Vercel Pro is $20/month and closes the licensing question with zero migration,
zero rewrite, and the storage work from §2 unnecessary. Framed to advisors as
*insurance against the site going down during registration week*, it is a much
easier ask than "hosting costs money."

The risk being priced is suspension mid-registration-window — low probability,
high blast radius. If your advisors read that risk differently, so does the
maths.

If you are leaving anyway: **do it in a quiet month, not the month before the
conference.**
