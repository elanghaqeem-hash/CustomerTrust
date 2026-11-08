-- LMS tenant configuration: permissions, validation, revision and audit (disposable DB).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE a uuid;b uuid;administrator uuid;ordinary uuid;foreign_org uuid;
 result jsonb;initial_org uuid;first_revision bigint;
BEGIN
 SELECT id INTO a FROM trainlive.class_session WHERE batch_no='A' ORDER BY created_at DESC LIMIT 1;
 SELECT id INTO b FROM trainlive.class_session WHERE batch_no='B' ORDER BY created_at DESC LIMIT 1;
 IF a IS NULL OR b IS NULL THEN RAISE EXCEPTION 'missing CI classes'; END IF;
 SELECT p.organization_id INTO initial_org FROM trainlive.class_session s
 JOIN trainlive.program p ON p.id=s.program_id WHERE s.id=a;
 INSERT INTO trainlive.staff_user(email,display_name,is_super_admin)
 VALUES('tenant-param-admin@example.invalid','Tenant CI Admin',true) RETURNING id INTO administrator;
 INSERT INTO trainlive.staff_user(email,display_name,is_super_admin)
 VALUES('tenant-param-staff@example.invalid','Tenant CI Staff',false) RETURNING id INTO ordinary;
 INSERT INTO trainlive.class_staff(class_id,user_id,role)
 VALUES(a,administrator,'facilitator'),(a,ordinary,'facilitator');
 INSERT INTO trainlive.organization(name,slug) VALUES('Tenant Param Foreign','tenant-param-foreign')
 RETURNING id INTO foreign_org;
 EXECUTE 'SET LOCAL ROLE trainlive_app';
 PERFORM set_config('trainlive.class_id',a::text,true);
 PERFORM set_config('trainlive.staff_id',ordinary::text,true);
 BEGIN
  PERFORM trainlive.lms_admin_get_tenant_settings(a);
  RAISE EXCEPTION 'facilitator accessed tenant settings';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM trainlive.lms_admin_set_tenant_setting(a,'branding.primary_color','"#112233"'::jsonb);
  RAISE EXCEPTION 'facilitator updated tenant settings';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('trainlive.staff_id',administrator::text,true);
 BEGIN
  PERFORM trainlive.lms_admin_set_tenant_setting(b,'branding.primary_color','"#112233"'::jsonb);
  RAISE EXCEPTION 'cross-class update allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM trainlive.lms_admin_get_tenant_settings(b);
  RAISE EXCEPTION 'cross-class read allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM trainlive.lms_admin_set_tenant_setting(a,'auth.mfa_required','false'::jsonb);
  RAISE EXCEPTION 'security setting accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM trainlive.lms_admin_set_tenant_setting(a,'certificate.enabled','true'::jsonb);
  RAISE EXCEPTION 'unimplemented certificate engine enabled';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM trainlive.lms_admin_set_tenant_setting(a,'learning.default_passing_grade','101'::jsonb);
  RAISE EXCEPTION 'out of bounds grade accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM trainlive.lms_admin_set_tenant_setting(a,'branding.logo_url','"http://insecure.example.invalid/logo"'::jsonb);
  RAISE EXCEPTION 'insecure logo URL accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM (SELECT count(*) FROM trainlive.lms_tenant_setting);
  RAISE EXCEPTION 'runtime read tenant setting table';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- Migration 022 removes the legacy direct-write path; writes use maker-checker.
  BEGIN
   PERFORM trainlive.lms_admin_set_tenant_setting(a,'branding.primary_color','"#112233"'::jsonb);
   RAISE EXCEPTION 'legacy direct tenant write remained available';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT count(*) FROM trainlive.audit_log WHERE class_id=a AND action='lms.setting.update')<>0
  THEN RAISE EXCEPTION 'legacy direct write created an audit event'; END IF;
 PERFORM set_config('trainlive.class_id',b::text,true);
 BEGIN
  PERFORM trainlive.lms_admin_get_tenant_settings(a);
  RAISE EXCEPTION 'spoofed class claim allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
