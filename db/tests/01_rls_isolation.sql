-- Real PostgreSQL integration test: two classes with the SAME published ContentVersion.
-- Prerequisites: psql with DATABASE_URL_ADMIN pointing to a disposable migrated database.
-- Every test is in one transaction and rolled back. It uses SET ROLE trainlive_app, NOT mocks.
\set ON_ERROR_STOP on
BEGIN;
-- Case 3: no class claim fails closed, even before fixtures exist.
SELECT set_config('trainlive.class_id','',true);
SELECT set_config('trainlive.participant_id','',true);
SELECT set_config('trainlive.staff_id','',true);
SET LOCAL ROLE trainlive_app;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM trainlive.class_session) OR
    EXISTS (SELECT 1 FROM trainlive.participant) OR
    EXISTS (SELECT 1 FROM trainlive.response) OR
    EXISTS (SELECT 1 FROM trainlive.point_ledger)
 THEN RAISE EXCEPTION 'FAIL RLS without claims'; END IF;
END $$;
RESET ROLE;

INSERT INTO trainlive.organization(id,name,slug)
VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Isolation Test Bank','isolation-bank');
INSERT INTO trainlive.program(id,organization_id,code,title)
VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','CTC-ISOLATION-TEST','Fixture');
INSERT INTO trainlive.content_version(id,program_id,version_no,status,source_yaml)
VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',1,'draft','v1');
INSERT INTO trainlive.content_item(id,content_version_id,item_key,type,module_no,order_no,payload)
VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
'cccccccc-cccc-4ccc-8ccc-cccccccccccc','RF1','single_choice',2,1,
'{"prompt":"old v1 wording","options":["A","B"],"correct":"A","timer_sec":30}');
UPDATE trainlive.content_version SET status='published',published_at=now()
WHERE id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';

INSERT INTO trainlive.class_session(
 id,program_id,content_version_id,name,batch_no,start_at,end_at,
 join_code,join_open_from,join_open_until,status)
VALUES
('11111111-1111-4111-8111-111111111111',
'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc',
'Batch A','A',now(),now()+interval '7 hour','BATCHA',now()-interval '1 day',now()+interval '2 day','live'),
('22222222-2222-4222-8222-222222222222',
'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc',
'Batch B','B',now(),now()+interval '7 hour','BATCHB',now()-interval '1 day',now()+interval '2 day','live');
INSERT INTO trainlive.participant(id,class_id,display_name,unit,email,consent_at)
VALUES
('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',
'Same User A','Unit A','same@example.invalid',now()),
('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222',
'Same User B','Unit B','same@example.invalid',now());
INSERT INTO trainlive.staff_user(id,email,display_name) VALUES
('55555555-5555-4555-8555-555555555555','facilitator@example.invalid','Facilitator A');
INSERT INTO trainlive.class_staff(class_id,user_id,role) VALUES
('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','facilitator');

-- Case 1: opening A cannot open B.
UPDATE trainlive.class_item SET state='open',opened_at=now()
WHERE class_id='11111111-1111-4111-8111-111111111111';
DO $$ BEGIN
 IF (SELECT count(*) FROM trainlive.class_item WHERE state='open')<>1 THEN
  RAISE EXCEPTION 'FAIL: opening A changed B'; END IF;
END $$;
-- Store generated class item IDs in transaction-local GUCs for the cross-class check.
SELECT set_config('fixture.item_a',
 (SELECT id::text FROM trainlive.class_item WHERE class_id='11111111-1111-4111-8111-111111111111'),true);
SELECT set_config('fixture.item_b',
 (SELECT id::text FROM trainlive.class_item WHERE class_id='22222222-2222-4222-8222-222222222222'),true);
INSERT INTO trainlive.response(class_id,class_item_id,participant_id,answer_json)
VALUES
('11111111-1111-4111-8111-111111111111',current_setting('fixture.item_a')::uuid,
 '33333333-3333-4333-8333-333333333333','"A"'::jsonb),
('22222222-2222-4222-8222-222222222222',current_setting('fixture.item_b')::uuid,
 '44444444-4444-4444-8444-444444444444','"B"'::jsonb);
INSERT INTO trainlive.point_ledger(class_id,participant_id,points,reason,source_ref,event_key)
VALUES
('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333',
10,'quiz_correct',current_setting('fixture.item_a')::uuid,'quiz-A'),
('22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444',
20,'worksheet_complete',current_setting('fixture.item_b')::uuid,'worksheet-B');

-- Case 4: v2 can change while v1's already created classes cannot.
INSERT INTO trainlive.content_version(id,program_id,version_no,status,source_yaml)
VALUES('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',2,'draft','v2');
INSERT INTO trainlive.content_item(content_version_id,item_key,type,module_no,order_no,payload)
VALUES('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','RF1','single_choice',2,1,
'{"prompt":"new v2 wording","options":["A","B"],"correct":"A"}');
UPDATE trainlive.content_version SET status='published',published_at=now()
WHERE id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
DO $$ BEGIN
 IF (SELECT count(*) FROM trainlive.class_item WHERE payload->>'prompt'='old v1 wording')<>2 THEN
  RAISE EXCEPTION 'FAIL: v1 snapshot changed after v2'; END IF;
END $$;

-- Cases 1/3/5/6: a runtime participant from A sees ONLY A rows and points.
SET LOCAL ROLE trainlive_app;
SELECT set_config('trainlive.class_id','11111111-1111-4111-8111-111111111111',true);
SELECT set_config('trainlive.participant_id','33333333-3333-4333-8333-333333333333',true);
DO $$
DECLARE n integer; score integer; denied boolean:=false;
BEGIN
 SELECT count(*) INTO n FROM trainlive.class_item;
 IF n<>1 THEN RAISE EXCEPTION 'FAIL: class A can see B item'; END IF;
 SELECT count(*) INTO n FROM trainlive.participant;
 IF n<>1 THEN RAISE EXCEPTION 'FAIL: class A can see B participant'; END IF;
 SELECT count(*) INTO n FROM trainlive.response;
 IF n<>1 THEN RAISE EXCEPTION 'FAIL: class A response export includes B'; END IF;
 SELECT COALESCE(SUM(points),0) INTO score FROM trainlive.point_ledger;
 IF score<>10 THEN RAISE EXCEPTION 'FAIL: class A leaderboard contaminated'; END IF;
 BEGIN
  INSERT INTO trainlive.response(class_id,class_item_id,participant_id,answer_json)
  VALUES('22222222-2222-4222-8222-222222222222',
    current_setting('fixture.item_b')::uuid,
    '33333333-3333-4333-8333-333333333333','"A"'::jsonb);
 EXCEPTION WHEN insufficient_privilege OR foreign_key_violation THEN
   denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'FAIL: cross-class response insert accepted'; END IF;
END $$;
RESET ROLE;
-- Staff A can see A only, even though staff claim is present.
SELECT set_config('trainlive.participant_id','',true);
SELECT set_config('trainlive.staff_id','55555555-5555-4555-8555-555555555555',true);
SET LOCAL ROLE trainlive_app;
DO $$
BEGIN
 IF (SELECT count(*) FROM trainlive.class_item)<>1 THEN
  RAISE EXCEPTION 'FAIL: facilitator A can see B item'; END IF;
 IF (SELECT count(*) FROM trainlive.participant)<>1 THEN
  RAISE EXCEPTION 'FAIL: facilitator A can see B participant'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
\echo 'PASS: class isolation fixtures, cross-class FK/RLS, immutable snapshots, no-claim default, per-class export/points'
