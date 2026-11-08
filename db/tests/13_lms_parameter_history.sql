-- Tenant parameter revision history: positive, forbidden, and rollback semantics.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE v_a uuid;v_b uuid;v_admin uuid;v_plain uuid;
 r jsonb;v_tenant uuid;
BEGIN
 SELECT id INTO v_a FROM trainlive.class_session WHERE batch_no='A' ORDER BY created_at DESC LIMIT 1;
 SELECT id INTO v_b FROM trainlive.class_session WHERE batch_no='B' ORDER BY created_at DESC LIMIT 1;
 INSERT INTO trainlive.staff_user(email,display_name,is_super_admin)
 VALUES('revision-ci-admin@example.invalid','Revision Admin',true) RETURNING id INTO v_admin;
 INSERT INTO trainlive.staff_user(email,display_name,is_super_admin)
 VALUES('revision-ci-user@example.invalid','Revision Ordinary',false) RETURNING id INTO v_plain;
 INSERT INTO trainlive.class_staff(class_id,user_id,role)
 VALUES(v_a,v_admin,'facilitator'),(v_a,v_plain,'facilitator');
 EXECUTE 'SET LOCAL ROLE trainlive_app';
 PERFORM set_config('trainlive.class_id',v_a::text,true);
 PERFORM set_config('trainlive.staff_id',v_plain::text,true);
 BEGIN
  PERFORM trainlive.lms_admin_setting_history(v_a,'branding.primary_color');
  RAISE EXCEPTION 'facilitator could read history';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM trainlive.lms_admin_rollback_setting(v_a,'branding.primary_color',1);
  RAISE EXCEPTION 'facilitator could roll back';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('trainlive.staff_id',v_admin::text,true);
 BEGIN
  PERFORM trainlive.lms_admin_setting_history(v_b,'branding.primary_color');
  RAISE EXCEPTION 'cross-class history leaked';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM trainlive.lms_admin_rollback_setting(v_b,'branding.primary_color',1);
  RAISE EXCEPTION 'cross-class rollback allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM (SELECT count(*) FROM trainlive.lms_tenant_setting_revision);
  RAISE EXCEPTION 'runtime direct history read allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- Migration 022 requires proposal + second-person approval for writes/rollback.
  BEGIN
   PERFORM trainlive.lms_admin_set_tenant_setting(v_a,'branding.primary_color','"#123456"'::jsonb);
   RAISE EXCEPTION 'legacy direct write still executable';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
   PERFORM trainlive.lms_admin_rollback_setting(v_a,'branding.primary_color',1);
   RAISE EXCEPTION 'legacy direct rollback still executable';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
