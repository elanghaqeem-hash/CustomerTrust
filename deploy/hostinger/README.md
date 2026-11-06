# TrainLive on Hostinger VPS — trainlive.seraya.id

Status: **deployment package ready for an authorized Hostinger VPS operator**, NOT an active installation. No Hostinger
server, hPanel account, DNS zone, or production secrets have been accessed by this change.

## Supported hosting options

- **Recommended: Hostinger KVM VPS** (Ubuntu 24.04 + Docker/Compose template).
  Runs Next.js 15, PostgreSQL 16, Caddy automatic HTTPS, and maintenance tooling.
- Hostinger Business/Cloud managed Node.js supports Next.js apps, but this Docker
  bundle does **not** target managed web hosting. It would require an independently
  managed PostgreSQL 16 database, different process/secret configuration, and
  a separate evaluation of realtime requirements.
- Ordinary static/PHP hosting cannot run the TrainLive full-stack app as-is.

This pack does not claim that subsecond WebSocket broadcast is implemented:
the current application uses polling. Use a separate authorized realtime provider
or a class-scoped WebSocket service once implemented and tested.

## Prerequisites

1. Own/control `seraya.id` DNS; add an A record: host `trainlive` -> **VPS public IPv4**.
   Do not change the main website's root A record.
2. A Hostinger VPS with Docker Engine and `docker compose` installed.
   If Hostinger already runs another website on TCP 80/443 on the **same VPS**,
   integrate this application's reverse-proxy route into the existing ingress
   rather than running a second public Caddy instance.
3. Open inbound TCP 80 and TCP 443 for Caddy/ACME; allow UDP 443 only if using HTTP/3.
   Restrict SSH to operator IPs, use SSH keys, and do NOT expose PostgreSQL 5432 or
   Next.js 3000 to the public internet.
4. A production-approved PostgreSQL hosting location, DPA/privacy assessment and
   retention policy for participant names, answers, attendance and scores.
5. A company OIDC identity provider configured for verified email and enforced MFA.
   Register **HTTPS callback** `https://trainlive.seraya.id/api/auth/staff/callback`.
   Record issuer URL, client ID, optional client secret, and approved staff email domains.
   The provider's verified ID token must include `amr` factors that prove MFA,
   or an approved `acr` listed in `TRAINLIVE_OIDC_MFA_ACR`.
6. Keep a tested **nonproduction** environment for migrations and 25-user browser UAT.
   Never point this Compose stack to an existing data-bearing database or run fixture
   scripts on production.

## Architecture and minimum operator baseline

Use a **Hostinger KVM VPS with Docker and the Compose plugin** (Ubuntu 24.04
recommended). Do **not** use the Hostinger Docker/OS template to reinstall an
existing server without confirming the backup and destruction implications.
[Hostinger Docker VPS guidance](https://www.hostinger.com/support/8306612-how-to-use-the-docker-vps-template-at-hostinger/).

The Compose graph has a **private internal-only database network** between
PostgreSQL, Next.js and the maintenance tool, plus a separate ingress/egress
network for Next.js and Caddy. Only Caddy publishes 80/443; PostgreSQL 5432
and Next.js 3000 must never be public. Logs rotate (10 MiB × 3 per
long-running container). At least 4 GiB RAM is advisable before running a
600-participant capacity exercise; real sizing depends on observed demand.

If the VPS already hosts `seraya.id` or another app on ports 80/443,
integrate the routing into the **existing** reverse proxy instead of
starting a second Caddy on the same ports. Keep the main website and its
DNS A record unchanged; add a dedicated `trainlive` record.

## 1. Clone and provision secrets

```bash
git clone https://github.com/elanghaqeem-hash/CustomerTrust.git
cd CustomerTrust
cp deploy/hostinger/hostinger.env.example deploy/hostinger/hostinger.env
chmod 600 deploy/hostinger/hostinger.env
openssl rand -hex 32  # run 3 times: owner DB, app DB, JWT secret
nano deploy/hostinger/hostinger.env
```

Fill `POSTGRES_PASSWORD`, `TRAINLIVE_APP_DB_PASSWORD` with **different**
64-character lowercase hex values and `TRAINLIVE_JWT_SECRET` with a new
high-entropy secret (hex 64 characters recommended). This format makes the DB
password safe inside the PostgreSQL connection URL. Set `TRAINLIVE_DOMAIN`
and real OIDC values; reject the sample `example.org`/REPLACE placeholders.

Never send passwords, JWT secret, OIDC client secrets or the `hostinger.env`
file through chat, GitHub, screenshots, CI logs, or public support tickets.

## 2. Preflight Compose and first-time bootstrap

Run this only against a **new empty** persistent database volume:

```bash
bash deploy/hostinger/preflight.sh
# After setting the DNS record, verify it resolves to your approved VPS:
# bash deploy/hostinger/preflight.sh --check-dns
bash deploy/hostinger/bootstrap.sh
```

The guarded bootstrap:

1. Confirms secrets/SSO inputs and brings up private PostgreSQL.
2. Refuses to reapply migrations if the schema already exists, protecting data.
3. Applies `db/migrations/001_*.sql` through the latest numbered SQL migration
   (currently `012_class_close_guard.sql`) in lexical order.
4. Provisions a separate `trainlive_web` LOGIN role that can switch only into
   `trainlive_app` for restricted Row-Level Security access.
5. Validates and seeds immutable Customer Trust Challenge v1 content.
6. Builds/starts Next.js and Caddy. Caddy obtains TLS certificates after DNS
   points to the VPS and HTTP/HTTPS ingress is reachable.

The runtime container **does not receive** `DATABASE_URL_ADMIN`. Only the
one-off maintenance container can use owner credentials. Database volumes are
never published on host ports. A container build succeeding is **not** go-live.

## 3. Check runtime and prepare a real class

```bash
# Check status without printing the resolved Compose config (which contains secrets).
docker compose --env-file deploy/hostinger/hostinger.env \
  -f deploy/hostinger/compose.yaml ps
curl -i https://trainlive.seraya.id/api/health
bash deploy/hostinger/smoke.sh
```

Go-live requires HTTP **200** and `{"service":"trainlive","status":"ready","ready":true}`.
Any HTTP **503** is a blocker, even if the registration page returns HTTP 200.

Create a scheduled class in the Asia/Makassar (WITA) timezone (use a future date):

```bash
docker compose --env-file deploy/hostinger/hostinger.env \
  -f deploy/hostinger/compose.yaml run --rm tools \
  tools/trainlive/create-class.mjs 2026-11-10 BATCH-01
```

It prints `class_id` and **a new random join_code**. Treat the code as a
class access credential; distribute it only within its scheduled registration
window. Never treat UI placeholder `ABC234` as a real code.

Assign an approved OIDC-backed facilitator, without creating insecure JWTs:

```bash
docker compose --env-file deploy/hostinger/hostinger.env \
  -f deploy/hostinger/compose.yaml run --rm tools \
  tools/trainlive/assign-staff.mjs CLASS_UUID trainer@approved-domain.id facilitator "Training Host"
```

The email domain must match `TRAINLIVE_OIDC_ALLOWED_EMAIL_DOMAINS`. The staff
member opens `https://trainlive.seraya.id/host/CLASS_UUID` and signs in with
the trusted identity provider and MFA; the class must first be activated through
authorized lifecycle controls. **Do not use**
`tools/trainlive/provision-facilitator.mjs` for production: that staging-only
tool prints a bearer token.

For an authorized master admin, a trusted operator may use
`tools/trainlive/promote-admin.mjs` after staff assignment; this is a
privileged audited operation, NOT part of automatic bootstrap.

## Login Administrator (satu URL tanpa mengetahui ID kelas)

Buka `https://trainlive.seraya.id/admin/login` setelah domain dan aplikasi
siap. Gunakan akun staf yang sudah dipromosikan menjadi Super Admin dengan
SSO/MFA; peserta menggunakan halaman utama. Migration 013 menambahkan resolver
admin terbatas, bukan user atau password default. Operator perlu menjalankan
`tools/trainlive/assign-staff.mjs` dan `tools/trainlive/promote-admin.mjs`
terhadap kelas sumber, menggunakan database owner di lingkungan aman. Callback
OIDC yang perlu didaftarkan tetap `https://trainlive.seraya.id/api/auth/staff/callback`.

## 4. Mandatory release tests

- Public HTTPS certificate valid; HTTP redirects; no public access to 3000/5432.
- `/api/health` 200/ready:true and actual DB connection with non-owner role.
- Staff SSO: verified email + MFA + assigned class, unauthorized and wrong-class denied.
- 25 mobile participants join in the permitted registration window and work
  end-to-end: pre/post tests, polls, 11 scenarios, 5 worksheets, chat,
  leaderboard, and CSV/XLSX/PDF exports.
- Separate simultaneous classes must never see each other's participants or scores.
- Confirm rate limiting behind Caddy: untrusted `X-Vercel-Forwarded-For` cannot
  override the real client IP on Hostinger.
- Backup, offsite encrypted copy, successful restore in a disposable environment.
- Load-test in staging against representative class counts. Do not claim 600
  concurrent production users without capacity evidence and monitoring.
- Complete OJK/PDP data residency review and participant privacy documentation.

## 5. Operations, backups and rollback

```bash
bash deploy/hostinger/backup.sh
# Replace with the path printed by backup.sh; never put real dumps in Git.
bash deploy/hostinger/restore-drill.sh /secure/path/trainlive-YYYYmmddTHHMMSSZ.dump
docker compose --env-file deploy/hostinger/hostinger.env \
  -f deploy/hostinger/compose.yaml logs --tail=100 app
```

The restore drill starts a **temporary isolated PostgreSQL 16 container with
no published port or network access**, verifies restored schema and training
content, and removes the container. It does not touch or overwrite production.
It does not replace a documented RPO/RTO, point-in-time recovery exercise,
or **encrypted offsite** backups.

Keep backup copies encrypted **outside the same VPS** and test point-in-time
recovery/restore. Preserve the last known-good application image and verified
database restore point before upgrades. For updates, pin a reviewed Git commit,
run CI, build the image, and promote only after staging smoke tests. **Never**
run initial `bootstrap.sh` against an existing production database or delete
`trainlive_data` with `docker compose down -v`.

For additional requirements, see `docs/PRODUCTION-READINESS.md`,
`docs/RUNBOOK.md`, and the existing integration workflow.

## Hostinger release checklist (printable)

- [ ] VPS operator can run `docker compose version` and Docker daemon.
- [ ] Private `hostinger.env` mode 600, independent strong secrets, verified
  OIDC HTTPS issuer/client/domains (no placeholder credentials).
- [ ] DNS `trainlive.seraya.id` matches the VPS public IPv4. No conflicting
  public reverse proxy on TCP 80/443.
- [ ] `preflight.sh --check-dns` and first-time `bootstrap.sh` succeed on an
  **empty** production volume; no database migration is replayed blindly.
- [ ] `smoke.sh` passes HTTPS, security headers and health `ready:true`.
- [ ] One valid MFA staff login and one unauthorized staff login are manually
  verified; no copied production bearer JWTs.
- [ ] A controlled classroom with 25 participants passes end-to-end exercises,
  worksheet submissions, scoring and PDF/XLSX/CSV exports.
- [ ] A private backup is created, restored in a disposable environment, then
  encrypted/offloaded to an approved offsite location. Restore objective tested.
- [ ] UAT, data-processing approval, monitoring, incident response, recovery
  owner and explicit go-live sign-off are recorded.

Passing CI, building images or getting HTTP 200 from a landing page is not a
substitute for these operating checks. Real-time WebSocket delivery and
automated H+1/H+7/H+30/H+60 follow-up are separate P1/P2 deliverables.

## Hosting-provider boundaries

This change cannot change DNS, buy a VPS, read Hostinger secrets, provision
an enterprise identity provider, or certify the application as live. The operator
must perform those steps in the Hostinger/DNS/IdP accounts and supply test evidence.
