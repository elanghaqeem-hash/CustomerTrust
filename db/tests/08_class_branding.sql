-- TrainLive 015 UAT: class-specific branding, Super Admin only, legacy isolation.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE v_a uuid;v_b uuid;v_admin uuid;v_plain uuid;v_result jsonb;v_new uuid;
 v_client text;v_title text;
BEGIN
 SELECT id INTO v_a FROM trainlive.class_session WHERE batch_no='A' ORDER BY created_at DESC LIMIT 1;
 SELECT id INTO v_b FROM trainlive.class_session WHERE batch_no='B' ORDER BY created_at DESC LIMIT 1;
 IF v_a IS NULL OR v_b IS NULL OR v_a=v_b THEN RAISE EXCEPTION 'branding fixtures missing'; END IF;
 INSERT INTO trainlive.staff_user(email,display_name,is_super_admin)
 VALUES('branding-admin@bank.example','Branding CI Admin',true) RETURNING id INTO v_admin;
 INSERT INTO trainlive.staff_user(email,display_name,is_super_admin)
 VALUES('branding-facilitator@bank.example','Branding Ordinary Staff',false) RETURNING id INTO v_plain;
 INSERT INTO trainlive.class_staff(class_id,user_id,role)
 VALUES(v_a,v_admin,'facilitator'),(v_a,v_plain,'facilitator');
 EXECUTE 'SET LOCAL ROLE trainlive_app';
 PERFORM set_config('trainlive.class_id',v_a::text,true);
 PERFORM set_config('trainlive.staff_id',v_plain::text,true);
 BEGIN
  PERFORM trainlive.admin_update_class_branding(v_a,'Unauthorized','Rejected');
  RAISE EXCEPTION 'ordinary facilitator edited branding';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM set_config('trainlive.staff_id',v_admin::text,true);
 BEGIN
  PERFORM trainlive.admin_update_class_branding(v_b,'Cross Class','Rejected');
  RAISE EXCEPTION 'cross-class update allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 v_result:=trainlive.admin_update_class_branding(v_a,'Bank Alpha','Customer Service Excellence');
 IF v_result->>'clientName'<>'Bank Alpha' OR
    v_result->>'trainingTitle'<>'Customer Service Excellence'
 THEN RAISE EXCEPTION 'branding update response mismatch'; END IF;
 SELECT client_name,training_title INTO v_client,v_title FROM trainlive.class_session WHERE id=v_a;
 IF v_client<>'Bank Alpha' OR v_title<>'Customer Service Excellence'
 THEN RAISE EXCEPTION 'branding update not persisted'; END IF;
 v_result:=trainlive.admin_create_branded_class(
  v_a,'Client B Training','BRANDINGCI',(now() AT TIME ZONE 'Asia/Makassar')::date,
  'ZQ8A92','Bank Beta','Business Continuity Training');
 v_new:=(v_result->>'classId')::uuid;
 PERFORM set_config('trainlive.class_id',v_new::text,true);
 SELECT client_name,training_title INTO v_client,v_title FROM trainlive.class_session WHERE id=v_new;
 IF v_client<>'Bank Beta' OR v_title<>'Business Continuity Training'
 THEN RAISE EXCEPTION 'new class branding missing'; END IF;
 -- A newly created class is assigned to the same admin but has no participants.
 IF (SELECT count(*) FROM trainlive.participant WHERE class_id=v_new)<>0
 THEN RAISE EXCEPTION 'new class contained participant records'; END IF;
 SELECT p.client_name,p.training_title INTO v_client,v_title
 FROM trainlive.public_class_branding('ZQ8A92') p;
 IF v_client<>'Bank Beta' OR v_title<>'Business Continuity Training'
 THEN RAISE EXCEPTION 'public prejoin branding failed'; END IF;
 SELECT p.client_name INTO v_client FROM trainlive.public_class_branding('ZZZZZZ') p;
 IF FOUND THEN RAISE EXCEPTION 'unknown code leaked branding'; END IF;
END $$;
ROLLBACK;
