-- LMS P1: explicitly authorized parameter editing for newly onboarded tenants.
-- Never infer tenant authorization from a browser-supplied organization ID.
BEGIN;
CREATE FUNCTION trainlive.lms_admin_tenant_settings(p_class uuid,p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_settings jsonb;v_revisions jsonb;
BEGIN
 IF NOT trainlive.lms_admin_can_manage_tenant(p_class,p_tenant)
 THEN RAISE EXCEPTION 'tenant settings forbidden' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(jsonb_object_agg(setting_key,setting_value),'{}'::jsonb),
        COALESCE(jsonb_object_agg(setting_key,revision),'{}'::jsonb)
 INTO v_settings,v_revisions FROM trainlive.lms_tenant_setting WHERE organization_id=p_tenant;
 RETURN jsonb_build_object('organizationId',p_tenant,'settings',v_settings,'revisions',v_revisions);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_admin_tenant_settings(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_admin_tenant_settings(uuid,uuid) TO trainlive_app;

CREATE FUNCTION trainlive.lms_admin_set_scoped_setting(
 p_class uuid,p_tenant uuid,p_key text,p_value jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_previous jsonb;v_revision bigint;
BEGIN
 IF NOT trainlive.lms_admin_can_manage_tenant(p_class,p_tenant)
 THEN RAISE EXCEPTION 'tenant setting mutation forbidden' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR p_key NOT IN (
 'branding.primary_color','branding.logo_url','learning.default_passing_grade',
 'learning.default_sequential','learning.default_delivery_mode',
 'certificate.enabled','certificate.issuer_name')
 OR p_value IS NULL OR length(p_value::text)>2048
 THEN RAISE EXCEPTION 'invalid setting key or JSON' USING ERRCODE='22023'; END IF;
 IF (p_key='branding.primary_color' AND
    (jsonb_typeof(p_value)<>'string' OR (p_value#>>'{}') !~ '^#[0-9A-Fa-f]{6}$'))
 OR (p_key='branding.logo_url' AND
    (jsonb_typeof(p_value)<>'string' OR length(p_value#>>'{}')>512
     OR (p_value#>>'{}') !~ '^https://[^[:space:]@<>]+$'))
 OR (p_key='learning.default_passing_grade' AND
    (jsonb_typeof(p_value)<>'number' OR (p_value#>>'{}') !~ '^[0-9]{1,3}$'
     OR (p_value#>>'{}')::integer NOT BETWEEN 0 AND 100))
 OR (p_key IN ('learning.default_sequential','certificate.enabled') AND
    jsonb_typeof(p_value)<>'boolean')
 OR (p_key='learning.default_delivery_mode' AND
    (jsonb_typeof(p_value)<>'string' OR
     (p_value#>>'{}') NOT IN ('live','self_paced','blended')))
 OR (p_key='certificate.issuer_name' AND
    (jsonb_typeof(p_value)<>'string' OR
     length(btrim(p_value#>>'{}')) NOT BETWEEN 2 AND 160
     OR (p_value#>>'{}') ~ '[[:cntrl:]<>]'))
 OR (p_key='certificate.enabled' AND p_value<>'false'::jsonb)
 THEN RAISE EXCEPTION 'invalid setting value' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM trainlive.organization WHERE id=p_tenant FOR UPDATE;
 SELECT setting_value INTO v_previous FROM trainlive.lms_tenant_setting
 WHERE organization_id=p_tenant AND setting_key=p_key;
 INSERT INTO trainlive.lms_tenant_setting(organization_id,setting_key,setting_value,updated_by)
 VALUES(p_tenant,p_key,p_value,trainlive.claim_staff())
 ON CONFLICT(organization_id,setting_key) DO UPDATE
 SET setting_value=EXCLUDED.setting_value,updated_by=EXCLUDED.updated_by,
 updated_at=now(),revision=trainlive.lms_tenant_setting.revision+1
 RETURNING revision INTO v_revision;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'super_admin',p_class,'lms.setting.tenant_update',p_key,
 jsonb_build_object('tenantId',p_tenant,'previousValue',v_previous,
 'newValue',p_value,'revision',v_revision));
 RETURN jsonb_build_object('key',p_key,'value',p_value,'revision',v_revision);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_admin_set_scoped_setting(uuid,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_admin_set_scoped_setting(uuid,uuid,text,jsonb) TO trainlive_app;

CREATE FUNCTION trainlive.lms_admin_scoped_setting_history(
 p_class uuid,p_tenant uuid,p_key text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_history jsonb;
BEGIN
 IF NOT trainlive.lms_admin_can_manage_tenant(p_class,p_tenant)
 THEN RAISE EXCEPTION 'tenant setting history forbidden' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR p_key !~ '^[a-z][a-z0-9_.]{2,63}$'
 THEN RAISE EXCEPTION 'invalid setting key' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'revision',h.revision,'value',h.new_value,'at',h.recorded_at,
  'actorId',h.actor_id) ORDER BY h.revision DESC),'[]'::jsonb) INTO v_history
 FROM (SELECT revision,new_value,recorded_at,actor_id
       FROM trainlive.lms_tenant_setting_revision
       WHERE organization_id=p_tenant AND setting_key=p_key
       ORDER BY revision DESC LIMIT 30) h;
 RETURN jsonb_build_object('key',p_key,'history',v_history);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_admin_scoped_setting_history(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_admin_scoped_setting_history(uuid,uuid,text) TO trainlive_app;

CREATE FUNCTION trainlive.lms_admin_rollback_scoped_setting(
 p_class uuid,p_tenant uuid,p_key text,p_revision bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_value jsonb;v_result jsonb;
BEGIN
 IF NOT trainlive.lms_admin_can_manage_tenant(p_class,p_tenant)
 THEN RAISE EXCEPTION 'tenant setting rollback forbidden' USING ERRCODE='42501'; END IF;
 IF p_revision IS NULL OR p_revision<1 OR p_key IS NULL
 THEN RAISE EXCEPTION 'invalid setting revision' USING ERRCODE='22023'; END IF;
 SELECT new_value INTO v_value FROM trainlive.lms_tenant_setting_revision
 WHERE organization_id=p_tenant AND setting_key=p_key AND revision=p_revision;
 IF NOT FOUND THEN RAISE EXCEPTION 'setting revision not found' USING ERRCODE='42501'; END IF;
 v_result:=trainlive.lms_admin_set_scoped_setting(p_class,p_tenant,p_key,v_value);
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'super_admin',p_class,'lms.setting.tenant_rollback',p_key,
 jsonb_build_object('tenantId',p_tenant,'restoredRevision',p_revision,
 'newRevision',v_result->'revision'));
 RETURN v_result || jsonb_build_object('restoredRevision',p_revision);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_admin_rollback_scoped_setting(uuid,uuid,text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_admin_rollback_scoped_setting(uuid,uuid,text,bigint) TO trainlive_app;
COMMIT;
