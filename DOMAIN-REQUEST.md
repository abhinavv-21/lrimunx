# What we need from IT: `mun.lri.edu.np`

Hand this to whoever manages the school's DNS. It is short on purpose — the ask is
one record and two open ports.

---

## Before anything else: two things to confirm

**1. Which zone is `lri.edu.np`?**

The school's website is at `www.lrischool.edu.np`, and that is the domain this site
links to in its footer. The request is for `mun.lri.edu.np`, which is a *different*
zone. Either the school also holds `lri.edu.np`, or the record belongs in
`lrischool.edu.np` instead and the name would be `mun.lrischool.edu.np`.

Please confirm which zone IT actually controls before they create anything. Both
work identically for us; we just need to know which name to put on the
certificate, in the site's own canonical tags and in the API's CORS policy.

**2. `/ops` needs nothing from IT.**

`mun.lri.edu.np/ops` is a *path* on the same hostname, not a second address. It
resolves through the same record as the public site, and the application decides
what to serve at that path. There is no second DNS entry, no second certificate
and no proxy rule to write. (Today that path is `/admin`; renaming it to `/ops` is
a change on our side, not theirs.)

---

## 1. The record

One A record. Not a CNAME — a CNAME points a name at *another name*, and we are
pointing at a machine's IP address. A CNAME would only be right if we were hosting
on a platform like Vercel or Netlify that gives us a hostname instead of an IP.

| Field | Value |
| :--- | :--- |
| Type | **A** |
| Name / host | `mun` (in the `lri.edu.np` zone) |
| Value | **the IPv4 address we will send them** — see the ordering note below |
| TTL | **300** (five minutes) until we confirm it works, then 3600 |
| Proxy / CDN | **Off.** If the zone is on Cloudflare, this must be DNS-only (grey cloud), not proxied |

That is the whole ask. No `www`, no wildcard, no second record.

### Ordering matters, and this is the part that usually goes wrong

The record cannot be created until the server exists, because the server asks
Let's Encrypt for its certificate the first time it starts, and that request fails
if the name does not already point at it.

So the sequence is:

1. **We** build the Oracle Cloud instance and attach a *reserved* (static) public
   IP, so the address cannot change underneath the record.
2. **We** send IT that IP address.
3. **IT** creates the A record above and tells us it is in.
4. **We** wait for it to resolve, then start the web server, which obtains the
   certificate automatically.

Steps 1 and 2 have not happened yet. Ask IT to be ready rather than to act now.

### IPv6

Only if we enable it on the instance, which we probably will not. If we do, it is
one more record of type **AAAA**, same name, with the IPv6 address. We will ask
separately if it becomes relevant.

---

## 2. Two ports, open to the world

The server needs to be reachable from the public internet on:

| Port | Protocol | Why |
| :--- | :--- | :--- |
| **443** | TCP | The site itself |
| **80** | TCP | **Not optional.** Let's Encrypt validates ownership over port 80, and the server redirects plain HTTP to HTTPS. If 80 is closed, no certificate is ever issued and the site never comes up |

Most of this is ours to configure — Oracle's own network rules and the instance's
firewall are both on our side of the line. What we need from IT is confirmation
that **nothing on the school's network sits in front of this**: no upstream
firewall rule, no filtering proxy, no port blocking on the path from the public
internet to that IP.

Nothing else should be exposed. The database and the application both listen on
localhost only and are not reachable from outside the machine.

---

## 3. CAA records — please check this one

If the zone has any **CAA** records, they control which certificate authorities are
allowed to issue for it. Ours comes from Let's Encrypt, so a CAA record that does
not name Let's Encrypt will silently block issuance, and the failure looks like a
server problem rather than a DNS one.

Ask IT to run:

```bash
dig +short CAA lri.edu.np
dig +short CAA mun.lri.edu.np
```

- **Empty output:** nothing to do. Any CA may issue. This is the common case.
- **Any output:** it must include `letsencrypt.org`, either on the zone apex or on
  `mun` specifically:

  ```
  mun.lri.edu.np. IN CAA 0 issue "letsencrypt.org"
  ```

This is the single most common cause of a certificate that never appears, and it
costs thirty seconds to rule out.

---

## 4. Email: `mun@lri.edu.np`

Work in progress on our side, so this is for planning rather than action. When we
are ready we will need, in the same zone:

| Type | Purpose | Who provides the value |
| :--- | :--- | :--- |
| **MX** | Routes mail for the domain to a mailbox provider | The provider (Google Workspace, Zoho, whoever IT already uses) |
| **TXT (SPF)** | Names the servers allowed to send as this domain | The provider, plus us if the app sends directly |
| **TXT (DKIM)** | Signing key so receivers can verify the mail | The provider, as a selector and a key |
| **TXT (DMARC)** | What to do with mail that fails the two above | Us, starting at `p=none` while we watch the reports |

Two things worth knowing now:

- **The conference sends real mail to delegates.** Registration confirmations and
  allocation announcements go to school students, whose filters are unforgiving.
  Without SPF and DKIM those land in spam, and a delegate who never sees their
  committee assignment is a support problem three days before the conference.
- **We do not send mail from the server.** It relays through a mail provider, so
  IT does **not** need to set up reverse DNS (PTR) on the instance's IP.

If the school already runs mail on `lri.edu.np`, the MX records exist and IT only
needs to create the mailbox. If it does not, that is a bigger decision than DNS and
should be settled separately.

---

## 5. What we are *not* asking for

Worth stating, because it makes the request smaller than it sounds:

- **No nameserver delegation.** IT keeps the zone. We never touch their DNS.
- **No certificate.** The server obtains and renews its own, free, automatically.
  Nobody has to remember to renew anything.
- **No load balancer, no CDN, no proxy configuration.**
- **No reverse DNS / PTR record.**
- **No changes to `lrischool.edu.np`** or to the school's existing website.
- **No registrar involvement.** A subdomain is an edit inside a zone the school
  already holds, not a new registration, so there is no `.edu.np` paperwork.

---

## 6. The whole ask, in one block to paste to IT

> We need one DNS record and confirmation on two ports.
>
> **Record:** `A` record for host `mun` in the `lri.edu.np` zone, pointing at an
> IPv4 address we will send you once the server is built. TTL 300 initially. Not
> proxied, if the zone is behind a CDN.
>
> **Ports:** the destination IP must be reachable from the public internet on TCP
> 80 and TCP 443. Port 80 is required for automated certificate issuance, not just
> for redirects.
>
> **Please also check:** `dig +short CAA lri.edu.np`. If it returns anything, it
> must include `letsencrypt.org` or our certificate cannot be issued.
>
> **Later, for email:** MX, SPF, DKIM and DMARC records for `mun@lri.edu.np`. We
> will send exact values when the mail provider is chosen. No PTR record is needed.
>
> Please confirm whether the correct zone is `lri.edu.np` or `lrischool.edu.np`.

---

## 7. How we will check it worked

Once IT says the record is in, from any machine:

```bash
# Should print the instance's IP and nothing else
dig +short mun.lri.edu.np

# Should be empty, or include letsencrypt.org
dig +short CAA lri.edu.np

# Should connect. If this times out, a firewall is in the way, not DNS
curl -sS -o /dev/null -w '%{http_code}\n' http://mun.lri.edu.np
```

Then, after the server is started:

```bash
# Should be 200, over a valid certificate
curl -sSI https://mun.lri.edu.np | head -1

# Should redirect to https
curl -sSI http://mun.lri.edu.np | head -1
```

---

## 8. What changes on our side once the name is live

Not IT's problem, listed so it is not forgotten:

- `SITE_URL` and `CORS_ORIGIN` set to `https://mun.lri.edu.np`. `SITE_URL` feeds
  every canonical tag, `og:url`, `sitemap.xml` and `robots.txt` from one place, so
  this is one variable rather than an edit across six files.
- The `Caddyfile` hostname (`SETUP.md` §13).
- `SETUP.md` and `TODO.md` both currently say `mun.lrischool.edu.np`. If the zone
  turns out to be `lri.edu.np`, both need correcting.
- The hub path, if we are renaming `/admin` to `/ops`: the Vercel rewrites, the
  Express static routes, the hub's router basename, `robots.txt` and the
  `X-Robots-Tag` header that keeps it out of search results.
- The TTL back to 3600 once we are happy.
