-- TrainLive 004: idempotent worksheet scoring and class-specific automatic LK2.
BEGIN;
CREATE FUNCTION trainlive.award_worksheet(p_worksheet_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE s trainlive.worksheet_submission%ROWTYPE; affected integer;
BEGIN
 SELECT * INTO s FROM trainlive.worksheet_submission
 WHERE class_id=trainlive.claim_class() AND class_worksheet_id=p_worksheet_id
   AND participant_id=trainlive.claim_participant() AND status='submitted';
 IF NOT FOUND THEN RAISE EXCEPTION 'submitted worksheet not found in session' USING ERRCODE='42501'; END IF;
 INSERT INTO trainlive.point_ledger(class_id,participant_id,points,reason,source_ref,event_key)
 VALUES(s.class_id,s.participant_id,20,'worksheet_complete',s.class_worksheet_id,
       'worksheet:'||s.class_worksheet_id::text||':'||s.participant_id::text)
 ON CONFLICT(class_id,event_key) DO NOTHING;
 GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN affected=1;
END $$;
REVOKE ALL ON FUNCTION trainlive.award_worksheet(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.award_worksheet(uuid) TO trainlive_app;

-- Called after an individual RF answer is saved. Generates LK2 only once all 4 RF answers exist.
CREATE FUNCTION trainlive.regenerate_lk2()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE cid uuid:=trainlive.claim_class(); pid uuid:=trainlive.claim_participant();
 ws_id uuid; answer_count integer; data jsonb;
BEGIN
 IF cid IS NULL OR pid IS NULL THEN RAISE EXCEPTION 'class participant token required' USING ERRCODE='42501'; END IF;
 SELECT id INTO ws_id FROM trainlive.class_worksheet
 WHERE class_id=cid AND ws_key='LK2';
 IF ws_id IS NULL THEN RETURN false; END IF;
 SELECT count(r.id) INTO answer_count
 FROM trainlive.class_item i JOIN trainlive.response r ON r.class_id=i.class_id AND r.class_item_id=i.id
 WHERE i.class_id=cid AND i.item_key IN ('RF1','RF2','RF3','RF4') AND r.participant_id=pid;
 IF answer_count<>4 THEN RETURN false; END IF;
 SELECT jsonb_build_object('red_flags',jsonb_agg(jsonb_build_object(
   'key',i.item_key,'scenario',i.payload->>'scenario',
   'participant_choice',r.answer_json->>'choice',
   'correct_option',i.payload->>'correct',
   'is_correct',(r.answer_json->>'choice'=i.payload->>'correct'),
   'explanation',i.payload->>'explanation',
   'legal_basis',i.payload->>'legal_basis'
 ) ORDER BY i.order_no)) INTO data
 FROM trainlive.class_item i JOIN trainlive.response r ON r.class_id=i.class_id AND r.class_item_id=i.id
 WHERE i.class_id=cid AND i.item_key IN ('RF1','RF2','RF3','RF4') AND r.participant_id=pid;
 INSERT INTO trainlive.worksheet_submission(class_id,class_worksheet_id,participant_id,data_json,status,submitted_at)
 VALUES(cid,ws_id,pid,data,'submitted',now())
 ON CONFLICT(class_id,class_worksheet_id,participant_id) DO UPDATE
 SET data_json=EXCLUDED.data_json,status='submitted',
     submitted_at=COALESCE(trainlive.worksheet_submission.submitted_at,now());
 PERFORM trainlive.award_worksheet(ws_id);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION trainlive.regenerate_lk2() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.regenerate_lk2() TO trainlive_app;
COMMIT;
