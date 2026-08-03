# Shared context for every subagent

Not an agent. Read this first — every agent definition in this folder assumes it.

## The repository is three apps, not one

| Path | What | Local URL |
| :--- | :--- | :--- |
| `apps/website` | the public conference site + registration form. Vite, vanilla JS, GSAP + Lenis. No React. | `localhost:5174` |
| `apps/frontend` | the OC operations hub. React 18, Vite, Tailwind, TanStack Query. Served under `/admin`. | `localhost:5173/admin` |
| `apps/backend` | the API both talk to. Express, TypeScript, Prisma, PostgreSQL. | `localhost:4000` |

The hub really does live under `/admin` in development as well as production —
`localhost:5173` on its own 404s.

**The two front ends do not share a design system.** The hub follows
`DESIGN.md` at the repo root. The site follows `apps/website/CLAUDE.md`, which
has its own palette, type scale and motion language. Applying one to the other
is a bug, not a tidy-up.

## Running things

```bash
npm run dev:backend        # API      → localhost:4000   (health: /health, NOT /api/v1/health)
npm run dev:frontend       # ops hub  → localhost:5173/admin
npm run dev:website        # site     → localhost:5174
npx vitest run --dir apps/backend/src --pool=forks --poolOptions.forks.singleFork
```

PostgreSQL does not start with Windows. If the API reports
`Can't reach database server at localhost:5432`:

```bash
cd /mnt/c && cmd.exe /c 'D:\pgportable\pg16\bin\pg_ctl.exe -D D:\pgportable\data -l D:\pgportable\pg.log start'
```

## Looking at a page in a real browser

There is no Playwright. There is headless Edge, which is enough to measure
layout and take screenshots:

```bash
"/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1400,1000 --virtual-time-budget=12000 \
  --dump-dom "http://localhost:5174/"
```

**`--window-size` is NOT the CSS viewport.** On this machine the viewport comes
out about 1.26× the requested size, so `--window-size=390` lays out at ~492px
and screenshots crop. To measure a true 390px phone viewport, load the page in
an **iframe of exactly 390px** inside a scratch harness page and measure inside
it. Delete the harness afterwards.

## Traps that have already cost this project time

1. **Never `open(path, 'w')` before reading the file.** Doing so truncates it,
   and then the read returns nothing. `index.html` and `vercel.json` have each
   been destroyed this way. Read first, then write.
2. **WSL environment variables do not reach Windows executables.** `FOO=bar
   npx ...` silently drops `FOO`. Prefix with `WSLENV=FOO` if you genuinely
   need it — but you almost never do.
3. **Never point anything at the production database.** `.env.prod.local` and
   `.env.prod` exist on this machine. Local work uses `.env`, which is
   localhost. Read-only inspection of production is the main agent's job, not
   yours.
4. **`prisma/schema.prisma` is off limits** without explicit user confirmation.
   Say what you would change and stop.

## How to report

Findings, not prose. For each one: the file and line, what is wrong, what a
user experiences because of it, and — if you fixed it — what you changed. If
you could not verify something, say so rather than implying you did.
