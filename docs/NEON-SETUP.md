# TrainLive on Neon (Singapore) — database setup

Provider choice: **Neon**, region **AWS Asia Pacific (Singapore) `aws-ap-southeast-1`**
(closest to Vercel `sin1`). The region cannot be changed after project creation.
Singapore is outside Indonesia: the bank's data-residency / PDP approval is still a
release gate (see `PRODUCTION-READINESS.md`).

Compatibility checked against the repo: migrations need only `CREATE EXTENSION pgcrypto`
and `CREATE ROLE trainlive_app` (owner role has CREATEROLE via `neon_superuser`).
The runtime login is created `NOBYPASSRLS NOCREATEROLE`, so `production_preflight()`
accepts it. The migration owner is rejected as runtime by design.

## 1. Create projects (Neon console, operator only)

- Production: project `trainlive-prod`, Postgres **16** (matches CI), region Singapore.
- Staging: a **separate** project `trainlive-staging`, same settings.
- Do not connect the database through a Marketplace integration that injects the owner
  URL into Vercel; TrainLive only reads `DATABASE_URL_APP`.

From *Connect*, copy two strings for the owner role (`neondb_owner`), database `neondb`:
- **Direct** (host without `-pooler`) → `DATABASE_URL_ADMIN` (local shell only).
- **Pooled** (host with `-pooler`) → template for `DATABASE_URL_APP`.

## 2. Migrate, create runtime login, seed, verify (trusted machine, repo root)

```bash
export DATABASE_URL_ADMIN='postgresql://neondb_owner:<owner-pw>@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'
npm install --prefix tools/trainlive

node tools/trainlive/db-setup.mjs migrate          # 001..013, tracked

# Neon requires >= 60 bits entropy; avoid URL-unsafe characters.
export TRAINLIVE_APP_DB_PASSWORD="$(openssl rand -base64 36 | tr -d '/+=')"
node tools/trainlive/db-setup.mjs runtime-role     # trainlive_web + GRANT trainlive_app

node tools/trainlive/seed.mjs                      # published CTC v1

export DATABASE_URL_APP="postgresql://trainlive_web:${TRAINLIVE_APP_DB_PASSWORD}@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
node tools/trainlive/db-setup.mjs verify           # must print: runtime connection verified: ready
```

Neon uses a publicly trusted certificate, so the default `TRAINLIVE_DB_SSL=verify-full`
works without a CA bundle.

## 3. Vercel project `ct` (Production, mark as Sensitive)

| Name | Value |
|---|---|
| `DATABASE_URL_APP` | the pooled `trainlive_web` URL above |

Do **not** add `DATABASE_URL_ADMIN`, the owner URL, `DATABASE_URL` or `POSTGRES_URL`.
Repeat for staging with the staging project's values.

Redeploy. `/api/health` stays **503 `setup_required`** on Vercel production until the
staff OIDC variables are also set (`STAFF-SSO.md`); after that it must return
200 `{"ready":true}`.

See also [VERCEL-NEON-AUTH0-ACTIVATION.md](VERCEL-NEON-AUTH0-ACTIVATION.md) for the complete
Neon + Auth0 Super Admin go-live procedure and migration 013.

## 4. Operations

- Enable a restore window / PITR appropriate for bank data and run a restore test
  before go-live (plan-dependent; confirm in Neon billing).
- Scale-to-zero adds a cold start on the first query; the app's 5 s connect timeout
  tolerates it. Consider keeping compute always-on during training days.
- Rotate the runtime password: `db-setup.mjs runtime-role --rotate`, then update
  `DATABASE_URL_APP` in Vercel and redeploy.
- Never paste connection strings into chat, GitHub, issues or logs.
