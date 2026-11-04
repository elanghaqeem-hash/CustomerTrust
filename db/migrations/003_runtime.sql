-- TrainLive 003: trusted, class-scoped operations. Apply after 001 and 002.
-- Function owners must be migration roles (no untrusted EXECUTE grants).
BEGIN;
CREATE FUNCTION trainlive.join_class(p_code text,p_name text,p_unit text,p_email text,p_consent boolean)
RETURNS TABLE(class_id uuid,participant_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE c trainlive.class_session%ROWTYPE; pid uuid;
BEGIN
 IF NOT p_consent OR length(btrim(p_name))<2 OR length(btrim(p_unit))<2
    OR length(p_name)>100 OR length(p_unit)>100
    OR (p_email IS NOT NULL AND length(p_email)>254)
 THEN RAISE EXCEPTION 'join validation failed' USING ERRCODE='22023'; END IF;
 SELECT * INTO c FROM trainlive.class_session
 WHERE join_code=upper(btrim(p_code))
   AND status IN ('scheduled','live')
   AND now() BETWEEN join_open_from AND join_open_until
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'join unavailable' USING ERRCODE='22023'; END IF;
 IF (SELECT count(*) FROM trainlive.participant p WHERE p.class_id=c.id) >= c.capacity
 THEN RAISE EXCEPTION 'class full' USING ERRCODE='22023'; END IF;
 INSERT INTO trainlive.participant(class_id,display_name,unit,email,consent_at)
 VALUES(c.id,btrim(p_name),btrim(p_unit),nullif(btrim(coalesce(p_email,'')),''),now())
 RETURNING id INTO pid;
 INSERT INTO trainlive.attendance_log(class_id,participant_id,event) VALUES(c.id,pid,'join');
 class_id:=c.id;participant_id:=pid;RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION trainlive.join_class(text,text,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.join_class(text,text,text,text,boolean) TO trainlive_app;

-- Only an assigned facilitator/cohost may run an item. Reveal awards +10 once per correct answer.
CREATE FUNCTION trainlive.run_item(p_item_id uuid,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v trainlive.class_item%ROWTYPE; class_status text; award_count integer:=0;
BEGIN
 SELECT * INTO v FROM trainlive.class_item
 WHERE id=p_item_id AND class_id=trainlive.claim_class() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'item not found in class' USING ERRCODE='42501'; END IF;
 IF NOT trainlive.staff_scope(v.class_id,ARRAY['facilitator','cohost'])
 THEN RAISE EXCEPTION 'not assigned to class' USING ERRCODE='42501'; END IF;
 SELECT status INTO class_status FROM trainlive.class_session WHERE id=v.class_id;
 IF class_status <> 'live' THEN RAISE EXCEPTION 'class not live' USING ERRCODE='22023'; END IF;
 IF p_action='open' THEN
   IF v.state NOT IN ('idle','closed') THEN RAISE EXCEPTION 'invalid transition' USING ERRCODE='22023'; END IF;
   UPDATE trainlive.class_item SET state='open',opened_at=now(),closed_at=NULL WHERE id=v.id;
 ELSIF p_action='close' THEN
   IF v.state<>'open' THEN RAISE EXCEPTION 'invalid transition' USING ERRCODE='22023'; END IF;
   UPDATE trainlive.class_item SET state='closed',closed_at=now() WHERE id=v.id;
 ELSIF p_action='reveal' THEN
   IF v.state NOT IN ('closed','open','revealed') THEN RAISE EXCEPTION 'invalid transition' USING ERRCODE='22023'; END IF;
   UPDATE trainlive.class_item SET state='revealed',closed_at=COALESCE(closed_at,now()) WHERE id=v.id;
   IF v.type='single_choice' AND v.payload ? 'correct' THEN
     UPDATE trainlive.response r
       SET is_correct=(r.answer_json->>'choice'=v.payload->>'correct')
       WHERE r.class_id=v.class_id AND r.class_item_id=v.id;
     INSERT INTO trainlive.point_ledger(class_id,participant_id,points,reason,source_ref,event_key,awarded_by)
     SELECT r.class_id,r.participant_id,10,'quiz_correct',v.id,
       'quiz:'||v.id::text||':'||r.participant_id::text,trainlive.claim_staff()
     FROM trainlive.response r
     WHERE r.class_id=v.class_id AND r.class_item_id=v.id
       AND r.is_correct IS TRUE AND r.participant_id IS NOT NULL
     ON CONFLICT(class_id,event_key) DO NOTHING;
     GET DIAGNOSTICS award_count=ROW_COUNT;
   END IF;
 ELSE RAISE EXCEPTION 'unknown action' USING ERRCODE='22023'; END IF;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'facilitator/cohost',v.class_id,'item.'||p_action,
 v.id::text,jsonb_build_object('awards_inserted',award_count));
 RETURN jsonb_build_object('class_id',v.class_id,'item_id',v.id,'action',p_action,'awards_inserted',award_count);
END $$;
REVOKE ALL ON FUNCTION trainlive.run_item(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.run_item(uuid,text) TO trainlive_app;

-- Score one chat message exactly once; no duplication on retries.
CREATE FUNCTION trainlive.read_chat(p_message_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE m trainlive.chat_message%ROWTYPE;
BEGIN
 SELECT * INTO m FROM trainlive.chat_message
 WHERE id=p_message_id AND class_id=trainlive.claim_class() FOR UPDATE;
 IF NOT FOUND OR NOT trainlive.staff_scope(m.class_id,ARRAY['facilitator','cohost'])
 THEN RAISE EXCEPTION 'not authorized' USING ERRCODE='42501'; END IF;
 IF m.hidden THEN RAISE EXCEPTION 'hidden chat cannot be read aloud' USING ERRCODE='22023'; END IF;
 UPDATE trainlive.chat_message SET read_aloud=true WHERE id=m.id;
 INSERT INTO trainlive.point_ledger(class_id,participant_id,points,reason,source_ref,event_key,awarded_by)
 VALUES(m.class_id,m.participant_id,5,'chat_read_aloud',m.id,
        'chat:'||m.id::text,trainlive.claim_staff())
 ON CONFLICT(class_id,event_key) DO NOTHING;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target)
 VALUES(trainlive.claim_staff(),'facilitator/cohost',m.class_id,'chat.read_aloud',m.id::text);
 RETURN jsonb_build_object('message_id',m.id,'read_aloud',true);
END $$;
REVOKE ALL ON FUNCTION trainlive.read_chat(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.read_chat(uuid) TO trainlive_app;

-- Class-local Top 10; raw participant rows remain protected from other participants.
CREATE FUNCTION trainlive.top_ten()
RETURNS TABLE(participant_id uuid,display_name text,unit text,points bigint,correct_latency_ms bigint,rank_no bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
BEGIN
 IF trainlive.claim_class() IS NULL OR
   (trainlive.claim_participant() IS NULL AND NOT trainlive.assigned(trainlive.claim_class()))
 THEN RAISE EXCEPTION 'class token required' USING ERRCODE='42501'; END IF;
 RETURN QUERY
 SELECT x.participant_id,x.display_name,x.unit,x.points,x.correct_latency_ms,
   ROW_NUMBER() OVER(ORDER BY x.points DESC,x.correct_latency_ms ASC,x.joined_at ASC,x.participant_id) AS rank_no
 FROM (
  SELECT p.id AS participant_id,p.display_name,p.unit,p.joined_at,
   COALESCE((SELECT SUM(l.points) FROM trainlive.point_ledger l WHERE l.class_id=p.class_id AND l.participant_id=p.id),0)::bigint AS points,
   COALESCE((SELECT SUM(r.latency_ms) FROM trainlive.response r WHERE r.class_id=p.class_id AND r.participant_id=p.id AND r.is_correct IS TRUE),0)::bigint AS correct_latency_ms
  FROM trainlive.participant p WHERE p.class_id=trainlive.claim_class()
 ) x
 ORDER BY x.points DESC,x.correct_latency_ms ASC,x.joined_at ASC,x.participant_id
 LIMIT 10;
END $$;
REVOKE ALL ON FUNCTION trainlive.top_ten() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.top_ten() TO trainlive_app;

-- The join code must be regenerated using management-only connections; session tokens remain class-scoped.
COMMIT;
