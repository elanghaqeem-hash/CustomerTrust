# TrainLive LMS Enterprise — P0 catalog foundation

**Source of truth:** elanghaqeem-hash/CustomerTrust. This increment is additive, tenant-scoped and explicitly **not production activation**.

## Implemented scope

The TrainLive application already has 'organization -> program -> published content_version -> class_session' and class-scoped participant data. LMS P0 introduces tenant-scoped draft course and module catalog tables through \`db/migrations/016_lms_catalog.sql\`. They do **not** modify existing class snapshots, published Customer Trust Challenge materials or participant scores.

Authorized Super Admin workflow (after migrations 001–016, seed, production identity and verified runtime database):
1. Log in via the existing /admin/login SSO + MFA and open the authorized class.
2. Go to \`/host/{classId}/lms\` (the existing class admin page links here).
3. See only courses under the source class's organization **and program**.
4. Create a **draft** course with code, title, description, delivery mode (live / self-paced / blended), passing grade and sequential-learning setting.
5. Edit draft course parameters; create ordered lesson, assessment or live-session module shells. New modules do not have lessons/media yet.
6. Every mutation is audited against the existing source class. New course/module IDs are server-generated.

## Security design

- LMS tables include organization_id; composite FKs ensure that the course's program and module's course belong to the same tenant.
- No direct SQL permissions to trainlive_app and RLS is enabled. The app uses trusted, SECURITY DEFINER functions with a validated class claim, class-assigned facilitator and explicitly approved is_super_admin.
- All catalog reads and mutations are scoped to the source class's existing program and organization. Staff with no membership, observer, cohost, normal facilitator, participant, and cross-class/tenant requests are denied.
- Staff bearer tokens are prohibited in real production, consistent with existing auth.ts.
- Catalog creation **does not** publish a course, enroll a student, expose a public lesson or replace a class's immutable content version.

## API contract

\`GET /api/class/:classId/lms\`: authorized catalog, \`{organization, program, courses:[{id, code, title, description, deliveryMode, passingGrade, sequentialModules, status, modules:[{id,moduleKey,title,kind,estimatedMinutes,position}]}]}\`.

\`POST /api/class/:classId/lms\`: one of:
- \`{action:"create_course",code,title,description,deliveryMode,passingGrade,sequentialModules}\`
- \`{action:"update_course",courseId,title,description,deliveryMode,passingGrade,sequentialModules}\` (draft only)
- \`{action:"create_module",courseId,moduleKey,title,kind,estimatedMinutes}\` (draft only)

All writes require same-origin browser requests and valid staff SSO session. Duplicate course codes return 409. Do not send secrets or bank customer data as course descriptions.

## Release steps and rollout gates

1. Run CI with PostgreSQL 16; migration 016 + \`db/tests/09_lms_catalog.sql\` must pass alongside existing isolation suite and Next.js typecheck/build.
2. Review DB owner and SECURITY DEFINER functions; apply migration through the controlled production DB workflow only after backup/PITR and reviewer approval.
3. Verify production DB readiness, staff SSO/MFA, tenant isolation and browser UAT before enabling UI for customers.
4. Preserve rollback: leave this catalog unused if activation fails; do not remove tables in a rollback or touch existing classes.

## Next increments (not part of P0)

P1: tenant CRUD / tenant admin roles, course publication workflow, lesson assets (PDF/video/link), enrollment and progress tracking. P2: assessment bank, grading, completion rules, certificates and reporting. P3: white-label domains, notifications, integrations and scale/performance acceptance.

Current P0 is an **authoring/catalog increment**, not a functioning self-paced LMS. Production app status must be assessed independently.

## Feature activation gate (default OFF)

The LMS course catalog is protected by a single explicit `NEXT_PUBLIC_TRAINLIVE_LMS_ENABLED=true` build flag. **Unset or any other value disables the LMS**: its navigation link is hidden, its page returns 404, and GET/POST LMS APIs return 404 before reading the database. This prevents releasing routes that depend on migrations 016/017 into an environment that only has migrations 001–015. Do not set the flag before approved database migration, role/SSO verification, UAT and a new approved build. Merely merging code does not activate LMS.
