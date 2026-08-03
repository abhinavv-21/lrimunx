# Cloudflare — what moves, what cannot, and what it costs

Written 3 August 2026. Every number here was measured on this repository, not
estimated. Where something is a platform limit it is linked.

---

## The short version

**The two front ends move to Cloudflare Pages and are better off there. The API
and the payment-screenshot storage cannot move on a free plan, and should stay
on Vercel for now.**

This is not a preference. It is one hard limit:

| | measured | Workers **free** budget |
| :--- | ---: | ---: |
| `bcrypt.compare` — every single sign-in | **340 ms** | **10 ms** |
| `bcrypt.hash` — creating an account | **358 ms** | 10 ms |
| the same at cost 10 instead of 12 | 79 ms | 10 ms |

Signing in costs **34× the entire free-tier CPU budget for a request**, and that
budget has to cover the whole request, not just the hash. There is no
configuration that fixes this. Lowering the bcrypt cost factor to 10 is still 8×
over, and it would weaken every stored password to buy a limit we still miss.

So: Pages now, free, permanently. API later, if there is ever $5/month.

---

## What is already true

You have deployed Cloudflare Pages against `./dist` with `npm run pages-build`.
That build composes both browser bundles and drops in `_redirects` and
`_headers` — the Pages equivalents of the rewrite and header rules in
`vercel.json`.

The Pages site talks to the **Vercel API**, by absolute URL. That is the part
that is not yet independent, and per the table above it cannot be for free.

---

## Why the static half is a genuine win

- **It is free, with no request cap that matters.** Pages static requests are
  unlimited; Vercel's Hobby plan has bandwidth limits and a commercial-use
  clause that a school conference sits awkwardly against.
- **Faster where your delegates are.** Cloudflare terminates in Kathmandu and
  across South Asia. Vercel's free tier does not give you edge control over
  which regions serve you.
- **Both deploys stay live off the same `main`.** Push once, Vercel and Pages
  both rebuild. You keep the Vercel URL as the fallback you wanted, and nothing
  has to be kept in sync by hand.
- **Better caching control.** `_headers` gives fingerprinted assets a year of
  immutable caching and keeps `/admin/*` out of search results.

## What you give up, honestly

- **Two builds to watch instead of one.** A push that breaks the build now
  breaks it in two places, and Pages reports it in a different dashboard.
- **Preview URLs work differently.** Pages builds a preview per branch. If you
  ever put the ops hub behind Cloudflare Access, previews need their own policy
  or they are public.
- **The API is still a single point of failure, and it is still Vercel's.** If
  Vercel is down, the Pages site loads and then cannot register anybody. Moving
  the static half does not buy resilience — only speed and cost.
- **CORS is now load-bearing.** The browser is on `pages.dev` and the API is on
  `vercel.app`, so every API call is cross-origin. It works because this API
  uses **bearer tokens, not cookies** — had it used cookies, this migration
  would have needed `SameSite=None`, a shared parent domain, or a CSRF rework.

---

## What the API would actually need

Recorded so the decision is not re-researched later. **None of this is worth
doing until there is a budget** — the first item alone blocks it.

### 1. A paid Workers plan — $5/month. Unavoidable.

Free gives **10 ms of CPU per invocation**; paid gives 30 seconds (up to 5
minutes). Sign-in needs ~340 ms and a PDF export needs far more. See
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

### 2. Express itself: no work at all — this was the surprise

Cloudflare now runs Node HTTP servers directly. With `nodejs_compat` and a
compatibility date of `2025-09-01` or later:

```js
import { httpServerHandler } from 'cloudflare:node'
import { createApp } from './app.js'

createApp().listen(8080)
export default httpServerHandler({ port: 8080 })
```

That is the entire port. **No Hono rewrite, no adapter, no second routing
table** — `createApp()` is already shared between the local server and the
Vercel function, so it would be shared with a third. This was the largest
assumed cost of the migration and it has evaporated.
See [Deploy an Express app](https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/)
and [node:http on Workers](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/).

### 3. Bundle size: already fine

Measured with esbuild, Node builtins external, minified and gzipped — the way
Cloudflare counts it:

```
raw       4.39 MiB
gzipped   1.28 MiB      free limit 3 MiB, paid limit 10 MiB   -> fits either way
```

Where it goes, minified:

```
1229 KiB  xlsx                    <- the single biggest thing in the API
 478 KiB  iconv-lite
 406 KiB  undici              \
 346 KiB  @vercel/cli-config   |  all three come from @vercel/blob and would
  85 KiB  jose                /   disappear with it — about 840 KiB back
 343 KiB  jspdf
 205 KiB  html2canvas         \   jsPDF's optional deps, not actually used
 121 KiB  canvg               /   for table PDFs — another ~326 KiB back
 186 KiB  @prisma/client
  64 KiB  our own code
```

Adding Prisma's WASM query engine would push this up again, but there is
several MB of headroom on the paid plan.

### 4. The database: nothing to do

`pooled.db.prisma.io` — this is **Prisma Postgres, not Vercel Postgres**. It is
already independent of both platforms. Prisma runs on Workers either through a
driver adapter over TCP (`@prisma/adapter-pg`, needs the `driverAdapters`
preview flag) or over HTTP with an Accelerate connection string.
`@prisma/extension-accelerate` is already a dependency of this repo.

Migrations would not run inside the Worker — they would run from a machine or a
CI job, as `prisma migrate deploy` against `DATABASE_URL`, exactly as
`vercel-build` does today.

### 5. Payment screenshots → R2: **also not free**

R2 is not on the Workers free plan; it starts at $0.015/GB-month plus per
operation charges. At conference scale that is pennies, but it is not zero, so
it lands on the same blocked list.

When it does happen, the recommended shape is **not** the presigned-URL flow
Vercel Blob uses. Bind the bucket to the Worker and take the upload through it:
a screenshot is a couple of MB against a 100 MB request limit, and it removes
presigning, S3 signature headers, and a whole class of R2 CORS bugs that are
easy to get wrong and hard to notice. `isBlobStorageUrl` then becomes a check
against our own host instead of `*.blob.vercel-storage.com`.

### 6. Rate limiting would need rethinking

`express-rate-limit` keeps its counters in memory, and every Worker isolate has
its own. On Workers the limits would still apply but the effective ceiling would
be higher than configured. It **fails open, not closed** — sign-ups would not
break, they would simply be less protected. The fix is Cloudflare's own rate
limiting rules at the zone level, or a Durable Object.

### 7. Web Push is unverified

`web-push` leans on Node crypto. It may work under `nodejs_compat` and may not.
VAPID keys are not configured on this project anyway, so nothing is lost today —
but it is the one item on this list nobody has tested.

---

## If you want true independence for free

The blocker is Workers' CPU limit, not Cloudflare generally. A free Node host
that runs the existing Express app unmodified would get you off Vercel without
touching the code: Render, Fly.io, Koyeb and Railway all have free tiers that
run a normal Node process, with cold starts as the trade-off. `createApp()` is
already portable, and `apps/backend/src/index.ts` already starts a real server.

That is a smaller change than the Workers port and costs nothing. **It is worth
considering before paying $5/month**, though a cold start on a free tier is a
15–30 second wait for the first delegate to hit the form after an idle period,
which is its own kind of bad on deadline night.

---

## What is guarded now

`npm run pages-build` refuses to produce a bundle that points at a development
server. This is not hypothetical: without `VITE_API_BASE_URL` the hub bakes in
`http://localhost:4000/api/v1`, deploys with a green build, and is completely
dead for every visitor with no error anywhere.

The check reads the built artifact rather than the environment variable, so it
catches a missing variable, a misspelt one, and a stale `dist/`. It also asserts
positively that the configured API base is actually present, because a typo in
the variable's *name* leaves no localhost behind either and would otherwise pass
silently.

```
$ npm run pages-build                      # no variable set
Error: This build points at a development server and would deploy dead:
  dist\admin\assets\index-dzIQ-BMW.js → http://localhost:4000

$ VITE_API_BASE_URL=https://lrimunx.vercel.app/api/v1 npm run pages-build
[pages] checked: no dev URL in the bundle, and the API base is baked in
```

---

## Still needed from you

1. **`VITE_API_BASE_URL`** in the Pages project → `https://lrimunx.vercel.app/api/v1`.
   The build now fails loudly without it rather than shipping a dead hub.
2. **`CORS_ORIGIN`** on Vercel → add your `https://<project>.pages.dev`. Until
   this is set, every API call from the Pages site is blocked by the browser and
   registration will not work.
3. **Rotate the database credential** — it was pasted into a chat transcript.
4. **Create the five missing committees** (UNHRC, DISEC, ECOSOC, WHO, HCC) with
   real seat counts. Production has only UNSC, so the matrix and allocations
   have nothing to work with.
