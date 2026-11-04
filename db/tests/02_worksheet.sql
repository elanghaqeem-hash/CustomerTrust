-- Integration test for auto-LK2 and exact-once worksheet awards, REAL PostgreSQL 16.
-- Uses class-specific fixtures, scoped runtime role, and a transaction rollback.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO trainlive.organization(id,name,slug) VALUES
 ('a2000000-0000-4000-8000-000000000001','Worksheet Isolation Fixture','worksheet-test');
INSERT INTO trainlive.program(id,organization_id,code,title) VALUES
 ('b2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','WORKSHEET-TEST','Worksheet Test');
INSERT INTO trainlive.content_version(id,program_id,version_no,status,source_yaml) VALUES
 ('c2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001',1,'draft','test');
INSERT INTO trainlive.content_item(content_version_id,item_key,type,module_no,order_no,payload)
SELECT 'c2000000-0000-4000-8000-000000000001',x.key,'single_choice',2,x.ord,
 jsonb_build_object('scenario','Scenario '||x.key,'correct','A',
 'explanation','Test explanation','legal_basis','Test reference','options',jsonb_build_array('A','B'))
FROM (VALUES('RF1',1),('RF2',2),('RF3',3),('RF4',4)) x(key,ord);
INSERT INTO trainlive.worksheet_template(content_version_id,ws_key,title,module_no,payload)
VALUES('c2000000-0000-4000-8000-000000000001','LK2','Red Flag Sheet',2,
'{"auto_generated_from":["RF1","RF2","RF3","RF4"]}');
UPDATE trainlive.content_version SET status='published',published_at=now()
WHERE id='c2000000-0000-4000-8000-000000000001';
INSERT INTO trainlive.class_session(id,program_id,content_version_id,name,batch_no,
start_at,end_at,join_code,join_open_from,join_open_until,status) VALUES
('12000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001',
'c2000000-0000-4000-8000-000000000001','Worksheet A','A',now(),now()+interval '7 hour',
'WSHTA2',now()-interval '1 day',now()+interval '2 day','live'),
('22000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000001',
'c2000000-0000-4000-8000-000000000001','Worksheet B','B',now(),now()+interval '7 hour',
'WSHTB2',now()-interval '1 day',now()+interval '2 day','live');
INSERT INTO trainlive.participant(id,class_id,display_name,unit,email,consent_at) VALUES
('32000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001',
'Participant A','Unit','same@example.invalid',now()),
('42000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000002',
'Participant B','Unit','same@example.invalid',now());
INSERT INTO trainlive.response(class_id,class_item_id,participant_id,answer_json)
SELECT i.class_id,i.id,'32000000-0000-4000-8000-000000000001','{"choice":"A"}'
FROM trainlive.class_item i WHERE i.class_id='12000000-0000-4000-8000-000000000001';
UPDATE trainlive.class_item SET state='revealed' WHERE class_id='12000000-0000-4000-8000-000000000001' AND item_key<>'RF4';
SET LOCAL ROLE trainlive_app;
SELECT set_config('trainlive.class_id','12000000-0000-4000-8000-000000000001',true);
SELECT set_config('trainlive.participant_id','32000000-0000-4000-8000-000000000001',true);
DO $$ BEGIN
 IF trainlive.regenerate_lk2() THEN RAISE EXCEPTION 'FAIL: LK2 generated before RF4 revealed'; END IF;
 IF (SELECT count(*) FROM trainlive.worksheet_submission)<>0 THEN
   RAISE EXCEPTION 'FAIL: early LK2 stored'; END IF;
END $$;
RESET ROLE;
UPDATE trainlive.class_item SET state='revealed'
WHERE class_id='12000000-0000-4000-8000-000000000001' AND item_key='RF4';
SET LOCAL ROLE trainlive_app;
DO $$
DECLARE p integer; c integer;
BEGIN
 IF NOT trainlive.regenerate_lk2() THEN RAISE EXCEPTION 'FAIL: LK2 did not generate'; END IF;
 IF NOT trainlive.regenerate_lk2() THEN RAISE EXCEPTION 'FAIL: LK2 retry returned false'; END IF;
 SELECT COALESCE(SUM(points),0)::integer INTO p FROM trainlive.point_ledger;
 IF p<>20 THEN RAISE EXCEPTION 'FAIL: LK2 points not idempotent'; END IF;
 SELECT jsonb_array_length(data_json->'red_flags') INTO c FROM trainlive.worksheet_submission;
 IF c<>4 THEN RAISE EXCEPTION 'FAIL: LK2 does not contain 4 responses'; END IF;
 IF (SELECT count(*) FROM trainlive.worksheet_submission)<>1 THEN
   RAISE EXCEPTION 'FAIL: LK2 leaked into class B'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM trainlive.worksheet_submission WHERE class_id='22000000-0000-4000-8000-000000000002')<>0
 THEN RAISE EXCEPTION 'FAIL: class B worksheet was contaminated'; END IF;
END $$;
ROLLBACK;
\echo 'PASS: LK2 waits for reveal, contains only 4 class-A answers, +20 idempotent, B isolated'
