# CustomerTrust / TrainLive

Repository utama: https://github.com/elanghaqeem-hash/CustomerTrust (branch main).
Vercel production: https://ct-kohl.vercel.app/ (project ct, team collman).

> **Release status (2026-11-05, verified):** Production project `ct` now builds and serves the **actual Next.js TrainLive UI** from `apps/trainlive` at https://ct-kohl.vercel.app/. The production application is **NOT ready for participant use**: `/api/health` returns HTTP 503 (`setup_required`) because `DATABASE_URL_APP` is not configured, and the production database and staff SSO/MFA have not been provisioned. Deployment `dpl_554EifomQajpybv3ZkJMVde5JVEJ` built successfully from commit `c5b95a44f1a7ffb46a62fedb872831a8a891072a`; a second deployment is being validated for Node.js 22.x and Singapore (`sin1`) runtime. Staging remains protected. GitHub CI passes database tests on its ephemeral PostgreSQL service but does **not** prove production database readiness. Existing P0/P1/P2 tickets #2–#8 remain open.

## Hostinger VPS deployment (new, not yet live)

A Hostinger VPS deployment bundle is available in
[deploy/hostinger/README.md](deploy/hostinger/README.md): Next.js 15 on Node.js 22,
PostgreSQL 16 (private network), Caddy automatic HTTPS, a restricted runtime DB
role, class SSO/MFA provisioning and guarded initialization/backups. Target domain:
`https://trainlive.seraya.id` (**not configured**). This is an alternative
deployment option; it does not grant Hostinger access or change the existing
Vercel production environment. Do not open registration until production
readiness checks and UAT pass.

## Login Administrator TrainLive

Pintu masuk khusus Admin: **`/admin/login`** (Vercel: `https://ct-kohl.vercel.app/admin/login`;
Hostinger setelah aktif: `https://trainlive.seraya.id/admin/login`). Halaman peserta memiliki
link `Login Admin`. Admin menggunakan **SSO + MFA**, bukan kode kelas atau
password hardcoded. Callback OIDC yang sama (`/api/auth/staff/callback`) memilih
kelas pertama yang diotorisasi secara server-side dan membuka
`/host/CLASS_UUID/admin`. SQL `013_super_admin_sso_entry.sql` harus
terpasang sebelum login Admin dapat berhasil.

**Provisioning belum otomatis:** operator menyiapkan PostgreSQL, SSO/MFA, satu
kelas yang diterbitkan, menjalankan `assign-staff.mjs` dan kemudian melakukan
persetujuan `promote-admin.mjs` menggunakan koneksi DB owner secara privat.
Tanpa seluruh prasyarat ini, link tetap dapat tampil tetapi login tidak aktif.
Tidak ada kredensial atau hak admin yang diberikan hanya dengan mengunjungi link.

## Source layout

- db/migrations/001_core.sql — normalized multi-class schema; immutable published content and class snapshots
- db/migrations/002_rls.sql — restrictive PostgreSQL Row Level Security
- db/migrations/003_runtime.sql — checked join, staff class action, immutable point awards, Top 10 class leaderboard
- db/migrations/004_worksheets.sql — worksheet awards and auto-generated, class-specific LK2 after RF1–RF4 reveal
- db/migrations/005_observer_audit.sql — staff export audit policy includes assigned observers
- db/migrations/006_join_throttle.sql — database-coordinated join attempts throttle without plaintext IP storage
- db/tests/01_rls_isolation.sql — actual PostgreSQL transactional A/B isolation fixtures
- db/tests/02_worksheet.sql — class-specific LK2 and idempotent scoring integration test
- db/tests/03_join_throttle.sql — 100 allowed attempts followed by enforcement
- seed/customer-trust-challenge.v1.json — Bank Sulteng CTC v1 content (published, immutable): 16 interactive items, 11 scenario quizzes, 20 pre/post questions, LK1–LK5
- seed/customer-trust-challenge.v2.json — **current** CTC v2, aligned to deck revision 13 (83 slides): adds the Trust Equation quiz (TE1, slide 15), deck slide numbers, schedule and recaps; 17 items, 12 scenario quizzes. `seed.mjs` publishes every vN in order; new classes (CLI and Super Admin) use the newest published version, existing classes keep their snapshot
- db/migrations/014_admin_class_latest_content.sql — Super Admin class creation uses the newest published content version
- tools/trainlive — idempotent content seeder, class factory and seed validation
- apps/trainlive — patched Next.js 15.5.28 / React 19 mobile UI, facilitator staging console, individual worksheets, reports and class-scoped CSV/XLSX/PDF exports
- .github/workflows/trainlive-ci.yml — real Postgres CI tests, build and REST cross-class smoke test
- docs/DECISIONS.md — decisions, limitations and security boundaries

## Local setup (PostgreSQL 16 and Node 22)

1. Copy .env.example to .env **locally**; set a strong POSTGRES_PASSWORD and update DATABASE_URL_ADMIN consistently. Never commit .env.
2. Run: docker compose up -d postgres
3. Apply migrations using the migration-owner connection in this order:

   psql "$DATABASE_URL_ADMIN" -v ON_ERROR_STOP=1 -f db/migrations/001_core.sql

   psql "$DATABASE_URL_ADMIN" -v ON_ERROR_STOP=1 -f db/migrations/002_rls.sql

   psql "$DATABASE_URL_ADMIN" -v ON_ERROR_STOP=1 -f db/migrations/003_runtime.sql

   psql "$DATABASE_URL_ADMIN" -v ON_ERROR_STOP=1 -f db/migrations/004_worksheets.sql

   psql "$DATABASE_URL_ADMIN" -v ON_ERROR_STOP=1 -f db/migrations/005_observer_audit.sql

   psql "$DATABASE_URL_ADMIN" -v ON_ERROR_STOP=1 -f db/migrations/006_join_throttle.sql

4. Provision a distinct **non-owner** login role that is a member of trainlive_app; use a strong password stored privately. Example SQL (replace values locally): CREATE ROLE trainlive_web LOGIN PASSWORD 'replace-me'; GRANT trainlive_app TO trainlive_web;. Configure DATABASE_URL_APP for this restricted login.
5. Set TRAINLIVE_JWT_SECRET to a random secret of **at least 32 bytes**, known only to the server.
6. From repo root, run npm install --prefix tools/trainlive, then node tools/trainlive/validate-seed.mjs and node tools/trainlive/seed.mjs.
7. Create a class in WITA: node tools/trainlive/create-class.mjs 2026-11-05 BATCH-01. The output includes a class UUID and 6-character join code. Each run creates **fresh class items** and no participant data.
8. Install/start the app: npm install --prefix apps/trainlive; npm run dev --prefix apps/trainlive. Then open http://localhost:3000 and join with the code within the allowed join window.

Environment values belong in your shell / secret manager. A database URL belongs **only on the server**. Do not provision an exposed Postgres connection for browser clients. On managed Postgres, role creation and RLS must be reviewed by the provider/DBA.

## Run the REAL database isolation test (not mocks)

Run against a disposable development database after all migrations:

    psql "$DATABASE_URL_ADMIN" -v ON_ERROR_STOP=1 -f db/tests/01_rls_isolation.sql
    psql "$DATABASE_URL_ADMIN" -v ON_ERROR_STOP=1 -f db/tests/02_worksheet.sql

It creates two simultaneous classes A/B using the same immutable version, checks no-claim RLS, class-specific item state, cross-class inserts, identical email with separate participant records, and class-specific response/point queries. Everything runs in a transaction and rolls back. The CI workflow also runs these tests, REST 403 cross-class smoke tests and facilitator report/export smoke checks. **WebSocket class-isolation and actual production/staging 600-user load tests remain unverified; CI verifies class-scoped CSV/XLSX/PDF exports.** Do not mark the full acceptance criteria 1–15 as PASS until their actual checks succeed.

## Facilitator day-H playbook (target workflow)

1. Program Admin selects organization, Program, published ContentVersion and batch/date. A class must have distinct class_id and join code; never reuse an existing participant dataset.
2. Before the session, assign facilitator/cohost/observer to class_staff, distribute join code/QR only during its activation window, and review participant consent.
3. On the day, the facilitator transitions class_session.status to live through a protected management workflow. In this staging baseline, it can be done with node tools/trainlive/provision-facilitator.mjs CLASS_UUID facilitator@example.invalid. This enables the assigned class and prints a short-lived staff JWT. **This tool is NOT production authentication**: it requires trusted local management credentials. Open /host/CLASS_UUID and enter that token. Staff SSO and MFA remain pending.
4. Open each item, close at timer expiry, reveal correct answers, and show Top 10. Participant routes already support join/items/respond/leaderboard; staff API supports run_item. Realtime notification/presenter view is a later release gate.
5. Participants use /class/CLASS_UUID/worksheets to save and submit LK1, LK3, LK4 and LK5. LK2 is created after the RF1–RF4 answers are revealed and the participant has answered all four. Open /host/CLASS_UUID/report with a class staff JWT for pre/post metrics, participation, quiz correctness and audited class-scoped CSV. Never export across classes.
6. H+1 / H+7 / H+30 / H+60 follow-up and configured retention need an authenticated background job plus signed-off consent and retention policy.

## Data protection and production blockers

- All participant-derived records are explicitly class-scoped; composite foreign keys enforce class membership of related resources.
- The backend validates signed class-scoped JWTs. PostgreSQL RLS is a second boundary; browser clients never set SQL role/claims directly.
- Participant JWTs use HttpOnly, SameSite cookies, scoped by class identifier. Staff workflows must validate class_staff assignments.
- Raw answer keys are hidden before reveal. Participant free text warns against sharing bank secrets; a numeric-pattern confirmation is not a substitute for a data-loss-prevention control.
- The current app uses **3-second polling as a temporary UI refresh**, not the required subsecond class-specific WebSocket broadcast. Participants send a 60-second heartbeat when their tab is visible.
- Anonymous polls persist a keyed deduplication digest instead of a participant_id; an operational privacy review is still required.
- The production deploy serves the Next.js app from `apps/trainlive`; its health endpoint remains HTTP 503 `setup_required` until production PostgreSQL is provisioned, schema migrations `001`–`006` are applied, a dedicated non-owner runtime DB role is configured, and `DATABASE_URL_APP` is supplied via encrypted Vercel environment variables. CSV/XLSX/PDF exports are implemented and pass CI; follow-up notifications are not automated.
- Data residency/hosting location must be approved against the bank's policies and Indonesian data protection obligations.

See AGENTS.md for how ChatGPT-driven changes are committed to GitHub and verified.

## Production readiness gates (2026-11-05)

The deploy is **not yet production-ready** despite a valid Next.js application build and HTTP 200 on `/`: only the TrainLive JWT signing secret is configured in the production Vercel environment, and no `DATABASE_URL_APP` is present. `/api/health` returns HTTP 503 (`setup_required`). Production PostgreSQL provisioning, migration/seed, non-owner runtime DB role, staff SSO/MFA, realtime authorization, data processing approvals, backup/restore and browser UAT remain release gates. See [docs/PRODUCTION-READINESS.md](docs/PRODUCTION-READINESS.md). Do not grant real participant access merely because deployment state is READY.

## Staging, security and load-test evidence

- Protected staging: https://ct-trainlive-staging.vercel.app/ (Node 22, Singapore function region). **Health is 503 setup_required** until trusted backend configuration exists.
- CI includes PostgreSQL migrations 001–006, RLS class-isolation, report/export verification, a 25-seat concurrent join test, JWT REST negative tests, and Next.js build.
- Authorized report exports: CSV, XLSX, PDF; facilitator chat moderation: hide/unhide/read aloud with idempotent point rewards.
- [Runbook](docs/RUNBOOK.md) · [600-user load test](docs/LOAD-TEST.md) · [Release criteria](docs/PRODUCTION-READINESS.md).
