# LRI MUN X — what is left, and who does it

Everything in here needs a human. Code work is tracked separately; this is the list
of things I cannot do for you, either because they need your accounts or because
only you have the information.

Ordered by what blocks what. Section 1 blocks having somewhere to test. Section 3
blocks opening registration. Section 4 is content that can land any time before
launch.

- [Part 1 — Vercel](#part-1--vercel-test-and-preview-deployment)
- [Part 2 — Local database](#part-2--a-database-for-local-development)
- [Part 3 — Money and registration](#part-3--money-and-registration)
- [Part 4 — Content](#part-4--content)
- [Part 5 — Before launch](#part-5--before-you-open-registration)
- [Part 6 — Oracle](#part-6--oracle-later)

---

# Part 1 — Vercel test and preview deployment

Oracle is still the real deployment. This is so you have somewhere reliable to test
until that VM exists. See `SETUP.md` section 19 for why the two are shaped
differently.

Your project already exists: **`lrimunx`**, under the **`ephi`** account, on the
Hobby plan. It was linked with the Vercel CLI at some point but never configured,
which is why nothing has deployed yet.

## 1.1 Already done, do not redo

The project is linked and I have already cleaned it up and configured most of it
through the Vercel CLI using your existing session. No token changed hands.

**Committed to the repository:**

| File | Purpose |
| :--- | :--- |
| `vercel.json` | Routing. `/api/v1/*` and `/health` to the function, `/admin/*` to the hub, `/register` to the registration page, everything else served from `dist/`. |
| `api/index.ts` | Wraps the Express app as a serverless function. |
| `package.json` → `vercel-build` | `prisma generate && prisma migrate deploy && npm run build` |

**Removed from the project:**

- The **Prisma Postgres** store `lri-mun-x`, and its `DATABASE_PRISMA_DATABASE_URL`
  and `DATABASE_POSTGRES_URL` variables. This is what was blocking Neon: it had
  already claimed the `DATABASE` prefix.
- Two half-created **Neon** databases, `neon-citron-house` and `lrimunx-db`. Both
  were connected to no project. Nothing now holds the `DATABASE` prefix, so
  creating a fresh one will not hit the conflict again.
- `BLOB_WEBHOOK_PUBLIC_KEY` and `BLOB_STORE_ID`. Payment screenshots go through
  an S3-compatible API and Vercel Blob is not S3-compatible, so nothing read them.
- `NODE_ENV`. Vercel sets this itself, and a hardcoded `production` would have
  been wrong on preview deployments.
- Ten old deployments, all from before `vercel.json` existed.

**Already set, verified:**

| Key | Value |
| :--- | :--- |
| `SERVE_STATIC` | `false` (Production, Preview, Development) |
| `CORS_ORIGIN` | `https://lrimunx.vercel.app` (Production, Preview) |
| `TRUST_PROXY` | `1` |
| `VITE_API_BASE_URL` | `/api/v1` |
| `JWT_SECRET`, `JWT_REFRESH_SECRET`, `GOOGLE_SHEETS_WEBHOOK_SECRET` | set 19 days ago, left alone |
| `SEED_ADMIN_USERNAME` | `abhinav` |
| `SEED_ADMIN_PASSWORD`, `DANGER_RESET_PASSPHRASE` | set, left alone |

So sections 1.3 and 1.4 below are mostly **already done**. What is left is the
database.

### One leftover I could not finish

- [ ] **Delete the `lrimunx-blob` Blob store.** Two clicks, and the order
      matters.

      **https://vercel.com/ephi/~/stores/blob/store_9mlCqNa8wYTMsTOe**

      1. Delete the single file it holds (1 blob, 72 KB).
      2. Then **Settings → Delete Store**.

      Deleting the store first returns `409 Blob store not empty`.

      I could not do this from the CLI. Every write route (`empty-store`,
      `signed-token`, `delete`) needs a Blob read-write token, that token is only
      issued when the store is connected to a project, and I disconnected it
      during the cleanup. Reconnecting is dashboard-only, so it is circular.

      Purely tidiness. It is disconnected from the project and costs nothing
      where it is.

## 1.2 Create the database — THIS IS THE MAIN THING LEFT

Vercel has no database of its own, and a serverless function has no local
PostgreSQL. You need a hosted one. The old Prisma Postgres store is deleted, so
the `DATABASE` prefix is now free and Neon will not conflict.

1. Go to **https://vercel.com/ephi/lrimunx**
2. **Storage** tab → **Create Database** → **Neon**, free plan.
3. Name it `lrimunx-db`. Pick the region closest to Nepal on offer, usually
   **Singapore** or **Frankfurt**.
4. Connect it to **lrimunx**, across **Production, Preview and Development**.
5. When it asks for a **Custom Prefix**, leave it as **`DATABASE`**. The app reads
   `DATABASE_URL` by that exact name (`apps/backend/src/config/env.ts`), so any
   other prefix means copying values by hand afterwards.

   It should no longer complain. If it somehow still does, there is another
   leftover: **Settings → Environment Variables**, delete whatever `DATABASE_URL`
   it names, then come back.

### Then fix the connection strings

This is the step most likely to bite you, and it is not optional.

Every serverless cold start opens its own database connection. Without pooling, a
handful of simultaneous requests exhausts Neon's connection limit and requests
start failing rather than queueing.

The integration writes several variables. Two matter: the **pooled** one, whose
hostname contains `-pooler`, and the **unpooled** one, usually suffixed
`_UNPOOLED`.

1. **`DATABASE_URL`** must be the **pooled** string, with this appended:
   ```
   &pgbouncer=true&connection_limit=1
   ```
   Finished, it looks like:
   ```
   postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=1
   ```

2. **`DIRECT_URL`** must be the **unpooled** string, with nothing appended.

   `prisma migrate deploy` runs during the build, takes an advisory lock, and
   cannot hold one through a transaction-mode pooler. Against the pooled URL it
   hangs forever with no explanation.

**`DIRECT_URL` is required everywhere, not just here.** `prisma/schema.prisma`
declares `directUrl`, and Prisma treats that as mandatory with no fallback to
`url`: unset it fails with `P1012`, and empty it fails with "You must provide a
nonempty direct URL". On Oracle and on your own machine, where there is no
pooler, set it to **exactly the same value** as `DATABASE_URL`. Only here do the
two differ.

## 1.3 Generate the secrets

Run each of these **separately** on your machine. Each one produces a different
value. Do not reuse one for two variables.

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Run it three times and keep the three outputs. They are for `JWT_SECRET`,
`JWT_REFRESH_SECRET` and `GOOGLE_SHEETS_WEBHOOK_SECRET`.

`JWT_SECRET` and `JWT_REFRESH_SECRET` **must be different from each other**. The
server refuses to start if either is shorter than 32 characters or still begins
with `replace-me`.

## 1.4 Paste the environment variables

**Where:** https://vercel.com/ephi/lrimunx → **Settings** → **Environment
Variables** → **Add New**.

For each row: type the **Key** exactly as written, paste the **Value**, and tick
the environments listed. Then click **Save**.

### Required. The server will not boot without all four.

| Key | Value | Environments |
| :--- | :--- | :--- |
| `DATABASE_URL` | The pooled Neon string from 1.2 | already set by the integration, just edit it |
| `DIRECT_URL` | The non-pooled Neon string from 1.2 | Production, Preview, Development |
| `JWT_SECRET` | First output of the command in 1.3 | Production, Preview, Development |
| `JWT_REFRESH_SECRET` | Second output, different from the first | Production, Preview, Development |
| `GOOGLE_SHEETS_WEBHOOK_SECRET` | Third output. **Required even though you are not using Google Sheets.** The server validates it at boot with no default. | Production, Preview, Development |

### Required for this to behave correctly on Vercel

| Key | Value | Why |
| :--- | :--- | :--- |
| `SERVE_STATIC` | `false` | Vercel serves the built files. If the function also tries to, the site 404s while the API keeps working, which is a confusing way to find out. |
| `TRUST_PROXY` | `1` | Vercel is a proxy hop. Left at `0`, every registration looks like it came from one IP, and the rate limiter (5 per 15 minutes per IP) locks out everyone at once after the fifth person registers anywhere in the world. |
| `VITE_API_BASE_URL` | `/api/v1` | Compiled into the browser bundle at build time, not read at runtime. If it is wrong you must rebuild, not just change the variable. |
| `CORS_ORIGIN` | `https://lrimunx.vercel.app` | Your production URL. Add more comma-separated with no spaces if you use a custom domain. |

All four: tick **Production, Preview, Development**.

### Optional. Everything works without these, with a stated limitation.

| Key | Value | If you leave it out |
| :--- | :--- | :--- |
| `SEED_ADMIN_USERNAME` | `abhinav` | No admin account is created. See 1.6. |
| `SEED_ADMIN_PASSWORD` | something long you will change immediately | as above |
| `S3_ENDPOINT` `S3_BUCKET` `S3_ACCESS_KEY_ID` `S3_SECRET_ACCESS_KEY` `S3_REGION` | see below | Payment screenshot upload answers 503. The form says so and registration still completes, but nobody can prove they paid. |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASSWORD` `SMTP_FROM` | see below | Approving a registration works, and the hub says plainly that no email was sent rather than pretending one was. |
| `VAPID_PUBLIC_KEY` `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` | Push notifications are off. |
| `DANGER_RESET_PASSPHRASE` | anything non-empty | The clear-all-data and restart-conference endpoints are disabled entirely. Leave empty until you want them. |

**For payment screenshots on Vercel**, the simplest free option is Cloudflare R2 or
Supabase Storage. You will move to Oracle Object Storage later, and the four
variables are the same shape either way, so nothing in the code changes. Set
`S3_REGION` to `auto` for R2, and to the real region id for Oracle.

**For email**, Gmail or Google Workspace works: `SMTP_HOST=smtp.gmail.com`,
`SMTP_PORT=587`, `SMTP_SECURE=false`, and an **app password** from the Google
account security page. A normal account password will not authenticate, and you
need 2FA switched on to generate one.

## 1.5 Deploy

```bash
git add -A
git commit -m "Vercel configuration"
git push
```

Vercel builds on push. Watch it at **https://vercel.com/ephi/lrimunx** →
**Deployments** → click the running one → **Building**.

The build runs `prisma generate`, then `prisma migrate deploy` (which creates every
table in the Neon database), then builds all three workspaces.

**Expect the first build to take three or four minutes.** Later ones are faster.

## 1.6 Create the first account

The Vercel build deliberately does **not** create accounts. A build container
should not be writing users into your database.

Run it from your own machine, pointed at the Neon database:

```bash
# from the repository root
DATABASE_URL="<your non-pooled Neon string>" \
SEED_ADMIN_USERNAME="abhinav" \
SEED_ADMIN_PASSWORD="<something long>" \
node scripts/bootstrap-admin.mjs
```

This creates the admin account **and all 12 committees**. It is safe to re-run: it
skips the account if any account exists, and never modifies a committee that is
already there.

## 1.7 Check it actually works

Replace the host with your deployment URL:

```bash
curl -I  https://lrimunx.vercel.app/            # 200, text/html
curl -I  https://lrimunx.vercel.app/admin       # 200, text/html
curl     https://lrimunx.vercel.app/health      # {"status":"ok",...}
curl -I  https://lrimunx.vercel.app/register    # 200, text/html
```

Then in a browser:

- [ ] The landing page loads and the committee rail shows 12 cards.
- [ ] Clicking **Details** on a committee opens the dialog.
- [ ] **Apply** from the dialog lands on `/register` with that committee preselected.
- [ ] `/admin` loads the login page.
- [ ] You can sign in with the account from 1.6.
- [ ] The hub's Committees page lists all 12.

## 1.8 If something is wrong

**Build fails at `prisma migrate deploy`, or hangs.** `DIRECT_URL` is missing or is
pointed at the pooled string. See 1.2.

**Site loads but every API call fails.** `VITE_API_BASE_URL` was not set when the
bundle was built. Set it, then **redeploy** — changing the variable alone does
nothing, because it is compiled in. Deployments → the latest → the three-dot menu →
**Redeploy**.

**Function returns 500 immediately on every request.** Almost always a missing
required variable. Check **Deployments → your deployment → Functions → Logs**. The
server names the exact variable in the error.

**Everything 404s except the API.** `SERVE_STATIC` is `true`. It must be `false` on
Vercel.

**Rate limiting blocks everyone after five registrations.** `TRUST_PROXY` is `0`.

---

# Part 2 — A database for local development

**Mostly done. One thing left for you.**

PostgreSQL 17 is now installed at `C:\Program Files\PostgreSQL\17`, the `munx`
role and `lri_mun_x` database exist with the credentials already in your `.env`,
and every migration has been applied.

The payoff: the **49 integration tests that used to skip silently now actually
run**. That matters, because `npm run verify` was reporting green while never
exercising a single API route. It immediately surfaced two real failures that had
been invisible.

## 2.1 The one thing you need to do

**PostgreSQL is not registered as a Windows service.** The winget package installed
incomplete the first time (binaries with no `lib` directory, so `initdb` failed on a
missing `dict_snowball`), and the repair install that fixed it did not register the
service either. I started the server by hand, so **it will not come back after a
reboot**.

Pick one.

**Option A, register the service.** Run this once, in a terminal opened as
Administrator:

```powershell
& "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe" register -N postgresql-x64-17 -D "C:\Program Files\PostgreSQL\17\data" -S auto
Start-Service postgresql-x64-17
```

Then it starts with Windows and you never think about it again.

**Option B, start it when you need it.** Add this to whatever you use to start
work:

```powershell
& "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe" -D "C:\Program Files\PostgreSQL\17\data" -l "$env:TEMP\pg-lrimunx.log" start
```

Either way, check it is up with:

```bash
"/c/Program Files/PostgreSQL/17/bin/pg_isready" -h localhost -p 5432
```

## 2.2 How to tell it is working

Run `npm run verify` and look for this line:

```
[integration] Skipping the API integration suite — PostgreSQL is unreachable
```

**If you see it, the database is down** and the 49 route tests did not run, no
matter how green the summary looks. If the line is absent, they ran.

The superuser password is `postgres`, for `psql -U postgres`. Change it if you
care; nothing in the project uses it, since the app connects as `munx`.

## 2.3 Optional: use Node 20 or 22 locally

The backend suite crashes on exit about one run in fifteen with `Error: Worker
exited unexpectedly`. Every test passes first, then the process segfaults during
teardown. It is Prisma 5.22's native engine against Node 24, which is newer than
that Prisma release supports.

It does not affect anything you deploy, because Oracle and Vercel both run Node
20. If the noise bothers you, install Node 20 LTS and use it for this project.
Otherwise just re-run, after checking the output says `Worker exited` rather than
naming a failing test.

## 2.4 The alternative, if you would rather not run one locally

Point `DATABASE_URL` in your local `.env` at the **non-pooled** Neon string from
Part 1. Nothing to install and nothing to keep running. The tests namespace and
clean up their own fixtures, but if that makes you uneasy, create a second free
Neon database called `lrimunx-test` and point local `.env` at that instead.

# Part 3 — Money and registration

Nothing here can be guessed and all of it blocks opening registration.

- [ ] **The four price amounts, in NPR.** Base, Internal (LRI's own students),
      Alumni, and the single flat Discount rate. These go into the hub's settings
      once that screen is built, not into code.
- [ ] **Replace `apps/site/assets/payment-qr.svg`** with the real, scannable code.
      The current file is a deliberate stand-in with the word PLACEHOLDER drawn
      across it. If yours is a PNG, drop it in as `payment-qr.png` and update the
      `src`, `alt` and caption in `register.html` (search that file for
      `payment-qr`).
- [ ] **Account name and account or wallet number**, in `register.html` (search for
      `Account name`).
- [ ] **The delegate fee**, which appears in three places: `index.html` (the
      register panel), `register.html` (the header facts), and `register.html`
      again in the step 2 body copy.
- [ ] **Confirm the seat counts.** I set working defaults sized to each real body,
      400 seats across 12 committees. **The API enforces these**: once a committee
      is full, allocation is refused with a message naming the numbers. Whatever the
      site advertises becomes a hard cap, so make these real before you publish.
      They live in one place, `apps/site/src/data/committees.js`.
- [ ] **A country list per committee**, as CSV, imported through the hub. Until a
      committee has one, country validation is switched off for it and the
      allocation screen will accept any typo as a country.

---

# Part 4 — Content

## 4.1 Committees

Everything below is one field each in `apps/site/src/data/committees.js`.

- [ ] **12 agendas.** Every card currently renders "Agenda to be announced." and
      leads on format instead, which is honest but is not what you want at launch.
- [ ] **24 names**, a chair and a vice-chair for each committee.
- [ ] **The two undecided committees.** Adding one is a single entry in that file,
      an icon at `apps/site/assets/icons/<code>.svg`, and the same code, name and
      seats mirrored into `prisma/seed.ts`. `npm run check:committees` fails the
      build if you forget the second half.
- [ ] **Official committee logos, if you still want them.** I have no way to
      download image files, so the 12 icons currently shipping are line marks I drew
      in the existing style. Drop real SVGs into `apps/site/assets/icons/` using the
      existing filenames (`unwomen.svg`, `icj.svg`, `unodc.svg` and so on) and they
      appear with no code change. Worth knowing: UN emblems are protected under a
      1946 General Assembly resolution, which is why most conferences use stylised
      marks rather than the official ones.

## 4.2 Organising committee

- [ ] **13 portraits** into `apps/site/assets/oc/`. The folder does not exist yet;
      create it. Portrait crops, 800×1000 px, under about 120 KB each. Exact
      filenames, which must match:

  ```
  subrat-lamichhane.jpg      siddub-sharma-bidari.jpg   mhigshang-lama-yolmo.jpg
  aaradhy-raj-pant.jpg       abhinav-gc.jpg             bidushi-sharma.jpg
  aditya-joshi.jpg           sparsh-sharma.jpg          asia-ramdam.jpg
  abhigya-shrestha.jpg       stuti-gautam.jpg           krystal-gurung.jpg
  desna-kc.jpg
  ```

  Missing ones fall back to a gold monogram plate rather than a broken image, so
  partial delivery is fine. Once **all** of them are in, delete the
  `.section__status` line in `index.html` that reads "Portraits are being
  photographed."

- [ ] **Media Team roles, if you want them split.** Asia Ramdam, Abhigya Shrestha
      and Stuti Gautam currently share the label "Media Team". I did not invent
      three sub-roles for named real people. One line each in
      `apps/site/src/modules/oc.js` if you want specific titles.

## 4.3 Past editions

- [ ] **9 photographs**, one per edition, at
      `apps/site/assets/past-galleries/edition-01/01.jpg` through
      `edition-09/01.jpg`. 1600 px on the long edge, about 200 KB each.
- [ ] **Then flip `PHOTOS_PUBLISHED` to `true`** at the top of
      `apps/site/src/modules/gallery.js`. Until you do, the archive shows the
      edition marquee and a link to Instagram, which is deliberate: with the flag on
      and the files missing, the section renders nine broken frames and ten filter
      buttons that each resolve to a single broken frame.
- [ ] **Real delegate quotes, if you want the testimonial cards back.** They were
      removed because all three were placeholders reading "Delegate review to be
      added." The splice logic is intact. Only re-enable with at least three real
      quotes, from real delegates, with their permission.

## 4.4 Contact and identity

- [ ] **A real email address.** The footer of both pages currently reads "Email and
      phone to be announced", and five separate copy blocks tell users to reach the
      secretariat through the footer contact.
- [ ] **A phone number**, same place.
- [ ] **Confirm `@lrimunx` is the right Instagram handle.** It is live on the site
      now, in the footer, the nav overlay, the archive section and two noscript
      fallbacks.
- [ ] **The final domain.** `og:url` was removed rather than left pointing at
      `example.org`, which is correct for now: social scrapers fall back to whatever
      URL they fetched. Add it back to both `index.html` and `register.html` once
      the domain exists.
- [ ] **A designed share image, optionally.** `assets/og-image.png` is generated
      from your logo by `node scripts/build-og-image.mjs`, 1200×630. It works. A
      properly designed card with the dates on it would work better.

---

# Part 5 — Before you open registration

- [ ] Sign in at `/admin` and **change the bootstrap admin password**, then remove
      `SEED_ADMIN_PASSWORD` from the Vercel environment.
- [ ] Confirm the hub's Committees page lists all 12 with the right seat counts.
- [ ] Import the country matrix for every committee.
- [ ] **Register a real test delegate end to end**, including the payment
      screenshot upload, then approve it in the hub and confirm the email arrives.
- [ ] Run `npm run verify` and confirm the "Skipping the API integration suite"
      line is gone, so you know all 49 integration tests actually ran.
- [ ] Paste the site URL into WhatsApp and check the share preview renders.
- [ ] Load the site on a real phone. It is built for 390px and up.

---

# Part 6 — Oracle, later

Fully documented in **`SETUP.md`**, 19 sections, written against the current Always
Free limits.

Two things to know before you start, both covered in detail there:

1. Oracle cut the free ARM allowance to **2 OCPU / 12 GB** on 15 June 2026 and
   began terminating over-limit instances on 18 August 2026. Any guide written
   before mid-2026 tells you to build a 4-core box, and that box gets killed.
2. **Your home region is permanent.** Choose Mumbai or Singapore at signup. You
   cannot move a tenancy afterwards.

The migration from Vercel is mostly moving environment variables and pointing DNS.
The application code is identical; only `SERVE_STATIC` flips to `true`, because on
Oracle the Node process serves the static files itself.
