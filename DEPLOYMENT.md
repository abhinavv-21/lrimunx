# Deploying LRI MUN X

One repository, one Vercel project, one domain:

```
lrimun.lrischool.edu.np/          the public conference site   apps/website
lrimun.lrischool.edu.np/admin     the OC operations hub        apps/frontend
lrimun.lrischool.edu.np/api/v1/*  the API (serverless)         apps/backend
```

The site and the hub are static bundles composed into `dist/` by
`scripts/compose-static.mjs`. The API is a single serverless function at
`api/index.ts` that wraps the same Express app used in local development.
Routing between the three is in `vercel.json`.

---

## Before the first deploy

### 1. A database that survives serverless

This is the one piece Vercel does not give you by accident, and the one most
likely to bite.

Serverless means many short-lived instances, each opening its own Postgres
connection. A normal Postgres accepts ~100 total; a traffic spike on the
registration form will exhaust them and every request starts failing at once.
**`DATABASE_URL` must point at a pooled connection**, not directly at Postgres.

Any of these work:

| Option | What to use for `DATABASE_URL` |
| :--- | :--- |
| Vercel Postgres (Neon) | The `POSTGRES_PRISMA_URL` it gives you — already pooled |
| Neon direct | The **pooled** connection string (`-pooler` in the host) |
| Supabase | The connection-pooling string on port `6543`, not `5432` |
| Your school's Postgres | Put PgBouncer in front of it in transaction mode |

For Prisma against PgBouncer or Neon's pooler, append
`?pgbouncer=true&connection_limit=1` to the URL.

Migrations are different — they need a *direct* connection. Run them from your
machine against the direct URL, never from the serverless function:

```bash
DATABASE_URL="<direct-url>" npx prisma migrate deploy
```

### 2. Environment variables

Set these in Vercel → Project → Settings → Environment Variables. Everything in
`.env.example` is documented; these are the ones that differ in production.

| Variable | Production value |
| :--- | :--- |
| `DATABASE_URL` | the **pooled** string from above |
| `JWT_SECRET` | a fresh 48-byte random string — not the one from your laptop |
| `JWT_REFRESH_SECRET` | a different fresh 48-byte random string |
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `1` — Vercel is one hop. Without it the rate limiter keys on the wrong address; with it set too high, a caller can forge their own |
| `CORS_ORIGIN` | `https://lrimun.lrischool.edu.np` |
| `VITE_API_BASE_URL` | `/api/v1` — same origin, so no host is baked into the bundle |
| `GOOGLE_SHEETS_WEBHOOK_SECRET` | a fresh random string |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | from `npx web-push generate-vapid-keys` |
| `VITE_VAPID_PUBLIC_KEY` | the same public key |

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

**Do not reuse the development secrets.** Anyone holding `JWT_SECRET` can mint a
valid admin token without a password.

`VITE_`-prefixed variables are compiled into the browser bundle and are public
by definition. Never put a secret behind that prefix.

### 3. The blob store, and why it is private

Payment screenshots go to Vercel Blob. Create the store from the project's
**Storage** tab; Vercel sets `BLOB_STORE_ID` and `BLOB_WEBHOOK_PUBLIC_KEY` for
you and authenticates the function by OIDC, so there is no long-lived token to
store anywhere. Nothing else needs setting — `BLOB_ACCESS` defaults to
`private`, which is what a store created that way is.

Create it **private**. A payment screenshot is a transaction record with an
account name and a number on it, and a public store hands one to anybody who
ends up holding the URL — forever, since the URL never expires. Private means:

- the file lands on `<store>.private.blob.vercel-storage.com` and returns 401 to
  an unauthenticated fetch;
- the ops hub asks `GET /api/v1/registrations/:id/payment-proof` for a signed
  URL when a reviewer presses **View screenshot**, and that URL dies after ten
  minutes;
- a link copied out of the network tab is worthless by the time it is pasted.

If you ever do run a public store, set `BLOB_ACCESS=public`. It is not cosmetic:
the two access levels serve from different hosts, and the check that decides
whether a submitted URL belongs to us keys off this value.

The store is also pinned by id. Without that, a URL on *someone else's* Vercel
Blob store — which any account can create in a minute — would satisfy the host
check, and the public form would be a way to put an attacker-hosted image in
front of the admin who approves registrations.

Local development has no store, and that is a supported state: the upload route
answers 503 and the form works without a screenshot.

### 4. Two build settings that are not obvious

**`installCommand` is `npm install --include=dev`.** `NODE_ENV=production` is
right for the function runtime, but npm omits devDependencies whenever it is
set — and TypeScript and Vite are devDependencies. The default install produces
a tree with no compiler, and the build fails with `tsc: command not found`.

**`vercel.json` rejects unknown keys**, including `//`-prefixed comment keys
that are legal in most JSON tooling. Explanations go here, not in that file.

### 5. Vercel project settings

- **Framework preset:** Other
- **Build command:** leave blank — `vercel.json` sets `npm run vercel-build`
- **Output directory:** leave blank — `vercel.json` sets `dist`
- **Node version:** 20 or later

### 6. The first admin account

There is no signup page, by design. The first account has to be created
directly against the production database from your machine:

```bash
DATABASE_URL="<direct-url>" npm run seed
```

Then sign in at `/admin` and immediately change the password. Create the rest
of the OC accounts from the Users screen.

---

## Who can reach what

| Surface | Who |
| :--- | :--- |
| `/` and the registration form | anyone |
| `POST /api/v1/public/register` | anyone, rate limited, honeypot |
| `/admin` and everything under it | an OC account |
| every other `/api/v1/*` route | a valid access token, role checked per route |

The guarantee that matters: **a public registration creates a `Registration`,
and on approval a `Delegate`. It never creates a `User`.** There is no code path
from the public form to an account. `/admin` is served on its own path with
`noindex`, but that is tidiness — the real boundary is server-side RBAC on every
route, which does not care what path the request came from.

---

## Local development

Three servers. Postgres must be up first — see [RUNNING.md](./RUNNING.md).

```bash
npm run dev:backend    # API        localhost:4000
npm run dev:frontend   # ops hub    localhost:5173/admin
npm run dev:website    # public     localhost:5174
```

Note the ops hub now lives under `/admin` in dev too, so its base path matches
production and the difference never surprises you at deploy time.

The website already ships `apps/website/.env.development` pointing at the dev
API, and `CORS_ORIGIN` defaults to both front-end ports, so this works with no
setup. Note that the API reads `.env` at startup only — after changing it,
restart the backend; `tsx watch` reloads on `.ts` changes, not on `.env`.

---

## Worth knowing before you commit to Vercel

**The Hobby plan forbids commercial use.** A school conference that charges a
delegate fee sits in a grey area, and the enforcement action is suspension —
which would take the registration form down mid-window. If you are collecting
fees, read Vercel's current terms or budget for the Pro tier. This is a
licensing question, not a technical one, and it is worth resolving before the
form goes live rather than after.

**Free-tier databases sleep.** Neon and Supabase free tiers idle out after
inactivity, and the first request afterwards pays a cold start of several
seconds. Fine while building; noticeable to a delegate submitting a form.

**Nothing here is Vercel-specific except `vercel.json` and `api/index.ts`.**
The app is a plain Express server and two static bundles. When the school server
is ready, `npm run build` and `node apps/backend/dist/index.js` behind nginx
serves the identical thing — the migration path is deliberately short.
