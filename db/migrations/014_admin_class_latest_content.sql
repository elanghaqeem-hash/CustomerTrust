-- TrainLive 014: Super Admin class creation uses the newest published content
-- version of the source class's program (e.g. CTC v2, deck revision 13) instead of
-- copying the source class's possibly older version. Signature, authorization,
-- validation and isolation are unchanged; participants and scores are never copied.
BEGIN;
CREATE OR REPLACE FUNCTION trainlive.admin_create_class(
 p_source uuid,p_name text,p_batch text,p_day date,p_join_code text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=trainlive,pg_temp AS $$
DECLARE v_source trainlive.class_session%ROWTYPE;
 v_version uuid; v_id uuid; v_start timestamptz; v_end timestamptz;
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
 -- New classes use the newest PUBLISHED content of the same program, never a draft.
 -- Existing classes keep their own immutable snapshot.
 SELECT v.id INTO v_version FROM trainlive.content_version v
  WHERE v.program_id=v_source.program_id AND v.status='published'
  ORDER BY v.version_no DESC LIMIT 1;
 IF v_version IS NULL
 THEN RAISE EXCEPTION 'content not published' USING ERRCODE='22023'; END IF;
 v_start:=(p_day+time '09:00') AT TIME ZONE 'Asia/Makassar';
 v_end:=(p_day+time '16:00') AT TIME ZONE 'Asia/Makassar';
 INSERT INTO trainlive.class_session(
   program_id,content_version_id,name,batch_no,start_at,end_at,timezone,
   join_code,join_open_from,join_open_until,capacity,status
 )
 VALUES(v_source.program_id,v_version,btrim(p_name),p_batch,
   v_start,v_end,'Asia/Makassar',p_join_code,v_start-interval '24 hours',
   v_end+interval '24 hours',v_source.capacity,'scheduled')
 RETURNING id INTO v_id;
 INSERT INTO trainlive.class_staff(class_id,user_id,role)
 VALUES(v_id,trainlive.claim_staff(),'facilitator');
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'super_admin',p_source,'class.create',v_id::text,
  jsonb_build_object('batch',p_batch,'date',p_day::text,'content_version_id',v_version));
 RETURN jsonb_build_object('classId',v_id,'joinCode',p_join_code,'batch',p_batch,
   'date',p_day::text,'name',btrim(p_name),'capacity',v_source.capacity);
END $$;
REVOKE ALL ON FUNCTION trainlive.admin_create_class(uuid,text,text,date,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.admin_create_class(uuid,text,text,date,text) TO trainlive_app;
COMMIT;
