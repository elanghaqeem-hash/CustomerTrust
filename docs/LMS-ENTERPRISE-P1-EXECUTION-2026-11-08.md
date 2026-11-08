# TrainLive LMS Enterprise — Execution Evidence (8 November 2026)

**Status:** Development/CI only. **Do not merge, migrate production, or activate LMS** until G0–G8 are reviewed and approved.
**Source:** \`CustomerTrust\`, branch \`feat/lms-parameter-foundation\`, PR #38. Baseline main \`aed36960d97a36170e107b4c88b2859dcab3e7ec\`.

## Delivered vertical slices

| WP | Evidence / implementation | Status |
| --- | --- | --- |
| P1.1 Tenant Parameters | Migration 018, scoped setting GET/POST, Super Admin settings editor, effective global/tenant preview, test 11 | Implemented, CI-tested |
| P1.2 Tenant Management | Migration 019, onboarding tenant creation, list/update, status lifecycle (onboarding, active, suspended), Super Admin management UI, test 12 | Implemented as controlled onboarding; tenant course/bootstrap journey not yet delivered |
| P1.3 Membership & RBAC | Migration 019, scoped pre-verified OIDC staff grant/revoke, no self-escalation, audit, test 12 | Core membership registry implemented; no tenant-admin self-service login or delegation |
| P1.4 Parameter versioning | Migration 020, history trigger, read and rollback SECURITY DEFINER functions, history UI, test 13 | Revision history/rollback implemented; maker-checker approval and broader inheritance pending |
| P1.5 Course Builder defaults | Existing P0/P1 builder reused. On-demand "Gunakan default tenant" UI and API server resolution of defaults when fields are omitted | Incremental; multi-program tenant-independent authoring is pending |
| P2/P3/P4 | Durable learner identity, assessment engine, issuance, private media, reporting, integrations, 420-case UAT | Not yet implemented / verified |

## Security and data preservation

- No migrations modify existing \`participant\`, \`class_item\`, \`class_session\`, \`response\`, \`point_ledger\`, published content snapshots, or worksheet submissions.
- New tenant creation is isolated: no class, participant, program, grade, content version or published snapshot is copied.
- All new runtime tables use RLS and prohibit direct \`trainlive_app\` table access. API writes require same-origin and signed staff class session.
- Only pre-approved, class-assigned Super Admin may manage tenants in the current release. Tenant membership does not itself grant class access or platform super-admin rights.
- Tenant list only returns the source tenant or additional tenants with an active \`tenant_admin\` membership held by the authenticated Super Admin.
- New role assignment requires a pre-provisioned staff identity with bound OIDC issuer and subject; self-assignment/self-revocation are prohibited.
- Suspension blocks LMS *authoring* writes on course/module/lesson only; it intentionally does not terminate existing live class participation or change historical records. Do not advertise it as a complete tenant-wide login suspension.
- Parameter revisions are immutable to the runtime role; a rollback is a new revision and passes the same allowlist and validation as a normal write. \`certificate.enabled=true\` remains prohibited.
- LMS build feature gate remains \`NEXT_PUBLIC_TRAINLIVE_LMS_ENABLED\` default OFF; route and API 404 cases are covered by CI.

## API contract (all class-scoped)

| API | Verbs | Server authorization |
| --- | --- | --- |
| \`/api/class/:classId/lms\` | GET/POST | Existing course builder and tenant parameter defaults on optional create fields |
| \`/api/class/:classId/lms/settings\` | GET/POST | Current tenant setting registry and effective values |
| \`/api/class/:classId/lms/settings/history\` | GET/POST | Read version history and validated rollback by revision |
| \`/api/class/:classId/lms/tenants\` | GET/POST | Scoped list, onboarding, metadata/lifecycle, membership grant/revoke |

All methods refuse unapproved actors in SQL, not merely by hiding UI buttons.

## CI and UAT

- \`.github/workflows/trainlive-ci.yml\` applies migrations 001–020 in order in disposable PostgreSQL 16 and runs DB tests 01–13 (including negative cross-class/tenant and runtime privilege checks).
- Existing TrainLive live training, browser participation, regression and load jobs remain in the same CI pipeline.
- P1 tenant management runs for commit \`2574c3d66cd13492535292116b8216abc6059ce6\`: both succeeded, e.g. GitHub Actions run \`42471999229\`.
- Later commits must be checked against **their own SHA** before treating these results as current. A green earlier run cannot prove subsequent code.
- Target 420-case enterprise UAT is not satisfied by CI. Browser tests on an approved LMS-enabled staging with representative roles remain required.

## Deployment and database findings

- At the time of read-only Neon verification on 8 Nov 2026, production branch \`production\` did not have any LMS tables from 016–020. QA clone had \`lms_course\` from migration 016. No production SQL write was performed.
- Vercel production deployment \`dpl_9N9CeVC5z7SaZibMueStbK9ieAFP\` was READY at main SHA \`aed36960d97a36170e107b4c88b2859dcab3e7ec\` when checked; it is not proof that LMS is activated. Preview deployments are separate.
- Main branch protection was reported as disabled when checked; branch safety and independent review must be established before production promotion.

## Outstanding gates for safe production

1. G0/G1: architecture and access review, database function audit, mandatory branch protection and reviewed PR.
2. G2: verified production backup/PITR and restore drill, migration status/checksum, independent approval; only then evaluate applying 016–020 on production.
3. G3: working SSO/MFA proof for actual authorized Super Admin and tenant-admin path; learner long-lived identity not yet available.
4. G4: LMS-on staging browser UAT, tenant-switch/suspended behavior, negative access checks and full live TrainLive regression.
5. G5/G6: measured load/accessibility, privacy and operations approvals, monitoring and rollback evidence.
6. G7/G8: verify environment config, deployment SHA, schema, \`/api/health\`, class join/learn/export and monitored staged rollout.

**No claim of fully-live Enterprise LMS** until all these gates are recorded PASS.

## Next executable work

Implement tenant-owned program bootstrap and class-independent catalog authoring without copying client data; introduce verified Tenant Admin login/role-bound sessions, maker-checker parameter approval, course versions and cross-scope inheritance; then P2 durable learner accounts and enrollments. Apply CI to every increment and keep production LMS disabled until release gates pass.
