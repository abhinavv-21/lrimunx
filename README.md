# LRI MUN X

The conference website and the operations hub behind it.

| Surface | Path | What it is |
| :--- | :--- | :--- |
| Public site | `/` | The conference site and the delegate registration form |
| Registration | `/register` | The two-step application form |
| Operations hub | `/admin` | Internal: delegates, committees, allocations, logistics, attendance |
| API | `/api/v1` | Serves both of the above |

All three are served by one Node process on one port.

## Running it locally

Requires Node 20+ and a PostgreSQL database.

```bash
npm install
cp .env.example .env          # then fill it in
npx prisma generate
npx prisma migrate deploy
npm run dev
```

`npm run dev` starts three servers: the API on `localhost:4000`, the hub on
`localhost:5173/admin`, and the site on `localhost:5174`.

To create the first admin account and the committees, set `SEED_ADMIN_USERNAME`
and `SEED_ADMIN_PASSWORD` in `.env` and run `node scripts/bootstrap-admin.mjs`. It
is idempotent: it skips the account if any account exists, and never modifies a
committee that is already there.

## The committee list

`apps/site/src/data/committees.js` is the source of truth. The cards on the
landing page, both dropdowns on the registration form and the seat counts in the
database all come from it.

`prisma/seed.ts` keeps a second copy for local development, because tsx runs it
inside the Prisma workspace and cannot import across to `apps/site`.
`npm run check:committees` fails the build if the two disagree, which is worth
having: they drifted once already, and because the API enforces `totalSeats` at
allocation time, the symptom was a delegate being refused a seat the site had
advertised.

Adding a committee means an entry in that file, an icon at
`apps/site/assets/icons/<icon>.svg`, and the same code, name and seats mirrored
into `prisma/seed.ts`.

## Before pushing

```bash
npm run verify
```

The committee drift check, lint, both typechecks, then both test suites. Vitest
transpiles without typechecking, so a suite can pass while `tsc` fails. Run this,
not just the tests.

Two traps.

The API integration suite **skips itself rather than failing** when
`DATABASE_URL` or the JWT secrets are missing, and `npm test` still exits green.
Read the output for `[integration] Skipping the API integration suite` before
trusting a pass.

The backend suite also **crashes on exit occasionally**, roughly one run in
fifteen, with `Error: Worker exited unexpectedly`. Every test reports passing
first; the crash is a segfault during teardown, not a failing assertion. It is
Prisma 5.22's native query engine against **Node 24**, which is newer than that
Prisma release supports. `src/test-support/vitest.setup.ts` disconnects the
shared client after every file, which took it from about one run in four down to
one in fifteen, but it does not eliminate it.

This does not affect deployment: Oracle and Vercel both run Node 20. If it
irritates you locally, use Node 20 or 22 rather than 24. Re-running is safe, but
check the output says `Worker exited` and not a real assertion before you do.

## Deploying

See [SETUP.md](SETUP.md).

## Layout

```
apps/site      public conference site and registration form (vanilla JS, Vite)
  src/data     the committee list, which the site and the database both read
apps/hub       operations hub (React, Vite, Tailwind)
apps/backend   Express + Prisma API, and the static file server
prisma/        schema and migrations
scripts/       build composition and first-admin bootstrap
integrations/  Google Apps Script for the registration sheet
```
