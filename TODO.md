# What only you can do

Everything in this file needs a human. Either it needs an account I cannot log
into, or it needs information only you have. Anything I could do myself is
already done and is not listed here.

| | Section | Blocks |
| :--- | :--- | :--- |
| 1 | [Deploy to Vercel](#1-deploy-to-vercel) | having anywhere to test |
| 2 | [Money](#2-money) | opening registration |
| 3 | [Committees](#3-committees) | opening registration |
| 4 | [Email and uploads](#4-email-and-file-uploads) | approvals working properly |
| 5 | [People and photographs](#5-people-and-photographs) | looking finished |
| 6 | [Contact details](#6-contact-details) | anyone reaching you |
| 7 | [Local database](#7-your-local-database) | done, nothing to do |
| 8 | [Tidying](#8-tidying-up) | nothing |
| 9 | [Oracle, later](#9-oracle-later) | the real launch |

---

# 0. Where to run the commands

**Every command in this file runs from the repository root:**

```
D:\LRI MUN X\Management Webapp
```

Which terminal matters, because two different shells appear below.

| Block looks like | Use | Why |
| :--- | :--- | :--- |
| `npx vercel …`, `git push`, `npm run …` | **Git Bash** or **PowerShell**, either works | plain single-line commands |
| Ends lines with `\`, or starts `VAR="value" command` | **Git Bash only** | PowerShell has no line-continuation backslash and no inline variable prefix. It will throw a parser error. |
| Starts with `& "C:\Program Files\…"` | **PowerShell, as Administrator** | registering a Windows service needs elevation |

**The easiest option:** type `!` followed by the command directly in Claude Code.
It runs in this session and the output comes back in the conversation, so I can
see what happened and help if it fails.

```
!npx vercel env ls
```

To open Git Bash at the right place: right-click the project folder in Explorer
and choose **Git Bash Here**. For elevated PowerShell: Start menu, type
PowerShell, right-click, **Run as administrator**, then:

```powershell
cd "D:\LRI MUN X\Management Webapp"
```

---

# 1. Deploy to Vercel

## Already done, do not redo

I set all of this through the CLI using your existing login. **No token changed
hands and none is needed.**

- **Database provisioned.** Neon, free plan, Singapore (`sin1`), named
  `lrimunx-db`, connected to Production, Preview and Development.
- **`DATABASE_URL`** set to the pooled connection with
  `&pgbouncer=true&connection_limit=1` appended.
- **`DIRECT_URL`** set to the unpooled connection. Migrations need this; they
  hang forever against a pooled URL.
- **`SERVE_STATIC=false`**, **`TRUST_PROXY=1`**, **`VITE_API_BASE_URL=/api/v1`**,
  **`CORS_ORIGIN=https://lrimunx.vercel.app`**.
- **VAPID keys** generated and set, so web push works.
- Your `JWT_SECRET`, `JWT_REFRESH_SECRET`, `GOOGLE_SHEETS_WEBHOOK_SECRET`,
  `SEED_ADMIN_*` and `DANGER_RESET_PASSPHRASE` from 19 days ago were already
  correct. I left them alone.
- Cleaned out: the old Prisma Postgres store, two half-created Neon databases,
  unused Blob variables, a hardcoded `NODE_ENV`, and ten dead deployments.

Everything required to boot is set. The only missing variables are SMTP and
object storage, which are section 4 and are both optional.

## 1.1 Push and watch the build

- [ ] From the repository root:

  ```bash
  git push
  ```

  Vercel builds on push. Watch it at
  **https://vercel.com/ephi/lrimunx → Deployments →** click the running one.

  The build runs `prisma generate`, then `prisma migrate deploy` (which creates
  every table in the new Neon database), then builds all three workspaces.
  **Expect three to four minutes** the first time.

## 1.2 Create the first account

The build deliberately does not create accounts, because a build container should
not be writing users into your database. Run it yourself, once.

- [ ] Pull the real connection string:

  ```bash
  npx vercel env pull .env.production.local --environment=production
  ```

  That file holds live credentials. It is gitignored. Delete it when you are done.

- [ ] Open it, copy the **`DIRECT_URL`** value, and run this **in Git Bash**
      (the backslashes and the `VAR="…"` prefixes are Bash syntax and will not
      parse in PowerShell):

  ```bash
  DATABASE_URL="<paste DIRECT_URL here>" \
  DIRECT_URL="<paste the same value here>" \
  SEED_ADMIN_USERNAME="abhinav" \
  SEED_ADMIN_PASSWORD="<pick something long>" \
  node scripts/bootstrap-admin.mjs
  ```

  Use `DIRECT_URL` for both, not the pooled one. This is a one-off script, not a
  serverless function, so it wants a direct connection.

  It creates your admin account **and all 12 committees**, and marks the account
  as owner so you can reach the Admin page. Safe to run twice: it skips the
  account if any account exists and never modifies a committee already there.

- [ ] Delete the credentials file:

  ```bash
  rm .env.production.local
  ```

## 1.3 Check it actually works

- [ ] On your deployment URL:
  - `/` loads and the committee rail shows 12 cards
  - **Details** on a committee opens the dialog
  - **Apply** from that dialog lands on `/register` with the committee preselected
  - `/admin` shows the login page
  - you can sign in with the account from 1.2
  - the hub's **Committees** page lists all 12
  - **Admin** appears in the sidebar. It is owner-only, so if it is missing,
    `isOwner` did not get set on your account.

- [ ] **Change the bootstrap password** on first sign-in, then remove it:

  ```bash
  npx vercel env rm SEED_ADMIN_PASSWORD production
  npx vercel env rm SEED_ADMIN_PASSWORD preview
  ```

## 1.4 If the build fails

**Hangs at `prisma migrate deploy`** — `DIRECT_URL` is pointing at the pooled
host. It must be the one *without* `-pooler` in the hostname.

**Site loads but every API call fails** — `VITE_API_BASE_URL` is compiled into
the browser bundle, not read at runtime. Changing it is not enough, you must
**redeploy**. Deployments → latest → three-dot menu → **Redeploy**.

**Everything 404s except the API** — `SERVE_STATIC` is `true`. It must be `false`
here, because Vercel serves the static files itself.

**500 on every request** — a required variable is missing, and the server names
it. Read **Deployments → your deployment → Functions → Logs**.

---

# 2. Money

None of this can be guessed, and all of it blocks opening registration.

- [ ] **The four prices, in whole NPR.** Set them in the hub at **Admin →
      Pricing** once deployed.

  | Tier | Who it is for |
  | :--- | :--- |
  | Base | Everyone else |
  | Internal | LRI's own students |
  | Alumni | Past participants |
  | Discount | One flat rate covering any kind of discount |

- [ ] **Replace the payment QR code.** The current file is a deliberate stand-in
      with the word PLACEHOLDER drawn across it. It is not scannable.

  Overwrite `apps/site/assets/payment-qr.svg` with the real code.

  If yours is a PNG, save it as `apps/site/assets/payment-qr.png` instead, then
  open `apps/site/register.html`, search for `payment-qr`, and update the `src`,
  the `alt` text and the caption. There is exactly one of each.

- [ ] **Account name and account or wallet number.** In
      `apps/site/register.html`, search for `Account name`.

- [ ] **The delegate fee.** Three places, all currently "to be announced":
  - `apps/site/index.html`, the register panel near the bottom
  - `apps/site/register.html`, the header facts
  - `apps/site/register.html` again, in the step 2 body copy

---

# 3. Committees

All of this lives in one file: `apps/site/src/data/committees.js`.

- [ ] **Confirm the seat counts.** This is the one that will bite you.

  I set working defaults sized to each real body, 400 seats across 12 committees.
  **The API enforces them.** Once a committee is full, allocation is refused with
  a message naming the numbers, so whatever the site advertises becomes a hard
  cap. Fix these before you publish, not after a delegate is turned away.

  Change a seat count and you must change it in `prisma/seed.ts` too.
  `npm run check:committees` fails the build if you forget, so you will know.

- [ ] **The 12 agendas.** Each committee has `agenda: null`, which renders as
      "Agenda to be announced." and makes the card lead on format instead.
      Replace `null` with the motion text in quotes.

- [ ] **24 names**, a `chair` and a `viceChair` per committee. Same file.

- [ ] **The two undecided committees.** To add one:
  1. Copy an existing entry in `committees.js` and edit it.
  2. Add an icon at `apps/site/assets/icons/<icon>.svg`. 24x24, stroke
     `#1A1015`, stroke-width `1.25`. Copy an existing one as a starting point.
  3. Mirror the `code`, `name` and `seats` into `STANDARD_COMMITTEES` in
     `prisma/seed.ts`.
  4. Run `npm run check:committees`.

- [ ] **A country list per committee**, as CSV, imported in the hub at
      **Committees → the committee → Country matrix**.

  Until a committee has one, country validation is **switched off** for it and
  the allocation screen accepts any typo as a country. That is how you end up
  with a delegate representing "Fance".

- [ ] **Official committee logos, if you still want them.** I cannot download
      image files, so the 12 icons shipping now are line marks I drew.

  Drop real SVGs into `apps/site/assets/icons/` using the existing filenames
  (`unwomen.svg`, `icj.svg`, `unodc.svg`) and they appear with no code change.

  Worth knowing first: UN emblems are protected under a 1946 General Assembly
  resolution, which is why most conferences use stylised marks instead.

- [ ] **The study guide URL.** Once written, set it in the hub so the allocation
      email can link to it. Without it the announcement send refuses rather than
      mailing a broken link.

---

# 4. Email and file uploads

Both optional. The app runs without them and says so plainly rather than
pretending. You want both before registration opens.

## 4.1 Email, so approvals notify the delegate

Without this, approving a registration works and the hub tells you no email was
sent. With it, the delegate gets a confirmation and you can send the bulk
allocation announcement.

- [ ] Get an **app password**. Google account → **Security** → 2-Step
      Verification must be ON → **App passwords** → generate. A normal account
      password will not authenticate.

- [ ] Set them:

  ```bash
  npx vercel env add SMTP_HOST production --value "smtp.gmail.com"
  npx vercel env add SMTP_PORT production --value "587"
  npx vercel env add SMTP_SECURE production --value "false"
  npx vercel env add SMTP_USER production --value "your@address"
  npx vercel env add SMTP_PASSWORD production --sensitive --value "<app password>"
  npx vercel env add SMTP_FROM production --value "LRI MUN X <your@address>"
  ```

  Repeat with `preview` if you want it on previews.

  `SMTP_SECURE` is `true` **only** for port 465. Port 587 upgrades with STARTTLS
  and must be `false`.

- [ ] Redeploy, then test properly: register a delegate, approve them, confirm
      the email arrives.

## 4.2 Object storage, so delegates can upload payment proof

Without this, `POST /api/v1/public/blob-upload` answers 503. The form says so and
registration still completes, but **nobody can prove they paid**.

The app speaks plain S3, so any S3-compatible provider works. Cloudflare R2 has a
free tier and is the least work. You move to Oracle Object Storage later and the
four values are the same shape, so no code changes.

- [ ] Create a bucket. **Make it private.** Payment screenshots are transaction
      records, readable only through a signed URL an authenticated hub user
      requests.

- [ ] Set:

  ```bash
  npx vercel env add S3_ENDPOINT production --value "https://<account>.r2.cloudflarestorage.com"
  npx vercel env add S3_BUCKET production --value "lrimunx-payments"
  npx vercel env add S3_REGION production --value "auto"
  npx vercel env add S3_ACCESS_KEY_ID production --sensitive --value "<key id>"
  npx vercel env add S3_SECRET_ACCESS_KEY production --sensitive --value "<secret>"
  ```

  `S3_REGION=auto` works for R2 and MinIO. **Oracle rejects it** — there you need
  the real region id, because Oracle validates the region inside the signature.

- [ ] Redeploy, then upload a screenshot through `/register` step 2 to confirm.

---

# 5. People and photographs

Missing images fall back to a painted gold monogram plate rather than a broken
icon, so the site is safe to launch with gaps here.

## 5.1 Organising committee portraits

- [ ] Create `apps/site/assets/oc/` and put 13 portraits in it. Portrait crops,
      **800 x 1000 px**, under about **120 KB** each.

  Filenames must match exactly:

  ```
  subrat-lamichhane.jpg      siddub-sharma-bidari.jpg   mhigshang-lama-yolmo.jpg
  aaradhy-raj-pant.jpg       abhinav-gc.jpg             bidushi-sharma.jpg
  aditya-joshi.jpg           sparsh-sharma.jpg          asia-ramdam.jpg
  abhigya-shrestha.jpg       stuti-gautam.jpg           krystal-gurung.jpg
  desna-kc.jpg
  ```

- [ ] Once **all 13** are in, delete the status line in `apps/site/index.html`
      reading "Portraits are being photographed." Search for `section__status`.

- [ ] **Media Team roles, if you want them split.** Asia Ramdam, Abhigya Shrestha
      and Stuti Gautam share the label "Media Team". I did not invent three
      sub-roles for three named real people. One line each in
      `apps/site/src/modules/oc.js` if you want specific titles.

## 5.2 Past editions

- [ ] Nine photographs, one per edition:

  ```
  apps/site/assets/past-galleries/edition-01/01.jpg
  ...
  apps/site/assets/past-galleries/edition-09/01.jpg
  ```

  1600 px on the long edge, about 200 KB each.

- [ ] **Then flip the switch.** `apps/site/src/modules/gallery.js`, line 12:

  ```js
  const PHOTOS_PUBLISHED = false   // change to true
  ```

  Leave it `false` until the files exist. With it `true` and the photos missing,
  the section renders nine broken frames under ten filter buttons that each
  resolve to a single broken frame. Right now it shows the edition marquee and a
  link to Instagram instead, which is deliberate.

- [ ] **Real delegate quotes, if you want the testimonial cards back.** All three
      that were there read "Delegate review to be added", so they were removed.
      Only re-enable with at least three real quotes, from real delegates, with
      their permission.

- [ ] **A total delegate count across editions I to IX**, if you have it. One
      hard number would be the strongest single addition to the page and it is
      the one real gap. I will not invent it.

---

# 6. Contact details

- [ ] **A real email address.** The footer of both pages reads "Email and phone
      to be announced", and five copy blocks tell people to reach the secretariat
      through the footer.

  Edit `apps/site/index.html` and `apps/site/register.html`, search for
  `footer__pending`.

- [ ] **A phone number**, same place.

- [ ] **Confirm `@lrimunx` is the right handle.** It is live in the footer, the
      nav overlay, the archive section and two no-JavaScript fallbacks.

- [ ] **The final domain.** `og:url` was removed rather than left pointing at
      `example.org`, which is correct for now: scrapers fall back to whatever URL
      they fetched. Add it back to both HTML files once the domain exists, and
      update CORS:

  ```bash
  npx vercel env add CORS_ORIGIN production --force --value "https://mun.lrischool.edu.np"
  ```

---

# 7. Your local database

**Done. Nothing left here.**

PostgreSQL 17 is installed, the `munx` role and `lri_mun_x` database exist, every
migration is applied, and it is **registered as a Windows service with
`AUTO_START`**, so it comes back on its own after a reboot.

Verified:

```
sc qc postgresql-x64-17   →  START_TYPE : 2  AUTO_START
pg_isready                →  localhost:5432 - accepting connections
```

The superuser password is `postgres`. Nothing in the project uses it; the app
connects as `munx`.

## How to tell the tests are really running

Run `npm run verify` and look for this line:

```
[integration] Skipping the API integration suite — PostgreSQL is unreachable
```

If you see it, the database is down and **49 route tests did not run**, however
green the summary looks. If the line is absent, they ran.

Separately, the backend suite crashes on exit roughly one run in fifteen with
`Error: Worker exited unexpectedly`. Every test passes first; it is a segfault
during teardown from Prisma 5.22 against Node 24. It does not affect anything you
deploy, since Vercel and Oracle both run Node 20. Re-running is safe, but check
the output says `Worker exited` rather than naming a failing test first.

## If it ever stops

```powershell
Start-Service postgresql-x64-17
```

---

# 8. Tidying up

- [ ] **Delete the `lrimunx-blob` Blob store.** Two clicks, and **the order
      matters**.

  **https://vercel.com/ephi/~/stores/blob/store_9mlCqNa8wYTMsTOe**

  1. Delete the single file it holds (1 blob, 72 KB).
  2. Then **Settings → Delete Store**.

  Deleting the store first returns `409 Blob store not empty`.

  I could not do this from the CLI: every write route needs a Blob read-write
  token, that token is only issued while the store is connected to a project, and
  I disconnected it during cleanup. Reconnecting is dashboard-only, so it is
  circular. Purely tidiness; it costs nothing where it is.

- [ ] **Optional: remove the unused Neon Auth variables.** Provisioning created
      `DATABASE_NEON_AUTH_BASE_URL`, `DATABASE_NEON_PROJECT_ID` and
      `DATABASE_VITE_NEON_AUTH_URL` even though I asked for `auth=false`. Nothing
      reads them. Harmless noise; leave them unless the list bothers you.

---

# 9. Oracle, later

Fully documented in **`SETUP.md`**, written against the current Always Free
limits.

Two things to know before you start:

1. Oracle cut the free ARM allowance to **2 OCPU / 12 GB** on 15 June 2026 and
   began terminating over-limit instances on 18 August 2026. Any guide written
   before mid-2026 tells you to build a 4-core box, and that box gets killed.

2. **Your home region is permanent.** Choose Mumbai (`ap-mumbai-1`) or Singapore
   (`ap-singapore-1`) at signup. A tenancy cannot be moved afterwards.

Moving from Vercel is mostly copying environment variables and pointing DNS. The
application code is identical. Two things change:

- `SERVE_STATIC` becomes `true`, because on Oracle the Node process serves the
  static files itself.
- `DIRECT_URL` becomes **the same value as `DATABASE_URL`**, because there is no
  pooler. It is still required: Prisma treats it as mandatory once the schema
  declares `directUrl`, with no fallback to `url`.
