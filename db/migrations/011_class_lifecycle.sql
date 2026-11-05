-- TrainLive 011: explicit, audited and class-scoped start/close transitions.
-- No reopening a closed session; no observer, participant or unassigned staff
-- may change status. This keeps newly created admin classes operable via web UI.
BEGIN;
CREATE FUNCTION trainlive.manage_class(p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=trainlive,pg_temp AS $$
DECLARE cid uuid:=trainlive.claim_class(); s trainlive.class_session%ROWTYPE;
BEGIN
 IF cid IS NULL OR trainlive.claim_staff() IS NULL OR
    NOT trainlive.staff_scope(cid,ARRAY['facilitator','cohost'])
 THEN RAISE EXCEPTION 'class management forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM trainlive.class_session WHERE id=cid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'class not found' USING ERRCODE='42501'; END IF;
 IF p_action='start' THEN
  IF s.status<>'scheduled' OR now()<s.join_open_from OR now()>s.join_open_until
  THEN RAISE EXCEPTION 'class cannot start at this time' USING ERRCODE='22023'; END IF;
  UPDATE trainlive.class_session SET status='live' WHERE id=cid;
 ELSIF p_action='close' THEN
  IF s.status<>'live' THEN RAISE EXCEPTION 'class not live' USING ERRCODE='22023'; END IF;
  UPDATE trainlive.class_session SET status='closed' WHERE id=cid;
 ELSE RAISE EXCEPTION 'unknown class action' USING ERRCODE='22023'; END IF;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'staff',cid,'class.'||p_action,cid::text,
        jsonb_build_object('previous_status',s.status));
 RETURN jsonb_build_object('classId',cid,'status',
        CASE WHEN p_action='start' THEN 'live' ELSE 'closed' END);
END $$;
REVOKE ALL ON FUNCTION trainlive.manage_class(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.manage_class(text) TO trainlive_app;
COMMIT;
