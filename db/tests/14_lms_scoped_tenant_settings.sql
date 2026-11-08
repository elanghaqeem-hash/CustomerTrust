-- Newly onboarded tenant settings: no cross-tenant IDOR; history and rollback.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE a uuid;b uuid;admin uuid;plain uuid;new_tenant uuid;foreign_tenant uuid;r jsonb;
BEGIN
 SELECT id INTO a FROM trainlive.class_session WHERE batch_no='A' ORDER BY created_at DESC LIMIT 1;
 SELECT id INTO b FROM trainlive.class_session WHERE batch_no='B' ORDER BY created_at DESC LIMIT 1;
 INSERT INTO trainlive.staff_user(email,display_name,is_super_admin)
 VALUES('scoped-settings-admin@example.invalid','Scoped Admin',true) RETURNING id INTO admin;
 INSERT INTO trainlive.staff_user(email,display_name,is_super_admin)
 VALUES('scoped-settings-staff@example.invalid','Scoped Staff',false) RETURNING id INTO plain;
 INSERT INTO trainlive.class_staff(class_id,user_id,role)
 VALUES(a,admin,'facilitator'),(a,plain,'facilitator');
 INSERT INTO trainlive.organization(name,slug)
 VALUES('Foreign Scoped Organization','foreign-scoped-ci') RETURNING id INTO foreign_tenant;
 EXECUTE 'SET LOCAL ROLE trainlive_app';
 PERFORM set_config('trainlive.class_id',a::text,true);
 PERFORM set_config('trainlive.staff_id',plain::text,true);
 BEGIN
  PERFORM trainlive.lms_admin_tenant_settings(a,foreign_tenant);
  RAISE EXCEPTION 'ordinary facilitator viewed tenant';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('trainlive.staff_id',admin::text,true);
 BEGIN
  PERFORM trainlive.lms_admin_tenant_settings(a,foreign_tenant);
  RAISE EXCEPTION 'unauthorized foreign tenant read';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM trainlive.lms_admin_set_scoped_setting(a,foreign_tenant,'branding.primary_color','"#112233"'::jsonb);
  RAISE EXCEPTION 'unauthorized foreign tenant mutation';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 r:=trainlive.lms_admin_create_tenant(a,'Scoped Client Academy','scoped-client-ci');
 new_tenant:=(r->>'id')::uuid;
 r:=trainlive.lms_admin_tenant_settings(a,new_tenant);
 IF r->>'organizationId'<>new_tenant::text OR r->'settings'<>'{}'::jsonb
 THEN RAISE EXCEPTION 'new tenant setting readback failed'; END IF;
 BEGIN
  PERFORM trainlive.lms_admin_set_scoped_setting(a,new_tenant,'certificate.enabled','true'::jsonb);
  RAISE EXCEPTION 'unsafe certificate activation allowed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM trainlive.lms_admin_set_scoped_setting(a,new_tenant,'auth.disable_mfa','true'::jsonb);
  RAISE EXCEPTION 'invalid auth setting accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 r:=trainlive.lms_admin_set_scoped_setting(a,new_tenant,'branding.primary_color','"#112233"'::jsonb);
 IF (r->>'revision')::integer<>1 THEN RAISE EXCEPTION 'first revision mismatch'; END IF;
 r:=trainlive.lms_admin_set_scoped_setting(a,new_tenant,'branding.primary_color','"#445566"'::jsonb);
 IF (r->>'revision')::integer<>2 THEN RAISE EXCEPTION 'second revision mismatch'; END IF;
 r:=trainlive.lms_admin_scoped_setting_history(a,new_tenant,'branding.primary_color');
 IF jsonb_array_length(r->'history')<>2 THEN RAISE EXCEPTION 'tenant history missing'; END IF;
 r:=trainlive.lms_admin_rollback_scoped_setting(a,new_tenant,'branding.primary_color',1);
 IF (r->>'revision')::integer<>3 THEN RAISE EXCEPTION 'rollback revision not incremented'; END IF;
 r:=trainlive.lms_admin_tenant_settings(a,new_tenant);
 IF r->'settings'->>'branding.primary_color'<>'#112233'
 THEN RAISE EXCEPTION 'rollback not restored in tenant'; END IF;
 BEGIN
  PERFORM trainlive.lms_admin_rollback_scoped_setting(a,foreign_tenant,'branding.primary_color',1);
  RAISE EXCEPTION 'foreign rollback allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM trainlive.lms_admin_scoped_setting_history(b,new_tenant,'branding.primary_color');
  RAISE EXCEPTION 'class spoofing allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (SELECT count(*) FROM trainlive.audit_log WHERE class_id=a AND
 action IN ('lms.setting.tenant_update','lms.setting.tenant_rollback'))<>4
 THEN RAISE EXCEPTION 'tenant change audit missing'; END IF;
END $$;
ROLLBACK;
