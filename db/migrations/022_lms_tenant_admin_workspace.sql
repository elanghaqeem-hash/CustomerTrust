-- TrainLive LMS P1.7: tenant-admin OIDC workspace, program bootstrap,
-- maker-checker parameter approval, and tenant branding delivery.
-- Additive only. Existing classes, participants, responses, score ledger,
-- worksheets and immutable content snapshots are not modified.
BEGIN;

CREATE TABLE trainlive.lms_tenant_invitation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES trainlive.organization(id),
 email text NOT NULL CHECK(email=lower(btrim(email)) AND length(email)<=254
  AND email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
 role text NOT NULL CHECK(role IN ('tenant_admin','learning_manager','course_author','viewer')),
 invited_by uuid NOT NULL REFERENCES trainlive.staff_user(id),
 invited_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '7 days'),
 accepted_at timestamptz,
 revoked_at timestamptz,
 CHECK(expires_at>invited_at),
 UNIQUE(id,organization_id)
);
CREATE UNIQUE INDEX lms_tenant_invitation_pending_email
 ON trainlive.lms_tenant_invitation(organization_id,email)
 WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX lms_tenant_invitation_expiry
 ON trainlive.lms_tenant_invitation(expires_at) WHERE accepted_at IS NULL AND revoked_at IS NULL;
ALTER TABLE trainlive.lms_tenant_invitation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON trainlive.lms_tenant_invitation FROM PUBLIC,trainlive_app;

CREATE TABLE trainlive.lms_tenant_setting_request (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES trainlive.organization(id),
 setting_key text NOT NULL CHECK(setting_key ~ '^[a-z][a-z0-9_.]{2,63}$'),
 requested_value jsonb NOT NULL,
 base_revision bigint NOT NULL DEFAULT 0 CHECK(base_revision>=0),
 requested_by uuid NOT NULL REFERENCES trainlive.staff_user(id),
 status text NOT NULL DEFAULT 'pending'
  CHECK(status IN ('pending','approved','rejected','stale','cancelled')),
 requested_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid REFERENCES trainlive.staff_user(id),
 reviewed_at timestamptz,
 review_note text NOT NULL DEFAULT '' CHECK(length(review_note)<=500),
 applied_revision bigint,
 CHECK((status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status<>'pending' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
 CHECK(status<>'approved' OR applied_revision IS NOT NULL)
);
CREATE UNIQUE INDEX lms_tenant_setting_one_pending
 ON trainlive.lms_tenant_setting_request(organization_id,setting_key) WHERE status='pending';
CREATE INDEX lms_tenant_setting_request_queue
 ON trainlive.lms_tenant_setting_request(organization_id,status,requested_at DESC);
ALTER TABLE trainlive.lms_tenant_setting_request ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON trainlive.lms_tenant_setting_request FROM PUBLIC,trainlive_app;

CREATE FUNCTION trainlive.claim_tenant()
RETURNS uuid LANGUAGE sql STABLE
SET search_path=trainlive,pg_temp AS $$
 SELECT NULLIF(current_setting('trainlive.tenant_id',true),'')::uuid
$$;
REVOKE ALL ON FUNCTION trainlive.claim_tenant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.claim_tenant() TO trainlive_app;

-- A tenant claim is only a target selector. Every privileged SQL operation
-- rechecks the active membership and allowed role against the database.
CREATE FUNCTION trainlive.lms_tenant_actor_can(p_tenant uuid,p_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=trainlive,pg_temp AS $$
 SELECT COALESCE(
  (p_tenant=trainlive.claim_tenant()
   AND trainlive.claim_staff() IS NOT NULL
   AND EXISTS(SELECT 1 FROM trainlive.lms_tenant_membership m
    WHERE m.organization_id=p_tenant AND m.staff_id=trainlive.claim_staff()
      AND m.active AND m.role=ANY(p_roles)))
  OR
  (trainlive.claim_class() IS NOT NULL AND 'tenant_admin'=ANY(p_roles)
   AND trainlive.lms_admin_can_manage_tenant(trainlive.claim_class(),p_tenant)),
 false)
$$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_actor_can(uuid,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_tenant_actor_can(uuid,text[]) TO trainlive_app;

-- Only a signed, nonce-checked, MFA-verified OIDC callback may invoke this
-- resolver. Existing active memberships require an exact immutable issuer/sub.
-- First login is possible only after an explicit email-bound invitation.
CREATE FUNCTION trainlive.resolve_tenant_admin_oidc(
 p_tenant uuid,p_email text,p_issuer text,p_subject text
) RETURNS TABLE(staff_id uuid,tenant_id uuid,tenant_slug text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_staff uuid;v_issuer text;v_subject text;v_invitation trainlive.lms_tenant_invitation%ROWTYPE;
 v_membership_role text;v_slug text;v_status text;
BEGIN
 IF p_tenant IS NULL OR p_email IS NULL OR p_email<>lower(btrim(p_email))
  OR length(p_email)>254 OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  OR p_issuer IS NULL OR p_issuer !~ '^https://' OR length(p_issuer)>2048
  OR p_subject IS NULL OR length(p_subject) NOT BETWEEN 1 AND 512
 THEN RETURN; END IF;
 SELECT o.slug,COALESCE(t.status,'active') INTO v_slug,v_status
 FROM trainlive.organization o LEFT JOIN trainlive.lms_tenant_profile t
 ON t.organization_id=o.id WHERE o.id=p_tenant;
 IF NOT FOUND OR v_status='suspended' THEN RETURN; END IF;

 PERFORM 1 FROM trainlive.organization WHERE id=p_tenant FOR UPDATE;
 SELECT * INTO v_invitation FROM trainlive.lms_tenant_invitation i
 WHERE i.organization_id=p_tenant AND i.email=p_email AND i.role='tenant_admin'
  AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now()
 ORDER BY i.invited_at DESC LIMIT 1 FOR UPDATE;

 SELECT u.id,u.oidc_issuer,u.oidc_subject INTO v_staff,v_issuer,v_subject
 FROM trainlive.staff_user u WHERE u.email=p_email FOR UPDATE;
 IF v_staff IS NULL THEN
  IF v_invitation.id IS NULL THEN RETURN; END IF;
  INSERT INTO trainlive.staff_user(email,display_name,oidc_issuer,oidc_subject)
  VALUES(p_email,split_part(p_email,'@',1),p_issuer,p_subject)
  RETURNING id INTO v_staff;
  v_issuer:=p_issuer;v_subject:=p_subject;
 ELSIF v_issuer IS NULL AND v_subject IS NULL THEN
  IF v_invitation.id IS NULL THEN RETURN; END IF;
  UPDATE trainlive.staff_user SET oidc_issuer=p_issuer,oidc_subject=p_subject
   WHERE id=v_staff;
  v_issuer:=p_issuer;v_subject:=p_subject;
 ELSIF v_issuer IS DISTINCT FROM p_issuer OR v_subject IS DISTINCT FROM p_subject THEN
  RETURN;
 END IF;

 SELECT m.role INTO v_membership_role FROM trainlive.lms_tenant_membership m
 WHERE m.organization_id=p_tenant AND m.staff_id=v_staff AND m.active FOR UPDATE;
 IF v_membership_role IS DISTINCT FROM 'tenant_admin' THEN
  IF v_invitation.id IS NULL THEN RETURN; END IF;
  INSERT INTO trainlive.lms_tenant_membership(
   organization_id,staff_id,role,active,assigned_by,updated_at)
  VALUES(p_tenant,v_staff,'tenant_admin',true,v_invitation.invited_by,now())
  ON CONFLICT(organization_id,staff_id) DO UPDATE
   SET role='tenant_admin',active=true,assigned_by=EXCLUDED.assigned_by,updated_at=now();
  UPDATE trainlive.lms_tenant_invitation SET accepted_at=now()
   WHERE id=v_invitation.id;
 END IF;

 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(v_staff,'tenant_admin',NULL,'auth.tenant_admin.login',p_tenant::text,
  jsonb_build_object('tenantId',p_tenant,'issuer',p_issuer));
 staff_id:=v_staff;tenant_id:=p_tenant;tenant_slug:=v_slug;RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION trainlive.resolve_tenant_admin_oidc(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.resolve_tenant_admin_oidc(uuid,text,text,text) TO trainlive_app;

CREATE FUNCTION trainlive.lms_admin_invite_tenant_user(
 p_class uuid,p_tenant uuid,p_email text,p_role text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 IF p_class IS DISTINCT FROM trainlive.claim_class() OR NOT trainlive.can_create_class()
  OR NOT trainlive.lms_admin_can_manage_tenant(p_class,p_tenant)
 THEN RAISE EXCEPTION 'tenant invitation forbidden' USING ERRCODE='42501'; END IF;
 IF p_email IS NULL OR p_email<>lower(btrim(p_email)) OR length(p_email)>254
  OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  OR p_role IS NULL OR p_role<>'tenant_admin'
 THEN RAISE EXCEPTION 'invalid tenant invitation' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM trainlive.organization WHERE id=p_tenant FOR UPDATE;
 UPDATE trainlive.lms_tenant_invitation SET revoked_at=now()
 WHERE organization_id=p_tenant AND email=p_email AND accepted_at IS NULL AND revoked_at IS NULL;
 INSERT INTO trainlive.lms_tenant_invitation(organization_id,email,role,invited_by)
 VALUES(p_tenant,p_email,p_role,trainlive.claim_staff()) RETURNING id INTO v_id;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'super_admin',p_class,'lms.tenant.invite',p_tenant::text,
  jsonb_build_object('invitationId',v_id,'email',p_email,'role',p_role,
   'expiresAt',now()+interval '7 days'));
 RETURN jsonb_build_object('invitationId',v_id,'tenantId',p_tenant,'email',p_email,
  'role',p_role,'loginPath','/tenant/login/'||p_tenant::text,'expiresInDays',7);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_admin_invite_tenant_user(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_admin_invite_tenant_user(uuid,uuid,text,text) TO trainlive_app;

CREATE FUNCTION trainlive.lms_tenant_dashboard(p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
 IF NOT trainlive.lms_tenant_actor_can(p_tenant,ARRAY['tenant_admin','learning_manager','course_author','viewer'])
 THEN RAISE EXCEPTION 'tenant workspace forbidden' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object(
  'tenant',jsonb_build_object('id',o.id,'name',o.name,'slug',o.slug,
   'status',COALESCE(t.status,'active')),
  'settings',COALESCE((SELECT jsonb_object_agg(s.setting_key,s.setting_value)
   FROM trainlive.lms_tenant_setting s WHERE s.organization_id=o.id),'{}'::jsonb),
  'revisions',COALESCE((SELECT jsonb_object_agg(s.setting_key,s.revision)
   FROM trainlive.lms_tenant_setting s WHERE s.organization_id=o.id),'{}'::jsonb),
  'programs',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'id',p.id,'code',p.code,'title',p.title,'description',p.description,
   'courseCount',(SELECT count(*) FROM trainlive.lms_course c
    WHERE c.program_id=p.id AND c.organization_id=o.id)
  ) ORDER BY p.title,p.code) FROM trainlive.program p WHERE p.organization_id=o.id),'[]'::jsonb)
 ) INTO v_result FROM trainlive.organization o
 LEFT JOIN trainlive.lms_tenant_profile t ON t.organization_id=o.id
 WHERE o.id=p_tenant;
 IF v_result IS NULL OR v_result->'tenant'->>'status'='suspended'
 THEN RAISE EXCEPTION 'tenant unavailable' USING ERRCODE='42501'; END IF;
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_dashboard(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_tenant_dashboard(uuid) TO trainlive_app;

CREATE FUNCTION trainlive.lms_tenant_create_program(
 p_tenant uuid,p_code text,p_title text,p_description text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 IF NOT trainlive.lms_tenant_actor_can(p_tenant,ARRAY['tenant_admin','learning_manager'])
 THEN RAISE EXCEPTION 'program creation forbidden' USING ERRCODE='42501'; END IF;
 IF p_code IS NULL OR p_code !~ '^[A-Z][A-Z0-9_-]{2,31}$'
  OR p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 3 AND 160
  OR p_title ~ '[[:cntrl:]<>]' OR p_description IS NULL OR length(p_description)>2000
 THEN RAISE EXCEPTION 'invalid program metadata' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM trainlive.organization o
 LEFT JOIN trainlive.lms_tenant_profile t ON t.organization_id=o.id
 WHERE o.id=p_tenant AND COALESCE(t.status,'active')<>'suspended' FOR UPDATE OF o;
 IF NOT FOUND THEN RAISE EXCEPTION 'tenant unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO trainlive.program(organization_id,code,title,description)
 VALUES(p_tenant,p_code,btrim(p_title),p_description) RETURNING id INTO v_id;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'tenant_admin',NULL,'lms.program.create',v_id::text,
  jsonb_build_object('tenantId',p_tenant,'code',p_code,'title',btrim(p_title)));
 RETURN jsonb_build_object('id',v_id,'tenantId',p_tenant,'code',p_code,
  'title',btrim(p_title),'description',p_description);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_create_program(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_tenant_create_program(uuid,text,text,text) TO trainlive_app;

CREATE FUNCTION trainlive.lms_tenant_setting_valid(p_key text,p_value jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path=trainlive,pg_temp AS $$
 SELECT COALESCE(
  p_key IN ('branding.primary_color','branding.logo_url','learning.default_passing_grade',
   'learning.default_sequential','learning.default_delivery_mode',
   'certificate.enabled','certificate.issuer_name')
  AND p_value IS NOT NULL AND length(p_value::text)<=2048
  AND NOT (
   (p_key='branding.primary_color' AND
    (jsonb_typeof(p_value)<>'string' OR (p_value#>>'{}') !~ '^#[0-9A-Fa-f]{6}$'))
   OR (p_key='branding.logo_url' AND
    (jsonb_typeof(p_value)<>'string' OR length(p_value#>>'{}')>512
     OR ((p_value#>>'{}')<>'' AND (p_value#>>'{}') !~ '^https://[^[:space:]@<>]+   OR (p_key='learning.default_passing_grade' AND
    (jsonb_typeof(p_value)<>'number' OR (p_value#>>'{}') !~ '^[0-9]{1,3}$'
     OR (p_value#>>'{}')::integer NOT BETWEEN 0 AND 100))
   OR (p_key IN ('learning.default_sequential','certificate.enabled')
    AND jsonb_typeof(p_value)<>'boolean')
   OR (p_key='learning.default_delivery_mode' AND
    (jsonb_typeof(p_value)<>'string' OR (p_value#>>'{}') NOT IN ('live','self_paced','blended')))
   OR (p_key='certificate.issuer_name' AND
    (jsonb_typeof(p_value)<>'string' OR length(btrim(p_value#>>'{}')) NOT BETWEEN 2 AND 160
     OR (p_value#>>'{}') ~ '[[:cntrl:]<>]'))
   OR (p_key='certificate.enabled' AND p_value<>'false'::jsonb)
  ),false)
$$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_setting_valid(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_tenant_setting_valid(text,jsonb) TO trainlive_app;

CREATE FUNCTION trainlive.lms_tenant_setting_apply(
 p_tenant uuid,p_key text,p_value jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_revision bigint;v_previous jsonb;
BEGIN
 IF NOT trainlive.lms_tenant_setting_valid(p_key,p_value)
 THEN RAISE EXCEPTION 'invalid tenant setting value' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM trainlive.organization WHERE id=p_tenant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'tenant missing' USING ERRCODE='42501'; END IF;
 SELECT setting_value INTO v_previous FROM trainlive.lms_tenant_setting
 WHERE organization_id=p_tenant AND setting_key=p_key;
 INSERT INTO trainlive.lms_tenant_setting(organization_id,setting_key,setting_value,updated_by)
 VALUES(p_tenant,p_key,p_value,trainlive.claim_staff())
 ON CONFLICT(organization_id,setting_key) DO UPDATE SET
 setting_value=EXCLUDED.setting_value,updated_by=EXCLUDED.updated_by,
 updated_at=now(),revision=trainlive.lms_tenant_setting.revision+1
 RETURNING revision INTO v_revision;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),
  CASE WHEN EXISTS(SELECT 1 FROM trainlive.staff_user WHERE id=trainlive.claim_staff() AND is_super_admin)
   THEN 'super_admin' ELSE 'tenant_admin' END,
  trainlive.claim_class(),'lms.setting.approved',p_key,
  jsonb_build_object('tenantId',p_tenant,'previousValue',v_previous,
   'newValue',p_value,'revision',v_revision));
 RETURN jsonb_build_object('key',p_key,'value',p_value,'revision',v_revision);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_setting_apply(uuid,text,jsonb) FROM PUBLIC,trainlive_app;

CREATE FUNCTION trainlive.lms_tenant_setting_propose(
 p_tenant uuid,p_key text,p_value jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_revision bigint;v_id uuid;v_current jsonb;v_status text;
BEGIN
 IF NOT trainlive.lms_tenant_actor_can(p_tenant,ARRAY['tenant_admin','learning_manager'])
 THEN RAISE EXCEPTION 'setting proposal forbidden' USING ERRCODE='42501'; END IF;
 IF NOT trainlive.lms_tenant_setting_valid(p_key,p_value)
 THEN RAISE EXCEPTION 'invalid tenant setting value' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM trainlive.organization o LEFT JOIN trainlive.lms_tenant_profile t
 ON t.organization_id=o.id WHERE o.id=p_tenant AND COALESCE(t.status,'active')<>'suspended'
 FOR UPDATE OF o;
 IF NOT FOUND THEN RAISE EXCEPTION 'tenant unavailable' USING ERRCODE='42501'; END IF;
 SELECT setting_value,revision INTO v_current,v_revision FROM trainlive.lms_tenant_setting
 WHERE organization_id=p_tenant AND setting_key=p_key;
 v_revision:=COALESCE(v_revision,0);
 IF v_current IS NOT DISTINCT FROM p_value THEN
  RETURN jsonb_build_object('status','no_change','key',p_key,'revision',v_revision);
 END IF;
 INSERT INTO trainlive.lms_tenant_setting_request(
  organization_id,setting_key,requested_value,base_revision,requested_by)
 VALUES(p_tenant,p_key,p_value,v_revision,trainlive.claim_staff())
 RETURNING id,status INTO v_id,v_status;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'tenant_admin',trainlive.claim_class(),
  'lms.setting.propose',p_key,
  jsonb_build_object('tenantId',p_tenant,'requestId',v_id,
   'requestedValue',p_value,'baseRevision',v_revision));
 RETURN jsonb_build_object('id',v_id,'key',p_key,'status',v_status,'baseRevision',v_revision);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_setting_propose(uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_tenant_setting_propose(uuid,text,jsonb) TO trainlive_app;

CREATE FUNCTION trainlive.lms_tenant_setting_queue(p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_queue jsonb;
BEGIN
 IF NOT trainlive.lms_tenant_actor_can(p_tenant,ARRAY['tenant_admin'])
 THEN RAISE EXCEPTION 'setting approval queue forbidden' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'id',q.id,'key',q.setting_key,'value',q.requested_value,
  'baseRevision',q.base_revision,'requestedBy',q.requested_by,
  'requesterEmail',u.email,'requestedAt',q.requested_at,'status',q.status,
  'canApprove',q.requested_by<>trainlive.claim_staff())
  ORDER BY q.requested_at),'[]'::jsonb) INTO v_queue
 FROM trainlive.lms_tenant_setting_request q
 JOIN trainlive.staff_user u ON u.id=q.requested_by
 WHERE q.organization_id=p_tenant AND q.status='pending';
 RETURN jsonb_build_object('tenantId',p_tenant,'requests',v_queue);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_setting_queue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_tenant_setting_queue(uuid) TO trainlive_app;

CREATE FUNCTION trainlive.lms_tenant_setting_review(
 p_tenant uuid,p_request uuid,p_decision text,p_note text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_request trainlive.lms_tenant_setting_request%ROWTYPE;
 v_current_revision bigint;v_applied jsonb;
BEGIN
 IF NOT trainlive.lms_tenant_actor_can(p_tenant,ARRAY['tenant_admin'])
 THEN RAISE EXCEPTION 'setting approval forbidden' USING ERRCODE='42501'; END IF;
 IF p_decision NOT IN ('approve','reject') OR p_note IS NULL OR length(p_note)>500
 THEN RAISE EXCEPTION 'invalid approval decision' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM trainlive.organization WHERE id=p_tenant FOR UPDATE;
 SELECT * INTO v_request FROM trainlive.lms_tenant_setting_request
 WHERE id=p_request AND organization_id=p_tenant FOR UPDATE;
 IF NOT FOUND OR v_request.status<>'pending'
 THEN RAISE EXCEPTION 'pending setting request not found' USING ERRCODE='42501'; END IF;
 IF v_request.requested_by=trainlive.claim_staff()
 THEN RAISE EXCEPTION 'maker cannot approve own parameter request' USING ERRCODE='42501'; END IF;
 SELECT revision INTO v_current_revision FROM trainlive.lms_tenant_setting
 WHERE organization_id=p_tenant AND setting_key=v_request.setting_key;
 v_current_revision:=COALESCE(v_current_revision,0);
 IF v_current_revision<>v_request.base_revision THEN
  UPDATE trainlive.lms_tenant_setting_request SET status='stale',
   reviewed_by=trainlive.claim_staff(),reviewed_at=now(),
   review_note='Base revision changed; submit a new request.'
  WHERE id=p_request;
  INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
  VALUES(trainlive.claim_staff(),'tenant_admin',trainlive.claim_class(),
   'lms.setting.stale',v_request.setting_key,
   jsonb_build_object('tenantId',p_tenant,'requestId',p_request,
    'expectedRevision',v_request.base_revision,'currentRevision',v_current_revision));
  RETURN jsonb_build_object('id',p_request,'status','stale');
 END IF;
 IF p_decision='approve' THEN
  v_applied:=trainlive.lms_tenant_setting_apply(p_tenant,v_request.setting_key,v_request.requested_value);
  UPDATE trainlive.lms_tenant_setting_request SET status='approved',
   reviewed_by=trainlive.claim_staff(),reviewed_at=now(),review_note=btrim(p_note),
   applied_revision=(v_applied->>'revision')::bigint WHERE id=p_request;
 ELSE
  UPDATE trainlive.lms_tenant_setting_request SET status='rejected',
   reviewed_by=trainlive.claim_staff(),reviewed_at=now(),review_note=btrim(p_note)
  WHERE id=p_request;
 END IF;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'tenant_admin',trainlive.claim_class(),
  'lms.setting.'||p_decision,v_request.setting_key,
  jsonb_build_object('tenantId',p_tenant,'requestId',p_request,
   'makerId',v_request.requested_by,'note',btrim(p_note),
   'appliedRevision',CASE WHEN p_decision='approve' THEN v_applied->'revision' ELSE NULL END));
 RETURN jsonb_build_object('id',p_request,'status',CASE WHEN p_decision='approve' THEN 'approved' ELSE 'rejected' END,
  'appliedRevision',CASE WHEN p_decision='approve' THEN v_applied->'revision' ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_setting_review(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_tenant_setting_review(uuid,uuid,text,text) TO trainlive_app;

CREATE FUNCTION trainlive.lms_tenant_setting_request_rollback(
 p_tenant uuid,p_key text,p_revision bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_value jsonb;
BEGIN
 IF NOT trainlive.lms_tenant_actor_can(p_tenant,ARRAY['tenant_admin','learning_manager'])
 THEN RAISE EXCEPTION 'setting rollback proposal forbidden' USING ERRCODE='42501'; END IF;
 IF p_revision IS NULL OR p_revision<1 THEN
  RAISE EXCEPTION 'invalid revision' USING ERRCODE='22023'; END IF;
 SELECT new_value INTO v_value FROM trainlive.lms_tenant_setting_revision
 WHERE organization_id=p_tenant AND setting_key=p_key AND revision=p_revision;
 IF NOT FOUND THEN RAISE EXCEPTION 'setting revision not found' USING ERRCODE='42501'; END IF;
 RETURN trainlive.lms_tenant_setting_propose(p_tenant,p_key,v_value);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_setting_request_rollback(uuid,text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_tenant_setting_request_rollback(uuid,text,bigint) TO trainlive_app;

CREATE FUNCTION trainlive.lms_tenant_settings_read(p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_settings jsonb;v_revisions jsonb;
BEGIN
 IF NOT trainlive.lms_tenant_actor_can(p_tenant,ARRAY['tenant_admin','learning_manager','course_author','viewer'])
 THEN RAISE EXCEPTION 'tenant settings read forbidden' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(jsonb_object_agg(setting_key,setting_value),'{}'::jsonb),
  COALESCE(jsonb_object_agg(setting_key,revision),'{}'::jsonb)
 INTO v_settings,v_revisions FROM trainlive.lms_tenant_setting WHERE organization_id=p_tenant;
 RETURN jsonb_build_object('organizationId',p_tenant,'settings',v_settings,'revisions',v_revisions);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_settings_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_tenant_settings_read(uuid) TO trainlive_app;

-- Runtime callers must not bypass maker-checker with the legacy direct-write
-- or direct-rollback functions. SECURITY DEFINER internal rollback helpers
-- remain usable by their owner; HTTP routes are switched to proposal APIs.
REVOKE EXECUTE ON FUNCTION trainlive.lms_admin_set_tenant_setting(uuid,text,jsonb) FROM trainlive_app;
REVOKE EXECUTE ON FUNCTION trainlive.lms_admin_set_scoped_setting(uuid,uuid,text,jsonb) FROM trainlive_app;
REVOKE EXECUTE ON FUNCTION trainlive.lms_admin_rollback_setting(uuid,text,bigint) FROM trainlive_app;
REVOKE EXECUTE ON FUNCTION trainlive.lms_admin_rollback_scoped_setting(uuid,uuid,text,bigint) FROM trainlive_app;

-- White-label values are safe display metadata only. The public join-code
-- endpoint returns no tenant IDs, membership, participant or course details.
CREATE FUNCTION trainlive.public_class_branding_v2(p_code text)
RETURNS TABLE(client_name text,training_title text,logo_url text,primary_color text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
 SELECT
  CASE WHEN c.client_name='PT Bank Pembangunan Daerah Sulawesi Tengah'
   THEN o.name ELSE c.client_name END,
  c.training_title,
  NULLIF((SELECT s.setting_value#>>'{}' FROM trainlive.lms_tenant_setting s
   WHERE s.organization_id=o.id AND s.setting_key='branding.logo_url'),''),
  NULLIF((SELECT s.setting_value#>>'{}' FROM trainlive.lms_tenant_setting s
   WHERE s.organization_id=o.id AND s.setting_key='branding.primary_color'),'')
 FROM trainlive.class_session c
 JOIN trainlive.program p ON p.id=c.program_id
 JOIN trainlive.organization o ON o.id=p.organization_id
 WHERE p_code ~ '^[A-HJ-NP-Z2-9]{6}$' AND c.join_code=p_code
  AND c.status IN ('scheduled','live')
  AND now() BETWEEN c.join_open_from AND c.join_open_until
 LIMIT 1
$$;
REVOKE ALL ON FUNCTION trainlive.public_class_branding_v2(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.public_class_branding_v2(text) TO trainlive_app;

CREATE FUNCTION trainlive.lms_learner_class_branding(p_class uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
 IF p_class IS DISTINCT FROM trainlive.claim_class()
  OR trainlive.claim_participant() IS NULL
  OR NOT EXISTS(SELECT 1 FROM trainlive.participant p
   WHERE p.class_id=p_class AND p.id=trainlive.claim_participant())
 THEN RAISE EXCEPTION 'learner branding forbidden' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object(
  'clientName',CASE WHEN c.client_name='PT Bank Pembangunan Daerah Sulawesi Tengah'
   THEN o.name ELSE c.client_name END,
  'trainingTitle',c.training_title,
  'logoUrl',NULLIF((SELECT s.setting_value#>>'{}' FROM trainlive.lms_tenant_setting s
   WHERE s.organization_id=o.id AND s.setting_key='branding.logo_url'),''),
  'primaryColor',NULLIF((SELECT s.setting_value#>>'{}' FROM trainlive.lms_tenant_setting s
   WHERE s.organization_id=o.id AND s.setting_key='branding.primary_color'),'')
 ) INTO v_result
 FROM trainlive.class_session c JOIN trainlive.program p ON p.id=c.program_id
 JOIN trainlive.organization o ON o.id=p.organization_id WHERE c.id=p_class;
 IF v_result IS NULL THEN RAISE EXCEPTION 'class not found' USING ERRCODE='42501'; END IF;
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_learner_class_branding(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_learner_class_branding(uuid) TO trainlive_app;


CREATE FUNCTION trainlive.lms_staff_class_branding(p_class uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=trainlive,pg_temp AS $
DECLARE v_result jsonb;
BEGIN
 IF p_class IS DISTINCT FROM trainlive.claim_class()
  OR trainlive.claim_staff() IS NULL
  OR NOT EXISTS(SELECT 1 FROM trainlive.class_staff s
   WHERE s.class_id=p_class AND s.user_id=trainlive.claim_staff())
 THEN RAISE EXCEPTION 'staff branding forbidden' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object(
  'clientName',CASE WHEN c.client_name='PT Bank Pembangunan Daerah Sulawesi Tengah'
   THEN o.name ELSE c.client_name END,
  'trainingTitle',c.training_title,
  'logoUrl',NULLIF((SELECT s.setting_value#>>'{}' FROM trainlive.lms_tenant_setting s
   WHERE s.organization_id=o.id AND s.setting_key='branding.logo_url'),''),
  'primaryColor',NULLIF((SELECT s.setting_value#>>'{}' FROM trainlive.lms_tenant_setting s
   WHERE s.organization_id=o.id AND s.setting_key='branding.primary_color'),'')
 ) INTO v_result
 FROM trainlive.class_session c JOIN trainlive.program p ON p.id=c.program_id
 JOIN trainlive.organization o ON o.id=p.organization_id WHERE c.id=p_class;
 IF v_result IS NULL THEN RAISE EXCEPTION 'class not found' USING ERRCODE='42501'; END IF;
 RETURN v_result;
END $;
REVOKE ALL ON FUNCTION trainlive.lms_staff_class_branding(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_staff_class_branding(uuid) TO trainlive_app;

COMMIT;
)))
   OR (p_key='learning.default_passing_grade' AND
    (jsonb_typeof(p_value)<>'number' OR (p_value#>>'{}') !~ '^[0-9]{1,3}$'
     OR (p_value#>>'{}')::integer NOT BETWEEN 0 AND 100))
   OR (p_key IN ('learning.default_sequential','certificate.enabled')
    AND jsonb_typeof(p_value)<>'boolean')
   OR (p_key='learning.default_delivery_mode' AND
    (jsonb_typeof(p_value)<>'string' OR (p_value#>>'{}') NOT IN ('live','self_paced','blended')))
   OR (p_key='certificate.issuer_name' AND
    (jsonb_typeof(p_value)<>'string' OR length(btrim(p_value#>>'{}')) NOT BETWEEN 2 AND 160
     OR (p_value#>>'{}') ~ '[[:cntrl:]<>]'))
   OR (p_key='certificate.enabled' AND p_value<>'false'::jsonb)
  ),false)
$$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_setting_valid(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_tenant_setting_valid(text,jsonb) TO trainlive_app;

CREATE FUNCTION trainlive.lms_tenant_setting_apply(
 p_tenant uuid,p_key text,p_value jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_revision bigint;v_previous jsonb;
BEGIN
 IF NOT trainlive.lms_tenant_setting_valid(p_key,p_value)
 THEN RAISE EXCEPTION 'invalid tenant setting value' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM trainlive.organization WHERE id=p_tenant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'tenant missing' USING ERRCODE='42501'; END IF;
 SELECT setting_value INTO v_previous FROM trainlive.lms_tenant_setting
 WHERE organization_id=p_tenant AND setting_key=p_key;
 INSERT INTO trainlive.lms_tenant_setting(organization_id,setting_key,setting_value,updated_by)
 VALUES(p_tenant,p_key,p_value,trainlive.claim_staff())
 ON CONFLICT(organization_id,setting_key) DO UPDATE SET
 setting_value=EXCLUDED.setting_value,updated_by=EXCLUDED.updated_by,
 updated_at=now(),revision=trainlive.lms_tenant_setting.revision+1
 RETURNING revision INTO v_revision;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),
  CASE WHEN EXISTS(SELECT 1 FROM trainlive.staff_user WHERE id=trainlive.claim_staff() AND is_super_admin)
   THEN 'super_admin' ELSE 'tenant_admin' END,
  trainlive.claim_class(),'lms.setting.approved',p_key,
  jsonb_build_object('tenantId',p_tenant,'previousValue',v_previous,
   'newValue',p_value,'revision',v_revision));
 RETURN jsonb_build_object('key',p_key,'value',p_value,'revision',v_revision);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_setting_apply(uuid,text,jsonb) FROM PUBLIC,trainlive_app;

CREATE FUNCTION trainlive.lms_tenant_setting_propose(
 p_tenant uuid,p_key text,p_value jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_revision bigint;v_id uuid;v_current jsonb;v_status text;
BEGIN
 IF NOT trainlive.lms_tenant_actor_can(p_tenant,ARRAY['tenant_admin','learning_manager'])
 THEN RAISE EXCEPTION 'setting proposal forbidden' USING ERRCODE='42501'; END IF;
 IF NOT trainlive.lms_tenant_setting_valid(p_key,p_value)
 THEN RAISE EXCEPTION 'invalid tenant setting value' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM trainlive.organization o LEFT JOIN trainlive.lms_tenant_profile t
 ON t.organization_id=o.id WHERE o.id=p_tenant AND COALESCE(t.status,'active')<>'suspended'
 FOR UPDATE OF o;
 IF NOT FOUND THEN RAISE EXCEPTION 'tenant unavailable' USING ERRCODE='42501'; END IF;
 SELECT setting_value,revision INTO v_current,v_revision FROM trainlive.lms_tenant_setting
 WHERE organization_id=p_tenant AND setting_key=p_key;
 v_revision:=COALESCE(v_revision,0);
 IF v_current IS NOT DISTINCT FROM p_value THEN
  RETURN jsonb_build_object('status','no_change','key',p_key,'revision',v_revision);
 END IF;
 INSERT INTO trainlive.lms_tenant_setting_request(
  organization_id,setting_key,requested_value,base_revision,requested_by)
 VALUES(p_tenant,p_key,p_value,v_revision,trainlive.claim_staff())
 RETURNING id,status INTO v_id,v_status;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'tenant_admin',trainlive.claim_class(),
  'lms.setting.propose',p_key,
  jsonb_build_object('tenantId',p_tenant,'requestId',v_id,
   'requestedValue',p_value,'baseRevision',v_revision));
 RETURN jsonb_build_object('id',v_id,'key',p_key,'status',v_status,'baseRevision',v_revision);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_setting_propose(uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_tenant_setting_propose(uuid,text,jsonb) TO trainlive_app;

CREATE FUNCTION trainlive.lms_tenant_setting_queue(p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_queue jsonb;
BEGIN
 IF NOT trainlive.lms_tenant_actor_can(p_tenant,ARRAY['tenant_admin'])
 THEN RAISE EXCEPTION 'setting approval queue forbidden' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'id',q.id,'key',q.setting_key,'value',q.requested_value,
  'baseRevision',q.base_revision,'requestedBy',q.requested_by,
  'requesterEmail',u.email,'requestedAt',q.requested_at,'status',q.status)
  ORDER BY q.requested_at),'[]'::jsonb) INTO v_queue
 FROM trainlive.lms_tenant_setting_request q
 JOIN trainlive.staff_user u ON u.id=q.requested_by
 WHERE q.organization_id=p_tenant AND q.status='pending';
 RETURN jsonb_build_object('tenantId',p_tenant,'requests',v_queue);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_setting_queue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_tenant_setting_queue(uuid) TO trainlive_app;

CREATE FUNCTION trainlive.lms_tenant_setting_review(
 p_tenant uuid,p_request uuid,p_decision text,p_note text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_request trainlive.lms_tenant_setting_request%ROWTYPE;
 v_current_revision bigint;v_applied jsonb;
BEGIN
 IF NOT trainlive.lms_tenant_actor_can(p_tenant,ARRAY['tenant_admin'])
 THEN RAISE EXCEPTION 'setting approval forbidden' USING ERRCODE='42501'; END IF;
 IF p_decision NOT IN ('approve','reject') OR p_note IS NULL OR length(p_note)>500
 THEN RAISE EXCEPTION 'invalid approval decision' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM trainlive.organization WHERE id=p_tenant FOR UPDATE;
 SELECT * INTO v_request FROM trainlive.lms_tenant_setting_request
 WHERE id=p_request AND organization_id=p_tenant FOR UPDATE;
 IF NOT FOUND OR v_request.status<>'pending'
 THEN RAISE EXCEPTION 'pending setting request not found' USING ERRCODE='42501'; END IF;
 IF v_request.requested_by=trainlive.claim_staff()
 THEN RAISE EXCEPTION 'maker cannot approve own parameter request' USING ERRCODE='42501'; END IF;
 SELECT revision INTO v_current_revision FROM trainlive.lms_tenant_setting
 WHERE organization_id=p_tenant AND setting_key=v_request.setting_key;
 v_current_revision:=COALESCE(v_current_revision,0);
 IF v_current_revision<>v_request.base_revision THEN
  UPDATE trainlive.lms_tenant_setting_request SET status='stale',
   reviewed_by=trainlive.claim_staff(),reviewed_at=now(),
   review_note='Base revision changed; submit a new request.'
  WHERE id=p_request;
  INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
  VALUES(trainlive.claim_staff(),'tenant_admin',trainlive.claim_class(),
   'lms.setting.stale',v_request.setting_key,
   jsonb_build_object('tenantId',p_tenant,'requestId',p_request,
    'expectedRevision',v_request.base_revision,'currentRevision',v_current_revision));
  RETURN jsonb_build_object('id',p_request,'status','stale');
 END IF;
 IF p_decision='approve' THEN
  v_applied:=trainlive.lms_tenant_setting_apply(p_tenant,v_request.setting_key,v_request.requested_value);
  UPDATE trainlive.lms_tenant_setting_request SET status='approved',
   reviewed_by=trainlive.claim_staff(),reviewed_at=now(),review_note=btrim(p_note),
   applied_revision=(v_applied->>'revision')::bigint WHERE id=p_request;
 ELSE
  UPDATE trainlive.lms_tenant_setting_request SET status='rejected',
   reviewed_by=trainlive.claim_staff(),reviewed_at=now(),review_note=btrim(p_note)
  WHERE id=p_request;
 END IF;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'tenant_admin',trainlive.claim_class(),
  'lms.setting.'||p_decision,v_request.setting_key,
  jsonb_build_object('tenantId',p_tenant,'requestId',p_request,
   'makerId',v_request.requested_by,'note',btrim(p_note),
   'appliedRevision',CASE WHEN p_decision='approve' THEN v_applied->'revision' ELSE NULL END));
 RETURN jsonb_build_object('id',p_request,'status',CASE WHEN p_decision='approve' THEN 'approved' ELSE 'rejected' END,
  'appliedRevision',CASE WHEN p_decision='approve' THEN v_applied->'revision' ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_setting_review(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_tenant_setting_review(uuid,uuid,text,text) TO trainlive_app;

CREATE FUNCTION trainlive.lms_tenant_setting_request_rollback(
 p_tenant uuid,p_key text,p_revision bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_value jsonb;
BEGIN
 IF NOT trainlive.lms_tenant_actor_can(p_tenant,ARRAY['tenant_admin','learning_manager'])
 THEN RAISE EXCEPTION 'setting rollback proposal forbidden' USING ERRCODE='42501'; END IF;
 IF p_revision IS NULL OR p_revision<1 THEN
  RAISE EXCEPTION 'invalid revision' USING ERRCODE='22023'; END IF;
 SELECT new_value INTO v_value FROM trainlive.lms_tenant_setting_revision
 WHERE organization_id=p_tenant AND setting_key=p_key AND revision=p_revision;
 IF NOT FOUND THEN RAISE EXCEPTION 'setting revision not found' USING ERRCODE='42501'; END IF;
 RETURN trainlive.lms_tenant_setting_propose(p_tenant,p_key,v_value);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_setting_request_rollback(uuid,text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_tenant_setting_request_rollback(uuid,text,bigint) TO trainlive_app;

CREATE FUNCTION trainlive.lms_tenant_settings_read(p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_settings jsonb;v_revisions jsonb;
BEGIN
 IF NOT trainlive.lms_tenant_actor_can(p_tenant,ARRAY['tenant_admin','learning_manager','course_author','viewer'])
 THEN RAISE EXCEPTION 'tenant settings read forbidden' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(jsonb_object_agg(setting_key,setting_value),'{}'::jsonb),
  COALESCE(jsonb_object_agg(setting_key,revision),'{}'::jsonb)
 INTO v_settings,v_revisions FROM trainlive.lms_tenant_setting WHERE organization_id=p_tenant;
 RETURN jsonb_build_object('organizationId',p_tenant,'settings',v_settings,'revisions',v_revisions);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_settings_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_tenant_settings_read(uuid) TO trainlive_app;

-- Runtime callers must not bypass maker-checker with the legacy direct-write
-- or direct-rollback functions. SECURITY DEFINER internal rollback helpers
-- remain usable by their owner; HTTP routes are switched to proposal APIs.
REVOKE EXECUTE ON FUNCTION trainlive.lms_admin_set_tenant_setting(uuid,text,jsonb) FROM trainlive_app;
REVOKE EXECUTE ON FUNCTION trainlive.lms_admin_set_scoped_setting(uuid,uuid,text,jsonb) FROM trainlive_app;
REVOKE EXECUTE ON FUNCTION trainlive.lms_admin_rollback_setting(uuid,text,bigint) FROM trainlive_app;
REVOKE EXECUTE ON FUNCTION trainlive.lms_admin_rollback_scoped_setting(uuid,uuid,text,bigint) FROM trainlive_app;

-- White-label values are safe display metadata only. The public join-code
-- endpoint returns no tenant IDs, membership, participant or course details.
CREATE FUNCTION trainlive.public_class_branding_v2(p_code text)
RETURNS TABLE(client_name text,training_title text,logo_url text,primary_color text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
 SELECT
  CASE WHEN c.client_name='PT Bank Pembangunan Daerah Sulawesi Tengah'
   THEN o.name ELSE c.client_name END,
  c.training_title,
  NULLIF((SELECT s.setting_value#>>'{}' FROM trainlive.lms_tenant_setting s
   WHERE s.organization_id=o.id AND s.setting_key='branding.logo_url'),''),
  NULLIF((SELECT s.setting_value#>>'{}' FROM trainlive.lms_tenant_setting s
   WHERE s.organization_id=o.id AND s.setting_key='branding.primary_color'),'')
 FROM trainlive.class_session c
 JOIN trainlive.program p ON p.id=c.program_id
 JOIN trainlive.organization o ON o.id=p.organization_id
 WHERE p_code ~ '^[A-HJ-NP-Z2-9]{6}$' AND c.join_code=p_code
  AND c.status IN ('scheduled','live')
  AND now() BETWEEN c.join_open_from AND c.join_open_until
 LIMIT 1
$$;
REVOKE ALL ON FUNCTION trainlive.public_class_branding_v2(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.public_class_branding_v2(text) TO trainlive_app;

CREATE FUNCTION trainlive.lms_learner_class_branding(p_class uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
 IF p_class IS DISTINCT FROM trainlive.claim_class()
  OR trainlive.claim_participant() IS NULL
  OR NOT EXISTS(SELECT 1 FROM trainlive.participant p
   WHERE p.class_id=p_class AND p.id=trainlive.claim_participant())
 THEN RAISE EXCEPTION 'learner branding forbidden' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object(
  'clientName',CASE WHEN c.client_name='PT Bank Pembangunan Daerah Sulawesi Tengah'
   THEN o.name ELSE c.client_name END,
  'trainingTitle',c.training_title,
  'logoUrl',NULLIF((SELECT s.setting_value#>>'{}' FROM trainlive.lms_tenant_setting s
   WHERE s.organization_id=o.id AND s.setting_key='branding.logo_url'),''),
  'primaryColor',NULLIF((SELECT s.setting_value#>>'{}' FROM trainlive.lms_tenant_setting s
   WHERE s.organization_id=o.id AND s.setting_key='branding.primary_color'),'')
 ) INTO v_result
 FROM trainlive.class_session c JOIN trainlive.program p ON p.id=c.program_id
 JOIN trainlive.organization o ON o.id=p.organization_id WHERE c.id=p_class;
 IF v_result IS NULL THEN RAISE EXCEPTION 'class not found' USING ERRCODE='42501'; END IF;
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_learner_class_branding(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_learner_class_branding(uuid) TO trainlive_app;

COMMIT;
))
   OR (p_key='learning.default_passing_grade' AND
    (jsonb_typeof(p_value)<>'number' OR (p_value#>>'{}') !~ '^[0-9]{1,3}$'
     OR (p_value#>>'{}')::integer NOT BETWEEN 0 AND 100))
   OR (p_key IN ('learning.default_sequential','certificate.enabled')
    AND jsonb_typeof(p_value)<>'boolean')
   OR (p_key='learning.default_delivery_mode' AND
    (jsonb_typeof(p_value)<>'string' OR (p_value#>>'{}') NOT IN ('live','self_paced','blended')))
   OR (p_key='certificate.issuer_name' AND
    (jsonb_typeof(p_value)<>'string' OR length(btrim(p_value#>>'{}')) NOT BETWEEN 2 AND 160
     OR (p_value#>>'{}') ~ '[[:cntrl:]<>]'))
   OR (p_key='certificate.enabled' AND p_value<>'false'::jsonb)
  ),false)
$$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_setting_valid(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_tenant_setting_valid(text,jsonb) TO trainlive_app;

CREATE FUNCTION trainlive.lms_tenant_setting_apply(
 p_tenant uuid,p_key text,p_value jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_revision bigint;v_previous jsonb;
BEGIN
 IF NOT trainlive.lms_tenant_setting_valid(p_key,p_value)
 THEN RAISE EXCEPTION 'invalid tenant setting value' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM trainlive.organization WHERE id=p_tenant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'tenant missing' USING ERRCODE='42501'; END IF;
 SELECT setting_value INTO v_previous FROM trainlive.lms_tenant_setting
 WHERE organization_id=p_tenant AND setting_key=p_key;
 INSERT INTO trainlive.lms_tenant_setting(organization_id,setting_key,setting_value,updated_by)
 VALUES(p_tenant,p_key,p_value,trainlive.claim_staff())
 ON CONFLICT(organization_id,setting_key) DO UPDATE SET
 setting_value=EXCLUDED.setting_value,updated_by=EXCLUDED.updated_by,
 updated_at=now(),revision=trainlive.lms_tenant_setting.revision+1
 RETURNING revision INTO v_revision;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),
  CASE WHEN EXISTS(SELECT 1 FROM trainlive.staff_user WHERE id=trainlive.claim_staff() AND is_super_admin)
   THEN 'super_admin' ELSE 'tenant_admin' END,
  trainlive.claim_class(),'lms.setting.approved',p_key,
  jsonb_build_object('tenantId',p_tenant,'previousValue',v_previous,
   'newValue',p_value,'revision',v_revision));
 RETURN jsonb_build_object('key',p_key,'value',p_value,'revision',v_revision);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_setting_apply(uuid,text,jsonb) FROM PUBLIC,trainlive_app;

CREATE FUNCTION trainlive.lms_tenant_setting_propose(
 p_tenant uuid,p_key text,p_value jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_revision bigint;v_id uuid;v_current jsonb;v_status text;
BEGIN
 IF NOT trainlive.lms_tenant_actor_can(p_tenant,ARRAY['tenant_admin','learning_manager'])
 THEN RAISE EXCEPTION 'setting proposal forbidden' USING ERRCODE='42501'; END IF;
 IF NOT trainlive.lms_tenant_setting_valid(p_key,p_value)
 THEN RAISE EXCEPTION 'invalid tenant setting value' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM trainlive.organization o LEFT JOIN trainlive.lms_tenant_profile t
 ON t.organization_id=o.id WHERE o.id=p_tenant AND COALESCE(t.status,'active')<>'suspended'
 FOR UPDATE OF o;
 IF NOT FOUND THEN RAISE EXCEPTION 'tenant unavailable' USING ERRCODE='42501'; END IF;
 SELECT setting_value,revision INTO v_current,v_revision FROM trainlive.lms_tenant_setting
 WHERE organization_id=p_tenant AND setting_key=p_key;
 v_revision:=COALESCE(v_revision,0);
 IF v_current IS NOT DISTINCT FROM p_value THEN
  RETURN jsonb_build_object('status','no_change','key',p_key,'revision',v_revision);
 END IF;
 INSERT INTO trainlive.lms_tenant_setting_request(
  organization_id,setting_key,requested_value,base_revision,requested_by)
 VALUES(p_tenant,p_key,p_value,v_revision,trainlive.claim_staff())
 RETURNING id,status INTO v_id,v_status;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'tenant_admin',trainlive.claim_class(),
  'lms.setting.propose',p_key,
  jsonb_build_object('tenantId',p_tenant,'requestId',v_id,
   'requestedValue',p_value,'baseRevision',v_revision));
 RETURN jsonb_build_object('id',v_id,'key',p_key,'status',v_status,'baseRevision',v_revision);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_setting_propose(uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_tenant_setting_propose(uuid,text,jsonb) TO trainlive_app;

CREATE FUNCTION trainlive.lms_tenant_setting_queue(p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_queue jsonb;
BEGIN
 IF NOT trainlive.lms_tenant_actor_can(p_tenant,ARRAY['tenant_admin'])
 THEN RAISE EXCEPTION 'setting approval queue forbidden' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'id',q.id,'key',q.setting_key,'value',q.requested_value,
  'baseRevision',q.base_revision,'requestedBy',q.requested_by,
  'requesterEmail',u.email,'requestedAt',q.requested_at,'status',q.status,
  'canApprove',q.requested_by<>trainlive.claim_staff())
  ORDER BY q.requested_at),'[]'::jsonb) INTO v_queue
 FROM trainlive.lms_tenant_setting_request q
 JOIN trainlive.staff_user u ON u.id=q.requested_by
 WHERE q.organization_id=p_tenant AND q.status='pending';
 RETURN jsonb_build_object('tenantId',p_tenant,'requests',v_queue);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_setting_queue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_tenant_setting_queue(uuid) TO trainlive_app;

CREATE FUNCTION trainlive.lms_tenant_setting_review(
 p_tenant uuid,p_request uuid,p_decision text,p_note text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_request trainlive.lms_tenant_setting_request%ROWTYPE;
 v_current_revision bigint;v_applied jsonb;
BEGIN
 IF NOT trainlive.lms_tenant_actor_can(p_tenant,ARRAY['tenant_admin'])
 THEN RAISE EXCEPTION 'setting approval forbidden' USING ERRCODE='42501'; END IF;
 IF p_decision NOT IN ('approve','reject') OR p_note IS NULL OR length(p_note)>500
 THEN RAISE EXCEPTION 'invalid approval decision' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM trainlive.organization WHERE id=p_tenant FOR UPDATE;
 SELECT * INTO v_request FROM trainlive.lms_tenant_setting_request
 WHERE id=p_request AND organization_id=p_tenant FOR UPDATE;
 IF NOT FOUND OR v_request.status<>'pending'
 THEN RAISE EXCEPTION 'pending setting request not found' USING ERRCODE='42501'; END IF;
 IF v_request.requested_by=trainlive.claim_staff()
 THEN RAISE EXCEPTION 'maker cannot approve own parameter request' USING ERRCODE='42501'; END IF;
 SELECT revision INTO v_current_revision FROM trainlive.lms_tenant_setting
 WHERE organization_id=p_tenant AND setting_key=v_request.setting_key;
 v_current_revision:=COALESCE(v_current_revision,0);
 IF v_current_revision<>v_request.base_revision THEN
  UPDATE trainlive.lms_tenant_setting_request SET status='stale',
   reviewed_by=trainlive.claim_staff(),reviewed_at=now(),
   review_note='Base revision changed; submit a new request.'
  WHERE id=p_request;
  INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
  VALUES(trainlive.claim_staff(),'tenant_admin',trainlive.claim_class(),
   'lms.setting.stale',v_request.setting_key,
   jsonb_build_object('tenantId',p_tenant,'requestId',p_request,
    'expectedRevision',v_request.base_revision,'currentRevision',v_current_revision));
  RETURN jsonb_build_object('id',p_request,'status','stale');
 END IF;
 IF p_decision='approve' THEN
  v_applied:=trainlive.lms_tenant_setting_apply(p_tenant,v_request.setting_key,v_request.requested_value);
  UPDATE trainlive.lms_tenant_setting_request SET status='approved',
   reviewed_by=trainlive.claim_staff(),reviewed_at=now(),review_note=btrim(p_note),
   applied_revision=(v_applied->>'revision')::bigint WHERE id=p_request;
 ELSE
  UPDATE trainlive.lms_tenant_setting_request SET status='rejected',
   reviewed_by=trainlive.claim_staff(),reviewed_at=now(),review_note=btrim(p_note)
  WHERE id=p_request;
 END IF;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'tenant_admin',trainlive.claim_class(),
  'lms.setting.'||p_decision,v_request.setting_key,
  jsonb_build_object('tenantId',p_tenant,'requestId',p_request,
   'makerId',v_request.requested_by,'note',btrim(p_note),
   'appliedRevision',CASE WHEN p_decision='approve' THEN v_applied->'revision' ELSE NULL END));
 RETURN jsonb_build_object('id',p_request,'status',CASE WHEN p_decision='approve' THEN 'approved' ELSE 'rejected' END,
  'appliedRevision',CASE WHEN p_decision='approve' THEN v_applied->'revision' ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_setting_review(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_tenant_setting_review(uuid,uuid,text,text) TO trainlive_app;

CREATE FUNCTION trainlive.lms_tenant_setting_request_rollback(
 p_tenant uuid,p_key text,p_revision bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_value jsonb;
BEGIN
 IF NOT trainlive.lms_tenant_actor_can(p_tenant,ARRAY['tenant_admin','learning_manager'])
 THEN RAISE EXCEPTION 'setting rollback proposal forbidden' USING ERRCODE='42501'; END IF;
 IF p_revision IS NULL OR p_revision<1 THEN
  RAISE EXCEPTION 'invalid revision' USING ERRCODE='22023'; END IF;
 SELECT new_value INTO v_value FROM trainlive.lms_tenant_setting_revision
 WHERE organization_id=p_tenant AND setting_key=p_key AND revision=p_revision;
 IF NOT FOUND THEN RAISE EXCEPTION 'setting revision not found' USING ERRCODE='42501'; END IF;
 RETURN trainlive.lms_tenant_setting_propose(p_tenant,p_key,v_value);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_setting_request_rollback(uuid,text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_tenant_setting_request_rollback(uuid,text,bigint) TO trainlive_app;

CREATE FUNCTION trainlive.lms_tenant_settings_read(p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_settings jsonb;v_revisions jsonb;
BEGIN
 IF NOT trainlive.lms_tenant_actor_can(p_tenant,ARRAY['tenant_admin','learning_manager','course_author','viewer'])
 THEN RAISE EXCEPTION 'tenant settings read forbidden' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(jsonb_object_agg(setting_key,setting_value),'{}'::jsonb),
  COALESCE(jsonb_object_agg(setting_key,revision),'{}'::jsonb)
 INTO v_settings,v_revisions FROM trainlive.lms_tenant_setting WHERE organization_id=p_tenant;
 RETURN jsonb_build_object('organizationId',p_tenant,'settings',v_settings,'revisions',v_revisions);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_settings_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_tenant_settings_read(uuid) TO trainlive_app;

-- Runtime callers must not bypass maker-checker with the legacy direct-write
-- or direct-rollback functions. SECURITY DEFINER internal rollback helpers
-- remain usable by their owner; HTTP routes are switched to proposal APIs.
REVOKE EXECUTE ON FUNCTION trainlive.lms_admin_set_tenant_setting(uuid,text,jsonb) FROM trainlive_app;
REVOKE EXECUTE ON FUNCTION trainlive.lms_admin_set_scoped_setting(uuid,uuid,text,jsonb) FROM trainlive_app;
REVOKE EXECUTE ON FUNCTION trainlive.lms_admin_rollback_setting(uuid,text,bigint) FROM trainlive_app;
REVOKE EXECUTE ON FUNCTION trainlive.lms_admin_rollback_scoped_setting(uuid,uuid,text,bigint) FROM trainlive_app;

-- White-label values are safe display metadata only. The public join-code
-- endpoint returns no tenant IDs, membership, participant or course details.
CREATE FUNCTION trainlive.public_class_branding_v2(p_code text)
RETURNS TABLE(client_name text,training_title text,logo_url text,primary_color text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
 SELECT
  CASE WHEN c.client_name='PT Bank Pembangunan Daerah Sulawesi Tengah'
   THEN o.name ELSE c.client_name END,
  c.training_title,
  NULLIF((SELECT s.setting_value#>>'{}' FROM trainlive.lms_tenant_setting s
   WHERE s.organization_id=o.id AND s.setting_key='branding.logo_url'),''),
  NULLIF((SELECT s.setting_value#>>'{}' FROM trainlive.lms_tenant_setting s
   WHERE s.organization_id=o.id AND s.setting_key='branding.primary_color'),'')
 FROM trainlive.class_session c
 JOIN trainlive.program p ON p.id=c.program_id
 JOIN trainlive.organization o ON o.id=p.organization_id
 WHERE p_code ~ '^[A-HJ-NP-Z2-9]{6}$' AND c.join_code=p_code
  AND c.status IN ('scheduled','live')
  AND now() BETWEEN c.join_open_from AND c.join_open_until
 LIMIT 1
$$;
REVOKE ALL ON FUNCTION trainlive.public_class_branding_v2(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.public_class_branding_v2(text) TO trainlive_app;

CREATE FUNCTION trainlive.lms_learner_class_branding(p_class uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
 IF p_class IS DISTINCT FROM trainlive.claim_class()
  OR trainlive.claim_participant() IS NULL
  OR NOT EXISTS(SELECT 1 FROM trainlive.participant p
   WHERE p.class_id=p_class AND p.id=trainlive.claim_participant())
 THEN RAISE EXCEPTION 'learner branding forbidden' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object(
  'clientName',CASE WHEN c.client_name='PT Bank Pembangunan Daerah Sulawesi Tengah'
   THEN o.name ELSE c.client_name END,
  'trainingTitle',c.training_title,
  'logoUrl',NULLIF((SELECT s.setting_value#>>'{}' FROM trainlive.lms_tenant_setting s
   WHERE s.organization_id=o.id AND s.setting_key='branding.logo_url'),''),
  'primaryColor',NULLIF((SELECT s.setting_value#>>'{}' FROM trainlive.lms_tenant_setting s
   WHERE s.organization_id=o.id AND s.setting_key='branding.primary_color'),'')
 ) INTO v_result
 FROM trainlive.class_session c JOIN trainlive.program p ON p.id=c.program_id
 JOIN trainlive.organization o ON o.id=p.organization_id WHERE c.id=p_class;
 IF v_result IS NULL THEN RAISE EXCEPTION 'class not found' USING ERRCODE='42501'; END IF;
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_learner_class_branding(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_learner_class_branding(uuid) TO trainlive_app;


CREATE FUNCTION trainlive.lms_staff_class_branding(p_class uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=trainlive,pg_temp AS $
DECLARE v_result jsonb;
BEGIN
 IF p_class IS DISTINCT FROM trainlive.claim_class()
  OR trainlive.claim_staff() IS NULL
  OR NOT EXISTS(SELECT 1 FROM trainlive.class_staff s
   WHERE s.class_id=p_class AND s.user_id=trainlive.claim_staff())
 THEN RAISE EXCEPTION 'staff branding forbidden' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object(
  'clientName',CASE WHEN c.client_name='PT Bank Pembangunan Daerah Sulawesi Tengah'
   THEN o.name ELSE c.client_name END,
  'trainingTitle',c.training_title,
  'logoUrl',NULLIF((SELECT s.setting_value#>>'{}' FROM trainlive.lms_tenant_setting s
   WHERE s.organization_id=o.id AND s.setting_key='branding.logo_url'),''),
  'primaryColor',NULLIF((SELECT s.setting_value#>>'{}' FROM trainlive.lms_tenant_setting s
   WHERE s.organization_id=o.id AND s.setting_key='branding.primary_color'),'')
 ) INTO v_result
 FROM trainlive.class_session c JOIN trainlive.program p ON p.id=c.program_id
 JOIN trainlive.organization o ON o.id=p.organization_id WHERE c.id=p_class;
 IF v_result IS NULL THEN RAISE EXCEPTION 'class not found' USING ERRCODE='42501'; END IF;
 RETURN v_result;
END $;
REVOKE ALL ON FUNCTION trainlive.lms_staff_class_branding(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_staff_class_branding(uuid) TO trainlive_app;

COMMIT;
)))
   OR (p_key='learning.default_passing_grade' AND
    (jsonb_typeof(p_value)<>'number' OR (p_value#>>'{}') !~ '^[0-9]{1,3}$'
     OR (p_value#>>'{}')::integer NOT BETWEEN 0 AND 100))
   OR (p_key IN ('learning.default_sequential','certificate.enabled')
    AND jsonb_typeof(p_value)<>'boolean')
   OR (p_key='learning.default_delivery_mode' AND
    (jsonb_typeof(p_value)<>'string' OR (p_value#>>'{}') NOT IN ('live','self_paced','blended')))
   OR (p_key='certificate.issuer_name' AND
    (jsonb_typeof(p_value)<>'string' OR length(btrim(p_value#>>'{}')) NOT BETWEEN 2 AND 160
     OR (p_value#>>'{}') ~ '[[:cntrl:]<>]'))
   OR (p_key='certificate.enabled' AND p_value<>'false'::jsonb)
  ),false)
$$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_setting_valid(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_tenant_setting_valid(text,jsonb) TO trainlive_app;

CREATE FUNCTION trainlive.lms_tenant_setting_apply(
 p_tenant uuid,p_key text,p_value jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_revision bigint;v_previous jsonb;
BEGIN
 IF NOT trainlive.lms_tenant_setting_valid(p_key,p_value)
 THEN RAISE EXCEPTION 'invalid tenant setting value' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM trainlive.organization WHERE id=p_tenant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'tenant missing' USING ERRCODE='42501'; END IF;
 SELECT setting_value INTO v_previous FROM trainlive.lms_tenant_setting
 WHERE organization_id=p_tenant AND setting_key=p_key;
 INSERT INTO trainlive.lms_tenant_setting(organization_id,setting_key,setting_value,updated_by)
 VALUES(p_tenant,p_key,p_value,trainlive.claim_staff())
 ON CONFLICT(organization_id,setting_key) DO UPDATE SET
 setting_value=EXCLUDED.setting_value,updated_by=EXCLUDED.updated_by,
 updated_at=now(),revision=trainlive.lms_tenant_setting.revision+1
 RETURNING revision INTO v_revision;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),
  CASE WHEN EXISTS(SELECT 1 FROM trainlive.staff_user WHERE id=trainlive.claim_staff() AND is_super_admin)
   THEN 'super_admin' ELSE 'tenant_admin' END,
  trainlive.claim_class(),'lms.setting.approved',p_key,
  jsonb_build_object('tenantId',p_tenant,'previousValue',v_previous,
   'newValue',p_value,'revision',v_revision));
 RETURN jsonb_build_object('key',p_key,'value',p_value,'revision',v_revision);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_setting_apply(uuid,text,jsonb) FROM PUBLIC,trainlive_app;

CREATE FUNCTION trainlive.lms_tenant_setting_propose(
 p_tenant uuid,p_key text,p_value jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_revision bigint;v_id uuid;v_current jsonb;v_status text;
BEGIN
 IF NOT trainlive.lms_tenant_actor_can(p_tenant,ARRAY['tenant_admin','learning_manager'])
 THEN RAISE EXCEPTION 'setting proposal forbidden' USING ERRCODE='42501'; END IF;
 IF NOT trainlive.lms_tenant_setting_valid(p_key,p_value)
 THEN RAISE EXCEPTION 'invalid tenant setting value' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM trainlive.organization o LEFT JOIN trainlive.lms_tenant_profile t
 ON t.organization_id=o.id WHERE o.id=p_tenant AND COALESCE(t.status,'active')<>'suspended'
 FOR UPDATE OF o;
 IF NOT FOUND THEN RAISE EXCEPTION 'tenant unavailable' USING ERRCODE='42501'; END IF;
 SELECT setting_value,revision INTO v_current,v_revision FROM trainlive.lms_tenant_setting
 WHERE organization_id=p_tenant AND setting_key=p_key;
 v_revision:=COALESCE(v_revision,0);
 IF v_current IS NOT DISTINCT FROM p_value THEN
  RETURN jsonb_build_object('status','no_change','key',p_key,'revision',v_revision);
 END IF;
 INSERT INTO trainlive.lms_tenant_setting_request(
  organization_id,setting_key,requested_value,base_revision,requested_by)
 VALUES(p_tenant,p_key,p_value,v_revision,trainlive.claim_staff())
 RETURNING id,status INTO v_id,v_status;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'tenant_admin',trainlive.claim_class(),
  'lms.setting.propose',p_key,
  jsonb_build_object('tenantId',p_tenant,'requestId',v_id,
   'requestedValue',p_value,'baseRevision',v_revision));
 RETURN jsonb_build_object('id',v_id,'key',p_key,'status',v_status,'baseRevision',v_revision);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_setting_propose(uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_tenant_setting_propose(uuid,text,jsonb) TO trainlive_app;

CREATE FUNCTION trainlive.lms_tenant_setting_queue(p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_queue jsonb;
BEGIN
 IF NOT trainlive.lms_tenant_actor_can(p_tenant,ARRAY['tenant_admin'])
 THEN RAISE EXCEPTION 'setting approval queue forbidden' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'id',q.id,'key',q.setting_key,'value',q.requested_value,
  'baseRevision',q.base_revision,'requestedBy',q.requested_by,
  'requesterEmail',u.email,'requestedAt',q.requested_at,'status',q.status)
  ORDER BY q.requested_at),'[]'::jsonb) INTO v_queue
 FROM trainlive.lms_tenant_setting_request q
 JOIN trainlive.staff_user u ON u.id=q.requested_by
 WHERE q.organization_id=p_tenant AND q.status='pending';
 RETURN jsonb_build_object('tenantId',p_tenant,'requests',v_queue);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_setting_queue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_tenant_setting_queue(uuid) TO trainlive_app;

CREATE FUNCTION trainlive.lms_tenant_setting_review(
 p_tenant uuid,p_request uuid,p_decision text,p_note text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_request trainlive.lms_tenant_setting_request%ROWTYPE;
 v_current_revision bigint;v_applied jsonb;
BEGIN
 IF NOT trainlive.lms_tenant_actor_can(p_tenant,ARRAY['tenant_admin'])
 THEN RAISE EXCEPTION 'setting approval forbidden' USING ERRCODE='42501'; END IF;
 IF p_decision NOT IN ('approve','reject') OR p_note IS NULL OR length(p_note)>500
 THEN RAISE EXCEPTION 'invalid approval decision' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM trainlive.organization WHERE id=p_tenant FOR UPDATE;
 SELECT * INTO v_request FROM trainlive.lms_tenant_setting_request
 WHERE id=p_request AND organization_id=p_tenant FOR UPDATE;
 IF NOT FOUND OR v_request.status<>'pending'
 THEN RAISE EXCEPTION 'pending setting request not found' USING ERRCODE='42501'; END IF;
 IF v_request.requested_by=trainlive.claim_staff()
 THEN RAISE EXCEPTION 'maker cannot approve own parameter request' USING ERRCODE='42501'; END IF;
 SELECT revision INTO v_current_revision FROM trainlive.lms_tenant_setting
 WHERE organization_id=p_tenant AND setting_key=v_request.setting_key;
 v_current_revision:=COALESCE(v_current_revision,0);
 IF v_current_revision<>v_request.base_revision THEN
  UPDATE trainlive.lms_tenant_setting_request SET status='stale',
   reviewed_by=trainlive.claim_staff(),reviewed_at=now(),
   review_note='Base revision changed; submit a new request.'
  WHERE id=p_request;
  INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
  VALUES(trainlive.claim_staff(),'tenant_admin',trainlive.claim_class(),
   'lms.setting.stale',v_request.setting_key,
   jsonb_build_object('tenantId',p_tenant,'requestId',p_request,
    'expectedRevision',v_request.base_revision,'currentRevision',v_current_revision));
  RETURN jsonb_build_object('id',p_request,'status','stale');
 END IF;
 IF p_decision='approve' THEN
  v_applied:=trainlive.lms_tenant_setting_apply(p_tenant,v_request.setting_key,v_request.requested_value);
  UPDATE trainlive.lms_tenant_setting_request SET status='approved',
   reviewed_by=trainlive.claim_staff(),reviewed_at=now(),review_note=btrim(p_note),
   applied_revision=(v_applied->>'revision')::bigint WHERE id=p_request;
 ELSE
  UPDATE trainlive.lms_tenant_setting_request SET status='rejected',
   reviewed_by=trainlive.claim_staff(),reviewed_at=now(),review_note=btrim(p_note)
  WHERE id=p_request;
 END IF;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'tenant_admin',trainlive.claim_class(),
  'lms.setting.'||p_decision,v_request.setting_key,
  jsonb_build_object('tenantId',p_tenant,'requestId',p_request,
   'makerId',v_request.requested_by,'note',btrim(p_note),
   'appliedRevision',CASE WHEN p_decision='approve' THEN v_applied->'revision' ELSE NULL END));
 RETURN jsonb_build_object('id',p_request,'status',CASE WHEN p_decision='approve' THEN 'approved' ELSE 'rejected' END,
  'appliedRevision',CASE WHEN p_decision='approve' THEN v_applied->'revision' ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_setting_review(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_tenant_setting_review(uuid,uuid,text,text) TO trainlive_app;

CREATE FUNCTION trainlive.lms_tenant_setting_request_rollback(
 p_tenant uuid,p_key text,p_revision bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_value jsonb;
BEGIN
 IF NOT trainlive.lms_tenant_actor_can(p_tenant,ARRAY['tenant_admin','learning_manager'])
 THEN RAISE EXCEPTION 'setting rollback proposal forbidden' USING ERRCODE='42501'; END IF;
 IF p_revision IS NULL OR p_revision<1 THEN
  RAISE EXCEPTION 'invalid revision' USING ERRCODE='22023'; END IF;
 SELECT new_value INTO v_value FROM trainlive.lms_tenant_setting_revision
 WHERE organization_id=p_tenant AND setting_key=p_key AND revision=p_revision;
 IF NOT FOUND THEN RAISE EXCEPTION 'setting revision not found' USING ERRCODE='42501'; END IF;
 RETURN trainlive.lms_tenant_setting_propose(p_tenant,p_key,v_value);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_setting_request_rollback(uuid,text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_tenant_setting_request_rollback(uuid,text,bigint) TO trainlive_app;

CREATE FUNCTION trainlive.lms_tenant_settings_read(p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_settings jsonb;v_revisions jsonb;
BEGIN
 IF NOT trainlive.lms_tenant_actor_can(p_tenant,ARRAY['tenant_admin','learning_manager','course_author','viewer'])
 THEN RAISE EXCEPTION 'tenant settings read forbidden' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(jsonb_object_agg(setting_key,setting_value),'{}'::jsonb),
  COALESCE(jsonb_object_agg(setting_key,revision),'{}'::jsonb)
 INTO v_settings,v_revisions FROM trainlive.lms_tenant_setting WHERE organization_id=p_tenant;
 RETURN jsonb_build_object('organizationId',p_tenant,'settings',v_settings,'revisions',v_revisions);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_tenant_settings_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_tenant_settings_read(uuid) TO trainlive_app;

-- Runtime callers must not bypass maker-checker with the legacy direct-write
-- or direct-rollback functions. SECURITY DEFINER internal rollback helpers
-- remain usable by their owner; HTTP routes are switched to proposal APIs.
REVOKE EXECUTE ON FUNCTION trainlive.lms_admin_set_tenant_setting(uuid,text,jsonb) FROM trainlive_app;
REVOKE EXECUTE ON FUNCTION trainlive.lms_admin_set_scoped_setting(uuid,uuid,text,jsonb) FROM trainlive_app;
REVOKE EXECUTE ON FUNCTION trainlive.lms_admin_rollback_setting(uuid,text,bigint) FROM trainlive_app;
REVOKE EXECUTE ON FUNCTION trainlive.lms_admin_rollback_scoped_setting(uuid,uuid,text,bigint) FROM trainlive_app;

-- White-label values are safe display metadata only. The public join-code
-- endpoint returns no tenant IDs, membership, participant or course details.
CREATE FUNCTION trainlive.public_class_branding_v2(p_code text)
RETURNS TABLE(client_name text,training_title text,logo_url text,primary_color text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
 SELECT
  CASE WHEN c.client_name='PT Bank Pembangunan Daerah Sulawesi Tengah'
   THEN o.name ELSE c.client_name END,
  c.training_title,
  NULLIF((SELECT s.setting_value#>>'{}' FROM trainlive.lms_tenant_setting s
   WHERE s.organization_id=o.id AND s.setting_key='branding.logo_url'),''),
  NULLIF((SELECT s.setting_value#>>'{}' FROM trainlive.lms_tenant_setting s
   WHERE s.organization_id=o.id AND s.setting_key='branding.primary_color'),'')
 FROM trainlive.class_session c
 JOIN trainlive.program p ON p.id=c.program_id
 JOIN trainlive.organization o ON o.id=p.organization_id
 WHERE p_code ~ '^[A-HJ-NP-Z2-9]{6}$' AND c.join_code=p_code
  AND c.status IN ('scheduled','live')
  AND now() BETWEEN c.join_open_from AND c.join_open_until
 LIMIT 1
$$;
REVOKE ALL ON FUNCTION trainlive.public_class_branding_v2(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.public_class_branding_v2(text) TO trainlive_app;

CREATE FUNCTION trainlive.lms_learner_class_branding(p_class uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
 IF p_class IS DISTINCT FROM trainlive.claim_class()
  OR trainlive.claim_participant() IS NULL
  OR NOT EXISTS(SELECT 1 FROM trainlive.participant p
   WHERE p.class_id=p_class AND p.id=trainlive.claim_participant())
 THEN RAISE EXCEPTION 'learner branding forbidden' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object(
  'clientName',CASE WHEN c.client_name='PT Bank Pembangunan Daerah Sulawesi Tengah'
   THEN o.name ELSE c.client_name END,
  'trainingTitle',c.training_title,
  'logoUrl',NULLIF((SELECT s.setting_value#>>'{}' FROM trainlive.lms_tenant_setting s
   WHERE s.organization_id=o.id AND s.setting_key='branding.logo_url'),''),
  'primaryColor',NULLIF((SELECT s.setting_value#>>'{}' FROM trainlive.lms_tenant_setting s
   WHERE s.organization_id=o.id AND s.setting_key='branding.primary_color'),'')
 ) INTO v_result
 FROM trainlive.class_session c JOIN trainlive.program p ON p.id=c.program_id
 JOIN trainlive.organization o ON o.id=p.organization_id WHERE c.id=p_class;
 IF v_result IS NULL THEN RAISE EXCEPTION 'class not found' USING ERRCODE='42501'; END IF;
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_learner_class_branding(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_learner_class_branding(uuid) TO trainlive_app;

COMMIT;
