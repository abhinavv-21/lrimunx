# Setting up LRI MUN X on Oracle Cloud

This is the whole setup, from a new Oracle account to the site running on the school's
domain with HTTPS, backups and payment screenshots. Go in order. Each step ends with a
check, and it is worth doing the check before moving on: a mistake found at step 5 costs
two minutes, the same mistake found at step 14 costs an evening.

What you end up with:

```
        the internet
             |
        Caddy  :443       HTTPS certificate, obtained and renewed on its own
             |
        node   :4000      the public site, the hub at /admin, and the API
             |
        PostgreSQL :5432  the database, on the same machine

        Object Storage    payment screenshots and nightly database backups
```

One Oracle virtual machine runs all of it. None of it costs money as long as you stay
inside the limits in step 1 and never upgrade the account (step 2).

**Time:** about three hours of your own, spread over a few days, because step 10 waits
on the school's IT team.

**What you need on your side:**

- A Windows PC with PowerShell. Windows 11 already has `ssh`, which is all you need to
  reach the server.
- The Oracle account.
- The domain name from IT. `DOMAIN-REQUEST.md` is the request to send them. This file
  writes the domain as `mun.lri.edu.np`. If IT says the zone is `lrischool.edu.np`,
  use `mun.lrischool.edu.np` everywhere you see `mun.lri.edu.np` below.

**Two kinds of command in this file.** Blocks marked **PowerShell (your PC)** run on your
own computer. Blocks marked **Server** run on the Oracle machine after you have
connected to it in step 8. Pasting a server command into your PC's PowerShell (or the
other way round) is the most common way to get stuck, so check the label.

---

## 1. What Always Free actually gives you

**Read this before you build anything.** Oracle cut the free ARM allowance in half on
**15 June 2026**, from 4 OCPU / 24 GB to 2 OCPU / 12 GB, without announcing it, and
began terminating instances over the new limit on **18 August 2026**. Every guide
written before mid-2026 tells you to build a 4-core box. That box gets killed.

| Resource | Always Free allowance |
| :--- | :--- |
| Ampere A1 compute | 1,500 OCPU-hours + 9,000 GB-hours per month, which is **2 OCPU / 12 GB running 24/7** |
| AMD micro compute | 2 × `VM.Standard.E2.1.Micro`, 1/8 OCPU and 1 GB each |
| Block storage | 200 GB total across boot and block volumes, 5 backups |
| Object Storage | 20 GB, 50,000 API requests per month |
| Outbound transfer | 10 TB per month |
| VCNs | 2 |

This setup uses one A1 machine at the full 2 OCPU / 12 GB, a 50 GB disk, and a small
part of the object storage. A conference site serving a few thousand people will not
come near 10 TB of traffic.

**The AMD micro shape is a trap.** The instance screen picks it by default and labels it
*Always Free-eligible*, which is true, but 1 GB of memory cannot build this project.
Step 5 shows you how to switch.

## 2. Make sure the card can never be charged

The card on the account is not the conference's, so do this before anything else.

**2a. Never upgrade the account.** While the console shows an **Upgrade to Pay As You
Go** button somewhere, the account is on the free tier and nothing can bill. Clicking
it turns billing on for everything outside the Always Free allowances, and there is no
way back to a free account afterwards. You may read online that upgrading makes A1
capacity easier to get. It does, and it is exactly the risk you are avoiding.

**2b. Set a budget alert.** Menu (☰, top left) → **Billing & Cost Management** →
**Budgets** → **Create Budget**.

| Field | Value |
| :--- | :--- |
| Name | `zero-spend` |
| Budget Scope | **Compartment** |
| Target Compartment | the one ending in **(root)** |
| Schedule | **Monthly** |
| Budget Amount | `1` |
| Day of the month to begin budget processing | `1` |
| Threshold Metric | **Actual Spend** |
| Threshold Type | **Percentage of Budget** |
| Threshold % | `1` |
| Email Recipients | an address someone reads. Add the cardholder's too, comma-separated, if they want to know directly |

Then **Create**. Without an email recipient the budget exists and tells nobody.

**Check:** it appears in the Budgets list. Budgets are checked a few times a day rather
than live, so an alert can arrive hours after a charge. That is still weeks before a
card statement would show it.

**2c. Know your home region.** Top right of the console. It was fixed at signup and
cannot be changed. This account's is **India West (Mumbai)**, whose identifier is
`ap-mumbai-1`. Write that down: step 18 needs it.

Oracle also placed a small verification hold on the card at signup, usually around one
dollar. It reverses on its own within a few days. Tell the cardholder, so it is not a
surprise.

## 3. Network

This builds the private network the machine lives in, and opens it to web traffic.

**3a. Create the network.** Menu → **Networking** → **Virtual cloud networks**. Make
sure the compartment on the left is the **(root)** one. Click **Actions** (or the
button beside **Create VCN**) → **Start VCN Wizard** → **Create VCN with Internet
Connectivity** → **Start VCN Wizard**.

| Field | Value |
| :--- | :--- |
| VCN name | `lrimunx-vcn` |
| Compartment | (root) |
| Everything else | leave the defaults |

**Next** → **Create**. It builds the network, a public subnet, a private subnet, an
internet gateway and the routes in one go. Wait for every line to show a green tick.

**3b. Open ports 80 and 443.** On the new VCN's page → **Security** tab (older consoles:
**Security Lists** on the left) → **Default Security List for lrimunx-vcn** → **Security
rules** → **Add Ingress Rules**.

First rule:

| Field | Value |
| :--- | :--- |
| Stateless | **off** |
| Source Type | CIDR |
| Source CIDR | `0.0.0.0/0`, meaning "from anywhere" |
| IP Protocol | TCP |
| Source Port Range | **leave blank**. This is the port on the visitor's computer, which is random. Blank means any. Do not type `0` |
| Destination Port Range | `80` |
| Description | `HTTP` |

Click **+ Another Ingress Rule** and make the same rule with Destination Port Range
`443` and Description `HTTPS`. Then **Add Ingress Rules**.

Do not add port 22: the default rules already allow SSH. Do not add 4000 either. The app
listens there, but only Caddy on the same machine should reach it.

**Check:** the list now shows ingress rules for 22, 80 and 443 (plus two ICMP rules the
wizard added).

This is only the first of two firewalls. Step 9 is the other one.

## 4. Make an SSH key on your PC

The key is how your PC proves to the server who it is. There is no password login.

**PowerShell (your PC).** The prompt should start with `PS`. In the older Command Prompt
(`C:\>` with no `PS`), `$env:USERPROFILE` is not understood and these commands fail.

A fresh Windows account has no `.ssh` folder yet, so make it first. This does nothing
if it already exists:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.ssh"
```

Then make the key:

```powershell
ssh-keygen -t ed25519 -C "lrimunx-oracle" -f "$env:USERPROFILE\.ssh\lrimunx"
```

It asks for a passphrase. Either type one (you will be asked for it every time you
connect) or press Enter twice for none. Either is fine for this.

That makes two files in `C:\Users\<you>\.ssh\`:

| File | What it is |
| :--- | :--- |
| `lrimunx` | the **private** key. Never share it, never paste it anywhere |
| `lrimunx.pub` | the **public** key. This is the one you give Oracle |

Copy the public key to the clipboard, ready for step 5:

```powershell
Get-Content "$env:USERPROFILE\.ssh\lrimunx.pub" | Set-Clipboard
```

**Back up the private key** somewhere safe (a USB stick, a password manager). If this PC
dies and nobody else has a copy, you are locked out of the server.

## 5. Create the instance

Menu → **Compute** → **Instances** → compartment **(root)** → **Create instance**.

The screen is a wizard with five parts: **Basic information**, **Security**,
**Networking**, **Storage**, **Review**. The defaults it shows (Oracle Linux 9,
`VM.Standard.E2.1.Micro`) are both wrong for this project.

### 5a. Basic information

| Field | Value |
| :--- | :--- |
| Name | `lrimunx` |
| Create in compartment | (root) |
| Availability domain | **AD 1**. Mumbai only has one, so there is nothing to choose |
| Advanced options | leave closed |

**Change the shape first,** then the image. The image list depends on the shape, and
doing it the other way round means choosing the image twice.

Under **Shape**, click **Change shape**:

| Field | Value |
| :--- | :--- |
| Instance type | **Virtual machine** |
| Shape series | **Ampere** (ARM-based processor) |
| Shape | tick **VM.Standard.A1.Flex** |
| Number of OCPUs | `2` |
| Amount of memory (GB) | `12` |

Check the shape shows the **Always Free-eligible** label, then **Select shape**.

Under **Image**, click **Change image** → **Ubuntu** → tick **Canonical Ubuntu 24.04**.
Not the one that says *Minimal*: it leaves out tools this guide uses. If there is an
**Image build** dropdown, pick the newest one. With the Ampere shape selected, only ARM
(`aarch64`) builds are compatible, and the console offers those.

**Check** before moving on. The Image and shape area should read:

| Line | Should say |
| :--- | :--- |
| Operating system | Canonical Ubuntu 24.04 |
| Image build | something containing `aarch64` |
| Shape | VM.Standard.A1.Flex, Always Free-eligible |
| Shape build | 2 core OCPU, 12 GB memory |

If the image says Oracle Linux or the shape says E2.1.Micro, one of the two dialogs did
not save. Open it again.

**Next.**

### 5b. Security

Leave every option **off** (Shielded instance, Confidential computing). They are not
needed, and some are not supported on the Ampere shape. **Next.**

### 5c. Networking

| Field | Value |
| :--- | :--- |
| VNIC name | leave blank |
| Primary network | **Select existing virtual cloud network** → `lrimunx-vcn` |
| Subnet | **Select existing subnet** → the one called **public subnet-lrimunx-vcn**. Not the private one: a machine in the private subnet cannot be reached from the internet at all |
| Private IPv4 address | **Automatically assign** |
| Automatically assign public IPv4 address | **on** |
| IPv6 | off |

**Add SSH keys.** In this step (in some console versions it sits in Security instead):
choose **Paste public keys** and paste what step 4 put on your clipboard. It is one line
starting `ssh-ed25519`. Do **not** choose "Generate a key pair for me": you already have
one, and the downloaded private key is easy to lose.

**Next.**

### 5d. Storage

| Field | Value |
| :--- | :--- |
| Specify a custom boot volume size | **on** |
| Boot volume size (GB) | `50` |
| Boot volume performance (VPU) | leave the default, `10` |
| Encryption | leave the default (Oracle-managed keys) |
| Block volumes | add none |

50 GB is plenty. The free allowance is 200 GB in total, so there is room, but nothing
needs more.

**Next.**

### 5e. Review and create

Click **View estimated cost** first. For this shape and disk it should show nothing to
pay. If it shows a monthly amount, something above is not Always Free: go back and
check the shape and the disk size.

Then **Create**. The status goes **Provisioning** → **Running** in one to three minutes.

**If it fails with "Out of host capacity"**, go to step 6. Otherwise skip it.

**Check:** the instance page shows **Running**, and a **Public IP address** in the
details. Write that address down. It is temporary until step 7.

## 6. When it says "Out of host capacity"

This is the single most common thing that stops people, and it is not a problem with
your account. Free ARM capacity in popular regions is genuinely used up much of the
time. Mumbai has one availability domain, so there is no second one to try.

What works:

- **Ask for less.** Change the shape to **1 OCPU / 6 GB** and try again. That often
  succeeds where 2 / 12 fails, and it is enough to run and build this project. You can
  scale up to 2 / 12 later on the instance page (**Edit** → shape) when capacity frees.
- **Try at different times.** Capacity is released continuously as other people delete
  instances. Early morning and late night, Indian time, tend to work better.
- **Keep the form.** After a failure the wizard usually keeps your choices, so a retry
  is one click.

What not to do: upgrade the account to get capacity (step 2a), or settle for the
E2.1.Micro shape (step 1). If a few days of trying gets nowhere, stop and ask; there are
ways round it that do not involve money.

## 7. Make the IP address permanent

The address Oracle gave the machine is **ephemeral**: it is released if the instance is
ever terminated or its IP is detached, and you would get a different one. IT is about to
point the school's domain at this address, so make it permanent now, before you send it.

On the instance page → **Networking** tab (older consoles: **Attached VNICs** under
Resources) → click the VNIC name → **IP administration** tab (older: **IPv4
Addresses**). On the row for the primary private IP, open the **⋯** menu → **Edit**:

1. **Public IP type:** choose **No public IP** → **Update**. The address disappears.
2. Open **⋯** → **Edit** again. Choose **Reserved public IP** → **Create a new reserved
   IP address** → name it `lrimunx-ip` → **Update**.

The machine now has a new address, and this one stays until you delete it. Reserved IPs
are free.

**Check:** the IP row shows the address with type **Reserved**. This is the address you
give IT and use from now on. The one from step 5 is gone.

## 8. Connect to the server

Make connecting a two-word command. **PowerShell (your PC)**, replacing the address with
your reserved IP:

```powershell
Add-Content "$env:USERPROFILE\.ssh\config" @"

Host lrimunx
    HostName 203.0.113.10
    User ubuntu
    IdentityFile ~/.ssh/lrimunx
"@
```

Then:

```powershell
ssh lrimunx
```

The first time, it asks whether to trust the server's fingerprint. Type `yes`. You
should land at a prompt ending in `ubuntu@lrimunx:~$`. Everything marked **Server** from
here on is typed there. `exit` returns you to your PC.

**If it hangs and times out**, the subnet is wrong (step 5c) or the IP is wrong. **If
it says "Permission denied (publickey)"**, the key pasted in step 5c is not the one in
`~/.ssh/lrimunx`, or the user is not `ubuntu`.

## 9. Open the ports on the machine itself

**Step 3 was not enough.** Oracle's Ubuntu images come with a firewall on the machine
that rejects everything except SSH. You can have step 3 perfect and still get a timeout
on port 80.

**Server:**

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

**`netfilter-persistent save` is not optional.** Without it the rules work perfectly
until the first reboot and then vanish, which is a miserable thing to track down six
weeks later.

**Check:**

```bash
sudo iptables -L INPUT -n --line-numbers | head -20
```

The two `ACCEPT ... dpt:80` and `dpt:443` lines must be **above** the line that says
`REJECT ... reject-with icmp-host-prohibited`. Rules are read top to bottom, and anything
below the reject never matches. On a stock image position 6 is above it, but look rather
than assume.

## 10. Send IT the address

Give IT the reserved IP from step 7 along with `DOMAIN-REQUEST.md`. They create one
**A record**: `mun` in the `lri.edu.np` zone, pointing at that address.

IT may take days. **Carry on with steps 11 to 16 while you wait.** Step 16 shows you how
to use the site before the domain works. Only step 17 (HTTPS) needs the record in place.

**Check, from your PC,** once IT says it is done:

```powershell
nslookup mun.lri.edu.np
```

The answer must be the reserved IP. If it shows another address or "Non-existent
domain", it is not ready yet, and HTTPS will fail until it is.

## 11. Install the software

**Server:**

```bash
sudo apt update && sudo apt upgrade -y
```

If it shows a pink screen about restarting services, press Enter to accept. If it
mentions a new kernel, run `sudo reboot`, wait a minute, and `ssh lrimunx` again.

Node.js 22, git, and PostgreSQL:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git postgresql postgresql-contrib
```

Node 22 rather than the Ubuntu package, which is too old. Node 20 reached end of life in
April 2026, so do not install that either.

Caddy, the web server that handles HTTPS:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

**Check:**

```bash
node --version     # v22.something
psql --version     # 16.something
caddy version      # v2.something
```

All three have native ARM builds. So do the two parts of this project that ship compiled
code, Prisma's query engine and esbuild. The `allowScripts` block in `package.json` is
what lets both install; do not remove it.

## 12. Create the database

Pick a database password: long, letters and numbers only (symbols need escaping inside
a URL, and that is an easy thing to get wrong). **Server**, with your password in place
of `yourLongPassword123`:

```bash
sudo -u postgres psql <<'SQL'
CREATE USER lrimunx WITH PASSWORD 'yourLongPassword123';
CREATE DATABASE lrimunx OWNER lrimunx;
SQL
```

The connection string for step 13 is then:

```
postgresql://lrimunx:yourLongPassword123@localhost:5432/lrimunx?schema=public
```

**Check:**

```bash
psql "postgresql://lrimunx:yourLongPassword123@localhost:5432/lrimunx" -c "select 1"
```

A small table with a `1` in it means the user, the password and the database all work.
PostgreSQL only listens on the machine itself, and steps 3 and 9 never opened 5432, so
nothing outside can reach it.

## 13. Get the code and write `.env`

**Server:**

```bash
sudo mkdir -p /srv/lrimunx && sudo chown ubuntu:ubuntu /srv/lrimunx
git clone https://github.com/abhinavv-21/lrimunx.git /srv/lrimunx
cd /srv/lrimunx
cp .env.example .env
chmod 600 .env
```

The repository is public, so no login is needed. (If it is ever made private, the server
needs a read-only *deploy key* from GitHub's repository settings instead.) `chmod 600`
means only the `ubuntu` user can read `.env`, which will hold every password.

Generate three secrets, one at a time, and keep them in a scratch note:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Now open the file:

```bash
nano .env
```

Nano basics: arrow keys to move, type to edit, **Ctrl+O** then **Enter** to save,
**Ctrl+X** to quit. Right-click pastes in the PowerShell window. Every value stays inside
its double quotes.

Change these lines. Leave every line not listed here as it is.

| Variable | Set it to |
| :--- | :--- |
| `DATABASE_URL` | the string from step 12 |
| `DIRECT_URL` | **exactly the same string** as `DATABASE_URL`. There is no connection pooler on this machine, but Prisma requires the variable and has no fallback: unset, every command dies with `P1012`; empty, with "You must provide a nonempty direct URL" |
| `JWT_SECRET` | secret number 1 |
| `JWT_REFRESH_SECRET` | secret number 2. Must be **different** from number 1 |
| `GOOGLE_SHEETS_WEBHOOK_SECRET` | secret number 3. **Required even though you will not use the webhook.** It is the usual reason a first start fails |
| `NODE_ENV` | `"production"` |
| `PORT` | `4000` (already) |
| `TRUST_PROXY` | `1` |
| `CORS_ORIGIN` | `"https://mun.lri.edu.np"`. Put the real domain **first**: approval emails build their links from the first entry |
| `SERVE_STATIC` | `"true"` |
| `VITE_API_BASE_URL` | `"/api/v1"` |
| `SEED_ADMIN_USERNAME` | the first hub login, e.g. `"secretariat"` |
| `SEED_ADMIN_PASSWORD` | a long temporary password. You change it on first sign-in and then delete this line (step 16) |

And add one line at the bottom:

```
SITE_URL="https://mun.lri.edu.np"
```

`SITE_URL` stamps the domain into every page's share preview, `sitemap.xml` and
`robots.txt` at build time.

**Why `TRUST_PROXY=1` matters.** Caddy sits in front, so every request reaches the app
from `127.0.0.1`. Left at `0`, the app sees one visitor for the entire internet.
Registration allows 5 per 15 minutes per visitor, so the sixth delegate anywhere gets
blocked, and so does everyone after them. It is the setting most likely to ruin launch
day.

Leave `S3_*` and `SMTP_*` empty for now. Steps 18 and 19 fill them in.

**Check:**

```bash
grep -c "replace-me" .env
```

It must print `0`. Anything else means a secret is still the example value, and the
server refuses to start with one.

## 14. Build

**Server:**

```bash
cd /srv/lrimunx
npm ci
```

Then load `.env` into the shell and build:

```bash
set -a; . ./.env; set +a
npm run deploy
```

**The order matters.** `npm ci` must run *before* loading `.env`. The file sets
`NODE_ENV=production`, and `npm ci` under that setting skips the build tools, so the
build then fails with missing packages.

`set -a; . ./.env; set +a` makes every line of `.env` visible to the build. Three of
them only work at build time: `VITE_API_BASE_URL` and `SITE_URL` are compiled into the
pages, and `SEED_ADMIN_*` create the first account.

`npm run deploy` does four things: creates every database table, builds the site and the
hub, composes them into `dist/`, then creates the first admin account and all 14
committees. Three to six minutes. It ends with a `[bootstrap]` line.

The build refuses to finish if the API address is wrong. It scans the output and rejects
anything pointing at `localhost` or at a name with no dot in it. If it stops there, the
`VITE_API_BASE_URL` line in `.env` is not `"/api/v1"`.

**Check:** start it by hand for a moment.

```bash
node apps/backend/dist/index.js
```

It should print that it is listening on 4000 and then sit there. If it exits instead, it
names the variable that is wrong. Press **Ctrl+C** to stop it.

## 15. Keep it running

A service makes the app start on boot and restart if it crashes.

**Server:**

```bash
sudo tee /etc/systemd/system/lrimunx.service > /dev/null <<'UNIT'
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
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now lrimunx
```

**Check:**

```bash
sudo systemctl status lrimunx --no-pager     # "active (running)"
curl -s localhost:4000/health                # {"status":"ok",...}
curl -sI localhost:4000/ | head -1           # HTTP/1.1 200 OK
curl -sI localhost:4000/admin | head -1      # HTTP/1.1 200 OK
```

To watch the log live: `journalctl -u lrimunx -f` (Ctrl+C to stop watching).

## 16. Use it before the domain works

You do not have to wait for IT to sign in and set things up. An SSH tunnel carries the
site to your PC privately.

**PowerShell (your PC):**

```powershell
ssh -L 4000:localhost:4000 lrimunx
```

Leave that window open, and in your browser go to **http://localhost:4000**. That is the
real server, seen through the tunnel.

1. Open **http://localhost:4000/admin** and sign in with `SEED_ADMIN_USERNAME` and
   `SEED_ADMIN_PASSWORD`.
2. Change the password straight away: **Users** in the sidebar → your account →
   edit → type a **New password** → save.
3. **Server:** delete the `SEED_ADMIN_PASSWORD` line from `.env` (`nano .env`, put the
   cursor on the line, **Ctrl+K** cuts it, then save), then
   `sudo systemctl restart lrimunx`. The account already exists, and the password
   should not sit in a file.

**Check:** the hub's **Committees** page lists 14, and **Admin** appears in the sidebar.
Admin is owner-only; if it is missing, the first account was not created by the build.

## 17. HTTPS

Only once `nslookup mun.lri.edu.np` returns the reserved IP (step 10).

**Server:** replace Caddy's configuration file with these three lines.

```bash
sudo tee /etc/caddy/Caddyfile > /dev/null <<'CADDY'
mun.lri.edu.np {
    reverse_proxy 127.0.0.1:4000
}
CADDY

sudo systemctl reload caddy
```

Caddy gets a certificate from Let's Encrypt on its own and renews it forever. It passes
every path straight to the app, which does its own routing. Do not add rules for
`/admin` here; routing it in the proxy is what produces a blank hub page and a "MIME
type" error in the browser console.

**Check,** from your PC's browser: **https://mun.lri.edu.np** loads with a padlock.

If it does not, watch Caddy's log while you reload the page:

```bash
journalctl -u caddy -f
```

The usual causes, in order: the domain does not point here yet (step 10), port 80 is
blocked (Let's Encrypt checks over port 80, so both steps 3 and 9 must allow it), or
the school's domain has a CAA record that does not permit Let's Encrypt
(`DOMAIN-REQUEST.md` covers this).

## 18. Payment screenshots

Registration works without this: the upload answers 503, the form says so plainly, and
the application still completes. What you lose is any proof that someone paid. Do it
before registration opens.

**18a. Create the bucket.** Menu → **Storage** → **Buckets** → compartment **(root)** →
**Create Bucket**.

| Field | Value |
| :--- | :--- |
| Bucket name | `lrimunx-payments` |
| Default storage tier | **Standard** |
| Everything else | leave the defaults |

It is created **private**, and it must stay private. Payment screenshots are transaction
records. The app hands them out only through short-lived signed links, and only to
someone signed in to the hub. A public bucket would put every delegate's bank screenshot
on the open internet.

On the bucket's page, note the **Namespace** (a short string of letters and numbers).

**18b. Create an access key.** Top right, your **profile icon** → **My profile** (older:
**User settings**) → **Customer secret keys** (under Resources, or a **Tokens and keys**
tab) → **Generate secret key** → name it `lrimunx-app` → **Generate**.

The **secret** is shown **once**. Copy it into your scratch note before closing the
dialog. The **Access key** then appears in the list beside the key's name; copy that
too. This is not the same thing as an "API key", which is a different page.

**18c. Tell the app.** **Server:** `nano .env` and fill in:

```
S3_ENDPOINT="https://<namespace>.compat.objectstorage.ap-mumbai-1.oraclecloud.com"
S3_BUCKET="lrimunx-payments"
S3_REGION="ap-mumbai-1"
S3_ACCESS_KEY_ID="<the access key>"
S3_SECRET_ACCESS_KEY="<the secret>"
```

`S3_REGION` must be the real region. The `.env.example` default of `auto` works for other
providers but not Oracle, which checks the region inside every request's signature.

These are read at start, not build, so a restart is enough:

```bash
sudo systemctl restart lrimunx
```

**Check:** open `/register`, complete step 1, and upload any image at step 2. Then in
the console, open the bucket's **Objects** list: the file should be there. A 503 on
upload means one of the five values is wrong; `journalctl -u lrimunx -n 50` says which.

## 19. Approval emails

Also optional. Without it, approving a registration still creates the delegate, and the
hub says no email was sent rather than pretending one was.

With a Gmail or Google Workspace address:

1. On that Google account, turn on **2-Step Verification** (Google Account → Security).
2. Same page → **App passwords** → create one named `lrimunx`. Google shows a
   16-letter password once.
3. **Server:** `nano .env`:

```
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="the-address@gmail.com"
SMTP_PASSWORD="the 16-letter app password"
SMTP_SECURE="false"
SMTP_FROM="LRI MUN X <the-address@gmail.com>"
```

The normal account password will not work, only the app password. `SMTP_FROM` must be
the same address as `SMTP_USER` or Gmail refuses to send. Port 587 is the one to use:
Oracle blocks outgoing port 25.

```bash
sudo systemctl restart lrimunx
```

**Check:** submit a test registration with your own email, approve it in the hub, and
see that the email arrives.

## 20. Nightly backups

The database lives on this one machine. If the machine is lost, so is every registration,
unless a copy exists elsewhere. This sends a compressed copy to Object Storage every
night, using a link that can only upload. Even if the server were broken into, the link
cannot read or delete the old backups.

**20a. The bucket.** Storage → Buckets → **Create Bucket** → name `lrimunx-backups`,
Standard, defaults. Private, like the other.

**20b. An upload-only link.** Open the bucket → **Pre-Authenticated Requests** (under
Resources, or a tab) → **Create Pre-Authenticated Request**.

| Field | Value |
| :--- | :--- |
| Name | `nightly-upload` |
| Pre-Authenticated Request Target | **Bucket** |
| Access Type | **Permit object writes** |
| Enable Object Listing | **off** |
| Expiration | a date after the conference year ends, e.g. 31 December 2027 |

**Create.** The URL is shown **once**. Copy it. It ends in `/o/`.

**20c. The script.** **Server:**

```bash
sudo tee /usr/local/bin/lrimunx-backup > /dev/null <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
cd /srv/lrimunx
set -a; . ./.env; set +a

FILE="/tmp/lrimunx-$(date +%F).sql.gz"
# pg_dump refuses the ?schema=public on the end of Prisma's URL, so cut it off.
pg_dump "${DIRECT_URL%%\?*}" | gzip > "$FILE"
curl -sf -X PUT --data-binary @"$FILE" "${BACKUP_UPLOAD_URL}$(basename "$FILE")"
rm -f "$FILE"
SCRIPT
sudo chmod +x /usr/local/bin/lrimunx-backup
```

Add the link to `.env` (`nano .env`, at the bottom):

```
BACKUP_UPLOAD_URL="https://objectstorage.ap-mumbai-1.oraclecloud.com/p/.../o/"
```

Run it once by hand:

```bash
lrimunx-backup && echo OK
```

**Check:** `OK` is printed, and the bucket's **Objects** list has a file named for today.

Then schedule it:

```bash
crontab -e
```

(If asked which editor, choose `1`, nano.) Add this line at the bottom, save, quit:

```cron
0 20 * * * /usr/local/bin/lrimunx-backup
```

The server's clock is UTC, so `20:00` UTC is 01:45 in Nepal: nightly, when nobody is
registering.

**20d. Delete old backups automatically.** Keeps the bucket from ever filling the 20 GB
allowance. Oracle first needs permission to delete objects on your behalf. Menu →
**Identity & Security** → **Policies** → compartment (root) → **Create Policy**:

| Field | Value |
| :--- | :--- |
| Name | `objectstorage-lifecycle` |
| Description | `Lets lifecycle rules delete old backups` |
| Policy builder | **Show manual editor**, then paste the line below |

```
Allow service objectstorage-ap-mumbai-1 to manage object-family in tenancy
```

**Create.** Then the `lrimunx-backups` bucket → **Lifecycle Policy Rules** → **Create
Rule** → name `expire-30-days`, lifecycle action **Delete**, **30** days → **Create**.

Do **not** put a lifecycle rule on `lrimunx-payments`.

**Restoring,** if you ever have to: in the console, open the backup object's **⋯** →
**Download**. Copy it to the server from **PowerShell (your PC)**:

```powershell
scp "$env:USERPROFILE\Downloads\lrimunx-2026-11-01.sql.gz" lrimunx:/tmp/
```

**Server.** A backup has to go into an empty database, so this drops the current one
and recreates it before loading the copy. Everything written since that backup is lost,
which is why you only do this when the database is already broken.

```bash
cd /srv/lrimunx && set -a; . ./.env; set +a
sudo systemctl stop lrimunx
sudo -u postgres psql -c "DROP DATABASE lrimunx;" -c "CREATE DATABASE lrimunx OWNER lrimunx;"
gunzip -c /tmp/lrimunx-2026-11-01.sql.gz | psql "${DIRECT_URL%%\?*}"
sudo systemctl start lrimunx
```

## 21. Do not let Oracle reclaim the machine

Oracle takes back **idle** Always Free machines. A machine counts as idle when, across a
7-day window, **all three** of these are true at once:

- 95th-percentile CPU use is below 20%
- network use is below 20%
- memory use is below 20% (A1 shapes only)

All three, not any one. A live server with PostgreSQL running normally clears the memory
test on its own, so during the run-up to the conference you are fine. The risk is the
months afterwards, when the site is quiet.

See where you stand: the instance page → **Monitoring** (or **Metrics**) → look at
**CPU utilization** and **Memory utilization** over 7 days.

If memory sits near 20% on a 12 GB machine, either give PostgreSQL more of it (raise
`shared_buffers` in `/etc/postgresql/16/main/postgresql.conf`, then
`sudo systemctl restart postgresql`), or add a small keep-alive to `crontab -e`:

```cron
*/20 * * * * /usr/bin/timeout 45 /usr/bin/nice -n 19 /bin/dd if=/dev/urandom of=/dev/null bs=1M count=4096 >/dev/null 2>&1
```

That is deliberately modest. The aim is to stay over a threshold, not to burn CPU.

## 22. Updating the site

Whenever new code is pushed to GitHub. **Server:**

```bash
cd /srv/lrimunx
git pull
npm ci
set -a; . ./.env; set +a
npm run deploy
sudo systemctl restart lrimunx
```

Same order as step 14, for the same reason. `npm run deploy` is safe to re-run:
migrations apply once, the admin account is only created when no account exists (and
`SEED_ADMIN_PASSWORD` is gone from `.env` anyway), and existing committees are left
untouched, so seat counts the secretariat changed in the hub stay changed.

The site is down for a few seconds during the restart, not during the build. Avoid
updating in the middle of a registration rush all the same.

## 23. Retire the old test site

Until now the site has also been running at `lrimunx.vercel.app`, with its own separate
database. Once `https://mun.lri.edu.np` works, take the old one down. Otherwise anyone
holding the old link can still register, into a database the hub on Oracle never sees,
and those delegates are silently lost.

Nothing there is needed: the committees and the admin account were created fresh here in
step 14. If the old site's hub shows real registrations under **Registrations**, stop
and move them across before deleting anything.

Then: Vercel dashboard → the `lrimunx` project → **Settings** → **Advanced** → **Delete
Project**. And in the Neon console, delete the `lrimunx` project.

## 24. Before you open registration

Content, in `apps/site` (edit, push to GitHub, then step 22):

- [ ] Replace `assets/payment-qr.svg`. It is a deliberate stand-in with the word
      PLACEHOLDER drawn across it, and it is not scannable.
- [ ] Fill in the account name and number on `register.html`, and the delegate fee,
      which appears on both `index.html` and `register.html`.
- [ ] Replace `Phone number to be announced` in the footer once a number exists, and
      replace `lrimodelun@gmail.com` if the conference gets its own address.
- [ ] Add the 14 committee agendas in `src/data/committees.js`. They all currently
      render "To be announced."
- [ ] Add the chair and vice-chair for each committee in the same file.
- [ ] Confirm the seat counts in that file. The API enforces them at allocation time.
- [ ] Add the 12 organising committee portraits to `assets/oc/`, named after the
      `photo` field in `src/modules/oc.js`. Portrait crops, 800×1000, under ~120 KB.
- [ ] Add one photograph per past edition to `assets/past-galleries/edition-01/01.jpg`
      through `edition-09/01.jpg`. 1600 px on the long edge, ~200 KB.

Both asset folders fall back to a painted gold plate rather than a broken image, so the
site is safe to launch with gaps in them.

On the server:

- [ ] The budget alert from step 2 exists and has an email recipient.
- [ ] `https://mun.lri.edu.np` loads with a padlock.
- [ ] The bootstrap password is changed and removed from `.env` (step 16).
- [ ] The hub's Committees page lists all 14.
- [ ] Import each committee's country list: **Committees** → the committee → **Country
      matrix**. Until a committee has one, the allocation screen accepts any typo as a
      country.
- [ ] A test registration goes all the way through: the screenshot lands in the
      payments bucket, you approve it in the hub, the email arrives.
- [ ] Last night's backup is in `lrimunx-backups`.
- [ ] Pasting the URL into WhatsApp shows the right preview.
- [ ] The old test site is gone (step 23).

## 25. When something is wrong

Start with the app's own log, which usually names the problem. **Server:**

```bash
journalctl -u lrimunx -n 100 --no-pager
```

**The service will not start, or keeps restarting.** It checks its configuration before
starting and refuses to run half-configured. The log names the variable. The usual one
is `GOOGLE_SHEETS_WEBHOOK_SECRET`, required even though you will not use the webhook, or
a secret still starting `replace-me`.

**Ports 80 or 443 time out from outside, but `curl localhost:4000` works on the
server.** One of the two firewalls. Find out which before changing anything:

```bash
sudo tcpdump -i any -n port 80
```

Then load `http://<reserved-ip>` in your browser. **Lines appear:** the traffic reaches
the machine, so step 3 is fine and the machine's firewall is dropping it (step 9).
**Nothing appears:** it never arrived, so fix the security list (step 3), and check the
instance really is in the *public* subnet (step 5c).

**It worked yesterday and today the ports are closed.** The firewall rules were never
saved. `sudo netfilter-persistent save`, step 9.

**`Out of host capacity`.** Step 6. It is Oracle, not you.

**The machine disappeared.** Either it exceeded the 2 OCPU / 12 GB limit and was
terminated (step 1), or it was reclaimed as idle (step 21). Oracle emails the account
address first; check it, including spam.

**The site loads but the hub cannot sign in, and every request fails.**
`VITE_API_BASE_URL` was not `/api/v1` when you built. It is compiled in, so fixing `.env`
is not enough: rebuild (step 22).

**The build stops saying the API base is unreachable.** A deliberate guard, same cause
as above.

**The build fails with missing packages such as `vite` or `tsc`.** `.env` was loaded
before `npm ci`, so it installed without the build tools. Open a fresh SSH session and
run step 14 in order.

**`/admin` is blank and the browser console mentions a MIME type.** Something in front
is serving a page where a script was asked for. Make sure the Caddyfile is exactly the
three lines in step 17.

**Every delegate after the fifth gets "too many requests" at once.** `TRUST_PROXY` is not
`1`. Step 13.

**Payment upload answers 503.** One of the `S3_*` values is empty or wrong (step 18). If
`S3_REGION` says `auto`, that is the bug.

**Any Prisma command fails with `P1012 Environment variable not found: DIRECT_URL`.**
Set `DIRECT_URL` to the same value as `DATABASE_URL` (step 13). An empty value fails
too.

**The backup prints nothing and no file appears.** Run `lrimunx-backup` by hand and read
the error. A `403` from `curl` means the upload link expired or was copied wrong: make a
new one (step 20b). A `pg_dump` error mentioning `schema` means the script was typed
without the `%%\?*` part.

**The build runs out of memory.** The machine is the 1 GB AMD shape rather than A1. Step
5a.
