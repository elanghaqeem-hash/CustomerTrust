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
 r:=trainlive.lms_admin_set_tenant_setting(v_a,'branding.primary_color','"#123456"'::jsonb);
 IF (r->>'revision')::integer<>1 THEN RAISE EXCEPTION 'first revision incorrect'; END IF;
 r:=trainlive.lms_admin_set_tenant_setting(v_a,'branding.primary_color','"#abcdef"'::jsonb);
 IF (r->>'revision')::integer<>2 THEN RAISE EXCEPTION 'second revision incorrect'; END IF;
 r:=trainlive.lms_admin_setting_history(v_a,'branding.primary_color');
 IF jsonb_array_length(r->'history')<>2 OR
 (r->'history'->0->>'revision')::integer<>2 OR
 r->'history'->1->>'value'<>'#123456'
 THEN RAISE EXCEPTION 'history snapshot incorrect'; END IF;
 BEGIN
  PERFORM trainlive.lms_admin_rollback_setting(v_a,'branding.primary_color',9999);
  RAISE EXCEPTION 'nonexistent revision accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 r:=trainlive.lms_admin_rollback_setting(v_a,'branding.primary_color',1);
 IF (r->>'revision')::integer<>3 OR (r->>'restoredRevision')::integer<>1
 THEN RAISE EXCEPTION 'rollback revision mismatch'; END IF;
 r:=trainlive.lms_admin_get_tenant_settings(v_a);
 IF r->'settings'->>'branding.primary_color'<>'#123456'
 THEN RAISE EXCEPTION 'rollback value not restored'; END IF;
 r:=trainlive.lms_admin_setting_history(v_a,'branding.primary_color');
 IF jsonb_array_length(r->'history')<>3 THEN RAISE EXCEPTION 'rollback not recorded'; END IF;
 IF (SELECT count(*) FROM trainlive.audit_log WHERE class_id=v_a
 AND action='lms.setting.rollback')<>1
 THEN RAISE EXCEPTION 'rollback audit event missing'; END IF;
END $$;
ROLLBACK;
