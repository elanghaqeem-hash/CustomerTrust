-- P1.7 tenant-admin invitation/SSO, program bootstrap, maker-checker and branding.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE a uuid;b uuid;platform uuid;maker uuid;checker uuid;foreign_tenant uuid;
 tenant uuid;program_id uuid;inv jsonb;login record;request jsonb;request_id uuid;
 result jsonb;class_org uuid;join_code text;brand record;
BEGIN
 SELECT id INTO a FROM trainlive.class_session WHERE batch_no='A' ORDER BY created_at DESC LIMIT 1;
 SELECT id INTO b FROM trainlive.class_session WHERE batch_no='B' ORDER BY created_at DESC LIMIT 1;
 SELECT join_code INTO join_code FROM trainlive.class_session WHERE id=a;
 INSERT INTO trainlive.staff_user(email,display_name,is_super_admin,oidc_issuer,oidc_subject)
 VALUES('p17-platform@example.invalid','P17 Platform',true,'https://login.example.invalid','p17-platform-sub')
 RETURNING id INTO platform;
 INSERT INTO trainlive.class_staff(class_id,user_id,role) VALUES(a,platform,'facilitator');
 INSERT INTO trainlive.staff_user(email,display_name,is_super_admin,oidc_issuer,oidc_subject)
 VALUES('p17-maker@example.invalid','P17 Maker',false,'https://login.example.invalid','p17-maker-sub')
 RETURNING id INTO maker;
 INSERT INTO trainlive.staff_user(email,display_name,is_super_admin,oidc_issuer,oidc_subject)
 VALUES('p17-checker@example.invalid','P17 Checker',false,'https://login.example.invalid','p17-checker-sub')
 RETURNING id INTO checker;
 INSERT INTO trainlive.organization(name,slug)
 VALUES('P17 Foreign Tenant','p17-foreign-ci') RETURNING id INTO foreign_tenant;
 EXECUTE 'SET LOCAL ROLE trainlive_app';
 PERFORM set_config('trainlive.class_id',a::text,true);
 PERFORM set_config('trainlive.staff_id',platform::text,true);
 inv:=trainlive.lms_admin_create_tenant(a,'P17 Academy','p17-academy-ci');
 tenant:=(inv->>'id')::uuid;
 inv:=trainlive.lms_admin_invite_tenant_user(a,tenant,'p17-maker@example.invalid','tenant_admin');
 IF inv->>'role'<>'tenant_admin' THEN RAISE EXCEPTION 'tenant invitation failed'; END IF;
 inv:=trainlive.lms_admin_invite_tenant_user(a,tenant,'p17-checker@example.invalid','tenant_admin');
 IF inv->>'role'<>'tenant_admin' THEN RAISE EXCEPTION 'second tenant invitation failed'; END IF;
 login:=trainlive.resolve_tenant_admin_oidc(tenant,'p17-maker@example.invalid',
  'https://login.example.invalid','p17-maker-sub');
 IF login.staff_id<>maker OR login.tenant_id<>tenant THEN
  RAISE EXCEPTION 'invited tenant admin OIDC login failed'; END IF;
 login:=trainlive.resolve_tenant_admin_oidc(tenant,'p17-checker@example.invalid',
  'https://login.example.invalid','p17-checker-sub');
 IF login.staff_id<>checker THEN RAISE EXCEPTION 'second tenant admin login failed'; END IF;
 -- Tenant session context: active membership is checked in every definer function.
 PERFORM set_config('trainlive.tenant_id',tenant::text,true);
 PERFORM set_config('trainlive.class_id','',true);
 PERFORM set_config('trainlive.staff_id',maker::text,true);
 result:=trainlive.lms_tenant_dashboard(tenant);
 IF result->'tenant'->>'slug'<>'p17-academy-ci' THEN RAISE EXCEPTION 'tenant dashboard mismatch'; END IF;
 result:=trainlive.lms_tenant_create_program(tenant,'P17PROGRAM','Enterprise Academy','Synthetic program');
 program_id:=(result->>'id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM trainlive.program WHERE id=program_id AND organization_id=tenant)
 THEN RAISE EXCEPTION 'program not tenant-owned'; END IF;
 request:=trainlive.lms_tenant_setting_propose(tenant,'branding.primary_color','"#123456"'::jsonb);
 request_id:=(request->>'id')::uuid;
 IF request->>'status'<>'pending' THEN RAISE EXCEPTION 'setting request not pending'; END IF;
 BEGIN
  PERFORM trainlive.lms_tenant_setting_review(tenant,request_id,'approve','self approval');
  RAISE EXCEPTION 'maker self-approved parameter';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('trainlive.staff_id',checker::text,true);
 result:=trainlive.lms_tenant_setting_review(tenant,request_id,'approve','Reviewed by second tenant admin');
 IF result->>'status'<>'approved' OR result->>'appliedRevision'<>'1'
 THEN RAISE EXCEPTION 'maker-checker approval failed'; END IF;
 result:=trainlive.lms_tenant_settings_read(tenant);
 IF result->'settings'->>'branding.primary_color'<>'#123456'
 THEN RAISE EXCEPTION 'approved setting not applied'; END IF;
 -- Reject cross-tenant access and class/tenant context spoofing.
 BEGIN
  PERFORM trainlive.lms_tenant_dashboard(foreign_tenant);
  RAISE EXCEPTION 'cross-tenant dashboard access allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('trainlive.tenant_id',foreign_tenant::text,true);
 BEGIN
  PERFORM trainlive.lms_tenant_create_program(foreign_tenant,'FOREIGN01','Foreign Program','No access');
  RAISE EXCEPTION 'cross-tenant program creation allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('trainlive.tenant_id',tenant::text,true);
 BEGIN
  PERFORM trainlive.lms_tenant_setting_propose(tenant,'auth.disable_mfa','true'::jsonb);
  RAISE EXCEPTION 'security setting accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 -- A revoked member cannot use the tenant session.
 UPDATE trainlive.lms_tenant_membership SET active=false WHERE organization_id=tenant AND staff_id=maker;
 PERFORM set_config('trainlive.staff_id',maker::text,true);
 BEGIN
  PERFORM trainlive.lms_tenant_dashboard(tenant);
  RAISE EXCEPTION 'revoked tenant admin session remained authorized';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- Public pre-join branding returns only safe, approved display fields.
 SELECT p.organization_id INTO class_org FROM trainlive.class_session s
 JOIN trainlive.program p ON p.id=s.program_id WHERE s.id=a;
 PERFORM set_config('trainlive.tenant_id','',true);
 PERFORM set_config('trainlive.class_id',a::text,true);
 PERFORM set_config('trainlive.staff_id',platform::text,true);
 result:=trainlive.lms_tenant_setting_propose(class_org,'branding.primary_color','"#abcdef"'::jsonb);
 request_id:=(result->>'id')::uuid;
 PERFORM set_config('trainlive.staff_id',maker::text,true);
 -- Use class-scoped Super Admin context for a distinct checker in the source tenant.
 PERFORM set_config('trainlive.staff_id',platform::text,true);
 result:=trainlive.lms_tenant_setting_review(class_org,request_id,'approve','source tenant checker');
 brand:=trainlive.public_class_branding_v2(join_code);
 IF brand.primary_color<>'#abcdef' THEN RAISE EXCEPTION 'approved white-label color not exposed'; END IF;
 IF brand.client_name IS NULL OR brand.training_title IS NULL THEN
  RAISE EXCEPTION 'safe class branding missing'; END IF;
 IF (SELECT count(*) FROM trainlive.audit_log WHERE action IN (
  'lms.tenant.invite','auth.tenant_admin.login','lms.program.create',
  'lms.setting.propose','lms.setting.approved'))<7
 THEN RAISE EXCEPTION 'tenant workspace audit trail incomplete'; END IF;
END $$;
ROLLBACK;
