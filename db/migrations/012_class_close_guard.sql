-- TrainLive 012: class close is atomic with open item closure, and participant
-- submissions acquire a session share lock. This prevents late responses
-- from crossing a class close transaction, even when an item timer is unlimited.
BEGIN;
CREATE OR REPLACE FUNCTION trainlive.manage_class(p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=trainlive,pg_temp AS $$
DECLARE cid uuid:=trainlive.claim_class(); s trainlive.class_session%ROWTYPE; closed_count integer:=0;
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
  UPDATE trainlive.class_item SET state='closed',closed_at=now()
   WHERE class_id=cid AND state='open';
  GET DIAGNOSTICS closed_count=ROW_COUNT;
 ELSE RAISE EXCEPTION 'unknown class action' USING ERRCODE='22023'; END IF;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'staff',cid,'class.'||p_action,cid::text,
        jsonb_build_object('previous_status',s.status,'automatically_closed_items',closed_count));
 RETURN jsonb_build_object('classId',cid,'status',
        CASE WHEN p_action='start' THEN 'live' ELSE 'closed' END,
        'automaticallyClosedItems',closed_count);
END $$;

-- SECURITY DEFINER: the app role cannot lock/update class sessions directly.
-- The lock remains in place until the API transaction commits.
CREATE FUNCTION trainlive.lock_live_class_for_response()
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=trainlive,pg_temp AS $$
DECLARE s text; cid uuid:=trainlive.claim_class(); pid uuid:=trainlive.claim_participant();
BEGIN
 IF cid IS NULL OR pid IS NULL THEN RETURN false; END IF;
 SELECT status INTO s FROM trainlive.class_session
 WHERE id=cid FOR SHARE;
 IF s IS DISTINCT FROM 'live' THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM trainlive.participant WHERE class_id=cid AND id=pid);
END $$;
REVOKE ALL ON FUNCTION trainlive.lock_live_class_for_response() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lock_live_class_for_response() TO trainlive_app;
COMMIT;
