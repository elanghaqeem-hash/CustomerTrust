# TrainLive Production Activation — Vercel, Neon, Auth0

This document is an OPERATOR RUNBOOK, not evidence of production activation.
Production: https://ct-kohl.vercel.app
GitHub: elanghaqeem-hash/CustomerTrust, branch main.
Vercel: collman/ct, Node.js 22 / Next.js.
Never place passwords, database URLs, JWT secrets or client secrets in GitHub,
ChatGPT, logs, screenshots or public issue trackers.

## 0. Approval and segregation

- Approve the bank participant privacy/data-retention policy and the data
  residency impact of AWS Singapore (outside Indonesia).
- Create separate production and staging databases and approve backup/PITR.
- Confirm current GitHub CI is green and capture a known-good Vercel deployment.
- Do not use existing Prisma Postgres integration: its permission model does not
  satisfy TrainLive's runtime role and Row-Level Security requirements.
- Never put DATABASE_URL_ADMIN into Vercel environment variables.

## 1. Provision Neon PostgreSQL

In the APPROVED Neon organization, create trainlive-prod, PostgreSQL 16,
region aws-ap-southeast-1 (Singapore). Also create a separate trainlive-staging.
Enable backup/PITR and a restore strategy appropriate to participant data.

From Neon Connect take the owner DIRECT connection string, not pooled, and
store privately on the trusted operator workstation as DATABASE_URL_ADMIN.
Run the following from CustomerTrust repository root:

~~~bash
npm ci --prefix tools/trainlive
node tools/trainlive/db-setup.mjs status
node tools/trainlive/db-setup.mjs migrate
export TRAINLIVE_APP_DB_PASSWORD="$(openssl rand -hex 32)"
node tools/trainlive/db-setup.mjs runtime-role
node tools/trainlive/validate-seed.mjs
node tools/trainlive/seed.mjs
~~~

Configure a SEPARATE DATABASE_URL_APP using Neon POOLED hostname
(with -pooler), trainlive_web username and the generated runtime password.
Never use the owner for app runtime. Check:

~~~bash
node tools/trainlive/db-setup.mjs verify
node tools/trainlive/db-setup.mjs status
~~~

The latest migration must be 013_super_admin_sso_entry.sql. Do not use
--baseline-through for an existing schema without reviewing the actual
migration history and confirming exact SQL compatibility.

## 2. Auth0 SSO and MFA

In your approved Auth0 tenant, create a Regular Web Application with
Authorization Code + PKCE S256 and scopes openid email profile.

Allowed Callback URL (exact):
https://ct-kohl.vercel.app/api/auth/staff/callback

Allowed Web Origin:
https://ct-kohl.vercel.app

- Restrict sign-up/connection access to authorized identities.
- Ensure the named Administrator email is verified.
- Enforce MFA for every staff login in Auth0 tenant/application policy.
- Check the signed ID token indicates amr including mfa, or a reviewed acr
  value configured in TRAINLIVE_OIDC_MFA_ACR. No MFA signal means reject.
- The issuer in Auth0 metadata may have a trailing slash. TrainLive verifies
  the EXACT discovered issuer on the signed ID token.
- Google consumer gmail identities do not satisfy Google Workspace's hd
  requirement in the alternative Workspace-specific provider path; an
  approved Auth0 identity with an exact authorized email is supported.

## 3. Vercel production variables

In Vercel > collman > ct > Settings > Environment Variables:
- DATABASE_URL_APP = non-owner Neon pooled URI
- TRAINLIVE_DB_SSL = verify-full
- TRAINLIVE_DB_POOL_MAX = 3
- TRAINLIVE_APP_ORIGIN = https://ct-kohl.vercel.app
- TRAINLIVE_JWT_SECRET = existing strong secret (do not rotate during a class)
- TRAINLIVE_OIDC_ISSUER = trusted Auth0 HTTPS issuer
- TRAINLIVE_OIDC_CLIENT_ID = Auth0 Regular Web Application client ID
- TRAINLIVE_OIDC_CLIENT_SECRET = Auth0 confidential client secret
- TRAINLIVE_OIDC_ALLOWED_EMAIL_DOMAINS = approved email domains
- TRAINLIVE_OIDC_MFA_ACR = approved acr only (optional)

Scope to Production and store sensitive values as encrypted/Sensitive.
Do not add DATABASE_URL_ADMIN, POSTGRES_URL or migration-owner credentials.
A project build showing READY is NOT evidence of a configured database.
Redeploy after changing environment variables.

## 4. Initial class and approved Super Admin

In the operator environment (DATABASE_URL_ADMIN defined), select a future
class date in Asia/Makassar (WITA):

~~~bash
node tools/trainlive/create-class.mjs YYYY-MM-DD ADMIN-BOOTSTRAP
node tools/trainlive/assign-staff.mjs CLASS_UUID approved-admin@example.com facilitator "Approved Admin"
node tools/trainlive/promote-admin.mjs CLASS_UUID approved-admin@example.com APPROVE-TRAINLIVE-SUPER-ADMIN
~~~

Replace CLASS_UUID and email with the actual approved, verified identity.
The privilege grant is audited; it is NOT executed automatically by deploying
the app. The ID token's issuer and subject are bound at first successful login.
Unauthorized or unassigned accounts must be denied.

## 5. Release gates

1. Redeploy reviewed GitHub main commit in Vercel ct; record deployment SHA.
2. GET https://ct-kohl.vercel.app/api/health returns HTTP 200 with:
   {"service":"trainlive","status":"ready","ready":true}
3. Login at https://ct-kohl.vercel.app/admin/login with verified MFA identity
   and check it redirects to /host/CLASS_UUID/admin.
4. Reject unauthorized admin, non-MFA, wrong issuer/subject and unverified email.
5. UAT 25 participants across pre/post, 11 scenarios, polls, worksheets,
   leaderboard, moderation, reports and class isolation.
6. Test backup and restore in a disposable database; preserve approved data
   protection/retention evidence and monitoring/rollback plan.

If health is 503, stop: setup_required, unavailable, unsafe_runtime_role,
rls_required, seed_required or migration_required are all NO-GO. Do not
activate participant registration until all gates pass.

Connecting an external Neon app to ChatGPT alone is not database provisioning
and is not proof of a running production database.
