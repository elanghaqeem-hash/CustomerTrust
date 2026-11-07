# TrainLive LMS — P1 lesson publishing and learning journey

This is a stacked increment on the P0 Course & Module Builder branch. **Not production activated.**

## Added
- Migration \`017_lms_learning.sql\`: materialized lessons, course enrollment, lesson progress. All three tables have RLS enabled **and no direct runtime SQL permissions**. Composite foreign keys prevent cross-tenant/course writes.
- Super Admin catalog now contains ordered lesson metadata/content. New actions: create lesson (draft only) and publish course. Publication is irreversible in P1 and only supported for populated \`lesson\` modules. Empty courses, assessments, and unsupported live_session modules cannot be marked published before actual engines exist.
- Participant portal \`/class/{classId}/learn\` includes course enrollment, reading/HTTPS links, per-lesson completion and progress display; \`/api/class/{classId}/learn\` requires an authenticated participant cookie. No response keys or other participants' results are returned.
- Sequential learning is verified in PostgreSQL on writes (not just hidden/disabled in the UI). Duplicate enrollment and completion are idempotent.
- New LMS API actions on staff endpoint: \`create_lesson\` and \`publish_course\`. Only previously approved, assigned, SSO/MFA-backed Super Admin can call them. Existing class sessions remain unchanged.

## Limits / security notes
- Lesson content is plain text; HTML is never interpreted. PDF/video use HTTPS URLs and open as external links. This increment **does not** upload files, stream video, scan documents or embed arbitrary external iframes.
- Lessons are delivered to authenticated, class-enrolled participants only; participants cannot read draft materials, other tenant courses or other learners' progress. Content is not sent to unenrolled users.
- Course completion refers only to **reading/marking lesson completion**, not examination passing grade or verified attendance. Assessments, grading, certification, long-term participant sign-in and tenant admin role management are not shipped.
- Participants need an existing TrainLive class cookie; token lifetime (72h) is not long-term LMS login. This is explicitly a beta constraint for future sessions.
- Publication locks authoring mutations via the approved SQL functions. Course records and lessons are never copied into a class's original immutable content snapshots.
- Publish only non-sensitive synthetic content during QA; external documents require organizational permission and appropriate storage/access controls.

## Verification
1. Run migration 017 after 001–016 in PostgreSQL 16.
2. Run \`db/tests/10_lms_learning.sql\` in disposable DB after seeded classes A/B (transaction rolls back). Tests cover publish/no-empty, permissions, drafts hidden, cross-class/tenant, repeated enrolment, skipped lessons, idempotent progress.
3. Run Next.js typecheck/build and existing CI; perform browser UAT on protected staging.
4. Keep PR as draft until production database, backup/PITR, SSO+MFA, privacy review, and UAT release criteria pass. Do not merge to main automatically.

## Next stage
P2: tenant administration, durable learner identity/enrollment independent of class session, private media storage, question bank/assessment scoring with passing-grade logic, certificate issuance and verification.

## Release feature gate

LMS is disabled by default, requiring `NEXT_PUBLIC_TRAINLIVE_LMS_ENABLED=true` in an approved build. The learner shortcut is hidden; the learner page returns not found; staff and learner LMS GET/POST APIs return 404 before database access. P0 admin navigation uses the same flag. Do not enable before migrations 016/017, production SSO/MFA, privacy review and browser UAT.
