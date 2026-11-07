-- LMS P1: test publication, tenant-safe enrollment, sequential progress and immutable authoring.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE a uuid;b uuid;adm uuid;norm uuid;pid uuid;other_pid uuid;
 course uuid;draft uuid;m1 uuid;m2 uuid;l1 uuid;l2 uuid;other_course uuid;
 tenant uuid;prg uuid;resp jsonb;cat jsonb;
BEGIN
 SELECT id INTO a FROM trainlive.class_session WHERE batch_no='A' ORDER BY created_at DESC LIMIT 1;
 SELECT id INTO b FROM trainlive.class_session WHERE batch_no='B' ORDER BY created_at DESC LIMIT 1;
 IF a IS NULL OR b IS NULL THEN RAISE EXCEPTION 'LMS fixtures missing'; END IF;
 INSERT INTO trainlive.staff_user(email,display_name,is_super_admin)
 VALUES('lms-p1-admin@example.invalid','LMS P1 Admin',true) RETURNING id INTO adm;
 INSERT INTO trainlive.staff_user(email,display_name)
 VALUES('lms-p1-ordinary@example.invalid','LMS P1 Staff') RETURNING id INTO norm;
 INSERT INTO trainlive.class_staff(class_id,user_id,role)
 VALUES(a,adm,'facilitator'),(a,norm,'facilitator');
 INSERT INTO trainlive.participant(class_id,display_name,unit,consent_at)
 VALUES(a,'LMS P1 Synthetic Learner','CI',now()) RETURNING id INTO pid;
 INSERT INTO trainlive.participant(class_id,display_name,unit,consent_at)
 VALUES(b,'LMS P1 Other Class Learner','CI',now()) RETURNING id INTO other_pid;

 INSERT INTO trainlive.organization(name,slug)
 VALUES('LMS P1 Foreign','lms-p1-foreign') RETURNING id INTO tenant;
 INSERT INTO trainlive.program(organization_id,code,title)
 VALUES(tenant,'LMS-P1-FOREIGN','Other tenant') RETURNING id INTO prg;
 INSERT INTO trainlive.lms_course(organization_id,program_id,code,title,created_by,status)
 VALUES(tenant,prg,'FOREIGN02','Foreign P1 Course',adm,'published')
 RETURNING id INTO other_course;

 EXECUTE 'SET LOCAL ROLE trainlive_app';
 PERFORM set_config('trainlive.class_id',a::text,true);
 PERFORM set_config('trainlive.staff_id',adm::text,true);
 resp:=trainlive.lms_admin_create_course(a,'LEARN001','Digital Learning Foundations',
  'Self-paced materials','self_paced',80,true);
 course:=(resp->>'id')::uuid;
 BEGIN
  PERFORM trainlive.lms_admin_publish_course(a,course);
  RAISE EXCEPTION 'empty course was published';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 resp:=trainlive.lms_admin_create_course(a,'DRAFT001','Private Draft Course',
  'Never public','self_paced',70,true);
 draft:=(resp->>'id')::uuid;
 resp:=trainlive.lms_admin_create_module(a,course,'MODULE01','First module','lesson',20);
 m1:=(resp->>'id')::uuid;
 resp:=trainlive.lms_admin_create_module(a,course,'MODULE02','Second module','lesson',25);
 m2:=(resp->>'id')::uuid;
 resp:=trainlive.lms_admin_create_lesson(a,course,m1,'LESSON01','Introduction',
   'text','Synthetic training content only',NULL);
 l1:=(resp->>'id')::uuid;
 resp:=trainlive.lms_admin_create_lesson(a,course,m2,'LESSON02','Next chapter',
   'link','External reference','https://example.org/training');
 l2:=(resp->>'id')::uuid;
 BEGIN
  PERFORM trainlive.lms_admin_create_lesson(a,course,m2,'FAIL_URL','Unsafe link',
   'link','Redirect','javascript:alert(1)');
  RAISE EXCEPTION 'unsafe URL accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 PERFORM set_config('trainlive.staff_id',norm::text,true);
 BEGIN
  PERFORM trainlive.lms_admin_publish_course(a,course);
  RAISE EXCEPTION 'ordinary staff published course';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM set_config('trainlive.staff_id',adm::text,true);
 resp:=trainlive.lms_admin_publish_course(a,course);
 IF resp->>'status'<>'published' OR (resp->>'lessonCount')::integer<>2
 THEN RAISE EXCEPTION 'publication failed'; END IF;
 BEGIN
  PERFORM trainlive.lms_admin_create_lesson(a,course,m1,'AFTER','Late edit','text','Should fail',NULL);
  RAISE EXCEPTION 'published course mutated';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM trainlive.lms_admin_publish_course(a,other_course);
  RAISE EXCEPTION 'cross-tenant publish succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;

 PERFORM set_config('trainlive.staff_id','',true);
 PERFORM set_config('trainlive.participant_id',pid::text,true);
 cat:=trainlive.lms_learner_catalog(a);
 IF jsonb_array_length(cat->'courses')<>1
 OR cat->'courses'->0->>'title'<>'Digital Learning Foundations'
 OR cat->'courses'->0->>'enrolled'<>'false'
 OR cat->'courses'->0->'modules'<>'[]'::jsonb
 THEN RAISE EXCEPTION 'draft or full content leaked to unenrolled learner'; END IF;
 BEGIN
  PERFORM trainlive.lms_learner_enroll(a,draft);
  RAISE EXCEPTION 'draft enrollment allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM trainlive.lms_learner_enroll(a,other_course);
  RAISE EXCEPTION 'foreign tenant enrollment allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM trainlive.lms_learner_complete_lesson(a,course,l1);
  RAISE EXCEPTION 'unenrolled progress accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 resp:=trainlive.lms_learner_enroll(a,course);
 IF resp->>'enrolled'<>'true' THEN RAISE EXCEPTION 'cannot enroll'; END IF;
 IF (trainlive.lms_learner_enroll(a,course)->>'enrollmentId') IS DISTINCT FROM (resp->>'enrollmentId')
 THEN RAISE EXCEPTION 'duplicate enrollment'; END IF;
 cat:=trainlive.lms_learner_catalog(a);
 IF jsonb_array_length(cat->'courses'->0->'modules')<>2
 THEN RAISE EXCEPTION 'enrolled learner cannot see modules'; END IF;
 BEGIN
  PERFORM trainlive.lms_learner_complete_lesson(a,course,l2);
  RAISE EXCEPTION 'sequential restriction missing';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 resp:=trainlive.lms_learner_complete_lesson(a,course,l1);
 IF (resp->>'completedLessons')::integer<>1 THEN RAISE EXCEPTION 'first lesson not saved'; END IF;
 PERFORM trainlive.lms_learner_complete_lesson(a,course,l1);
 resp:=trainlive.lms_learner_complete_lesson(a,course,l2);
 IF (resp->>'completedLessons')::integer<>2 OR resp->>'courseContentComplete'<>'true'
 THEN RAISE EXCEPTION 'course progress wrong'; END IF;
 cat:=trainlive.lms_learner_catalog(a);
 IF (cat->'courses'->0->>'completedLessons')::integer<>2
 THEN RAISE EXCEPTION 'duplicate progress inserted'; END IF;
 BEGIN
  PERFORM trainlive.lms_learner_catalog(b);
  RAISE EXCEPTION 'participant cross-class access allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM set_config('trainlive.class_id',b::text,true);
 PERFORM set_config('trainlive.participant_id',other_pid::text,true);
 cat:=trainlive.lms_learner_catalog(b);
 IF jsonb_array_length(cat->'courses')<>1 OR cat->'courses'->0->>'enrolled'<>'false'
 THEN RAISE EXCEPTION 'other learner inherited progress'; END IF;
 BEGIN
  PERFORM trainlive.lms_learner_complete_lesson(b,course,l2);
  RAISE EXCEPTION 'another learner wrote progression without enrollment';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
ROLLBACK;
