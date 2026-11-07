-- TrainLive LMS P1: published lessons, class-bound enrollment, idempotent learning progress.
-- Additive to migrations 001-016. Do NOT grant LMS table access to runtime role.
BEGIN;

ALTER TABLE trainlive.lms_module
 ADD CONSTRAINT lms_module_course_tenant_identity UNIQUE(id,course_id,organization_id);

CREATE TABLE trainlive.lms_lesson (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 course_id uuid NOT NULL,
 module_id uuid NOT NULL,
 lesson_key text NOT NULL CHECK (lesson_key ~ '^[A-Z][A-Z0-9_-]{1,31}$'),
 title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 160 AND title !~ '[[:cntrl:]<>]'),
 content_type text NOT NULL CHECK (content_type IN ('text','link','video','pdf')),
 body text NOT NULL DEFAULT '' CHECK (length(body)<=10000),
 external_url text CHECK (
  external_url IS NULL OR
  (length(external_url)<=2048 AND external_url ~ '^https://[^[:space:]@<>]+$')
 ),
 position integer NOT NULL CHECK (position>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (module_id,course_id,organization_id)
  REFERENCES trainlive.lms_module(id,course_id,organization_id),
 UNIQUE(module_id,lesson_key), UNIQUE(module_id,position),
 UNIQUE(id,course_id,organization_id),
 CHECK (
  (content_type='text' AND length(btrim(body))>0 AND external_url IS NULL)
  OR (content_type<>'text' AND external_url IS NOT NULL)
 )
);
CREATE INDEX lms_lesson_course_idx ON trainlive.lms_lesson(course_id,module_id,position);

CREATE TABLE trainlive.lms_enrollment (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 course_id uuid NOT NULL,
 class_id uuid NOT NULL,
 participant_id uuid NOT NULL,
 enrolled_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (course_id,organization_id) REFERENCES trainlive.lms_course(id,organization_id),
 FOREIGN KEY (class_id,participant_id) REFERENCES trainlive.participant(class_id,id),
 UNIQUE (course_id,class_id,participant_id),
 UNIQUE (id,course_id,organization_id)
);
CREATE INDEX lms_enrollment_participant_idx ON trainlive.lms_enrollment(class_id,participant_id);

CREATE TABLE trainlive.lms_lesson_progress (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 course_id uuid NOT NULL,
 enrollment_id uuid NOT NULL,
 lesson_id uuid NOT NULL,
 completed_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (enrollment_id,course_id,organization_id)
  REFERENCES trainlive.lms_enrollment(id,course_id,organization_id),
 FOREIGN KEY (lesson_id,course_id,organization_id)
  REFERENCES trainlive.lms_lesson(id,course_id,organization_id),
 UNIQUE(enrollment_id,lesson_id)
);
CREATE INDEX lms_progress_enrollment_idx ON trainlive.lms_lesson_progress(enrollment_id);

ALTER TABLE trainlive.lms_lesson ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainlive.lms_enrollment ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainlive.lms_lesson_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON trainlive.lms_lesson,trainlive.lms_enrollment,trainlive.lms_lesson_progress
 FROM PUBLIC,trainlive_app;

-- Extend the existing authorized catalog with lesson authoring data.
-- Keep its return type and function signature stable.
CREATE OR REPLACE FUNCTION trainlive.lms_admin_catalog(p_class uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=trainlive,pg_temp AS $$
DECLARE v_program uuid;v_program_title text;v_program_code text;
 v_org uuid;v_org_name text;v_courses jsonb;
BEGIN
 IF p_class IS DISTINCT FROM trainlive.claim_class() OR NOT trainlive.can_create_class()
 THEN RAISE EXCEPTION 'LMS management forbidden' USING ERRCODE='42501'; END IF;
 SELECT p.id,p.title,p.code,p.organization_id,o.name
 INTO v_program,v_program_title,v_program_code,v_org,v_org_name
 FROM trainlive.class_session s
 JOIN trainlive.program p ON p.id=s.program_id
 JOIN trainlive.organization o ON o.id=p.organization_id
 WHERE s.id=p_class;
 IF NOT FOUND THEN RAISE EXCEPTION 'class not found' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'id',c.id,'code',c.code,'title',c.title,'description',c.description,
   'deliveryMode',c.delivery_mode,'passingGrade',c.passing_grade,
   'sequentialModules',c.sequential_modules,'status',c.status,
   'modules',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
     'id',m.id,'moduleKey',m.module_key,'title',m.title,'kind',m.kind,
     'estimatedMinutes',m.estimated_minutes,'position',m.position,
     'lessons',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
       'id',l.id,'lessonKey',l.lesson_key,'title',l.title,
       'contentType',l.content_type,'body',l.body,'externalUrl',l.external_url,
       'position',l.position
     ) ORDER BY l.position),'[]'::jsonb)
     FROM trainlive.lms_lesson l WHERE l.module_id=m.id)
   ) ORDER BY m.position),'[]'::jsonb)
   FROM trainlive.lms_module m WHERE m.course_id=c.id)
 ) ORDER BY c.created_at DESC),'[]'::jsonb) INTO v_courses
 FROM trainlive.lms_course c
 WHERE c.program_id=v_program AND c.organization_id=v_org;
 RETURN jsonb_build_object(
  'organization',jsonb_build_object('id',v_org,'name',v_org_name),
  'program',jsonb_build_object('id',v_program,'code',v_program_code,'title',v_program_title),
  'courses',v_courses
 );
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_admin_catalog(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_admin_catalog(uuid) TO trainlive_app;

CREATE FUNCTION trainlive.lms_admin_create_lesson(
 p_class uuid,p_course uuid,p_module uuid,p_key text,p_title text,
 p_type text,p_body text,p_url text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=trainlive,pg_temp AS $$
DECLARE v_program uuid;v_org uuid;v_lesson uuid;v_position integer;
BEGIN
 IF p_class IS DISTINCT FROM trainlive.claim_class() OR NOT trainlive.can_create_class()
 THEN RAISE EXCEPTION 'LMS management forbidden' USING ERRCODE='42501'; END IF;
 IF p_key IS NULL OR p_key !~ '^[A-Z][A-Z0-9_-]{1,31}$'
 OR p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 3 AND 160
 OR p_title ~ '[[:cntrl:]<>]' OR p_body IS NULL OR length(p_body)>10000
 OR p_type IS NULL OR p_type NOT IN ('text','link','video','pdf')
 OR (p_type='text' AND (length(btrim(p_body))=0 OR p_url IS NOT NULL))
 OR (p_type<>'text' AND
  (p_url IS NULL OR length(p_url)>2048 OR p_url !~ '^https://[^[:space:]@<>]+$'))
 THEN RAISE EXCEPTION 'invalid lesson parameters' USING ERRCODE='22023'; END IF;
 SELECT p.id,p.organization_id INTO v_program,v_org
 FROM trainlive.class_session s JOIN trainlive.program p ON p.id=s.program_id WHERE s.id=p_class;
 -- Lock parent course before adding its content to serialize with publish.
 PERFORM 1 FROM trainlive.lms_course c
 JOIN trainlive.lms_module m ON m.course_id=c.id AND m.organization_id=c.organization_id
 WHERE c.id=p_course AND c.program_id=v_program AND c.organization_id=v_org
   AND c.status='draft' AND m.id=p_module AND m.kind='lesson' FOR UPDATE OF c;
 IF NOT FOUND THEN RAISE EXCEPTION 'module not editable in tenant' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(max(position),0)+1 INTO v_position
 FROM trainlive.lms_lesson WHERE module_id=p_module;
 INSERT INTO trainlive.lms_lesson(
  organization_id,course_id,module_id,lesson_key,title,content_type,body,external_url,position
 ) VALUES(v_org,p_course,p_module,p_key,btrim(p_title),p_type,p_body,p_url,v_position)
 RETURNING id INTO v_lesson;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'super_admin',p_class,'lms.lesson.create',v_lesson::text,
  jsonb_build_object('courseId',p_course,'moduleId',p_module,'type',p_type));
 RETURN jsonb_build_object('id',v_lesson,'position',v_position);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_admin_create_lesson(uuid,uuid,uuid,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_admin_create_lesson(uuid,uuid,uuid,text,text,text,text,text) TO trainlive_app;

CREATE FUNCTION trainlive.lms_admin_publish_course(p_class uuid,p_course uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_program uuid;v_org uuid;v_modules integer;v_lessons integer;
BEGIN
 IF p_class IS DISTINCT FROM trainlive.claim_class() OR NOT trainlive.can_create_class()
 THEN RAISE EXCEPTION 'LMS management forbidden' USING ERRCODE='42501'; END IF;
 SELECT p.id,p.organization_id INTO v_program,v_org
 FROM trainlive.class_session s JOIN trainlive.program p ON p.id=s.program_id WHERE s.id=p_class;
 PERFORM 1 FROM trainlive.lms_course
 WHERE id=p_course AND program_id=v_program AND organization_id=v_org AND status='draft' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'course not publishable in tenant' USING ERRCODE='42501'; END IF;
 SELECT count(*) INTO v_modules FROM trainlive.lms_module WHERE course_id=p_course;
 SELECT count(*) INTO v_lessons FROM trainlive.lms_lesson WHERE course_id=p_course;
 -- Grading and live attendance are not implemented yet: P1 publishes only
 -- actual self-paced lesson modules, never misleading empty assessments.
 IF v_modules=0 OR v_lessons=0 OR EXISTS (
  SELECT 1 FROM trainlive.lms_module m
  WHERE m.course_id=p_course AND (m.kind<>'lesson' OR NOT EXISTS
   (SELECT 1 FROM trainlive.lms_lesson l WHERE l.module_id=m.id))
 ) THEN RAISE EXCEPTION 'course requires populated lesson modules' USING ERRCODE='22023'; END IF;
 UPDATE trainlive.lms_course SET status='published',updated_at=now() WHERE id=p_course;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'super_admin',p_class,'lms.course.publish',p_course::text,
  jsonb_build_object('moduleCount',v_modules,'lessonCount',v_lessons));
 RETURN jsonb_build_object('id',p_course,'status','published',
  'moduleCount',v_modules,'lessonCount',v_lessons);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_admin_publish_course(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_admin_publish_course(uuid,uuid) TO trainlive_app;

-- Participant access always depends on the signed class-bound session,
-- its actual participant row, the class program, and a published course.
CREATE FUNCTION trainlive.lms_learner_catalog(p_class uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=trainlive,pg_temp AS $$
DECLARE v_participant uuid:=trainlive.claim_participant();
 v_program uuid;v_org uuid;v_courses jsonb;
BEGIN
 IF p_class IS DISTINCT FROM trainlive.claim_class() OR v_participant IS NULL
    OR trainlive.claim_staff() IS NOT NULL
 THEN RAISE EXCEPTION 'learner access forbidden' USING ERRCODE='42501'; END IF;
 SELECT s.program_id,p.organization_id INTO v_program,v_org
 FROM trainlive.class_session s
 JOIN trainlive.program p ON p.id=s.program_id
 JOIN trainlive.participant pt ON pt.class_id=s.id AND pt.id=v_participant
 WHERE s.id=p_class AND s.status<>'archived';
 IF NOT FOUND THEN RAISE EXCEPTION 'participant not in class' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'id',c.id,'code',c.code,'title',c.title,'description',c.description,
  'deliveryMode',c.delivery_mode,'sequentialModules',c.sequential_modules,
  'enrolled',e.id IS NOT NULL,
  'totalLessons',(SELECT count(*) FROM trainlive.lms_lesson l WHERE l.course_id=c.id),
  'completedLessons',(SELECT count(*) FROM trainlive.lms_lesson_progress lp
   WHERE lp.enrollment_id=e.id),
  'modules',CASE WHEN e.id IS NULL THEN '[]'::jsonb ELSE
   (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',m.id,'title',m.title,'position',m.position,
    'lessons',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
     'id',l.id,'title',l.title,'position',l.position,'contentType',l.content_type,
     'body',l.body,'externalUrl',l.external_url,
     'completed',EXISTS(SELECT 1 FROM trainlive.lms_lesson_progress lp
       WHERE lp.enrollment_id=e.id AND lp.lesson_id=l.id)
    ) ORDER BY l.position),'[]'::jsonb) FROM trainlive.lms_lesson l WHERE l.module_id=m.id)
   ) ORDER BY m.position),'[]'::jsonb)
    FROM trainlive.lms_module m WHERE m.course_id=c.id)
   END
 ) ORDER BY c.title),'[]'::jsonb) INTO v_courses
 FROM trainlive.lms_course c
 LEFT JOIN trainlive.lms_enrollment e ON e.course_id=c.id
   AND e.class_id=p_class AND e.participant_id=v_participant
 WHERE c.program_id=v_program AND c.organization_id=v_org AND c.status='published';
 RETURN jsonb_build_object('courses',v_courses);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_learner_catalog(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_learner_catalog(uuid) TO trainlive_app;

CREATE FUNCTION trainlive.lms_learner_enroll(p_class uuid,p_course uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_participant uuid:=trainlive.claim_participant();
 v_program uuid;v_org uuid;v_enrollment uuid;
BEGIN
 IF p_class IS DISTINCT FROM trainlive.claim_class() OR v_participant IS NULL
    OR trainlive.claim_staff() IS NOT NULL
 THEN RAISE EXCEPTION 'learner access forbidden' USING ERRCODE='42501'; END IF;
 SELECT s.program_id,p.organization_id INTO v_program,v_org
 FROM trainlive.class_session s
 JOIN trainlive.program p ON p.id=s.program_id
 JOIN trainlive.participant pt ON pt.class_id=s.id AND pt.id=v_participant
 WHERE s.id=p_class AND s.status<>'archived';
 IF NOT FOUND THEN RAISE EXCEPTION 'participant not in class' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM trainlive.lms_course
 WHERE id=p_course AND program_id=v_program AND organization_id=v_org AND status='published';
 IF NOT FOUND THEN RAISE EXCEPTION 'course not available to learner' USING ERRCODE='42501'; END IF;
 INSERT INTO trainlive.lms_enrollment(organization_id,course_id,class_id,participant_id)
 VALUES(v_org,p_course,p_class,v_participant)
 ON CONFLICT(course_id,class_id,participant_id) DO NOTHING;
 SELECT id INTO v_enrollment FROM trainlive.lms_enrollment
 WHERE course_id=p_course AND class_id=p_class AND participant_id=v_participant;
 -- Logging is class-scoped; avoids leaking participant identity in public responses.
 RETURN jsonb_build_object('courseId',p_course,'enrolled',true,'enrollmentId',v_enrollment);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_learner_enroll(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_learner_enroll(uuid,uuid) TO trainlive_app;

CREATE FUNCTION trainlive.lms_learner_complete_lesson(
 p_class uuid,p_course uuid,p_lesson uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_participant uuid:=trainlive.claim_participant();
 v_enrollment uuid;v_org uuid;v_sequential boolean;
 v_mod_position integer;v_position integer;v_completed integer;v_total integer;
BEGIN
 IF p_class IS DISTINCT FROM trainlive.claim_class() OR v_participant IS NULL
    OR trainlive.claim_staff() IS NOT NULL
 THEN RAISE EXCEPTION 'learner access forbidden' USING ERRCODE='42501'; END IF;
 SELECT e.id,e.organization_id INTO v_enrollment,v_org FROM trainlive.lms_enrollment e
 JOIN trainlive.participant pt ON pt.id=e.participant_id AND pt.class_id=e.class_id
 JOIN trainlive.class_session s ON s.id=e.class_id
 WHERE e.class_id=p_class AND e.participant_id=v_participant
  AND e.course_id=p_course AND s.status<>'archived'
 FOR UPDATE OF e;
 IF NOT FOUND THEN RAISE EXCEPTION 'learner not enrolled' USING ERRCODE='42501'; END IF;
 SELECT c.sequential_modules,m.position,l.position
 INTO v_sequential,v_mod_position,v_position
 FROM trainlive.lms_lesson l
 JOIN trainlive.lms_module m ON m.id=l.module_id
 JOIN trainlive.lms_course c ON c.id=l.course_id
 WHERE l.id=p_lesson AND l.course_id=p_course AND l.organization_id=v_org
  AND c.status='published';
 IF NOT FOUND THEN RAISE EXCEPTION 'lesson not available in course' USING ERRCODE='42501'; END IF;
 IF v_sequential AND EXISTS(
  SELECT 1 FROM trainlive.lms_lesson previous
  JOIN trainlive.lms_module pm ON pm.id=previous.module_id
  LEFT JOIN trainlive.lms_lesson_progress progress ON
    progress.enrollment_id=v_enrollment AND progress.lesson_id=previous.id
  WHERE previous.course_id=p_course
  AND (pm.position<v_mod_position OR (pm.position=v_mod_position AND previous.position<v_position))
  AND progress.id IS NULL
 ) THEN RAISE EXCEPTION 'complete previous lessons first' USING ERRCODE='22023'; END IF;
 INSERT INTO trainlive.lms_lesson_progress(organization_id,course_id,enrollment_id,lesson_id)
 VALUES(v_org,p_course,v_enrollment,p_lesson)
 ON CONFLICT(enrollment_id,lesson_id) DO NOTHING;
 SELECT count(*) INTO v_completed FROM trainlive.lms_lesson_progress
 WHERE enrollment_id=v_enrollment;
 SELECT count(*) INTO v_total FROM trainlive.lms_lesson WHERE course_id=p_course;
 RETURN jsonb_build_object('courseId',p_course,'lessonId',p_lesson,
  'completedLessons',v_completed,'totalLessons',v_total,
  'courseContentComplete',v_total>0 AND v_completed=v_total);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_learner_complete_lesson(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_learner_complete_lesson(uuid,uuid,uuid) TO trainlive_app;

COMMIT;
