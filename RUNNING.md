# Running the Operations Hub

Three things have to be up, in this order: **PostgreSQL → backend → frontend**.
Postgres is the one that catches people out — it does not start with Windows, so
after every reboot you start it by hand. If the app loads but the API errors, or
the backend prints `Can't reach database server at localhost:5432`, that is all
this is.

---

## Every session — the three commands

Run each in its own terminal, in order.

```bash
# 1 · PostgreSQL  (start it once; it stays up until you reboot or stop it)
cd /mnt/c && cmd.exe /c 'D:\pgportable\pg16\bin\pg_ctl.exe -D D:\pgportable\data -l D:\pgportable\pg.log start'

# 2 · Backend API  →  http://localhost:4000/api/v1
cd "/mnt/d/LRI MUN X/Management Webapp" && npm run dev:backend

# 3 · Frontend     →  http://localhost:5173
cd "/mnt/d/LRI MUN X/Management Webapp" && npm run dev:frontend
```

Then open **http://localhost:5173**.

The `cd /mnt/c` in step 1 is not cosmetic — `cmd.exe` refuses to run from a WSL
path and will warn and fall back to `C:\Windows` if you don't.

Steps 2 and 3 must stay open. They are the servers, not one-off commands — close
the terminal and the site goes down with it.

To confirm the API is alive:

```bash
curl http://localhost:4000/health          # → {"status":"ok", ...}
```

Use `/health`, not `/api/v1/health` — everything under `/api/v1/` sits behind
auth and answers `401 Missing bearer token` even when the server is perfectly
fine.

If you're in Windows PowerShell or CMD rather than WSL, step 1 is just:

```
D:\pgportable\pg16\bin\pg_ctl.exe -D D:\pgportable\data -l D:\pgportable\pg.log start
```

### Shutting down

Ctrl-C the two `npm` terminals. Leave Postgres running, or stop it with:

```bash
cd /mnt/c && cmd.exe /c 'D:\pgportable\pg16\bin\pg_ctl.exe -D D:\pgportable\data stop'
```

---

## Sign in

| Username | Role |
| :--- | :--- |
| `abhinav` | ADMIN |
| `secretariat` | CONTRIBUTOR |

Passwords are the ones you set. If you lock yourself out, `npm run seed` will
recreate the two default accounts — it does **not** touch delegates, committees,
requests or the audit log.

---

## After changing code

| What changed | What to run |
| :--- | :--- |
| Anything in `apps/` | Nothing — both dev servers hot-reload |
| `prisma/schema.prisma` | `npx prisma migrate dev --name what_changed` then `npx prisma generate` |
| `package.json` / dependencies | `npm install` |

---

## Checks worth knowing

```bash
npm run typecheck    # both workspaces, strict TS
npm test             # backend unit tests
npm run lint
npm run build        # production build of both
npx prisma studio    # browse/edit the database in a browser
```

---

## When something is wrong

**The site won't load at all / "can't reach this page"**
Nothing is listening. Check what's actually up:

```bash
cd /mnt/c && cmd.exe /c 'netstat -ano | findstr LISTENING' | grep -E ':(5432|4000|5173) '
```

You want three lines. Whichever port is missing is the step you skipped — or the
terminal you closed.

**`Can't reach database server at localhost:5432`**
Postgres isn't running. Step 1 above. Note the backend *exits* when this happens,
so once the database is up you have to start the backend again — it does not
reconnect on its own. If Postgres refuses to start, read the tail of
`D:\pgportable\pg.log`; it says exactly why.

**`EADDRINUSE: address already in use :::4000`**
An old backend survived. Find and kill it:

```bash
cd /mnt/c && cmd.exe /c 'netstat -ano | findstr :4000'
cd /mnt/c && cmd.exe /c 'taskkill /PID <the-pid> /T /F'
```

Same recipe for `:5173` (frontend) and `:5432` (Postgres).

**Vite says it's on 5174 instead of 5173**
Two Vite servers are running. Kill both, start one.

**Blank page after an update**
A stale service worker. Hard-reload with `Ctrl+Shift+R`, or in DevTools →
Application → Service Workers → Unregister, then reload.

---

## Where things live

| | |
| :--- | :--- |
| Database files | `D:\pgportable\data` |
| Database log | `D:\pgportable\pg.log` |
| Postgres binaries | `D:\pgportable\pg16\bin` |
| Connection string | `DATABASE_URL` in `.env` at the repo root |

`D:\pgportable\` is deliberately outside the repo — the database is your data,
not your code. Back up that folder, not this one, if you want the delegates to
survive.
