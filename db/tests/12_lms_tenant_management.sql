-- P1 Tenant Management: disposable database, positive + negative access cases.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE v_a uuid;v_b uuid;v_admin uuid;v_plain uuid;v_target uuid;
 v_foreign uuid;v_new uuid;v_result jsonb;v_org uuid;
BEGIN
 SELECT id INTO v_a FROM trainlive.class_session WHERE batch_no='A' ORDER BY created_at DESC LIMIT 1;
 SELECT id INTO v_b FROM trainlive.class_session WHERE batch_no='B' ORDER BY created_at DESC LIMIT 1;
 IF v_a IS NULL OR v_b IS NULL THEN RAISE EXCEPTION 'missing classes'; END IF;
 INSERT INTO trainlive.staff_user(email,display_name,is_super_admin)
 VALUES('tenant-ci-admin@example.invalid','Admin',true) RETURNING id INTO v_admin;
 INSERT INTO trainlive.staff_user(email,display_name,is_super_admin)
 VALUES('tenant-ci-ordinary@example.invalid','Ordinary',false) RETURNING id INTO v_plain;
 INSERT INTO trainlive.staff_user(email,display_name,is_super_admin,oidc_issuer,oidc_subject)
 VALUES('tenant-ci-target@example.invalid','Verified Tenant Admin',false,
 'https://login.example.invalid','verified-target-tenant-ci') RETURNING id INTO v_target;
 INSERT INTO trainlive.class_staff(class_id,user_id,role) VALUES
 (v_a,v_admin,'facilitator'),(v_a,v_plain,'facilitator');
 INSERT INTO trainlive.organization(name,slug)
 VALUES('Unrelated Tenant','unrelated-ci-lms-tenant') RETURNING id INTO v_foreign;
 EXECUTE 'SET LOCAL ROLE trainlive_app';
 PERFORM set_config('trainlive.class_id',v_a::text,true);
 PERFORM set_config('trainlive.staff_id',v_plain::text,true);
 BEGIN
  PERFORM trainlive.lms_admin_tenants(v_a);
  RAISE EXCEPTION 'ordinary facilitator could list tenants';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM trainlive.lms_admin_create_tenant(v_a,'Unauthorized New Tenant','unauthorized-ci-lms');
  RAISE EXCEPTION 'ordinary facilitator could create tenant';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('trainlive.staff_id',v_admin::text,true);
 BEGIN
  PERFORM (SELECT count(*) FROM trainlive.lms_tenant_membership);
  RAISE EXCEPTION 'direct membership table read allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM trainlive.lms_admin_create_tenant(v_b,'Forged Context','forged-context');
  RAISE EXCEPTION 'cross-class tenant create allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM trainlive.lms_admin_update_tenant(v_a,v_foreign,'Stolen Tenant','active');
  RAISE EXCEPTION 'unrelated tenant update allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM trainlive.lms_admin_assign_tenant_role(v_a,v_foreign,'tenant-ci-target@example.invalid','tenant_admin');
  RAISE EXCEPTION 'unrelated tenant membership allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM trainlive.lms_admin_create_tenant(v_a,'Invalid Tenant','BAD SPACE');
  RAISE EXCEPTION 'invalid tenant slug accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 v_result:=trainlive.lms_admin_create_tenant(v_a,'Tenant Academy CI','academy-lms-ci');
 v_new:=(v_result->>'id')::uuid;
 IF v_result->>'status'<>'onboarding' THEN RAISE EXCEPTION 'new tenant not onboarding'; END IF;
 IF EXISTS(SELECT 1 FROM trainlive.class_session s
   JOIN trainlive.program p ON p.id=s.program_id WHERE p.organization_id=v_new)
 THEN RAISE EXCEPTION 'new tenant unexpectedly copied legacy classes'; END IF;
 IF (trainlive.lms_admin_tenants(v_a)->'tenants') @> 
   jsonb_build_array(jsonb_build_object('id',v_foreign))
 THEN RAISE EXCEPTION 'foreign tenant leaked in list'; END IF;
 BEGIN
  PERFORM trainlive.lms_admin_assign_tenant_role(v_a,v_new,
  'tenant-ci-ordinary@example.invalid','tenant_admin');
  RAISE EXCEPTION 'unverified staff received membership';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM trainlive.lms_admin_assign_tenant_role(v_a,v_new,
  'tenant-ci-target@example.invalid','super_admin');
  RAISE EXCEPTION 'platform role escalation accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 v_result:=trainlive.lms_admin_assign_tenant_role(v_a,v_new,
 'tenant-ci-target@example.invalid','tenant_admin');
 IF v_result->>'role'<>'tenant_admin' THEN RAISE EXCEPTION 'role assignment missing'; END IF;
 v_result:=trainlive.lms_admin_update_tenant(v_a,v_new,'Tenant Academy 2','active');
 IF v_result->>'status'<>'active' THEN RAISE EXCEPTION 'activation failed'; END IF;
 v_result:=trainlive.lms_admin_revoke_tenant_role(v_a,v_new,v_target);
 IF v_result->>'active'<>'false' THEN RAISE EXCEPTION 'revocation failed'; END IF;
 BEGIN
  PERFORM trainlive.lms_admin_revoke_tenant_role(v_a,v_new,v_admin);
  RAISE EXCEPTION 'self revocation accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 v_result:=trainlive.lms_admin_update_tenant(v_a,v_new,'Tenant Academy 2','suspended');
 IF v_result->>'status'<>'suspended' THEN RAISE EXCEPTION 'suspension failed'; END IF;
 -- Role revocation removes active membership but leaves audit and row evidence.
 IF NOT EXISTS(SELECT 1 FROM trainlive.lms_tenant_membership WHERE
 organization_id=v_new AND staff_id=v_target AND active=false)
 THEN RAISE EXCEPTION 'revoked role still active'; END IF;
 -- The source class remains bound to its original tenant.
 SELECT p.organization_id INTO v_org FROM trainlive.class_session s JOIN trainlive.program p
 ON p.id=s.program_id WHERE s.id=v_a;
 IF v_org=v_new THEN RAISE EXCEPTION 'legacy class reassigned'; END IF;
 IF (SELECT count(*) FROM trainlive.audit_log WHERE class_id=v_a
 AND action IN ('lms.tenant.create','lms.tenant.update','lms.tenant.role_assign',
 'lms.tenant.role_revoke'))<>5
 THEN RAISE EXCEPTION 'tenant admin audit trail missing'; END IF;
END $$;
ROLLBACK;
