-- TrainLive 010: allow an explicitly promoted super admin, already assigned as
-- facilitator to an existing class, to clone ONLY published content into a new
-- isolated class. Participants, scores, attendance and responses are NEVER cloned.
-- All functions are private by default and callable only by the limited runtime role.
BEGIN;
CREATE FUNCTION trainlive.can_create_class()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=trainlive,pg_temp AS $$
 SELECT trainlive.claim_class() IS NOT NULL AND trainlive.claim_staff() IS NOT NULL
 AND EXISTS (
   SELECT 1 FROM trainlive.class_staff s
   JOIN trainlive.staff_user u ON u.id=s.user_id
   WHERE s.class_id=trainlive.claim_class()
     AND s.user_id=trainlive.claim_staff()
     AND s.role='facilitator'
     AND u.is_super_admin IS TRUE
 )
$$;
REVOKE ALL ON FUNCTION trainlive.can_create_class() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.can_create_class() TO trainlive_app;

CREATE FUNCTION trainlive.admin_create_class(
 p_source uuid,p_name text,p_batch text,p_day date,p_join_code text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=trainlive,pg_temp AS $$
DECLARE v_source trainlive.class_session%ROWTYPE;
 v_id uuid; v_start timestamptz; v_end timestamptz;
BEGIN
 IF NOT trainlive.can_create_class() OR p_source IS DISTINCT FROM trainlive.claim_class()
 THEN RAISE EXCEPTION 'class management forbidden' USING ERRCODE='42501'; END IF;
 IF p_name IS NULL OR length(btrim(p_name))<3 OR length(p_name)>160 OR
    p_batch IS NULL OR p_batch !~ '^[A-Za-z0-9_-]{1,32}$' OR
    p_join_code IS NULL OR p_join_code !~ '^[A-HJ-NP-Z2-9]{6}$' OR
    p_day IS NULL OR p_day < (now() AT TIME ZONE 'Asia/Makassar')::date OR
    p_day > (now() AT TIME ZONE 'Asia/Makassar')::date+365
 THEN RAISE EXCEPTION 'invalid class parameters' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_source FROM trainlive.class_session WHERE id=p_source;
 IF NOT FOUND THEN RAISE EXCEPTION 'source class not found' USING ERRCODE='42501'; END IF;
 IF (SELECT status FROM trainlive.content_version WHERE id=v_source.content_version_id)<>'published'
 THEN RAISE EXCEPTION 'content not published' USING ERRCODE='22023'; END IF;
 v_start:=(p_day+time '09:00') AT TIME ZONE 'Asia/Makassar';
 v_end:=(p_day+time '16:00') AT TIME ZONE 'Asia/Makassar';
 INSERT INTO trainlive.class_session(
   program_id,content_version_id,name,batch_no,start_at,end_at,timezone,
   join_code,join_open_from,join_open_until,capacity,status
 )
 VALUES(v_source.program_id,v_source.content_version_id,btrim(p_name),p_batch,
   v_start,v_end,'Asia/Makassar',p_join_code,v_start-interval '24 hours',
   v_end+interval '24 hours',v_source.capacity,'scheduled')
 RETURNING id INTO v_id;
 INSERT INTO trainlive.class_staff(class_id,user_id,role)
 VALUES(v_id,trainlive.claim_staff(),'facilitator');
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'super_admin',p_source,'class.create',v_id::text,
  jsonb_build_object('batch',p_batch,'date',p_day::text));
 RETURN jsonb_build_object('classId',v_id,'joinCode',p_join_code,'batch',p_batch,
   'date',p_day::text,'name',btrim(p_name),'capacity',v_source.capacity);
END $$;
REVOKE ALL ON FUNCTION trainlive.admin_create_class(uuid,text,text,date,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.admin_create_class(uuid,text,text,date,text) TO trainlive_app;
COMMIT;
