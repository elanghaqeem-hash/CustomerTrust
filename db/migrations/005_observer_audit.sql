-- Migration 005: allow audited read-only observers to export assigned class reports.
-- Audit entries remain immutable to the web role; force caller identity to match.
BEGIN;
DROP POLICY audit_insert ON trainlive.audit_log;
CREATE POLICY audit_insert ON trainlive.audit_log FOR INSERT TO trainlive_app
WITH CHECK (
 class_id IS NOT NULL
 AND trainlive.staff_scope(class_id)
 AND actor_id=trainlive.claim_staff()
);
COMMIT;
