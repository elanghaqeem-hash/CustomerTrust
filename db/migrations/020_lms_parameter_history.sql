-- LMS P1.4: immutable tenant-setting revision history and controlled rollback.
-- Additive: no participant, class or published content mutation.
BEGIN;
CREATE TABLE trainlive.lms_tenant_setting_revision (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES trainlive.organization(id),
 setting_key text NOT NULL CHECK(setting_key ~ '^[a-z][a-z0-9_.]{2,63}$'),
 revision bigint NOT NULL CHECK(revision>0),
 previous_value jsonb,
 new_value jsonb NOT NULL,
 actor_id uuid NOT NULL REFERENCES trainlive.staff_user(id),
 class_id uuid REFERENCES trainlive.class_session(id),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,setting_key,revision)
);
CREATE INDEX lms_tenant_setting_revision_latest
 ON trainlive.lms_tenant_setting_revision(organization_id,setting_key,revision DESC);
ALTER TABLE trainlive.lms_tenant_setting_revision ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON trainlive.lms_tenant_setting_revision FROM PUBLIC,trainlive_app;
-- Preserve the present snapshot for installations where 018 was already tested.
-- No historical versions can be reconstructed before 020.
INSERT INTO trainlive.lms_tenant_setting_revision(
 organization_id,setting_key,revision,previous_value,new_value,actor_id,recorded_at)
 SELECT organization_id,setting_key,revision,NULL,setting_value,updated_by,updated_at
 FROM trainlive.lms_tenant_setting;

CREATE FUNCTION trainlive.lms_record_setting_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
BEGIN
 INSERT INTO trainlive.lms_tenant_setting_revision(
  organization_id,setting_key,revision,previous_value,new_value,actor_id,class_id)
 VALUES(NEW.organization_id,NEW.setting_key,NEW.revision,
  CASE WHEN TG_OP='UPDATE' THEN OLD.setting_value ELSE NULL END,
  NEW.setting_value,NEW.updated_by,trainlive.claim_class());
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_record_setting_revision() FROM PUBLIC;
CREATE TRIGGER lms_tenant_setting_record AFTER INSERT OR UPDATE ON trainlive.lms_tenant_setting
 FOR EACH ROW EXECUTE FUNCTION trainlive.lms_record_setting_revision();

-- Readback requires the same explicit class-assigned Super Admin as mutations.
CREATE FUNCTION trainlive.lms_admin_setting_history(p_class uuid,p_key text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_org uuid;v_history jsonb;
BEGIN
 IF p_class IS DISTINCT FROM trainlive.claim_class() OR NOT trainlive.can_create_class()
 THEN RAISE EXCEPTION 'setting history forbidden' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR p_key !~ '^[a-z][a-z0-9_.]{2,63}$'
 THEN RAISE EXCEPTION 'invalid setting key' USING ERRCODE='22023'; END IF;
 SELECT p.organization_id INTO v_org FROM trainlive.class_session s
 JOIN trainlive.program p ON p.id=s.program_id WHERE s.id=p_class;
 IF NOT FOUND THEN RAISE EXCEPTION 'class not found' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'revision',h.revision,'value',h.new_value,'at',h.recorded_at,
  'actorId',h.actor_id) ORDER BY h.revision DESC),'[]'::jsonb) INTO v_history
 FROM (SELECT revision,new_value,recorded_at,actor_id
  FROM trainlive.lms_tenant_setting_revision
  WHERE organization_id=v_org AND setting_key=p_key
  ORDER BY revision DESC LIMIT 30) h;
 RETURN jsonb_build_object('key',p_key,'history',v_history);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_admin_setting_history(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_admin_setting_history(uuid,text) TO trainlive_app;

CREATE FUNCTION trainlive.lms_admin_rollback_setting(p_class uuid,p_key text,p_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_org uuid;v_value jsonb;v_written jsonb;
BEGIN
 IF p_class IS DISTINCT FROM trainlive.claim_class() OR NOT trainlive.can_create_class()
 THEN RAISE EXCEPTION 'setting rollback forbidden' USING ERRCODE='42501'; END IF;
 IF p_revision IS NULL OR p_revision<1 OR p_key IS NULL
 THEN RAISE EXCEPTION 'invalid revision' USING ERRCODE='22023'; END IF;
 SELECT p.organization_id INTO v_org FROM trainlive.class_session s
 JOIN trainlive.program p ON p.id=s.program_id WHERE s.id=p_class;
 IF NOT FOUND THEN RAISE EXCEPTION 'class not found' USING ERRCODE='42501'; END IF;
 SELECT h.new_value INTO v_value FROM trainlive.lms_tenant_setting_revision h
 WHERE h.organization_id=v_org AND h.setting_key=p_key AND h.revision=p_revision;
 IF NOT FOUND THEN RAISE EXCEPTION 'revision not found in tenant' USING ERRCODE='42501'; END IF;
 -- Reuses the exact same allowlist, type checks and concurrency lock as writes.
 v_written:=trainlive.lms_admin_set_tenant_setting(p_class,p_key,v_value);
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'super_admin',p_class,'lms.setting.rollback',p_key,
 jsonb_build_object('organizationId',v_org,'restoredRevision',p_revision,
 'newRevision',v_written->'revision'));
 RETURN v_written || jsonb_build_object('restoredRevision',p_revision);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_admin_rollback_setting(uuid,text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_admin_rollback_setting(uuid,text,bigint) TO trainlive_app;
COMMIT;
