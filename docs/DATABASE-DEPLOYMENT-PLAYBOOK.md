# TrainLive — production database and go-live playbook

> **Release safety.** Production and staging are NOT ready until `/api/health`
> returns HTTP 200 `{"ready":true}` and the independent UAT/security gates pass.
> Do not open the participant class join window or use live bank data earlier.

## Reuse existing assets

Use `db/migrations/001_core.sql` through `009_join_throttle_multiclass.sql`,
`seed/customer-trust-challenge.v1.json`, `tools/trainlive/{seed,create-class,provision-facilitator}.mjs`,
`.github/workflows/trainlive-ci.yml`, `docs/STAFF-SSO.md`, and the deployed
Next.js project `ct`. No new app or schema rewrite is required.

## Provider compatibility

Choose **managed PostgreSQL 16+** with separate migration-owner login and a
separate, non-owner **runtime LOGIN role** with `NOBYPASSRLS` and membership
in `trainlive_app`; it MUST support `CREATE ROLE`, `GRANT`, `SET LOCAL ROLE`,
transactional session settings, SECURITY DEFINER functions, and RLS.
Provision **separate databases** for production and staging; approve the region,
data residency, encryption, network access, backups/PITR and restore test before
using real bank participant data.

**Do not connect the existing Prisma Postgres Marketplace integration to this
security model.** Prisma's current published limitations state custom PostgreSQL
roles cannot be created and separate credentials have equal access. That is
incompatible with the mandatory TrainLive least-privilege runtime/RLS boundary.
See official [Prisma FAQ](https://www.prisma.io/docs/postgres/faq) and
[connecting guide](https://www.prisma.io/docs/postgres/database/connecting-to-your-database).
A suitable managed provider is one that demonstrably supports the roles and
permissions above (e.g. a correctly configured PostgreSQL service on Railway,
Neon or Supabase, with provider-specific constraints reviewed first).

## Execute once a compatible provider is available

1. **Private operator action:** create two isolated databases, approve location
   and backup/PITR settings, and retain provider credentials in its secret manager.
2. Apply all migrations as the **migration owner**, sequentially, stopping at
   first error. Example with direct admin connection:
   ```bash
   for file in db/migrations/0*.sql; do
     psql "$DATABASE_URL_ADMIN" -v ON_ERROR_STOP=1 -f "$file"
   done
   ```
   Use the *ordered filenames* 001 to 009; never run these in a browser.
3. Create a separate runtime login with an independently generated strong
   password via DBA-controlled SQL, then `GRANT trainlive_app TO <runtime-login>`.
   The runtime account must **not own any trainlive tables** and must not
   have `SUPERUSER`, `BYPASSRLS` or `CREATEROLE`.
4. Use a disposable staging database to run
   `db/tests/01_rls_isolation.sql`, `02_worksheet.sql`, `03_join_throttle.sql`,
   and `04_staff_oidc.sql`. Run `05_production_preflight.sql` using the
   dedicated `DATABASE_URL_APP` (not the migration owner's connection).
   Run the repository's GitHub Actions CI integration suite.
5. Seed published material using existing `node tools/trainlive/seed.mjs`
   (idempotent). Run `node tools/trainlive/create-class.mjs YYYY-MM-DD BATCH-01`
   against the approved DB, after checking local date/time in WITA.
6. In Vercel `ct`, create **encrypted** `DATABASE_URL_APP` for the non-owner
   runtime connection. Set a unique long `TRAINLIVE_JWT_SECRET` (already present)
   and the SSO settings in `docs/STAFF-SSO.md`. Do not use the migration owner,
   `DATABASE_URL`, or `POSTGRES_URL` as `DATABASE_URL_APP`.
7. Redeploy production, then verify `/api/health` is HTTP 200
   with `ready:true`, which now also verifies restricted runtime role,
   RLS policies being enabled, published Bank Sulteng seed structure, and
   required functions. Health is a **technical** readiness check, not
   sufficient alone for business go-live.
8. Configure the approved IdP OIDC callback, staff MFA, assignments to classes
   and live browser login/logout. No manually pasted JWT in Vercel production.
9. Run 25 browser UAT, two-class isolation, pre/post, 11 scenarios, LK1–5,
   moderation, score reconciliation, report CSV/XLSX/PDF and error/rollback
   scenarios. Run 600 synthetic VUs only against staging (never real users).
10. Obtain written data processing/retention approval, backup **restore**
    evidence, security reviewer acceptance, and program owner's go/no-go.

## How to investigate a failed health check

* `setup_required`: missing runtime DB URL, JWT or production IdP settings.
* `unavailable`: database inaccessible, insufficient grants, or migration
  008 missing. Inspect restricted server logs without leaking credentials.
* `unsafe_runtime_role`: DB connection is owner, superuser or not a proper
  member of the restricted role; do not bypass it.
* `rls_required`: one or more mandatory tenant tables lack RLS.
* `seed_required`: published Bank Sulteng v1 content (16 items, 5 sheets)
  has not been installed.
* `migration_required`: schema/functions/grants incomplete.
* `ready`: technical database gate passes; still complete real IdP and UAT.

**Never** place actual DB connection strings, IdP secrets, access tokens,
participant data, or join codes in GitHub commits, issues or test logs.
