-- TrainLive 015: per-class client and training branding, controlled by Super Admin.
-- Existing Bank Sulteng classes retain their current labels; future classes can override.
-- No participant, score, content snapshot or identity tables are modified.
BEGIN;
ALTER TABLE trainlive.class_session
 ADD COLUMN client_name text NOT NULL DEFAULT 'PT Bank Pembangunan Daerah Sulawesi Tengah',
 ADD COLUMN training_title text NOT NULL DEFAULT 'Customer Trust Challenge';
ALTER TABLE trainlive.class_session
 ADD CONSTRAINT class_branding_text_valid CHECK (
   length(btrim(client_name)) BETWEEN 2 AND 160
   AND length(btrim(training_title)) BETWEEN 3 AND 160
   AND client_name !~ '[[:cntrl:]<>]'
   AND training_title !~ '[[:cntrl:]<>]'
 );

-- Only an assigned, pre-approved Super Admin may edit the current class.
-- No direct class_session UPDATE grants or RLS UPDATE policy are added.
CREATE FUNCTION trainlive.admin_update_class_branding(
 p_class uuid,p_client text,p_title text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=trainlive,pg_temp AS $$
DECLARE v_client text:=btrim(p_client);
 v_title text:=btrim(p_title);
BEGIN
 IF p_class IS DISTINCT FROM trainlive.claim_class() OR NOT trainlive.can_create_class()
 THEN RAISE EXCEPTION 'branding management forbidden' USING ERRCODE='42501'; END IF;
 IF v_client IS NULL OR length(v_client) NOT BETWEEN 2 AND 160 OR
    v_title IS NULL OR length(v_title) NOT BETWEEN 3 AND 160 OR
    v_client ~ '[[:cntrl:]<>]' OR v_title ~ '[[:cntrl:]<>]'
 THEN RAISE EXCEPTION 'invalid branding fields' USING ERRCODE='22023'; END IF;
 UPDATE trainlive.class_session SET client_name=v_client,training_title=v_title
 WHERE id=p_class;
 IF NOT FOUND THEN RAISE EXCEPTION 'class not found' USING ERRCODE='42501'; END IF;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'super_admin',p_class,'class.branding.update',p_class::text,
  jsonb_build_object('clientName',v_client,'trainingTitle',v_title));
 RETURN jsonb_build_object('classId',p_class,'clientName',v_client,'trainingTitle',v_title);
END $$;
REVOKE ALL ON FUNCTION trainlive.admin_update_class_branding(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.admin_update_class_branding(uuid,text,text) TO trainlive_app;

-- Keep the preexisting five-argument admin_create_class() contract intact
-- for legacy clients and UAT scripts while supporting new branded classes.
CREATE FUNCTION trainlive.admin_create_branded_class(
 p_source uuid,p_name text,p_batch text,p_day date,p_join_code text,
 p_client text,p_title text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=trainlive,pg_temp AS $$
DECLARE v_created jsonb;
 v_client text:=btrim(p_client);
 v_title text:=btrim(p_title);
 v_new uuid;
BEGIN
 IF p_source IS DISTINCT FROM trainlive.claim_class() OR NOT trainlive.can_create_class()
 THEN RAISE EXCEPTION 'class management forbidden' USING ERRCODE='42501'; END IF;
 IF v_client IS NULL OR length(v_client) NOT BETWEEN 2 AND 160 OR
    v_title IS NULL OR length(v_title) NOT BETWEEN 3 AND 160 OR
    v_client ~ '[[:cntrl:]<>]' OR v_title ~ '[[:cntrl:]<>]'
 THEN RAISE EXCEPTION 'invalid branding fields' USING ERRCODE='22023'; END IF;
 v_created:=trainlive.admin_create_class(p_source,p_name,p_batch,p_day,p_join_code);
 v_new:=(v_created->>'classId')::uuid;
 UPDATE trainlive.class_session SET client_name=v_client,training_title=v_title
 WHERE id=v_new;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'super_admin',p_source,'class.branding.create',v_new::text,
  jsonb_build_object('clientName',v_client,'trainingTitle',v_title));
 RETURN v_created || jsonb_build_object('clientName',v_client,'trainingTitle',v_title);
END $$;
REVOKE ALL ON FUNCTION trainlive.admin_create_branded_class(uuid,text,text,date,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.admin_create_branded_class(uuid,text,text,date,text,text,text) TO trainlive_app;

-- Public pre-join branding: only a valid, presently joinable class code can
-- reveal the two non-sensitive labels. Never disclose IDs, names or rosters.
CREATE FUNCTION trainlive.public_class_branding(p_code text)
RETURNS TABLE(client_name text,training_title text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
 SELECT c.client_name,c.training_title FROM trainlive.class_session c
 WHERE p_code ~ '^[A-HJ-NP-Z2-9]{6}$' AND c.join_code=p_code
   AND c.status IN ('scheduled','live')
   AND now() BETWEEN c.join_open_from AND c.join_open_until
 LIMIT 1;
$$;
REVOKE ALL ON FUNCTION trainlive.public_class_branding(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.public_class_branding(text) TO trainlive_app;
COMMIT;
