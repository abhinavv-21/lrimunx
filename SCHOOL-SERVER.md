# Running LRI MUN X on the school's own server

Written against this repository as it stands — every file path is real and every
claim was checked against the code, not assumed from a template.

Nothing here is urgent. The site runs on Vercel today and that is fine. This
exists so that when someone asks "could we host it ourselves?", the answer is a
list rather than a shrug.

**Read §1 before anything else.** One of those items decides whether the rest of
the document is worth reading at all, and it is not a coding problem.

---

## 1. The three things that actually decide this

Everything else on this page is work. These are the ones that can make the
answer "no", and none of them are in the code.

### 1.1 Can the school's connection serve the public internet?

School networks routinely block inbound 443, sit behind carrier-grade NAT, or
carry a dynamic IP that changes without warning. **Prove you can accept an
inbound HTTPS connection from outside the building before you write a line of
config.** This kills more self-hosting plans than every technical problem on
this page combined.

Test it, on the actual connection, before committing to anything:

```bash
# on the school box
python3 -m http.server 8080
# from a phone on mobile data, NOT school wifi
curl -v http://<the-school-public-ip>:8080
```

If that does not answer, stop here. The remaining options are a cheap VPS the
school pays for, or staying on Vercel.

### 1.2 Who runs it after you?

A student-run conference inherits its infrastructure every year. A box only one
person understands is a box that dies at their graduation. Whatever you build,
write down where it is, how to restart it, and how to restore the database — in
a place that is not your head and not your laptop.

### 1.3 Uptime during registration week

Vercel's job today includes surviving a power cut, a failed disk and a
misbehaving update. On the school box that is now your job, during the exact
weeks it matters most. Budget for a UPS, or accept the risk deliberately rather
than by accident.

---

## 2. What is already portable — which is most of it

This is the encouraging half, and it is genuinely most of the application.

- **The database.** `prisma/schema.prisma` is plain `provider = "postgresql"`
  reading `env("DATABASE_URL")`. No hosted-provider API, no proprietary client.
  Point it at a local PostgreSQL and it works.
- **The server.** `apps/backend/src/index.ts` is an ordinary long-lived Express
  server with `listen()` and SIGTERM handling. It already exists — it is what
  you run in development every day. Only `serverless.ts` is Vercel-shaped, and
  you simply stop using it.
- **Auth has no cookies anywhere.** It is a JWT in an `Authorization` header.
  That makes splitting the API onto its own origin cheap: no `SameSite=None`,
  no cookie domain, no CSRF rework. Just `CORS_ORIGIN`.
- **The public site** uses `base: './'` in `apps/website/vite.config.js`, so its
  assets resolve relative to wherever the document lands. It does not care what
  origin or path it is served from.
- **Sessions already work server-side.** The `Session` table means signing out
  genuinely ends a session, so moving hosts does not weaken anything.

## 3. What is genuinely tied to Vercel

Short list, and only one item is real work:

| Thing | Where | Effort |
| :--- | :--- | :--- |
| `@vercel/blob` | `apps/backend/src/lib/blob.ts`, `routes/public.routes.ts`, `routes/registrations.routes.ts`, `apps/website/src/modules/payment-upload.js` | **The only real lock-in.** See §4. |
| Serverless entry | `api/index.ts` → `apps/backend/dist/serverless.js` | Stop using it. `index.ts` already exists. |
| Routing and headers | `vercel.json` | Rewrite as nginx/Caddy rules. See §6. |
| Static composition | `scripts/compose-static.mjs` | Reuse as-is; it just copies files. |
| Client IP | `x-vercel-forwarded-for` in `public.routes.ts` | One line. See §7. |

---

## 4. Storage is the one piece of real work

**Already done.** Screenshots now live on S3-compatible storage — see
`apps/backend/src/lib/storage.ts` — so the school box needs MinIO and four
environment variables, not a rewrite.

**Write it against the S3 API, not against any one provider.** MinIO speaks S3
and is what you would run on a school box. So does every other object store you
might ever be handed. Do it once and the same code runs on Vercel today and in
the server room later with a different `S3_ENDPOINT` and nothing else changed.

Signing uses `aws4fetch` (80 KB, no dependencies) rather than `@aws-sdk/client-s3`,
which is roughly fifteen megabytes for the two operations this needs.

What you would set:

```
S3_ENDPOINT           http://localhost:9000     (MinIO on the same box)
S3_BUCKET             lrimunx-payment-proofs
S3_ACCESS_KEY_ID      from MinIO
S3_SECRET_ACCESS_KEY  from MinIO
S3_REGION             auto
```

Keep the bucket **private**. `isStorageUrl` in `lib/storage.ts` pins accepted
URLs to your own bucket and prefix — that is what stops somebody pasting an
arbitrary URL into `paymentProofUrl` and getting a reviewer to click it.

> A simpler alternative worth considering: since the API and the storage are now
> the same machine, you could skip object storage entirely and write screenshots
> to a directory with a UUID filename, served back through an authenticated
> route. Fewer moving parts, one fewer daemon, and the backup story becomes
> "back up this folder". The S3 route is better if you might move again.

---

## 5. What actually runs on the box

Four things, in this order:

```
PostgreSQL        the database
MinIO             object storage (or a plain folder — see §4)
Node              apps/backend/dist/index.js, under systemd
Caddy or nginx    TLS, static files, and reverse proxy to Node
```

### 5.1 Node under systemd

`/etc/systemd/system/lrimunx.service`:

```ini
[Unit]
Description=LRI MUN X API
After=network.target postgresql.service

[Service]
Type=simple
User=lrimunx
WorkingDirectory=/srv/lrimunx
EnvironmentFile=/srv/lrimunx/.env
ExecStart=/usr/bin/node apps/backend/dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`Restart=always` is the important line: it is what replaces the platform
restarting a crashed function for you.

### 5.2 Deploying a new version

```bash
git pull
npm install
npm run build                      # backend + hub + site
npx prisma migrate deploy          # never `migrate dev` on a live database
sudo systemctl restart lrimunx
```

`npm run build` already builds all three workspaces. `scripts/compose-static.mjs`
composes them into `dist/` — it only copies files, so it works unchanged; point
your web server at `dist/`.

---

## 6. The web server rules

`vercel.json` does four things you now do yourself. **Clean URLs are the one
people forget** — `/register` only resolves to `register.html` because something
rewrites it, and nothing does that automatically.

nginx:

```nginx
root /srv/lrimunx/dist;

# /register -> register.html, without the extension showing
location = /register { try_files /register.html =404; }

# the hub is a single-page app: every unknown path is its index
location /admin/ { try_files $uri $uri/ /admin/index.html; }

# the API
location /api/ {
  proxy_pass http://127.0.0.1:4000;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}

# keep the hub out of search results
location /admin { add_header X-Robots-Tag "noindex, nofollow" always; }

# fingerprinted bundles never change under the same name
location /assets/build/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
```

**Prefer Caddy unless someone insists on nginx.** Caddy obtains and renews TLS
certificates with no configuration and no cron job; nginx needs certbot plus a
renewal timer that will eventually fail quietly.

---

## 7. Configuration that must carry across

- **`JWT_SECRET` and `JWT_REFRESH_SECRET` must be copied over**, or every OC
  session invalidates the moment you cut over. Harmless, confusing, avoidable.
- **`DATABASE_URL`** — a direct connection string. Drop any pgbouncer or
  pooling parameters that were there for serverless; a long-lived server keeps
  one pool and does not need them.
- **`CORS_ORIGIN`** — the public origin(s) the browser will be on.
- **`TRUST_PROXY=1`**, because Node now sits behind nginx/Caddy rather than
  being the edge itself. Without it every request appears to come from
  `127.0.0.1` and the rate limiters treat the whole school as one visitor.
- **The client-IP header.** `public.routes.ts` reads `x-vercel-forwarded-for`;
  behind your own proxy that becomes `x-forwarded-for`. One line, and the
  registration rate limiting depends on it being right.
- **`DANGER_RESET_PASSPHRASE`** and the VAPID keys, if you use push.

---

## 8. Moving the data

```bash
# from the current database
pg_dump "$OLD_DATABASE_URL" -Fc -f lrimunx.dump

# on the school box
createdb lrimunx
pg_restore -d lrimunx lrimunx.dump
npx prisma migrate deploy     # replays any migrations the dump predates
```

Then **check the counts match** before pointing anything at it — delegates,
committees, registrations, users. A restore that silently half-worked is worse
than one that failed.

The payment screenshots have to move too: they are files in Vercel Blob, and
whatever is in `paymentProofUrl` must still resolve afterwards. Copy them into
the new bucket and rewrite the stored URLs in the same transaction, or leave the
old ones reachable until the conference is over.

---

## 9. Backups — the thing that quietly stops happening

Your host does this invisibly today. The day it becomes your job is the day it
stops getting done.

```bash
# /etc/cron.daily/lrimunx-backup
pg_dump "$DATABASE_URL" -Fc -f "/backups/lrimunx-$(date +%F).dump"
find /backups -name 'lrimunx-*.dump' -mtime +30 -delete
```

Two rules:

1. **Off the machine.** A backup on the same disk as the database is not a
   backup. Copy it to a different box, a NAS, or cloud storage.
2. **Test the restore.** An untested backup is a guess. Restore one into a
   scratch database once, before you need it, and confirm the row counts.

---

## 10. Honest summary

**Cost:** essentially zero in money, meaningful in time — one weekend to set up
if §1.1 passes, plus ongoing attention forever.

**What you gain:** full control, no plan restrictions, no commercial-use clause,
and something genuinely instructive to run.

**What you take on:** uptime, TLS renewal, backups, security patching, and being
the person who gets called when registration breaks at 11pm.

**The realistic recommendation:** if you do this, do it in a **quiet month**,
not the month before the conference, and keep the Vercel deployment alive and
receiving pushes until the school box has survived a full registration cycle.
Cutting over under deadline pressure is how a working site becomes a broken one.
