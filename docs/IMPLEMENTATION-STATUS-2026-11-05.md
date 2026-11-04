# TrainLive execution status — 5 November 2026

## Source implementation
- Database migration 006 enforces a 100-attempt/10-minute per-IP join throttle based on HMAC, avoiding plaintext client IP storage.
- Next.js 15.5.28 and React 19.3.1 replace vulnerable earlier runtime versions.
- Health probe performs database/migration validation; it cannot claim success from environment variables alone.
- Facilitator can moderate per-class chat (hide / unhide / mark read aloud with +5 idempotent points).
- Report supports audited, class-scoped CSV, XLSX, and PDF.
- Participant join form displays backend readiness and refuses submission while setup is pending.
- CI covers PostgreSQL class isolation, 25-seat concurrent join, export formats, and REST authorization.
- k6 script for 600 synthetic users across 24 isolated classes committed (run not executed).

## Infrastructure and release
- Main production site: https://ct-kohl.vercel.app — static initialization landing.
- Staging project: `ct-trainlive-staging`, independent Vercel project, root `apps/trainlive`, runtime Node 22, function region sin1, Vercel Authentication enabled.
- Staging root: HTTP 200; health: HTTP 503 setup_required without backend secrets.
- Production Vercel `ct` currently has no TrainLive environment variables and must not be switched prematurely.
- Prisma Marketplace integration is installed at team scope but not bound to TrainLive or initialized as a database.
- Full SSO/MFA and realtime provider remain unimplemented; no 600-user staging load test or signed data policy.

## Release decision
**NO-GO** for real banking participant data until all P0 controls in PRODUCTION-READINESS.md pass. A successful GitHub build or a Vercel READY label does not override these gates. Production cutover is deliberately withheld.
