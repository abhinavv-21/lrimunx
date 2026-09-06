# Setting up LRI MUN X

Two ways to host this, and this file covers both.

**Part One** takes you from no accounts at all to a working site on a free plan,
with no credit card entered anywhere. About an hour, most of it waiting for
builds. This is where the site lives now.

**Part Two** is Oracle Cloud Always Free, one virtual machine you control. More
work, more capable, and the only one of the two whose free tier permits a site
that asks people for money. Read Step 0 before you decide.

Every command in this file runs from the repository root:

```
D:\LRI MUN X\Management Webapp
```

You need **Node 20 or newer** and **git**. Nothing else on your own machine.

---

# Part One: getting it live, free

Steps are numbered 1 to 13 and refer to each other by number. Part Two has its
own numbering, and says so where it starts.

## Step 0. The money, before anything else

You said the card is not yours. That changes what you should do, so read this
whole step before creating a single account.

### What the three services cost

| Service | What it does here | Plan | Card needed to sign up | Can it ever charge? |
| :--- | :--- | :--- | :--- | :--- |
| **GitHub** | holds the code, triggers deploys | Free | No | No |
| **Neon** | the PostgreSQL database | Free | No | No |
| **Vercel** | builds and serves the site, hub and API | Hobby | No | No |

That is the whole hosting bill: nothing.

Neither Neon nor Vercel bills a free account when you run past a limit. Neither
one *can*, because neither has a card on file and neither offers overage billing
on its free tier. They stop instead:

- **Neon Free** gives 0.5 GB of storage and 100 compute-hours per project each
  month, plus 5 GB of network transfer. Run out of compute-hours or transfer and
  the database is suspended until the next month. Fill the 0.5 GB and writes
  start failing. Your data is not deleted in any of those cases. The compute
  also sleeps after 5 minutes of no queries, which is why almost nothing counts
  against those 100 hours while you are only testing.
- **Vercel Hobby** has no billing cycle at all. Exceed a limit and that feature
  pauses, usually for 30 days, and then works again. The published guidance for
  a Hobby account is up to 100 GB of data transfer, 1M function calls, 4 CPU-hours
  and 360 GB-hours of memory per month, with 100 deployments a day.

For scale: 400 delegates loading a 1.5 MB page ten times each is under 6 GB of
transfer. You are not close to any of these numbers.

Vercel's Spend Management, the feature that caps a bill, is a Pro feature and
shows as **N/A** on Hobby. That is not a gap. There is no bill to cap.

### The one rule that can actually bite you

Vercel's fair use policy restricts Hobby to **non-commercial personal use**, and
this is their own first example of commercial use:

> Any method of requesting or processing payment from visitors of the site

The registration page shows a payment QR code, states a delegate fee, and asks
for a screenshot of the transfer. That is requesting payment from visitors.
Vercel also says plainly that asking for donations counts.

So the honest position: **while the fee is live, this site does not meet the
terms of the plan it is on.** Vercel enforces by pausing a deployment and asking
you to upgrade, not by charging you, so the card is still safe either way. But a
paused site during registration week is its own disaster.

### What to do about it

Three real options.

**Stay on Vercel Hobby while you build.** No card, no charge, nothing to
decide. Correct for everything up to the day the fee goes live: previews,
testing, showing the advisors, the whole secretariat learning the hub.

**Move to Oracle Cloud Always Free before registration opens.** Part Two. Its
free tier has no non-commercial clause, so the payment QR is not a problem.
Oracle does ask for a card at signup to verify identity, and places a small
temporary authorisation on it that reverses within a few days. Always Free
resources are never billed. If the card belongs to the school, this needs the
cardholder's consent for that one verification step, and Oracle section 1 and
Step 1 below both tell you how to make sure nothing can charge it later.

**Upgrade Vercel to Pro.** $20 per developer per month, on a real card, every
month. Only worth raising if the school would rather pay than run a server.

My recommendation: build on Hobby now, and move to Oracle before you publish the
fee. That is already the plan the repository is written around, which is why
Part Two exists and is the longer half of this file.

## Step 1. Make sure no card can ever be charged

Do this once at signup and once more before launch.

### Vercel

1. Sign up at **vercel.com/signup** with **Continue with GitHub**. You will not
   be asked for a card. If a screen ever asks for one, you are on the wrong flow
   or a Pro trial. Back out.
2. Stay on the personal **Hobby** account. Do not create a Team. Teams are the
   Pro billing unit.
3. **Never start the Pro trial.** It asks for a card and converts to a paid plan
   when it ends. The Upgrade button is in the sidebar and is easy to hit by
   accident.
4. Do not add team members. Developer seats are $20 each per month.
5. Add the database **from Neon directly** (Step 4), not from Vercel's
   Storage tab. Adding it through Vercel routes Neon's billing through your
   Vercel account, which is one more place a charge could appear. Going direct
   keeps the two completely separate.
6. Do not buy a domain from Vercel. Domains bought there cost money and renew
   annually. Adding a domain the school already owns is free, and that is what
   Step 9 does.

**Prove it:** Vercel dashboard → **Settings** → **Billing**. It should say
**Hobby**, and there should be no payment method listed.

### Neon

1. Sign up at **neon.com** with GitHub or Google. No card is requested.
2. Leave the project on the **Free** plan. Ignore the prompts to upgrade to
   Launch or Scale.

**Prove it:** Neon console → **Billing**. Plan should read **Free**, with no
payment method.

### If a card is already attached to either account

You cannot remove a payment method while a paid plan is using it. Downgrade
first, then remove:

- **Vercel:** Settings → Billing → **Plan** → downgrade to Hobby. Then, in the
  same page, delete the saved card. Check **Settings → Billing → Invoices** is
  empty or fully paid before you finish.
- **Neon:** Billing → change plan to **Free**, then remove the card.

If a charge has already happened, both of them will show it under Invoices with
a date and an amount. Screenshot it before you change anything, so whoever owns
the card gets a straight answer.

### If you go to Oracle later

Oracle is the one that needs a card at signup. Two things make it safe:

- **Never click "Upgrade to Pay As You Go."** Always Free stays free forever on
  a free account. Upgrading turns on billing for everything outside the free
  allowances, permanently, and it is a one-way door.
- **Set a budget alert at the smallest amount Oracle accepts.** Console →
  **Billing & Cost Management → Budgets → Create Budget**, scope it to the root
  compartment, set the amount to 1, and set the alert rule to trigger at 1% of
  actual spend. Any charge at all then emails you the same day instead of
  showing up on a statement a month later.

## Step 2. The accounts you need

Three, in this order. Use an address the conference controls, not a personal one
that leaves with whoever graduates.

| # | Service | Where | Sign in with |
| :--- | :--- | :--- | :--- |
| 1 | GitHub | github.com/signup | email |
| 2 | Neon | neon.com | the GitHub account from 1 |
| 3 | Vercel | vercel.com/signup | the GitHub account from 1 |

Signing Neon and Vercel in through GitHub means one password to protect rather
than three. Turn on two-factor authentication on the GitHub account before you
do anything else: it now controls all three.

## Step 3. Put the code on GitHub

Skip this if the repository already exists. It does for this project, at
`abhinavv-21/lrimunx`.

```bash
git remote -v            # already has an origin? skip the rest of this step
```

Otherwise, on github.com click **New repository**, name it `lrimunx`, leave it
**Private**, and do not let it add a README or a `.gitignore`. Then:

```bash
git remote add origin https://github.com/<your-username>/lrimunx.git
git branch -M main
git push -u origin main
```

Nothing secret is in the repository. `.env` is gitignored and stays on your
machine. Every real secret lives in Vercel's environment variables instead.

## Step 4. Create the database on Neon

1. Neon console → **New Project**.
2. Name it `lrimunx`.
3. **Region: Singapore (ap-southeast-1).** This matters. `vercel.json` pins the
   function to `sin1`, which is Singapore. A database in Virginia would add
   roughly 200ms to every single query.
4. Postgres version: the default is fine.
5. Create it, and leave the connection details on screen. You need two strings
   from this page and they are not the same string.

**The pooled one**, for `DATABASE_URL`. It has `-pooler` in the hostname. Add
two parameters to the end by hand:

```
postgresql://…-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=1
```

Every cold start of the function opens its own connection. Without the pooler
and that limit, a handful of people registering at once exhausts the database's
connection cap instead of queueing behind it.

**The direct one**, for `DIRECT_URL`. Same string with **no** `-pooler` in the
hostname, and without `pgbouncer` or `connection_limit`:

```
postgresql://….ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

Database migrations take a PostgreSQL advisory lock, and a transaction-mode
pooler cannot hold one across statements. Point migrations at the pooled URL and
they hang forever rather than failing with a message.

`DIRECT_URL` is not optional and cannot be blank. The schema declares it, and
Prisma has no fallback: unset, every command dies with `P1012`; set to an empty
string, it dies with "You must provide a nonempty direct URL".

Keep both strings somewhere safe for Step 6. They contain the database password.

## Step 5. Create the Vercel project

1. Vercel dashboard → **Add New → Project**.
2. **Import Git Repository**, and authorise Vercel to read the GitHub account.
   Grant it access to the one repository rather than all of them.
3. Pick `lrimunx`.
4. **Do not touch the build settings.** `vercel.json` in the repository already
   sets the build command, the output directory and the region. Anything you
   type into the dashboard overrides that file and will drift out of sync with it.
5. Expand **Environment Variables** and add everything in Step 6 *before* you
   click Deploy. The first build runs migrations, so it needs the database
   already configured.
6. Deploy.

The first build takes three to four minutes. It runs `prisma generate`, then
`prisma migrate deploy` (which creates every table in the empty Neon database),
then builds all three workspaces.

## Step 6. Environment variables

In Vercel: **Settings → Environment Variables**. Add each one to **Production**,
**Preview** and **Development** unless noted.

Generate every secret separately. Never reuse one for two variables:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Required. The server refuses to start without these

| Variable | Value |
| :--- | :--- |
| `DATABASE_URL` | the pooled string from Step 4 |
| `DIRECT_URL` | the direct string from Step 4 |
| `JWT_SECRET` | a fresh 48-byte random string |
| `JWT_REFRESH_SECRET` | a **different** 48-byte random string |
| `GOOGLE_SHEETS_WEBHOOK_SECRET` | any 16+ character random string |

`GOOGLE_SHEETS_WEBHOOK_SECRET` is required even though most deployments never
use the webhook. It is the single most common reason a first deploy will not
boot. Give it a random value and move on.

### Required for Vercel specifically

| Variable | Value | Why |
| :--- | :--- | :--- |
| `SERVE_STATIC` | `false` | Vercel serves `dist/` itself. Leave this `true` and the function tries to serve files it was never given: the site 404s while the API keeps answering, which is a confusing way to find out. |
| `TRUST_PROXY` | `1` | Vercel is a proxy hop. At `0` the app ignores `X-Forwarded-For` and sees one IP for the whole internet. Registration is rate limited to 5 per 15 minutes per IP, so the sixth delegate anywhere in the world gets blocked, and so does everyone after them. |
| `VITE_API_BASE_URL` | `/api/v1` | Compiled into the browser bundle at build time, not read at runtime. Changing it later does nothing until you redeploy. |
| `CORS_ORIGIN` | `https://lrimunx.vercel.app` | Comma-separated. Add the real domain here too once Step 9 is done. |

**Do not set `NODE_ENV`.** Vercel sets it to `production` for you, and a
hardcoded value here has caused trouble before.

### Optional, and safe to leave out at first

| Variable | Leaving it empty means |
| :--- | :--- |
| `S3_*` (five of them) | Payment screenshot uploads answer 503. The form says so and registration still completes. Step 10. |
| `SMTP_*` | Approving a registration works, and the hub says plainly that no email was sent rather than claiming one was. Step 11. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VITE_VAPID_PUBLIC_KEY` | No browser push notifications. Generate with `npx web-push generate-vapid-keys`. |
| `DANGER_RESET_PASSPHRASE` | The endpoint that wipes all conference data is disabled entirely. That is the right default until you need it. |

### Two you add now and delete later

| Variable | Value |
| :--- | :--- |
| `SEED_ADMIN_USERNAME` | e.g. `secretariat` |
| `SEED_ADMIN_PASSWORD` | something long, changed on first sign-in |

Step 8 uses these once, then tells you to remove them.

## Step 7. Watch the first build

Vercel dashboard → **Deployments** → click the running one.

If it fails, the log names the cause. The three that actually happen:

- **Hangs at `prisma migrate deploy`.** `DIRECT_URL` is pointing at the pooled
  host. It must be the one *without* `-pooler`.
- **`P1012 Environment variable not found: DIRECT_URL`.** You did not set it, or
  set it to an empty string. Both fail. See Step 4.
- **The build aborts saying the API base is unreachable.** A deliberate guard.
  It scans the built bundle and rejects any API base that is `localhost` or a
  hostname with no dot in it. `/api/v1` is what you want here.

When it goes green, open the deployment URL. The site loads, but nobody can sign
in yet, because the database has tables and nothing in them.

## Step 8. The first admin account and the committees

The build deliberately does not create accounts. A build container should not be
writing users into your database, so you run this once, yourself.

```bash
npx vercel login
npx vercel link                       # pick the lrimunx project
npx vercel env pull .env.production.local --environment=production
```

That file holds live credentials. It is gitignored. **Delete it when you are
done.**

Open it, copy the **`DIRECT_URL`** value, and run this in **Git Bash** (the
backslashes and the `VAR="…"` prefixes are Bash syntax and will not parse in
PowerShell):

```bash
DATABASE_URL="<paste DIRECT_URL here>" \
DIRECT_URL="<paste DIRECT_URL here>" \
SEED_ADMIN_USERNAME="secretariat" \
SEED_ADMIN_PASSWORD="<the password from Step 6>" \
node scripts/bootstrap-admin.mjs
```

Use the direct string for both. This is a one-off script rather than a
serverless function, so it wants a direct connection.

It does two things, both safe to repeat:

1. Creates the first account, as ADMIN and as the owner, **only if no account
   exists at all**. The owner flag matters: settings, the danger zone and the
   restart button answer to it and nothing else, so an account created without
   it produces a hub whose owner-only screens can never be reached.
2. Creates every committee from `apps/site/src/data/committees.js` that is not
   already there, and never modifies one that is. If the secretariat has changed
   a seat count in the hub, re-running this will not undo it.

Then clean up:

```bash
rm .env.production.local
```

And in Vercel, **Settings → Environment Variables**, delete `SEED_ADMIN_PASSWORD`
from every environment after you have signed in once and changed it.

## Step 9. The domain

The school's IT team controls `lri.edu.np`. `DOMAIN-REQUEST.md` in this
repository is the request to hand them; it asks for one A record and nothing
else. Confirm with them whether the zone is `lri.edu.np` or `lrischool.edu.np`,
because the site currently links to the second one.

On Vercel: **Settings → Domains → Add**, type `mun.lri.edu.np`, and Vercel shows
you the exact record to give IT. Do not buy a domain here. Adding one the school
already owns is free; buying one is not.

Once it resolves, add it to `CORS_ORIGIN` alongside the Vercel URL and redeploy.
`VITE_API_BASE_URL` stays `/api/v1`, because the site and the API are the same
origin either way.

## Step 10. Payment screenshots

Registration works without this. The upload endpoint answers 503, the form says
so plainly, and the application still completes. What you lose is any proof that
someone paid, so fill it in before registration opens.

Five variables, S3-compatible so the provider can change later without touching
code. Oracle Object Storage is covered in Oracle section 14; Cloudflare R2 and
Supabase Storage both work the same way.

```
S3_ENDPOINT, S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
```

**The bucket must be private.** Payment screenshots are transaction records.
They are readable only through a signed URL, which only a signed-in hub user can
obtain. A public bucket puts every delegate's bank screenshot on the open
internet under a guessable name.

`S3_REGION` catches people out. Signing puts a region in every request even
where the provider ignores it. Cloudflare R2 and MinIO accept `auto`. Oracle
does not, because it validates the region inside the signature, so use the real
region id there.

## Step 11. Approval emails

Also optional. Without it, approving a registration still creates the delegate,
and the hub says no email was sent rather than pretending one was.

For Gmail or Google Workspace: `smtp.gmail.com`, port 587, `SMTP_SECURE=false`,
and an **app password** from the Google account's security page. A normal
account password will not authenticate, and generating an app password requires
2FA to be on. `SMTP_FROM` has to match the authenticated mailbox or most
providers refuse to send.

## Step 12. Check it works

On the deployment URL:

- [ ] `/` loads and the committee grid shows 14 cards
- [ ] **Details** on a committee opens the dialog
- [ ] **Apply** from that dialog lands on `/register` with the committee preselected
- [ ] `/register` submits and you get a confirmation
- [ ] `/admin` shows the login page
- [ ] you can sign in with the account from Step 8
- [ ] the hub's **Committees** page lists all 14
- [ ] **Admin** appears in the sidebar. It is owner-only, so if it is missing,
      the owner flag did not get set
- [ ] `/health` returns `{"status":"ok",…}`
- [ ] paste the URL into WhatsApp and check the share preview

And locally, before every deploy:

```bash
npm run verify
```

That runs the committee and page checks, the script tests, the linter, the type
checker and both test suites. The API integration suite self-skips when
`DATABASE_URL` and the JWT secrets are absent and still lets the run go green,
so read the output for `[integration] Skipping the API integration suite` if you
meant it to run.

## Step 13. The monthly money check

Two minutes, once a month, until the conference is over.

| Where | What you want to see |
| :--- | :--- |
| Vercel → Settings → Billing | Plan **Hobby**, no payment method, no invoices |
| Vercel → the project → **Usage** | every bar well short of its limit |
| Neon → Billing | Plan **Free**, no payment method |
| Neon → the project → **Monitoring** | compute-hours under 100 for the month |

If you moved to Oracle, add: Console → **Billing & Cost Management → Cost
Analysis**, which should read 0.00 for every month, and confirm the budget alert
from Step 1 still exists.

---

# Part Two: Oracle Cloud Always Free

Where this is going, and the only one of the two free tiers that permits a site
asking visitors for money. Step 0 explains why that matters.

**The section numbers below belong to Part Two.** A reference to "section 6"
means section 6 of this part, not Step 6 of Part One.

One Node process serves the public site, the operations hub and the API on a single
port. Caddy sits in front for HTTPS. PostgreSQL runs on the same machine. Payment
screenshots go to Oracle Object Storage.

```
        the internet
             |
        Caddy :443                 (TLS, obtained and renewed automatically)
             |
        node  :4000                (site + hub + API)
             |
        PostgreSQL :5432           (same machine)

        Oracle Object Storage      (payment screenshots, S3-compatible API)
```

All of it fits inside Always Free. Nothing here costs money if you stay within the
limits in section 1.

---

## 1. What Always Free actually gives you

**Read this before you build anything.** Oracle cut the free ARM allowance in half
on **15 June 2026**, from 4 OCPU / 24 GB to 2 OCPU / 12 GB, without announcing it,
and began terminating instances over the new limit on **18 August 2026**. Every
guide written before mid-2026 tells you to build a 4-core box. That box gets killed.

| Resource | Always Free allowance |
| :--- | :--- |
| Ampere A1 compute | 1,500 OCPU-hours + 9,000 GB-hours per month, which is **2 OCPU / 12 GB running 24/7** |
| AMD micro compute | 2 × `VM.Standard.E2.1.Micro`, 1/8 OCPU and 1 GB each |
| Block storage | 200 GB total across boot and block volumes, 5 backups |
| Object Storage | 20 GB, 50,000 API requests per month |
| Outbound transfer | 10 TB per month |
| Load balancer | 1 flexible, 10 Mbps |
| VCNs | 2 |

This deployment uses one A1 instance at the full 2 OCPU / 12 GB, about 50 GB of the
block storage, and a fraction of the object storage. A conference site serving a few
thousand people will not come close to 10 TB of egress.

**Do not use the AMD micro shape for this.** 1 GB of RAM cannot run the build. You
would have to build elsewhere and upload `dist/`, which is a worse arrangement for
no gain.

**You do not need the free load balancer.** Caddy on the instance terminates TLS,
and the load balancer's 10 Mbps cap is lower than the instance's own throughput.

A credit card is required at signup for identity verification. Always Free resources
are not charged against it. If you later upgrade to Pay As You Go, the Always Free
resources stay free, but everything else starts billing, so stay on the free tier
unless you have decided otherwise. Upgrading is a one-way door.

**Set a budget alert before you build anything.** Part One, Step 1 has the exact
click path: it takes a minute and turns any charge at all into an email the same
day.

## 2. Pick your home region, and get it right the first time

**Your home region is permanent.** You cannot move a tenancy to another region later.

For delegates in Nepal, pick **Mumbai (`ap-mumbai-1`)** or **Singapore
(`ap-singapore-1`)**. Mumbai is the closer of the two.

A1 capacity is regional and heavily contested. If the region you want has no A1
capacity at all, that is a reason to choose a different one at signup, not something
you can fix afterwards. See section 5.

## 3. Network

Console → **Networking → Virtual Cloud Networks → Start VCN Wizard → Create VCN with
Internet Connectivity.** Accept the defaults. This creates the VCN, a public subnet,
an internet gateway and the route table in one step.

Then open the web ports. **Networking → Virtual Cloud Networks → your VCN → Security
Lists → Default Security List → Add Ingress Rules:**

| Stateless | Source | IP Protocol | Source Port | Destination Port |
| :--- | :--- | :--- | :--- | :--- |
| No | `0.0.0.0/0` | TCP | All | `80` |
| No | `0.0.0.0/0` | TCP | All | `443` |

This is only the first of two firewalls. Section 6 is the other one, and it is the
step people miss.

## 4. Launch the instance

**Compute → Instances → Create Instance.**

| Setting | Value |
| :--- | :--- |
| Image | Canonical Ubuntu 24.04 (aarch64) |
| Shape | `VM.Standard.A1.Flex` |
| OCPUs | 2 |
| Memory | 12 GB |
| Boot volume | 50 GB |
| Subnet | the public subnet from section 3 |
| Public IPv4 | Assign |
| SSH keys | paste your public key, or let Oracle generate one and **save the private key immediately**, because it is shown once |

Confirm the shape header says **Always Free eligible** before you create it. If it
does not, you have picked the wrong shape or exceeded the allowance.

Then make the address permanent. A newly created instance gets an *ephemeral* public
IP that changes if the instance is stopped and started, which would silently break
your DNS. **Instance → Resources → Attached VNICs → your VNIC → IPv4 Addresses →
Edit the public IP → No Public IP**, then re-add it as **Reserved**. Do this before
you point DNS at it.

```bash
ssh -i ~/.ssh/your-key ubuntu@<your-public-ip>
```

## 5. When it says "Out of capacity"

`Out of host capacity` on an A1 shape is the single most common thing that stops
people, and it is not a problem with your account. Free ARM capacity in popular
regions is genuinely exhausted much of the time.

What works:

- **Try each availability domain in turn.** Multi-AD regions such as Mumbai often
  have capacity in AD-2 or AD-3 when AD-1 has none.
- **Ask for less.** 1 OCPU / 6 GB frequently succeeds where 2 OCPU / 12 GB fails.
  You can scale the instance up later, in place, when capacity frees up.
- **Retry on a schedule.** Capacity is released continuously as other people delete
  instances. Attempts at off-peak hours for the region succeed more often.

The Oracle Cloud CLI makes retrying practical:

```bash
# after `oci setup config` on your own machine
until oci compute instance launch --from-json file://instance.json; do
  echo "no capacity, retrying in 60s"; sleep 60
done
```

Do not run this every few seconds. Oracle rate-limits the API and hammering it makes
things worse, not faster.

## 6. Open the ports on the instance itself

**Section 3 was not enough.** Oracle's Ubuntu images ship with an iptables rule that
rejects everything except SSH. You can have the security list perfectly configured
and still get a connection timeout on port 80.

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

**The `netfilter-persistent save` is not optional.** Without it the rules work
perfectly until the first reboot and then vanish, which is a miserable thing to
debug six weeks later.

Check it took:

```bash
sudo iptables -L INPUT -n --line-numbers | head -20
```

The two ACCEPT rules must appear **above** the catch-all `REJECT`. If they are below
it they never match. `-I INPUT 6` puts them at position 6, which is above the reject
on a stock Ubuntu image, but confirm rather than assume.

### Which of the two firewalls is blocking you

Run this on the instance, then load `http://<your-ip>` from your browser:

```bash
sudo tcpdump -i any -n port 80
```

- **Packets appear:** they reached the instance, so the security list is fine and
  the instance firewall is dropping them. Fix iptables.
- **Nothing appears:** they never arrived. Fix the VCN security list, and check the
  subnet's route table has a default route to the internet gateway.

## 7. DNS

Create an **A record** for your domain pointing at the reserved public IP.

Do this now and wait for it to resolve, because Caddy requests a certificate on
first start and that request fails if the name does not yet point at the machine.

```bash
dig +short mun.lrischool.edu.np
```

## 8. Install the software

```bash
sudo apt update && sudo apt upgrade -y

# Node 20 (the distro package is too old)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git postgresql postgresql-contrib

# Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

node --version    # v20 or newer
psql --version    # 14 or newer
```

All of these have native `arm64` builds. So do the two dependencies that matter to
this project: Prisma's query engine and esbuild's binary. The `allowScripts` block in
`package.json` is what permits both to be placed during install. Do not remove it, on
any platform.

## 9. Database

```bash
sudo -u postgres psql <<'SQL'
CREATE USER lrimunx WITH PASSWORD 'pick-something-long';
CREATE DATABASE lrimunx OWNER lrimunx;
SQL
```

`DATABASE_URL` then reads:

```
postgresql://lrimunx:pick-something-long@localhost:5432/lrimunx?schema=public
```

Because PostgreSQL is on the same machine, this is a direct connection, which is what
you want. `prisma migrate deploy` takes an advisory lock through a transaction and
cannot do that through a transaction-mode connection pooler. If you ever move the
database to a managed pooled service, run migrations against the direct URL.

## 10. Get the code and write `.env`

```bash
sudo mkdir -p /srv/lrimunx && sudo chown "$USER" /srv/lrimunx
git clone <your-repo-url> /srv/lrimunx
cd /srv/lrimunx
cp .env.example .env
nano .env
```

`.env` must be at the **repository root**. The app resolves it relative to itself and
will not find it anywhere else.

Generate each secret separately:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Required, or the server exits on start

| Variable | Notes |
| :--- | :--- |
| `DATABASE_URL` | from section 9 |
| `DIRECT_URL` | **Set it to exactly the same value as `DATABASE_URL`.** There is no pooler here, but Prisma requires the variable to exist once the schema declares `directUrl`, and there is no fallback. Unset, every Prisma command dies with `P1012`; empty, with "You must provide a nonempty direct URL" |
| `JWT_SECRET` | 32+ characters, and must not still start with `replace-me` |
| `JWT_REFRESH_SECRET` | 32+ characters, **different** from the above |
| `GOOGLE_SHEETS_WEBHOOK_SECRET` | 16+ characters. **Required even though most deployments never use the webhook.** This is the usual reason a first deploy will not start |

### Required for this arrangement to work at all

```bash
NODE_ENV=production
PORT=4000
SERVE_STATIC=true
CORS_ORIGIN=https://mun.lrischool.edu.np
TRUST_PROXY=1
```

**`TRUST_PROXY=1` matters more than it looks.** Caddy is a proxy hop, so every
request arrives from `127.0.0.1`. Left at `0`, the app ignores `X-Forwarded-For` and
sees one IP for the entire internet. Public registration is rate-limited to 5 per 15
minutes per IP, so the sixth delegate to register anywhere in the world gets blocked,
and so does everyone after them. This is the single setting most likely to ruin a
launch day.

The reverse is also true: if you ever run Node facing the internet directly,
`TRUST_PROXY` **must** be `0`, or a caller can forge their own address in a header and
walk straight past the limiter.

### Payment screenshots (section 14)

```bash
S3_ENDPOINT=""
S3_BUCKET=""
S3_REGION=""
S3_ACCESS_KEY_ID=""
S3_SECRET_ACCESS_KEY=""
```

Leave these empty and `POST /api/v1/public/blob-upload` answers 503. The form says so
plainly and registration still completes without a screenshot, which is a supported
state, but it means nobody can prove they paid. Fill them in before registration opens.

### Approval emails

```bash
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASSWORD=""
SMTP_SECURE="false"
SMTP_FROM="LRI MUN X <mun@lrischool.edu.np>"
```

Leave empty and approving a registration still works. The hub says plainly that no
email was sent rather than claiming one was. For Gmail or Google Workspace use
`smtp.gmail.com` port 587 with an **app password**, which requires 2FA on the account;
a normal password will not authenticate.

### First account, and the committees

```bash
SEED_ADMIN_USERNAME="secretariat"
SEED_ADMIN_PASSWORD="pick-something-long"
```

`npm run deploy` creates this ADMIN account **only if the user table is empty**, and
creates every committee from `apps/site/src/data/committees.js` that does not already
exist. It never modifies a committee that is already there, so if the secretariat has
changed a seat count in the hub, re-deploying will not undo it.

Change this password on first sign-in, then remove `SEED_ADMIN_PASSWORD` from `.env`.

`SEED_COMMITTEES=true` is a separate thing, used only by `npm run seed` for local
development. You do not need it here.

### Optional

`VAPID_*` for web push, and `DANGER_RESET_PASSPHRASE`, which gates the endpoint that
wipes all conference data. Leaving the passphrase empty disables that endpoint
entirely, which is the right default until you need it.

## 11. Build and start

```bash
cd /srv/lrimunx
npm ci

export VITE_API_BASE_URL=/api/v1     # MUST be set before building
npm run deploy
```

`VITE_API_BASE_URL` is **compiled into the browser bundle**, not read at runtime.
Setting it afterwards does nothing; you have to build again. `/api/v1` is correct here
because the site, the hub and the API are all served from one origin.

The build refuses to finish if it gets this wrong. `scripts/compose-static.mjs` scans
the composed output and rejects any API base that is `localhost` or a hostname with no
dot in it. An intranet name like `https://munserver/api/v1` trips it. That guard has
saved more deploys than anything else in this document.

`npm run deploy` runs migrations, builds all three workspaces, composes them into
`dist/`, then creates the admin account and the committees. 12 GB of RAM builds this
comfortably with no swap file.

Check it:

```bash
npm start &
curl -I localhost:4000/          # 200, HTML
curl -I localhost:4000/admin     # 200, HTML
curl    localhost:4000/health    # {"status":"ok",...}
```

## 12. Keep it running

`/etc/systemd/system/lrimunx.service`:

```ini
[Unit]
Description=LRI MUN X
After=network.target postgresql.service

[Service]
Type=simple
User=ubuntu
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
journalctl -u lrimunx -f          # follow the log
```

## 13. HTTPS

`/etc/caddy/Caddyfile`, in its entirety:

```
mun.lrischool.edu.np {
    reverse_proxy 127.0.0.1:4000
}
```

```bash
sudo systemctl reload caddy
```

Caddy obtains and renews the certificate on its own. It passes every path straight
through, so `/`, `/register`, `/admin` and `/api/v1` all reach the app, which does its
own routing. Do not try to route `/admin/*` in the proxy; that is what produces a blank
hub page and a MIME type error in the console.

## 14. Payment screenshots on Oracle Object Storage

Oracle exposes an S3-compatible API, so this drops into the existing `S3_*` variables
with no code change. `apps/backend/src/lib/storage.ts` was written against plain S3
rather than any one vendor.

**Create the bucket.** Console → **Storage → Buckets → Create Bucket.** Name it
`lrimunx-payments`, standard tier, and leave visibility **Private**. Payment
screenshots are transaction records. They are readable only through a signed URL,
which only an authenticated ops-hub user can mint via
`GET /api/v1/registrations/:id/payment-proof`. Do not make this bucket public.

**Find your namespace.** It is on the bucket detail page as *Object Storage
Namespace*, or:

```bash
oci os ns get
```

**Create a Customer Secret Key.** This is the step people miss, because it is not the
same thing as an API signing key. Console → your **Profile menu → User settings →
Customer Secret Keys → Generate Secret Key.** The secret is shown **once**. Copy it
immediately.

Then:

```bash
S3_ENDPOINT="https://<namespace>.compat.objectstorage.ap-mumbai-1.oraclecloud.com"
S3_BUCKET="lrimunx-payments"
S3_REGION="ap-mumbai-1"
S3_ACCESS_KEY_ID="<the access key shown next to the secret key>"
S3_SECRET_ACCESS_KEY="<the secret, shown once>"
```

`S3_REGION` must be the real OCI region identifier. `auto` works on Cloudflare R2 and
MinIO but not here, because Oracle validates the region inside the SigV4 signature.

Rebuild is not needed for this; these are read at runtime. Restart the service:

```bash
sudo systemctl restart lrimunx
```

Then test the real path: open `/register`, complete step 1, and upload a screenshot at
step 2. A 503 means the variables are not being read; check `journalctl -u lrimunx`.

## 15. Backups

PostgreSQL is on your machine, so its backups are your responsibility. A backup on the
same disk as the database is not a backup, so push it to Object Storage.

```bash
sudo apt install -y python3-oci-cli    # or: bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"
oci setup config
```

Create a second bucket, `lrimunx-backups`, private. Then `/usr/local/bin/lrimunx-backup`:

```bash
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%F)
FILE="/tmp/lrimunx-${STAMP}.sql.gz"

pg_dump lrimunx | gzip > "$FILE"
oci os object put --bucket-name lrimunx-backups --file "$FILE" --force
rm -f "$FILE"

# keep 30 days locally is unnecessary; object storage lifecycle rules handle retention
```

```bash
sudo chmod +x /usr/local/bin/lrimunx-backup
sudo crontab -e
```

```cron
0 2 * * * /usr/local/bin/lrimunx-backup
```

Set a **lifecycle policy** on the bucket to delete objects older than 30 days, so the
20 GB allowance is never the thing that breaks your backups. Bucket → **Lifecycle
Policy Rules → Create Rule → Delete, 30 days**.

Restore:

```bash
oci os object get --bucket-name lrimunx-backups --name lrimunx-2026-11-01.sql.gz --file - \
  | gunzip | psql lrimunx
```

Payment screenshots live in Object Storage rather than on this machine, so they are
covered by that bucket's own retention rather than by `pg_dump`.

## 16. Do not let Oracle reclaim the instance

Oracle reclaims **idle** Always Free compute. An instance counts as idle when, across
a 7-day window, **all three** of these are true at once:

- 95th-percentile CPU utilisation is below 20%
- network utilisation is below 20%
- memory utilisation is below 20% (A1 shapes only)

All three, not any one. A live server with PostgreSQL resident normally clears the
memory test on its own, so during the run-up to the conference you are fine. The risk
window is the eleven months afterwards, when the site is quiet.

Check where you actually stand: **Instance → Metrics**, or Observability →
Monitoring, and look at `CpuUtilization` and `MemoryUtilization` over 7 days.

If memory sits near 20% on a 12 GB box, either give PostgreSQL more of it (raise
`shared_buffers` in `/etc/postgresql/*/main/postgresql.conf`), or run a small
keepalive:

```cron
*/20 * * * * /usr/bin/timeout 45 /usr/bin/nice -n 19 /bin/dd if=/dev/urandom of=/dev/null bs=1M count=4096 >/dev/null 2>&1
```

That is deliberately modest. The goal is to stay above a threshold, not to burn free
CPU hours, and your allowance is measured in OCPU-hours whether you use them or not.

## 17. Updating

```bash
cd /srv/lrimunx
git pull
npm ci
export VITE_API_BASE_URL=/api/v1
npm run deploy
sudo systemctl restart lrimunx
```

`npm run deploy` is safe to re-run. Migrations are applied once, the admin account is
only created when no account exists, and existing committees are left untouched.

## 18. Before you launch

Content, in `apps/site`:

- [ ] Replace `assets/payment-qr.svg`. It is a deliberate stand-in with the word
      PLACEHOLDER drawn across it, and it is not scannable.
- [ ] Fill in the account name and number on `register.html`, and the delegate fee,
      which appears on both `index.html` and `register.html`.
- [ ] Replace `Phone number to be announced` in the footer once a number exists, and
      replace `lrimodelun@gmail.com` if the conference gets its own address. Five
      separate copy blocks tell users to reach the secretariat through the footer.
- [ ] Add the 14 committee agendas in `src/data/committees.js`. They all currently
      render "To be announced."
- [ ] Add the chair and vice-chair for each committee in the same file.
- [ ] Confirm the seat counts in that file. They are sized to each body but were not
      set from a real plan, and the API enforces them at allocation time.
- [ ] Add the 12 organising committee portraits to `assets/oc/`, named after the
      `photo` field in `src/modules/oc.js`. Portrait crops, 800×1000, under ~120 KB.
- [ ] Add one photograph per past edition to `assets/past-galleries/edition-01/01.jpg`
      through `edition-09/01.jpg`. 1600 px on the long edge, ~200 KB.

Both asset folders degrade to a painted gold plate rather than a broken icon, so the
site is safe to launch with gaps in them.

Deployment:

- [ ] `npm run verify` passes, and the API integration suite actually **ran** rather
      than skipping. It self-skips when `DATABASE_URL` or the JWT secrets are absent
      and still lets the run go green, so read the output for
      `[integration] Skipping the API integration suite`.
- [ ] Sign in at `/admin` and change the bootstrap admin password.
- [ ] Confirm the committees are in the database: the hub's Committees page should
      list all 14.
- [ ] Import the country matrix for each committee under `/admin/matrix`. Until a
      committee has one, country validation is switched off for it and allocations
      accept any typo as a country.
- [ ] Register a real test delegate end to end, including the payment upload, then
      approve it in the hub and confirm the email arrives.
- [ ] Check the share preview by pasting the URL into WhatsApp.

## 19. Vercel, until the Oracle VM is up

**Part One is the step-by-step version of this section.** What follows is the
short reference: why the two deployments are not the same shape, and what
changes between them.

Oracle is the destination. Vercel is the interim home for previews and the test
environment, and the two are not the same shape: Oracle runs one long-lived Node
process that also serves the static files, Vercel runs the same Express app as a
function and serves the static files itself.

The project (`lrimunx`, hobby plan) is already linked. What makes it work:

| File | What it does |
| :--- | :--- |
| `api/index.ts` | Wraps `createApp()` as the function. No `listen()`. |
| `vercel.json` | Rewrites `/api/v1/*` and `/health` to the function, `/admin/*` to the hub's SPA shell, `/register` to `register.html`. Everything else is served from `dist/`. |
| `npm run vercel-build` | `prisma generate && prisma migrate deploy && npm run build`. Deliberately does **not** run `bootstrap-admin.mjs`, because a build container should not be creating accounts. |

### The database

Vercel has no local PostgreSQL, so you need a hosted one. Add the **Neon**
integration from the Vercel dashboard (Storage → Create Database). It writes
`DATABASE_URL` into the project's environment for you.

**Use the pooled connection string, and add `connection_limit=1`:**

```
postgresql://…-pooler.…neon.tech/lrimunx?sslmode=require&pgbouncer=true&connection_limit=1
```

Every cold start opens its own connection. Without the pooler and that limit, a
handful of concurrent requests exhausts the database's connection cap instead of
queueing.

Migrations are the exception. `prisma migrate deploy` takes an advisory lock and
cannot hold one through a transaction-mode pooler, so it needs the unpooled
string. Set **`DIRECT_URL`** to the Neon connection string **without** `-pooler`
in the hostname and without the `pgbouncer` and `connection_limit` parameters.

`DIRECT_URL` is not optional. The schema declares `directUrl`, and Prisma treats
that as required with no fallback to `url`: unset it fails with `P1012`, and set
to an empty string it fails with "You must provide a nonempty direct URL".

### Environment variables to set in the Vercel dashboard

Same required set as section 10, with three differences that matter:

```bash
SERVE_STATIC=false      # Vercel serves dist/, the function must not
TRUST_PROXY=1           # Vercel is a proxy hop
VITE_API_BASE_URL=/api/v1
```

`SERVE_STATIC=true` on Vercel makes the function try to serve files it was never
given, and the site 404s while the API keeps working, which is a confusing way to
find out.

### What is worse here than on Oracle

- **Cold starts.** The first request after idle pays Prisma's connection setup.
  Fine for testing, and the reason the login page already calls `warmApi()`.
- **No background work.** Anything long-running has to finish inside the 30s
  function budget.
- **Web push** works, but there is no process to hold a schedule.

None of that matters for previews. All of it is why Oracle is still the plan.

---

## 20. When something is wrong

**The server exits immediately on start.** It validates its configuration before
listening and refuses to run half-configured. Read the message; it names the variable.
The usual culprit is `GOOGLE_SHEETS_WEBHOOK_SECRET`, which is required with no default
even though most deployments never use the webhook.

**Port 80 or 443 times out from outside, but the app answers on the instance.** The
instance firewall. Section 6. Confirm with `tcpdump` which of the two layers is
dropping the packets before changing anything.

**It worked yesterday and now the ports are closed again.** The iptables rules were
never persisted. `sudo netfilter-persistent save`, section 6.

**`Out of host capacity` when creating the instance.** Section 5. It is Oracle, not
you.

**The instance disappeared.** Either it exceeded the 2 OCPU / 12 GB Always Free limit
and was terminated (section 1), or it was reclaimed as idle (section 16). Check your
email; Oracle notifies before terminating for the limit, though not always usefully in
advance.

**The hub loads but every request fails.** `VITE_API_BASE_URL` was not set when you
built, so the bundle points at `localhost:4000`. It is compiled in, not read at
runtime. Rebuild with it set.

**The build aborts saying the API base is unreachable.** A deliberate guard. It scans
the built bundle and refuses a base that is `localhost` or a hostname with no dot. Use
a fully qualified name, or `/api/v1` for this same-origin deployment.

**`/admin` loads but the page is blank and the console reports a MIME type error.**
Something upstream is serving `index.html` where JavaScript was requested. The app
gets this right on its own. Make sure Caddy forwards everything rather than trying to
route `/admin/*` itself.

**Every request comes from the same IP in the logs and rate limiting blocks everyone
at once.** `TRUST_PROXY` is `0` while Caddy is in front. Set it to `1`. Section 10.

**Payment upload answers 503.** `S3_*` is empty or wrong. Section 14. If you set
`S3_REGION=auto` out of habit, that is the bug: Oracle validates the region inside the
signature.

**`prisma migrate deploy` hangs.** It cannot hold an advisory lock through a
transaction-mode connection pooler. Use the direct database URL.

**Any Prisma command fails with `P1012 Environment variable not found:
DIRECT_URL`.** The schema declares `directUrl` and Prisma treats it as required
with no fallback to `url`. On this machine there is no pooler, so set
`DIRECT_URL` to the same string as `DATABASE_URL`. Setting it to an empty string
does not work either; it fails with "You must provide a nonempty direct URL".

**A clean `npm ci` produces a broken install.** The `allowScripts` block in
`package.json` is what permits Prisma's query engine and esbuild's binary to be
placed. Do not remove it.

**The build runs out of memory.** You are on the 1 GB AMD micro shape rather than the
A1. Section 1.
