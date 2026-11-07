-- LMS P0 security and catalog regression (disposable CI database only).
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE v_a uuid;v_b uuid;v_admin uuid;v_ordinary uuid;
 v_org uuid;v_program uuid;v_foreign_course uuid;
 v_course uuid;v_module uuid;v_created jsonb;v_catalog jsonb;
BEGIN
 SELECT id INTO v_a FROM trainlive.class_session WHERE batch_no='A' ORDER BY created_at DESC LIMIT 1;
 SELECT id INTO v_b FROM trainlive.class_session WHERE batch_no='B' ORDER BY created_at DESC LIMIT 1;
 IF v_a IS NULL OR v_b IS NULL THEN RAISE EXCEPTION 'missing LMS CI classes'; END IF;
 INSERT INTO trainlive.staff_user(email,display_name,is_super_admin)
 VALUES('lms-admin@example.invalid','LMS CI Admin',true) RETURNING id INTO v_admin;
 INSERT INTO trainlive.staff_user(email,display_name,is_super_admin)
 VALUES('lms-staff@example.invalid','LMS CI Facilitator',false) RETURNING id INTO v_ordinary;
 INSERT INTO trainlive.class_staff(class_id,user_id,role)
 VALUES(v_a,v_admin,'facilitator'),(v_a,v_ordinary,'facilitator');

 -- A foreign tenant, not reachable through class A's program.
 INSERT INTO trainlive.organization(name,slug)
 VALUES('Foreign LMS CI Bank','foreign-lms-ci') RETURNING id INTO v_org;
 INSERT INTO trainlive.program(organization_id,code,title)
 VALUES(v_org,'FOREIGN-LMS-CI','Foreign program') RETURNING id INTO v_program;
 INSERT INTO trainlive.lms_course(organization_id,program_id,code,title,created_by)
 VALUES(v_org,v_program,'FOREIGN01','Other tenant course',v_admin) RETURNING id INTO v_foreign_course;

 EXECUTE 'SET LOCAL ROLE trainlive_app';
 PERFORM set_config('trainlive.class_id',v_a::text,true);
 PERFORM set_config('trainlive.staff_id',v_ordinary::text,true);
 BEGIN
  PERFORM trainlive.lms_admin_catalog(v_a);
  RAISE EXCEPTION 'ordinary facilitator accessed LMS catalog';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM trainlive.lms_admin_create_course(v_a,'NOPE001','Unauthorized course','','live',70,true);
  RAISE EXCEPTION 'ordinary facilitator created LMS course';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM set_config('trainlive.staff_id',v_admin::text,true);
 BEGIN
  PERFORM trainlive.lms_admin_catalog(v_b);
  RAISE EXCEPTION 'cross-class LMS catalog allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM (SELECT count(*) FROM trainlive.lms_course);
  RAISE EXCEPTION 'runtime role read protected LMS table directly';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 v_created:=trainlive.lms_admin_create_course(v_a,'CYBER001','Cyber Awareness Course',
  'Introductory course','blended',80,true);
 v_course:=(v_created->>'id')::uuid;
 IF v_created->>'status'<>'draft' THEN RAISE EXCEPTION 'new course not draft'; END IF;
 PERFORM trainlive.lms_admin_update_course(
   v_a,v_course,'Cyber Awareness Advanced','Configured by admin','self_paced',85,false);
 v_created:=trainlive.lms_admin_create_module(
   v_a,v_course,'INTRO','Introduction to Cybersecurity','lesson',45);
 v_module:=(v_created->>'id')::uuid;
 IF (v_created->>'position')::integer<>1 THEN RAISE EXCEPTION 'module position wrong'; END IF;
 v_catalog:=trainlive.lms_admin_catalog(v_a);
 IF jsonb_array_length(v_catalog->'courses')<>1
 OR v_catalog->'courses'->0->>'title'<>'Cyber Awareness Advanced'
 OR (v_catalog->'courses'->0->>'passingGrade')::integer<>85
 OR v_catalog->'courses'->0->>'sequentialModules'<>'false'
 OR jsonb_array_length(v_catalog->'courses'->0->'modules')<>1
 THEN RAISE EXCEPTION 'catalog/parameter values not persisted'; END IF;
 BEGIN
  PERFORM trainlive.lms_admin_create_module(v_a,v_foreign_course,'LEAK','Forbidden Module','lesson',30);
  RAISE EXCEPTION 'cross-tenant module creation allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM trainlive.lms_admin_update_course(v_a,v_foreign_course,'Foreign Edited','','live',70,true);
  RAISE EXCEPTION 'cross-tenant course edit allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM trainlive.lms_admin_create_course(v_a,'CYBER001','Duplicate Course','','live',70,true);
  RAISE EXCEPTION 'duplicate course code allowed';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 IF (SELECT count(*) FROM trainlive.audit_log
     WHERE class_id=v_a AND action LIKE 'lms.%')<>3
 THEN RAISE EXCEPTION 'LMS audit evidence missing'; END IF;
END $$;
ROLLBACK;
