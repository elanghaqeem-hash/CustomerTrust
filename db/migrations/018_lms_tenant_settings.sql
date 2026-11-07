-- TrainLive LMS P2: tenant-scoped parameter registry.
-- Additive migration. No modification of existing class/participant data.
BEGIN;
CREATE TABLE trainlive.lms_tenant_setting (
 organization_id uuid NOT NULL REFERENCES trainlive.organization(id),
 setting_key text NOT NULL CHECK (setting_key ~ '^[a-z][a-z0-9_.]{2,63}$'),
 setting_value jsonb NOT NULL,
 updated_by uuid NOT NULL REFERENCES trainlive.staff_user(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id,setting_key),
 CHECK (jsonb_typeof(setting_value) IN ('string','number','boolean','object','array'))
);
ALTER TABLE trainlive.lms_tenant_setting ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON trainlive.lms_tenant_setting FROM PUBLIC,trainlive_app;

-- Explicit allowlist: arbitrary JSON keys cannot become security-sensitive configuration.
CREATE FUNCTION trainlive.lms_admin_set_tenant_setting(
 p_class uuid,p_key text,p_value jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=trainlive,pg_temp AS $$
DECLARE v_org uuid;
BEGIN
 IF p_class IS DISTINCT FROM trainlive.claim_class() OR NOT trainlive.can_create_class()
 THEN RAISE EXCEPTION 'LMS settings forbidden' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR p_key NOT IN (
  'branding.primary_color','branding.logo_url','learning.default_passing_grade',
  'learning.default_sequential','learning.default_delivery_mode',
  'certificate.enabled','certificate.issuer_name'
 ) OR p_value IS NULL OR length(p_value::text)>2048
 THEN RAISE EXCEPTION 'invalid LMS setting' USING ERRCODE='22023'; END IF;
 IF (p_key='branding.primary_color' AND
     (jsonb_typeof(p_value)<>'string' OR (p_value #>> '{}') !~ '^#[0-9A-Fa-f]{6}$'))
 OR (p_key='branding.logo_url' AND
     (jsonb_typeof(p_value)<>'string' OR length(p_value #>> '{}')>512
      OR (p_value #>> '{}') !~ '^https://[^[:space:]@<>]+$'))
 OR (p_key='learning.default_passing_grade' AND
     (jsonb_typeof(p_value)<>'number' OR (p_value #>> '{}') !~ '^[0-9]{1,3}$'
      OR (p_value #>> '{}')::integer NOT BETWEEN 0 AND 100))
 OR (p_key IN ('learning.default_sequential','certificate.enabled') AND
     jsonb_typeof(p_value)<>'boolean')
 OR (p_key='learning.default_delivery_mode' AND
     (jsonb_typeof(p_value)<>'string' OR (p_value #>> '{}') NOT IN ('live','self_paced','blended')))
 OR (p_key='certificate.issuer_name' AND
     (jsonb_typeof(p_value)<>'string' OR length(btrim(p_value #>> '{}')) NOT BETWEEN 2 AND 160
      OR (p_value #>> '{}') ~ '[[:cntrl:]<>]'))
 THEN RAISE EXCEPTION 'invalid LMS setting value' USING ERRCODE='22023'; END IF;
 SELECT p.organization_id INTO v_org FROM trainlive.class_session s
 JOIN trainlive.program p ON p.id=s.program_id WHERE s.id=p_class;
 IF v_org IS NULL THEN RAISE EXCEPTION 'class not found' USING ERRCODE='42501'; END IF;
 INSERT INTO trainlive.lms_tenant_setting(organization_id,setting_key,setting_value,updated_by)
 VALUES(v_org,p_key,p_value,trainlive.claim_staff())
 ON CONFLICT(organization_id,setting_key) DO UPDATE
 SET setting_value=EXCLUDED.setting_value,updated_by=EXCLUDED.updated_by,updated_at=now();
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'super_admin',p_class,'lms.setting.update',p_key,
 jsonb_build_object('organizationId',v_org));
 RETURN jsonb_build_object('key',p_key,'value',p_value);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_admin_set_tenant_setting(uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_admin_set_tenant_setting(uuid,text,jsonb) TO trainlive_app;

CREATE FUNCTION trainlive.lms_admin_get_tenant_settings(p_class uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=trainlive,pg_temp AS $$
DECLARE v_org uuid;v_settings jsonb;
BEGIN
 IF p_class IS DISTINCT FROM trainlive.claim_class() OR NOT trainlive.can_create_class()
 THEN RAISE EXCEPTION 'LMS settings forbidden' USING ERRCODE='42501'; END IF;
 SELECT p.organization_id INTO v_org FROM trainlive.class_session s
 JOIN trainlive.program p ON p.id=s.program_id WHERE s.id=p_class;
 IF v_org IS NULL THEN RAISE EXCEPTION 'class not found' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(jsonb_object_agg(setting_key,setting_value),'{}'::jsonb)
 INTO v_settings FROM trainlive.lms_tenant_setting WHERE organization_id=v_org;
 RETURN jsonb_build_object('organizationId',v_org,'settings',v_settings);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_admin_get_tenant_settings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_admin_get_tenant_settings(uuid) TO trainlive_app;
COMMIT;
