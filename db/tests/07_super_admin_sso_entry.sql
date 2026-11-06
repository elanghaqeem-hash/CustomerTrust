-- Restricted Super Admin login: legitimate, unassigned and rebound identities.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE v_class uuid; v_admin uuid; v_plain uuid; v_row record;
BEGIN
 SELECT id INTO v_class FROM trainlive.class_session WHERE batch_no='A'
 ORDER BY created_at DESC LIMIT 1;
 IF v_class IS NULL THEN RAISE EXCEPTION 'test class A missing'; END IF;
 INSERT INTO trainlive.staff_user(email,display_name,is_super_admin)
 VALUES('portal-admin@bank.example','CI Admin',true) RETURNING id INTO v_admin;
 INSERT INTO trainlive.staff_user(email,display_name,is_super_admin)
 VALUES('portal-user@bank.example','CI Staff',false) RETURNING id INTO v_plain;
 INSERT INTO trainlive.class_staff(class_id,user_id,role)
 VALUES(v_class,v_admin,'facilitator'),(v_class,v_plain,'facilitator');
 EXECUTE 'SET LOCAL ROLE trainlive_app';
 SELECT * INTO v_row FROM trainlive.resolve_super_admin_oidc(
  'portal-user@bank.example','https://sso.bank.example','ordinary-user');
 IF FOUND THEN RAISE EXCEPTION 'ordinary facilitator was granted admin login'; END IF;
 SELECT * INTO v_row FROM trainlive.resolve_super_admin_oidc(
  'portal-admin@bank.example','https://sso.bank.example','ci-admin-123');
 IF NOT FOUND OR v_row.staff_id IS DISTINCT FROM v_admin OR
   v_row.class_id IS DISTINCT FROM v_class THEN
  RAISE EXCEPTION 'valid superadmin login refused';
 END IF;
 SELECT * INTO v_row FROM trainlive.resolve_super_admin_oidc(
  'portal-admin@bank.example','https://sso.bank.example','different-subject');
 IF FOUND THEN RAISE EXCEPTION 'OIDC identity rebound permitted'; END IF;
 SELECT * INTO v_row FROM trainlive.resolve_super_admin_oidc(
  'portal-admin@bank.example','http://insecure.example','ci-admin-123');
 IF FOUND THEN RAISE EXCEPTION 'insecure issuer permitted'; END IF;
 SELECT * INTO v_row FROM trainlive.resolve_super_admin_oidc(
  'not-provisioned@bank.example','https://sso.bank.example','unknown');
 IF FOUND THEN RAISE EXCEPTION 'unprovisioned user was granted admin login'; END IF;
END $$;
ROLLBACK;
