# TrainLive LMS — parameterized foundation (P2)

## Existing implementation
Migrations 016 and 017 already introduce tenant-linked course/module/lesson catalogs, publishing, class-bound learner enrollment and idempotent progress. They are not evidence of production activation. Keep all existing TrainLive live-class workflows and immutable published class content unchanged.

## New migration 018
Introduces `lms_tenant_setting`, a tenant-keyed parameter registry with restricted server-side access, an explicit allowlist, validated JSON values, Super Admin-only updates and audit events. It does not migrate existing participants, change existing course defaults, or automatically expose a new UI.

Supported keys:
- `branding.primary_color`: #RRGGBB
- `branding.logo_url`: HTTPS URL
- `learning.default_passing_grade`: integer 0–100
- `learning.default_sequential`: boolean
- `learning.default_delivery_mode`: live, self_paced or blended
- `certificate.enabled`: boolean (feature flag only; no certificate issuing yet)
- `certificate.issuer_name`: 2–160 character issuer name

## Next implementation gates
1. Add protected Super Admin API and UI for the setting functions, preserving signed class staff claims and audit logs.
2. Apply tenant defaults in course creation server-side; preserve explicit course overrides.
3. Add versioned settings and safe rollback before exposing certificate or client-specific styling.
4. Implement cross-tenant positive/negative database tests, input validation tests, and full LMS browser UAT.
5. Run migration on disposable PostgreSQL and CI before any production migration; backup and obtain approval first.

## Security boundaries
Never grant direct table access to runtime role or client. Never infer a tenant from browser-supplied organization IDs. The only mutation path verifies the signed class claim and approved Super Admin membership via existing `can_create_class()`. Settings are not a substitute for permission checks. Do not enable real certificate issuance until the certificate module is built and tested.
