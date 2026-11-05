# TrainLive — Production execution gate and 25-browser synthetic UAT

Updated: 2026-11-05. This is a **verification plan**, not a production go-live certificate.

## New automated evidence

The `TrainLive integration` GitHub workflow runs real PostgreSQL 16, migration/RLS and REST checks, a synthetic 600-join API test, then launches **25 separate Chromium browser contexts** on a disposable CI database. It verifies:

1. 25 independently consented participants enter the same synthetic class using the real join form.
2. The Rundown tab renders without revealing answer keys.
3. An assigned facilitator opens a scenario using the protected class API; participants receive the open item.
4. 25 participants choose an answer in the actual mobile UI and send responses. All 25 persisted responses are checked.
5. Reveal shows the key only after the facilitator action, points appear in the class-specific Top 10.
6. A participant from class A receives HTTP 403 on class B data.
7. All five worksheet menu items appear; facilitator menu displays the authorized role and report link.
8. Homepage exposes the expected CSP header; health probe returns ready in CI.

The test intentionally increases **only the synthetic class's SC1 timer** to 180 seconds to accommodate browser setup on shared CI compute. The regular training content and answer timer remain unchanged.

This is stronger than REST-only tests, but it is **not** a live-bank 25-person signoff, real-browser cross-device accessibility certification, staging k6 benchmark, or MFA/SSO test. If CI turns red, inspect logs before merging.

## Runtime smoke verification

After all approved production prerequisites are configured, run:

```bash
node tools/trainlive/verify-deployment.mjs https://ct-kohl.vercel.app
```

The read-only verifier checks: 200 frontend with TrainLive UI, CSP and clickjacking guard, non-cached health endpoint, and **200 `{"service":"trainlive","status":"ready","ready":true}`**. Returns nonzero on NO-GO; never interpret a 200 HTML root alone as ready.

## Blocking external actions before real customers

1. **Bank/owner approval:** hosting region and cross-border data assessment (if applicable), privacy notice, data purpose, retention, processor agreements, backup RPO/RTO, authorized class coordinator.
2. **Database:** connect a managed PostgreSQL 16+ with role creation, TLS, backup/PITR and separate staging/production databases. Create migration owner and restricted `trainlive_web` login; no Prisma Postgres because its current limited roles do not support this required pattern. Run 001–012 in order, seed published CTC, and verify non-owner RLS as described in `DATABASE-DEPLOYMENT-PLAYBOOK.md`.
3. **SSO/MFA:** approved OIDC issuer and client, MFA claim policy, verified allowed staff email domains and preassigned facilitator/cohost/observer; stage an actual authorization-code browser test. The manual JWT path is not a production option.
4. **Vercel environment:** securely enter `DATABASE_URL_APP`, `TRAINLIVE_OIDC_ISSUER`, `TRAINLIVE_OIDC_CLIENT_ID`, `TRAINLIVE_OIDC_ALLOWED_EMAIL_DOMAINS`, `TRAINLIVE_OIDC_MFA_ACR` and (if needed) `TRAINLIVE_OIDC_CLIENT_SECRET`; never paste values into GitHub/issues/chat. Keep `TRAINLIVE_JWT_SECRET` private.
5. **Security/release:** protect GitHub `main` with required TrainLive CI and approvals. Validate backups/restore, audit logs, 25 live staging browsers, two-class isolation and bank signoff; record a rollback deployment.
6. **P1/P2 not yet closed:** provision class-scoped realtime service and benchmark subsecond p95; perform independent WCAG 2.2 AA/security review; stage a 600-user k6 test with actual database; approve optional H+1/H+7/H+30/H+60 data and provider before enabling notifications.

### Safe release decision

`READY` on Vercel means the **build** succeeded; it does not override an unhealthy backend. Do not allow bank participant data or mark TrainLive fully live until the verifiable health check, UAT and the required external approvals all pass. A fail-closed join screen while unconfigured is expected and protective.
