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

To create the first admin account, set `SEED_ADMIN_USERNAME` and
`SEED_ADMIN_PASSWORD` in `.env` and run `node scripts/bootstrap-admin.mjs`.

## Before pushing

```bash
npm run verify
```

Lint, both typechecks, then both test suites. Vitest transpiles without
typechecking, so a suite can pass while `tsc` fails — run this, not just the
tests.

## Deploying

See [SETUP.md](SETUP.md).

## Layout

```
apps/site      public conference site and registration form (vanilla JS, Vite)
apps/hub       operations hub (React, Vite, Tailwind)
apps/backend   Express + Prisma API, and the static file server
prisma/        schema and migrations
scripts/       build composition and first-admin bootstrap
integrations/  Google Apps Script for the registration sheet
```
