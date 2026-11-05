-- Run after CI has seeded the canonical master and created two distinct classes.
-- The transaction rolls back test assignments and OIDC identity binding.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE v_a uuid; v_b uuid; v_staff uuid; v_res uuid;
BEGIN
 SELECT id INTO v_a FROM trainlive.class_session WHERE batch_no='A' ORDER BY created_at DESC LIMIT 1;
 SELECT id INTO v_b FROM trainlive.class_session WHERE batch_no='B' ORDER BY created_at DESC LIMIT 1;
 IF v_a IS NULL OR v_b IS NULL OR v_a=v_b THEN RAISE EXCEPTION 'fixture classes missing'; END IF;
 INSERT INTO trainlive.staff_user(email,display_name)
 VALUES('oidc-ci@bank.example','OIDC CI Staff') RETURNING id INTO v_staff;
 INSERT INTO trainlive.class_staff(class_id,user_id,role) VALUES(v_a,v_staff,'facilitator');
 -- Narrow SECURITY DEFINER resolver must be callable by restricted runtime role.
 EXECUTE 'SET LOCAL ROLE trainlive_app';
 SELECT trainlive.resolve_staff_oidc(v_a,'oidc-ci@bank.example',
    'https://sso.bank.example','oidc-user-123') INTO v_res;
 IF v_res IS DISTINCT FROM v_staff THEN RAISE EXCEPTION 'verified staff not resolved'; END IF;
 SELECT trainlive.resolve_staff_oidc(v_b,'oidc-ci@bank.example',
    'https://sso.bank.example','oidc-user-123') INTO v_res;
 IF v_res IS NOT NULL THEN RAISE EXCEPTION 'cross-class SSO access permitted'; END IF;
 SELECT trainlive.resolve_staff_oidc(v_a,'oidc-ci@bank.example',
    'https://sso.bank.example','different-subject') INTO v_res;
 IF v_res IS NOT NULL THEN RAISE EXCEPTION 'OIDC subject rebound'; END IF;
 SELECT trainlive.resolve_staff_oidc(v_a,'not-assigned@bank.example',
    'https://sso.bank.example','oidc-user-123') INTO v_res;
 IF v_res IS NOT NULL THEN RAISE EXCEPTION 'unassigned SSO account admitted'; END IF;
END $$;
ROLLBACK;
