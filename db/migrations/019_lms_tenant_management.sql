-- TrainLive LMS P1.2/P1.3: tenant onboarding, lifecycle and scoped membership.
-- Additive only: legacy class, participant, class content and score tables are not changed.
BEGIN;
CREATE TABLE trainlive.lms_tenant_profile (
 organization_id uuid PRIMARY KEY REFERENCES trainlive.organization(id),
 status text NOT NULL DEFAULT 'onboarding' CHECK(status IN ('onboarding','active','suspended')),
 updated_by uuid NOT NULL REFERENCES trainlive.staff_user(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE trainlive.lms_tenant_membership (
 organization_id uuid NOT NULL REFERENCES trainlive.organization(id),
 staff_id uuid NOT NULL REFERENCES trainlive.staff_user(id),
 role text NOT NULL CHECK(role IN ('tenant_admin','learning_manager','course_author','viewer')),
 active boolean NOT NULL DEFAULT true,
 assigned_by uuid NOT NULL REFERENCES trainlive.staff_user(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,staff_id)
);
CREATE INDEX lms_tenant_membership_staff_idx
 ON trainlive.lms_tenant_membership(staff_id,organization_id) WHERE active;
ALTER TABLE trainlive.lms_tenant_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainlive.lms_tenant_membership ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON trainlive.lms_tenant_profile,trainlive.lms_tenant_membership FROM PUBLIC,trainlive_app;

-- This is an explicitly class-assigned platform Super Admin boundary.
-- A newly created tenant is visible to its creator via scoped membership;
-- an arbitrary guessed organization UUID does not grant access.
CREATE FUNCTION trainlive.lms_admin_can_manage_tenant(p_class uuid,p_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=trainlive,pg_temp AS $$
 SELECT COALESCE(
  p_class=trainlive.claim_class() AND trainlive.can_create_class() AND EXISTS (
   SELECT 1 FROM trainlive.class_session s
   JOIN trainlive.program p ON p.id=s.program_id WHERE s.id=p_class
  ) AND (
   EXISTS (SELECT 1 FROM trainlive.class_session s
    JOIN trainlive.program p ON p.id=s.program_id
    WHERE s.id=p_class AND p.organization_id=p_org)
   OR EXISTS (SELECT 1 FROM trainlive.lms_tenant_membership m
    WHERE m.organization_id=p_org AND m.staff_id=trainlive.claim_staff()
      AND m.active AND m.role='tenant_admin')
  ),false);
$$;
REVOKE ALL ON FUNCTION trainlive.lms_admin_can_manage_tenant(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_admin_can_manage_tenant(uuid,uuid) TO trainlive_app;

CREATE FUNCTION trainlive.lms_admin_tenants(p_class uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_source uuid;v_result jsonb;
BEGIN
 IF p_class IS DISTINCT FROM trainlive.claim_class() OR NOT trainlive.can_create_class()
 THEN RAISE EXCEPTION 'tenant list forbidden' USING ERRCODE='42501'; END IF;
 SELECT p.organization_id INTO v_source FROM trainlive.class_session s
 JOIN trainlive.program p ON p.id=s.program_id WHERE s.id=p_class;
 IF NOT FOUND THEN RAISE EXCEPTION 'source not found' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'id',o.id,'name',o.name,'slug',o.slug,
  'status',COALESCE(t.status,'active'),
  'members',(
   SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'staffId',m.staff_id,'email',u.email,'displayName',u.display_name,
    'role',m.role,'active',m.active) ORDER BY u.email),'[]'::jsonb)
   FROM trainlive.lms_tenant_membership m JOIN trainlive.staff_user u ON u.id=m.staff_id
   WHERE m.organization_id=o.id
  )
 ) ORDER BY o.created_at),'[]'::jsonb) INTO v_result
 FROM trainlive.organization o
 LEFT JOIN trainlive.lms_tenant_profile t ON t.organization_id=o.id
 WHERE o.id=v_source OR EXISTS (
  SELECT 1 FROM trainlive.lms_tenant_membership m
  WHERE m.organization_id=o.id AND m.staff_id=trainlive.claim_staff()
   AND m.active AND m.role='tenant_admin'
 );
 RETURN jsonb_build_object('sourceOrganizationId',v_source,'tenants',v_result);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_admin_tenants(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_admin_tenants(uuid) TO trainlive_app;

CREATE FUNCTION trainlive.lms_admin_create_tenant(p_class uuid,p_name text,p_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_new uuid;
BEGIN
 IF p_class IS DISTINCT FROM trainlive.claim_class() OR NOT trainlive.can_create_class()
 THEN RAISE EXCEPTION 'tenant creation forbidden' USING ERRCODE='42501'; END IF;
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 2 AND 160
 OR p_name ~ '[[:cntrl:]<>]' OR p_slug IS NULL
 OR p_slug !~ '^[a-z][a-z0-9-]{2,62}$'
 THEN RAISE EXCEPTION 'invalid tenant' USING ERRCODE='22023'; END IF;
 INSERT INTO trainlive.organization(name,slug)
 VALUES(btrim(p_name),p_slug) RETURNING id INTO v_new;
 INSERT INTO trainlive.lms_tenant_profile(organization_id,status,updated_by)
 VALUES(v_new,'onboarding',trainlive.claim_staff());
 INSERT INTO trainlive.lms_tenant_membership(organization_id,staff_id,role,assigned_by)
 VALUES(v_new,trainlive.claim_staff(),'tenant_admin',trainlive.claim_staff());
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'super_admin',p_class,'lms.tenant.create',v_new::text,
 jsonb_build_object('tenantId',v_new,'slug',p_slug,'status','onboarding'));
 RETURN jsonb_build_object('id',v_new,'name',btrim(p_name),'slug',p_slug,'status','onboarding');
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_admin_create_tenant(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_admin_create_tenant(uuid,text,text) TO trainlive_app;

CREATE FUNCTION trainlive.lms_admin_update_tenant(p_class uuid,p_org uuid,p_name text,p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_old_name text;v_old_status text;v_new_name text:=btrim(p_name);
BEGIN
 IF NOT trainlive.lms_admin_can_manage_tenant(p_class,p_org)
 THEN RAISE EXCEPTION 'tenant update forbidden' USING ERRCODE='42501'; END IF;
 IF p_name IS NULL OR length(v_new_name) NOT BETWEEN 2 AND 160
 OR p_name ~ '[[:cntrl:]<>]' OR p_status IS NULL
 OR p_status NOT IN ('onboarding','active','suspended')
 THEN RAISE EXCEPTION 'invalid tenant update' USING ERRCODE='22023'; END IF;
 -- Suspension never deletes or closes legacy live classes, but disallows new LMS authoring.
 SELECT o.name,COALESCE(t.status,'active') INTO v_old_name,v_old_status
 FROM trainlive.organization o
 LEFT JOIN trainlive.lms_tenant_profile t ON t.organization_id=o.id
 WHERE o.id=p_org FOR UPDATE OF o;
 IF NOT FOUND THEN RAISE EXCEPTION 'tenant not found' USING ERRCODE='42501'; END IF;
 UPDATE trainlive.organization SET name=v_new_name WHERE id=p_org;
 INSERT INTO trainlive.lms_tenant_profile(organization_id,status,updated_by)
 VALUES(p_org,p_status,trainlive.claim_staff())
 ON CONFLICT(organization_id) DO UPDATE SET status=EXCLUDED.status,
 updated_by=EXCLUDED.updated_by,updated_at=now();
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'super_admin',p_class,'lms.tenant.update',p_org::text,
 jsonb_build_object('before',jsonb_build_object('name',v_old_name,'status',v_old_status),
 'after',jsonb_build_object('name',v_new_name,'status',p_status)));
 RETURN jsonb_build_object('id',p_org,'name',v_new_name,'status',p_status);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_admin_update_tenant(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_admin_update_tenant(uuid,uuid,text,text) TO trainlive_app;

CREATE FUNCTION trainlive.lms_admin_assign_tenant_role(
 p_class uuid,p_org uuid,p_email text,p_role text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_target uuid;v_before text;
BEGIN
 IF NOT trainlive.lms_admin_can_manage_tenant(p_class,p_org)
 THEN RAISE EXCEPTION 'tenant membership forbidden' USING ERRCODE='42501'; END IF;
 IF p_role IS NULL OR p_role NOT IN ('tenant_admin','learning_manager','course_author','viewer')
 OR p_email IS NULL OR p_email<>lower(btrim(p_email)) OR length(p_email)>254
 THEN RAISE EXCEPTION 'invalid tenant role' USING ERRCODE='22023'; END IF;
 -- Only already verified OIDC identities may receive tenant membership.
 SELECT id INTO v_target FROM trainlive.staff_user
 WHERE email=p_email AND oidc_issuer IS NOT NULL AND oidc_subject IS NOT NULL;
 IF v_target IS NULL THEN RAISE EXCEPTION 'staff identity not preprovisioned' USING ERRCODE='42501'; END IF;
 IF v_target=trainlive.claim_staff() THEN
  RAISE EXCEPTION 'self-assignment is prohibited' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM trainlive.organization WHERE id=p_org FOR UPDATE;
 SELECT role INTO v_before FROM trainlive.lms_tenant_membership
 WHERE organization_id=p_org AND staff_id=v_target;
 INSERT INTO trainlive.lms_tenant_membership(organization_id,staff_id,role,assigned_by)
 VALUES(p_org,v_target,p_role,trainlive.claim_staff())
 ON CONFLICT(organization_id,staff_id) DO UPDATE SET role=EXCLUDED.role,
 active=true,assigned_by=EXCLUDED.assigned_by,updated_at=now();
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'super_admin',p_class,'lms.tenant.role_assign',p_org::text,
 jsonb_build_object('staffId',v_target,'previousRole',v_before,'newRole',p_role));
 RETURN jsonb_build_object('tenantId',p_org,'staffId',v_target,'role',p_role,'active',true);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_admin_assign_tenant_role(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_admin_assign_tenant_role(uuid,uuid,text,text) TO trainlive_app;

CREATE FUNCTION trainlive.lms_admin_revoke_tenant_role(p_class uuid,p_org uuid,p_staff uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_role text;
BEGIN
 IF NOT trainlive.lms_admin_can_manage_tenant(p_class,p_org)
 THEN RAISE EXCEPTION 'tenant revocation forbidden' USING ERRCODE='42501'; END IF;
 IF p_staff IS NULL OR p_staff=trainlive.claim_staff() THEN
  RAISE EXCEPTION 'self-revocation is prohibited' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM trainlive.organization WHERE id=p_org FOR UPDATE;
 SELECT role INTO v_role FROM trainlive.lms_tenant_membership
 WHERE organization_id=p_org AND staff_id=p_staff AND active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'membership not found' USING ERRCODE='42501'; END IF;
 IF v_role='tenant_admin' AND
 (SELECT count(*) FROM trainlive.lms_tenant_membership
  WHERE organization_id=p_org AND role='tenant_admin' AND active)<=1 THEN
  RAISE EXCEPTION 'last tenant admin cannot be revoked' USING ERRCODE='42501'; END IF;
 UPDATE trainlive.lms_tenant_membership SET active=false,updated_at=now(),assigned_by=trainlive.claim_staff()
 WHERE organization_id=p_org AND staff_id=p_staff;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'super_admin',p_class,'lms.tenant.role_revoke',p_org::text,
 jsonb_build_object('staffId',p_staff,'previousRole',v_role));
 RETURN jsonb_build_object('tenantId',p_org,'staffId',p_staff,'active',false);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_admin_revoke_tenant_role(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_admin_revoke_tenant_role(uuid,uuid,uuid) TO trainlive_app;

-- Suspension only blocks new LMS authoring; legacy live learning and historical
-- learner progress remain intact. Future learner identity gates need separate release.
CREATE FUNCTION trainlive.lms_tenant_authoring_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=trainlive,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM trainlive.lms_tenant_profile
  WHERE organization_id=NEW.organization_id AND status='suspended')
 THEN RAISE EXCEPTION 'tenant LMS authoring suspended' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lms_course_tenant_suspend BEFORE INSERT OR UPDATE ON trainlive.lms_course
 FOR EACH ROW EXECUTE FUNCTION trainlive.lms_tenant_authoring_guard();
CREATE TRIGGER lms_module_tenant_suspend BEFORE INSERT OR UPDATE ON trainlive.lms_module
 FOR EACH ROW EXECUTE FUNCTION trainlive.lms_tenant_authoring_guard();
CREATE TRIGGER lms_lesson_tenant_suspend BEFORE INSERT OR UPDATE ON trainlive.lms_lesson
 FOR EACH ROW EXECUTE FUNCTION trainlive.lms_tenant_authoring_guard();
COMMIT;
