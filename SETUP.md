# Deploying LRI MUN X

One Node process serves the public site, the operations hub and the API on a
single port. Put a reverse proxy in front of it for HTTPS and you are done.

```
        the internet
             |
        Caddy / nginx / IIS        (TLS, port 443)
             |
        node  :4000                (site + hub + API)
             |
        PostgreSQL :5432           (same machine, or managed elsewhere)
```

Nothing else is required. There is no separate web server for the static files —
the app serves them itself when `SERVE_STATIC=true`.

---

## 1. What you need

- **Node.js 20 or newer**
- **PostgreSQL 14 or newer** — on the same machine, or a managed one
- **A domain name** pointing at the server
- **512 MB RAM to run**; 2 GB or more to *build* (Vite and `tsc` are the hungry
  part, not the running app)

## 2. Environment

Create `.env` **at the repository root**. It has to be there — the app resolves
it relative to itself and will not find it elsewhere.

Start from `.env.example`, which documents every variable. The required ones:

| Variable | Notes |
| :--- | :--- |
| `DATABASE_URL` | `postgresql://user:pass@localhost:5432/lrimunx` |
| `JWT_SECRET` | 32+ random characters |
| `JWT_REFRESH_SECRET` | 32+ random characters, **different** from the above |
| `GOOGLE_SHEETS_WEBHOOK_SECRET` | 16+ characters. **Required even if you never use Google Sheets** — the server refuses to start without it |

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

For a single-domain deployment, also set:

```bash
SERVE_STATIC=true
CORS_ORIGIN=https://mun.lrischool.edu.np
TRUST_PROXY=1          # 1 when behind a proxy, 0 when Node faces the internet
PORT=4000
NODE_ENV=production
```

Optional, and each safely omitted: `SMTP_*` (approval emails — without these
approving still works, it just reports that no email was sent), `S3_*`
(payment screenshot uploads — without these the upload endpoint answers 503 and
registration still completes), `VAPID_*` (push notifications),
`DANGER_RESET_PASSPHRASE` (leaving it empty disables the bulk-reset endpoint
entirely).

## 3. First deployment — Linux

```bash
sudo apt update && sudo apt install -y nodejs npm postgresql git

sudo -u postgres createuser --pwprompt lrimunx
sudo -u postgres createdb --owner=lrimunx lrimunx

sudo mkdir -p /srv/lrimunx && sudo chown "$USER" /srv/lrimunx
git clone <your-repo-url> /srv/lrimunx
cd /srv/lrimunx

nano .env                        # section 2

npm ci
export VITE_API_BASE_URL=/api/v1   # MUST be set before building
npm run deploy
```

`npm run deploy` generates the Prisma client, applies migrations, builds all
three workspaces, composes them into `dist/`, and creates the first admin
account from `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` if the user table is
empty.

Check it:

```bash
npm start
curl -I localhost:4000/          # 200, HTML
curl -I localhost:4000/admin     # 200, HTML
curl    localhost:4000/health    # {"status":"ok",...}
```

### Keep it running

`/etc/systemd/system/lrimunx.service`:

```ini
[Unit]
Description=LRI MUN X
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

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lrimunx
sudo systemctl status lrimunx
```

### HTTPS

Caddy is the least work — it obtains and renews certificates automatically.
`/etc/caddy/Caddyfile`:

```
mun.lrischool.edu.np {
    reverse_proxy 127.0.0.1:4000
}
```

```bash
sudo systemctl reload caddy
```

That is the whole configuration. Caddy passes every path through, so `/`,
`/register`, `/admin` and `/api/v1` all reach the app, which handles the routing
itself.

<details>
<summary>nginx instead of Caddy</summary>

```nginx
server {
    listen 443 ssl;
    server_name mun.lrischool.edu.np;

    ssl_certificate     /etc/letsencrypt/live/mun.lrischool.edu.np/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mun.lrischool.edu.np/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Note `X-Forwarded-For $remote_addr` and **not** `$proxy_add_x_forwarded_for` —
overwriting the header rather than appending to it stops a caller forging their
own address and evading the registration rate limiter.
</details>

## 4. Windows instead

The application is identical; only the process manager and proxy change.

1. Install Node 20+ and PostgreSQL.
2. Clone, configure `.env`, and run the same `npm ci` / `npm run deploy`.
3. Run it as a service with [NSSM](https://nssm.cc/):
   ```
   nssm install LRIMUNX "C:\Program Files\nodejs\node.exe" "apps\backend\dist\index.js"
   nssm set LRIMUNX AppDirectory C:\srv\lrimunx
   nssm start LRIMUNX
   ```
4. Put IIS in front using **URL Rewrite** and **Application Request Routing**:
   add a site bound to the hostname with a single inbound rule matching `(.*)`
   and rewriting to `http://127.0.0.1:4000/{R:1}`. Bind the certificate in IIS.

Keep `TRUST_PROXY=1`, since IIS is a proxy hop.

## 5. If there is no shell at all

Shared hosting (cPanel, Plesk) cannot run a persistent Node process unless it
offers cPanel's **Setup Node.js App** (Node.js Selector). If it does, point it
at `apps/backend/dist/index.js` and set the environment variables in its panel.

If it does not, the only option is to split them: upload `dist/` as static files
to the shared host, and run the API somewhere that can hold a process. In that
case build with `VITE_API_BASE_URL=https://api.yourhost.example/api/v1` instead
of `/api/v1`, and set `CORS_ORIGIN` to the site's address. This is the worst of
the three arrangements — two hosts to keep in step — so prefer either of the
above.

## 6. Updating

```bash
cd /srv/lrimunx
git pull
npm ci
export VITE_API_BASE_URL=/api/v1
npm run deploy
sudo systemctl restart lrimunx
```

## 7. Backups

If PostgreSQL is on the same machine, its backups are your responsibility.
Nightly dump, kept for a month:

```bash
sudo -u postgres crontab -e
```

```cron
0 2 * * * pg_dump lrimunx | gzip > /var/backups/lrimunx-$(date +\%F).sql.gz
0 3 * * * find /var/backups -name 'lrimunx-*.sql.gz' -mtime +30 -delete
```

Copy those off the machine as well — a backup on the same disk as the database
is not a backup. Restore with:

```bash
gunzip -c /var/backups/lrimunx-2026-08-13.sql.gz | psql lrimunx
```

Payment screenshots live in object storage, not on this server, so they are
covered by whatever that bucket's retention is.

## 8. Adding photos

Both folders degrade gracefully — a missing image falls back to a painted gold
plate rather than a broken icon — so the site is safe to launch with gaps.

**Organising committee** → `apps/site/assets/oc/`. The roster is defined in
`apps/site/src/modules/oc.js` and each member's `photo` field names a file here:

```
chief-advisor.jpg          advisor-01.jpg            advisor-02.jpg
secretary-general.jpg      deputy-secretary-general.jpg
director-general.jpg       charge-daffaires.jpg      head-committee-affairs.jpg
usg-delegate-affairs.jpg   usg-logistics.jpg         usg-finance.jpg
usg-press.jpg              usg-design.jpg            usg-outreach.jpg
usg-technology.jpg         usg-hospitality.jpg
```

Portrait crops, 800×1000 px, under ~120 KB each. Advisors and Upper Secretariat
render 4:5 and Under Secretariat 1:1, so leave headroom and `object-fit: cover`
handles both.

**Past editions** → `apps/site/assets/past-galleries/`, one folder per edition
and **one frame each**: `edition-01/01.jpg` through `edition-09/01.jpg`.
1600 px on the long edge, ~200 KB each. The `ratio` field in
`src/modules/gallery.js` reserves each tile before the image loads — do not
remove it, it is what keeps layout shift at zero.

## 9. Before you launch

- [ ] **Replace the placeholder names in `apps/site/src/modules/oc.js`.** The
      committee member names are not real, and the `alt` text is generated from
      them.
- [ ] **Replace or delete the `QUOTES` array in
      `apps/site/src/modules/gallery.js`.** Every testimonial in it is invented —
      no quote, name, committee or year is real. Do not ship fabricated reviews.
- [ ] Replace the `og:url` values in `apps/site/index.html` and `register.html`,
      which still read `https://example.org/mun`.
- [ ] Replace the `https://www.instagram.com/PLACEHOLDER` links, or remove them.
- [ ] Add `apps/site/assets/og-image.jpg` — referenced but not present.
- [ ] Replace `apps/site/assets/payment-qr.svg` with the real, scannable QR.
- [ ] Sign in and change the bootstrap admin password.

## 10. When something is wrong

**The server exits immediately on start.** It validates its configuration
before listening and refuses to run half-configured. Read the message — it names
the variable. The usual culprit is `GOOGLE_SHEETS_WEBHOOK_SECRET`, which is
required with no default even though most deployments never use the webhook.

**The hub loads but every request fails.** `VITE_API_BASE_URL` was not set when
you built, so the bundle points at `localhost:4000`. It is compiled in, not read
at runtime — rebuild with it set.

**The build aborts saying the API base is unreachable.** A deliberate guard: it
scans the built bundle and refuses a base that is `localhost` or a hostname with
no dot. An intranet name like `https://munserver/api/v1` trips it. Use a fully
qualified name, or `/api/v1` for a same-origin deployment.

**`/admin` loads but the page is blank and the console reports a MIME type
error.** Something upstream is serving `index.html` where JavaScript was
requested. The app gets this right on its own; if a proxy sits in front, make
sure it forwards everything rather than trying to route `/admin/*` itself.

**Everything comes from the same IP in the logs, and rate limiting blocks
everyone at once.** `TRUST_PROXY` is `0` while a proxy is in front. Set it to
`1`. Conversely, if Node faces the internet directly, `TRUST_PROXY` must be `0`
or callers can forge their address.

**`prisma migrate deploy` hangs.** It cannot hold an advisory lock through a
transaction-mode connection pooler. Run migrations against the direct database
URL, not a pooled one.

**A clean `npm ci` produces a broken install.** The `allowScripts` block in
`package.json` is what permits Prisma's query engine and esbuild's binary to be
placed. Do not remove it.
