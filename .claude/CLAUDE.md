# CLAUDE.md — LRI MUN X Operations Hub

## Project Context
This repository contains the full-stack web application for the LRI MUN X Operations Hub. The application manages delegates, committees, logistics, and attendance.

## Tech Stack
| Layer | Technology |
| :--- | :--- |
| Frontend | React 18, Vite, Tailwind CSS, Lucide Icons, Radix UI, TanStack Query/Table |
| Backend | Node.js (Express), TypeScript, Prisma ORM |
| Database | PostgreSQL |
| Offline / PWA | Workbox (Service Worker), Dexie.js (IndexedDB) |

## Core Commands
* Install dependencies: `npm install`
* Start frontend dev server: `npm run dev:frontend`
* Start backend dev server: `npm run dev:backend`
* Database migration: `npx prisma migrate dev`
* Generate Prisma client: `npx prisma generate`
* Build for production: `npm run build`

## Architectural Rules
1. **Strict RBAC:** Enforce `ADMIN` and `CONTRIBUTOR` roles on all backend routes via middleware.
2. **Audit Logging:** All `POST`, `PUT`, `PATCH`, and `DELETE` requests by an `ADMIN` must generate a corresponding record in the `AuditLog` table containing `payloadBefore` and `payloadAfter`.
3. **Offline-First:** Queue logistics request submissions from `CONTRIBUTOR` accounts in Dexie.js if offline. Sync via Service Worker when `navigator.onLine` evaluates to true.
4. **Transactions:** Use Prisma transactions for all delegate assignments to prevent committee over-capacity or double-booking countries.
5. **API Structure:** Version all API endpoints under `/api/v1/`.
6. **Integrations:** Route Google Sheets/Forms webhook data through `/api/v1/integrations/google-sheets`. Use `papaparse` for manual CSV ingestion.

## Style & Formatting
1. **TypeScript:** Enforce strict mode. Define explicit interfaces for all API payloads and responses. Ban the use of `any`.
2. **Tailwind CSS:** Follow the exact color palette and spacing variables defined in `DESIGN.md`. Do not introduce arbitrary colors or unapproved utility classes.
3. **UI Responsiveness:** Ensure zero horizontal scrolling on mobile viewports (minimum 390px width). Ensure touch targets are at least 48px x 48px.
4. **Component Structure:** Group components by feature domain (e.g., `/features/delegates`, `/features/logistics`) rather than generic UI types.
5. **Error Handling:** Standardize API error responses format: `{ error: string, code: number, details?: unknown }`.

## Agent Operational Instructions
1. Read `DESIGN.md` before generating any new frontend components.
2. Do not modify `prisma/schema.prisma` without explicit confirmation. If modifications are approved, immediately run `npx prisma format` and `npx prisma validate`.
3. Verify all role security boundaries during backend implementation (e.g., ensure `CONTRIBUTOR` tokens receive `403 Forbidden` on admin-only routes).
4. Execute relevant tests before marking a task as complete. 
5. Do not generate placeholder "lorem ipsum" text. Use realistic MUN operational data (e.g., "DISEC - France", "Placard request for UNHRC") for UI mocks or database seeding.
6. If missing environment variables (`DATABASE_URL`, JWT secrets) or network constraints block execution, halt processes and request input immediately.