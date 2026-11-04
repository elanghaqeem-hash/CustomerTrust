# TrainLive operations and disaster recovery runbook

## Deployment ownership
- GitHub: `elanghaqeem-hash/CustomerTrust`, primary branch `main`
- Vercel: `collman/ct` / `prj_csqddt8RBv8OEk33vJi2WObzHvR8`
- URL: https://ct-kohl.vercel.app/
- App source root: `apps/trainlive`
- Database: external PostgreSQL 16+; no database is provisioned by merely building Next.js.

## Production prerequisites
1. Approve DPA, target hosting region, handling of participant names, individual answers, and retention periods.
2. Provision managed Postgres with encrypted storage and backups/PITR. Validate network access from the Vercel runtime; enable TLS.
3. Create a migration-owner credential separate from non-owner `trainlive_web`. Restrict web role via `trainlive_app` RLS; never use a table owner for app runtime.
4. Run migrations `001_core` through `006_join_throttle` as migration owner. Verify schema and execute tests on a *separate disposable database*.
5. Seed canonical Bank Sulteng content once using trusted management tooling. Configure production Vercel `DATABASE_URL_APP` and `TRAINLIVE_JWT_SECRET` through the dashboard (production scoped).
6. Provide staff SSO/MFA and class assignments through a reviewed IdP. The staging copy/paste staff JWT is **not acceptable for production**.
7. Only after these checks switch Vercel Framework to `nextjs`, Root Directory to `apps/trainlive`, runtime Node.js 22.x, and deploy the approved SHA.
8. Check `GET /api/health` returns `200 {ready:true}`; verify join, pre/post tests, worksheets, score calculation, class isolation, permissions and export audit in the deployed environment.

## Observability
- Set Vercel error alerting; include HTTP 5xx, 403 cross-class denial, unusual 429 join attempts, DB saturation and slow queries.
- Never log JWTs, join codes, answers, email addresses or DB URLs.
- Test backups at least monthly, recording restore time and point-in-time recovery. Keep migration IDs and rollback notes.
- Refuse production rollout while any P0 gate remains unresolved.

## Security operations
- Join requests use a DB-backed 100-attempt/10-minute per source IP throttle; hashed identifiers must be purged according to policy (e.g. old entries removed by DBA job after approved retention).
- Use HTTPS, minimal DB grants, protected branch and CI approvals, and follow-up authenticated access reviews.
- CSV, Excel and PDF are class-bound, staff-authorized, and logged in `trainlive.audit_log`.
- Auth key rotation invalidates existing participant tokens; arrange rotation between live sessions.

## Rollback
- Record the last healthy Vercel deployment ID and a verified database restore point before changes.
- For a frontend regression, reassign traffic to the previous healthy production deployment.
- For DB regression, favor forward fix; restore only against a tested recovery plan, since restore may lose recent responses.
- Require a post-rollback login and class-isolation check. Preserve incident logs and notify affected class coordinators.

## Follow-up/retention schedule
H+1 / H+7 / H+30 / H+60 cannot run on user data until consent terms, retention duration, message templates, notification provider and opt-out have been approved. The schema alone does not implement or authorize sending.
