# LRI MUN X Operations Hub

Delegates, committees, country assignments, logistics and attendance for the LRI MUN X conference — offline-capable, role-scoped, fully audited.

## Getting started

```bash
npm install                 # installs both workspaces
# 1. Start PostgreSQL (see below) — nothing DB-backed works without it
npx prisma migrate dev      # creates the schema
npm run seed                # the two sign-in accounts only — no sample data
# SEED_COMMITTEES=true npm run seed   # optional: create the six standard committees
npm run dev:backend         # API on http://localhost:4000/api/v1
npm run dev:frontend        # app on http://localhost:5173
```

### PostgreSQL

`DATABASE_URL` in `.env` must point at a reachable instance. The quickest local option:

```bash
docker run --name munx-db \
  -e POSTGRES_USER=munx -e POSTGRES_PASSWORD=munx -e POSTGRES_DB=lri_mun_x \
  -p 5432:5432 -d postgres:16
```

### Environment

`.env` is git-ignored; `.env.example` documents every variable. The API refuses to start rather than run half-configured — a missing `DATABASE_URL` or a placeholder JWT secret is a hard failure with a message naming the variable.

Web Push is optional. With `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` empty, alerts are disabled and everything else works; generate keys with `npx web-push generate-vapid-keys`.

## Seeded accounts

Both are created by `npm run seed` from the `SEED_*` variables. **Change the passwords before anyone else uses this.**

| Username | Role | Password |
|---|---|---|
| `secretariat` | ADMIN | `ChangeMe!MUNX2026` |
| `volunteer` | CONTRIBUTOR | `ChangeMe!MUNX2026` |

## Roles

Roles are scopes of responsibility, **not device profiles** — every surface either role can reach is built and verified at 390px and 1440px.

| Capability | ADMIN | CONTRIBUTOR |
|---|:---:|:---:|
| Read delegates, committees, logistics | ✓ | ✓ |
| Create logistics requests | ✓ | ✓ |
| Submit attendance check-ins | ✓ | ✓ |
| Create / edit / delete delegates and committees | ✓ | — |
| Update or resolve logistics requests | ✓ | — |
| Users, audit log, exports, CSV import | ✓ | — |

Enforcement is server-side on every route. The UI omits controls a role cannot use, but that is presentation only.

## Architecture

```
prisma/            schema + seed
apps/backend/      Express + TypeScript API, all routes under /api/v1
  src/middleware/  auth (JWT), rbac, validation (zod), audit guard, errors
  src/lib/         prisma, audit, transactions, exporters, ingestion, push
  src/routes/      one module per resource
apps/frontend/     React 18 + Vite PWA
  src/components/  ui primitives + layout shell
  src/features/    one folder per domain
  src/lib/         api client, offline queue (Dexie), hooks, push
  src/sw.ts        Workbox service worker: precache, runtime cache, push
integrations/      Google Apps Script for Forms/Sheets ingestion
DESIGN.md          the design system — read before touching any UI
RUNNING.md         the three commands that start everything locally
DEPLOYMENT.md      deploying all three surfaces to one domain on Vercel
SCHOOL-SERVER.md   what it would take to run all of this on the school's own box
```

### Guarantees worth knowing

- **Committee and country live on the delegate.** There is no separate assignments screen — placing a delegate is part of editing them. Capacity checks and the insert run in a `SERIALIZABLE` transaction with retry, so two admins filling the last seat concurrently cannot overfill a committee, and duplicate countries are blocked by a `@@unique([committeeId, country])` constraint.
- **Audit trail.** Every admin mutation writes an `AuditLog` row with `payloadBefore`/`payloadAfter`, secrets redacted. Assignment audits commit inside the same transaction as the change. Attendance check-ins are audited for both roles.
- **Offline writes.** Logistics requests and attendance check-ins queue in IndexedDB when the network is unreachable and drain on reconnect. The server collapses identical replays within a 15-minute window, so a lost response cannot create a duplicate. Other writes fail fast rather than deferring silently.
- **Standard errors.** Every failure returns `{ error, code, details? }`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev:backend` / `dev:frontend` | Development servers |
| `npm run build` | Typecheck and build both workspaces |
| `npm run typecheck` | Types only |
| `npm run test` | Backend unit suite |
| `npx prisma migrate dev` | Apply schema changes |
| `npm run seed` | Seed realistic conference data |
| `npx prisma studio` | Browse the database |

## Google Forms / Sheets ingestion

`integrations/google-apps-script/Code.gs` posts each form submission to `/api/v1/integrations/google-sheets`, authenticated with `X-Webhook-Secret` (compared in constant time). Setup instructions are in the file header.

Ingestion is keyed on email, which is unique — a repeat email updates the delegate. Phone numbers are deliberately *not* unique: siblings and teachers legitimately share one, so shared numbers are reported as collisions for review rather than rejected. Admins can also paste a CSV from the Delegates page.

## Testing

`npm run test` covers RBAC gating, CSV parsing and header aliasing, ingestion validation, export generation and the error contract — 23 tests, no database required.

Route-level integration tests (real 403s against admin endpoints, audit-row assertions, concurrent-assignment races) need a live `DATABASE_URL` and are not yet written. See the QA agent brief in `.claude/agents/qa.md` for the intended coverage.
