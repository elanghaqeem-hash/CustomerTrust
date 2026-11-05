# TrainLive release gates — 2026-11-05

## Hosting target portability

Vercel remains the previously configured environment. Hostinger VPS is supported
as a separate, **not-yet-deployed** target via
`deploy/hostinger/README.md`. The same database, least-privilege, staff MFA,
security, privacy, backup and acceptance gates apply. For Hostinger, additionally
verify external DNS, Caddy-managed HTTPS, container isolation and safe client-IP
forwarding. `/api/health` must not skip staff SSO configuration merely because
the host is not Vercel.

## Non-negotiable controls

**Never switch Vercel's production Root Directory to `apps/trainlive` until the operating database has been provisioned, migrations and seed applied, and an authenticated facilitator flow works on the intended production environment.** Build READY alone does not establish readiness.

### P0
- [ ] Provision production PostgreSQL (approved region, network restrictions, PITR/backup, distinct migration owner and non-owner runtime account)
- [ ] Apply migrations `001_core.sql` through current version and run the database test fixtures in an isolated *non-production* database
- [ ] Configure `DATABASE_URL_APP` and `TRAINLIVE_JWT_SECRET` on Vercel as encrypted production environment variables, never in Git
- [ ] Provision staff identity and verify MFA/SSO with class-specific assignment; retire manually pasted production staff bearer tokens
- [ ] Preflight `/api/health` returns HTTP 200 with `ready:true`, not just environment presence
- [ ] Staging UAT: 25 real browsers, simultaneous two-class isolation, 10-question pre/post, 11 scenarios, 5 worksheets, anonymous poll, chat, full report and retry safety
- [ ] Configure Vercel root directory `apps/trainlive`, framework `nextjs`, Node.js 22.x and inspect deployment build logs
- [ ] Confirm `https://ct-kohl.vercel.app/` serves Next.js TrainLive; smoke test health and working browser interactions
- [ ] Enable protected `main`, mandatory TrainLive integration checks and review before production changes

### P1
- [ ] Implement authenticated, class-scoped realtime broadcast with measured end-to-end latency (a provider or websocket runtime is needed)
- [ ] Complete staff UI, chat moderation and authorization
- [ ] Add multi-format export with safe CSV/XLSX/PDF; audit each export and keep it class-bound
- [ ] Validate abuse protection, CSP, auth CSRF and all user input limits
- [ ] Establish logs, error alerts and restoration testing

### P2
- [ ] Obtain approved follow-up schedule and consent for H+1/H+7/H+30/H+60; run notification jobs with opt-outs
- [ ] Run k6 synthetic 600-user test against staging without real customer data
- [ ] Run independent accessibility review to WCAG 2.2 AA and documented score >=90
- [ ] Review OJK/PDP constraints, data residency, retention and deletion in writing

## Promotion and rollback
1. Validate a protected pull request, CI, preview smoke tests and database backup.
2. Promote only an approved, tested production build once all P0 gates are satisfied.
3. Keep existing known-good Vercel deployment ID and backup/PITR restore procedures.
4. If errors rise or an authorization test fails, stop the rollout and roll back traffic.
5. Never treat a static landing page returning HTTP 200 as a functioning TrainLive instance.
