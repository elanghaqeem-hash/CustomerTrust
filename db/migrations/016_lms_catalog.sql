-- TrainLive LMS P0: tenant-scoped course and module catalog.
-- Existing live classes, published snapshots, participant records and scores are untouched.
-- Runtime role has no direct table privileges; mutations require an approved, class-assigned Super Admin.
BEGIN;

CREATE TABLE trainlive.lms_course (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES trainlive.organization(id),
 program_id uuid NOT NULL,
 code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_-]{2,31}$'),
 title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 160 AND title !~ '[[:cntrl:]<>]'),
 description text NOT NULL DEFAULT '' CHECK (length(description)<=2000),
 delivery_mode text NOT NULL DEFAULT 'blended' CHECK (delivery_mode IN ('live','self_paced','blended')),
 passing_grade integer NOT NULL DEFAULT 70 CHECK (passing_grade BETWEEN 0 AND 100),
 sequential_modules boolean NOT NULL DEFAULT true,
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
 created_by uuid NOT NULL REFERENCES trainlive.staff_user(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (program_id,organization_id) REFERENCES trainlive.program(id,organization_id),
 UNIQUE (organization_id,code),
 UNIQUE (id,organization_id)
);
CREATE INDEX lms_course_program_idx ON trainlive.lms_course(program_id,created_at DESC);

CREATE TABLE trainlive.lms_module (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 course_id uuid NOT NULL,
 module_key text NOT NULL CHECK (module_key ~ '^[A-Z][A-Z0-9_-]{1,31}$'),
 title text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 160 AND title !~ '[[:cntrl:]<>]'),
 kind text NOT NULL DEFAULT 'lesson' CHECK (kind IN ('lesson','assessment','live_session')),
 estimated_minutes integer NOT NULL DEFAULT 30 CHECK (estimated_minutes BETWEEN 1 AND 10080),
 position integer NOT NULL CHECK (position>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (course_id,organization_id) REFERENCES trainlive.lms_course(id,organization_id),
 UNIQUE (course_id,module_key),
 UNIQUE (course_id,position)
);
CREATE INDEX lms_module_course_idx ON trainlive.lms_module(course_id,position);

-- Explicitly deny runtime SQL table access. These catalog objects are accessed
-- through the narrowly scoped SECURITY DEFINER functions below, never from a browser.
ALTER TABLE trainlive.lms_course ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainlive.lms_module ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON trainlive.lms_course,trainlive.lms_module FROM PUBLIC,trainlive_app;

CREATE FUNCTION trainlive.lms_admin_catalog(p_class uuid)
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
     'estimatedMinutes',m.estimated_minutes,'position',m.position
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

CREATE FUNCTION trainlive.lms_admin_create_course(
 p_class uuid,p_code text,p_title text,p_description text,p_mode text,
 p_passing_grade integer,p_sequential boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=trainlive,pg_temp AS $$
DECLARE v_program uuid;v_org uuid;v_course uuid;
BEGIN
 IF p_class IS DISTINCT FROM trainlive.claim_class() OR NOT trainlive.can_create_class()
 THEN RAISE EXCEPTION 'LMS management forbidden' USING ERRCODE='42501'; END IF;
 IF p_code IS NULL OR p_code !~ '^[A-Z][A-Z0-9_-]{2,31}$'
 OR p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 3 AND 160
 OR p_title ~ '[[:cntrl:]<>]' OR p_description IS NULL
 OR length(p_description)>2000 OR p_mode IS NULL
 OR p_mode NOT IN ('live','self_paced','blended')
 OR p_passing_grade IS NULL OR p_passing_grade NOT BETWEEN 0 AND 100
 OR p_sequential IS NULL
 THEN RAISE EXCEPTION 'invalid course configuration' USING ERRCODE='22023'; END IF;
 SELECT p.id,p.organization_id INTO v_program,v_org
 FROM trainlive.class_session s JOIN trainlive.program p ON p.id=s.program_id WHERE s.id=p_class;
 IF NOT FOUND THEN RAISE EXCEPTION 'source class missing' USING ERRCODE='42501'; END IF;
 INSERT INTO trainlive.lms_course(
  organization_id,program_id,code,title,description,delivery_mode,passing_grade,
  sequential_modules,created_by
 ) VALUES(v_org,v_program,p_code,btrim(p_title),p_description,p_mode,p_passing_grade,
          p_sequential,trainlive.claim_staff())
 RETURNING id INTO v_course;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'super_admin',p_class,'lms.course.create',v_course::text,
  jsonb_build_object('organizationId',v_org,'programId',v_program,'code',p_code));
 RETURN jsonb_build_object('id',v_course,'code',p_code,'status','draft');
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_admin_create_course(uuid,text,text,text,text,integer,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_admin_create_course(uuid,text,text,text,text,integer,boolean) TO trainlive_app;

CREATE FUNCTION trainlive.lms_admin_update_course(
 p_class uuid,p_course uuid,p_title text,p_description text,p_mode text,
 p_passing_grade integer,p_sequential boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=trainlive,pg_temp AS $$
DECLARE v_program uuid;v_org uuid;
BEGIN
 IF p_class IS DISTINCT FROM trainlive.claim_class() OR NOT trainlive.can_create_class()
 THEN RAISE EXCEPTION 'LMS management forbidden' USING ERRCODE='42501'; END IF;
 IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 3 AND 160
 OR p_title ~ '[[:cntrl:]<>]' OR p_description IS NULL OR length(p_description)>2000
 OR p_mode IS NULL OR p_mode NOT IN ('live','self_paced','blended')
 OR p_passing_grade IS NULL OR p_passing_grade NOT BETWEEN 0 AND 100 OR p_sequential IS NULL
 THEN RAISE EXCEPTION 'invalid course configuration' USING ERRCODE='22023'; END IF;
 SELECT p.id,p.organization_id INTO v_program,v_org
 FROM trainlive.class_session s JOIN trainlive.program p ON p.id=s.program_id WHERE s.id=p_class;
 UPDATE trainlive.lms_course
 SET title=btrim(p_title),description=p_description,delivery_mode=p_mode,
     passing_grade=p_passing_grade,sequential_modules=p_sequential,updated_at=now()
 WHERE id=p_course AND program_id=v_program AND organization_id=v_org AND status='draft';
 IF NOT FOUND THEN RAISE EXCEPTION 'course not editable in tenant' USING ERRCODE='42501'; END IF;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'super_admin',p_class,'lms.course.update',p_course::text,
  jsonb_build_object('organizationId',v_org));
 RETURN jsonb_build_object('id',p_course,'updated',true);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_admin_update_course(uuid,uuid,text,text,text,integer,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_admin_update_course(uuid,uuid,text,text,text,integer,boolean) TO trainlive_app;

CREATE FUNCTION trainlive.lms_admin_create_module(
 p_class uuid,p_course uuid,p_module_key text,p_title text,
 p_kind text,p_minutes integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=trainlive,pg_temp AS $$
DECLARE v_program uuid;v_org uuid;v_module uuid;v_position integer;
BEGIN
 IF p_class IS DISTINCT FROM trainlive.claim_class() OR NOT trainlive.can_create_class()
 THEN RAISE EXCEPTION 'LMS management forbidden' USING ERRCODE='42501'; END IF;
 IF p_module_key IS NULL OR p_module_key !~ '^[A-Z][A-Z0-9_-]{1,31}$'
 OR p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 3 AND 160
 OR p_title ~ '[[:cntrl:]<>]' OR p_kind IS NULL
 OR p_kind NOT IN ('lesson','assessment','live_session')
 OR p_minutes IS NULL OR p_minutes NOT BETWEEN 1 AND 10080
 THEN RAISE EXCEPTION 'invalid module configuration' USING ERRCODE='22023'; END IF;
 SELECT p.id,p.organization_id INTO v_program,v_org
 FROM trainlive.class_session s JOIN trainlive.program p ON p.id=s.program_id WHERE s.id=p_class;
 -- Lock the course to serialize module ordering and prevent cross-tenant insertion.
 PERFORM 1 FROM trainlive.lms_course
 WHERE id=p_course AND program_id=v_program AND organization_id=v_org AND status='draft' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'course not editable in tenant' USING ERRCODE='42501'; END IF;
 SELECT COALESCE(max(position),0)+1 INTO v_position
 FROM trainlive.lms_module WHERE course_id=p_course;
 INSERT INTO trainlive.lms_module(
  organization_id,course_id,module_key,title,kind,estimated_minutes,position
 ) VALUES(v_org,p_course,p_module_key,btrim(p_title),p_kind,p_minutes,v_position)
 RETURNING id INTO v_module;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(trainlive.claim_staff(),'super_admin',p_class,'lms.module.create',v_module::text,
  jsonb_build_object('courseId',p_course,'position',v_position));
 RETURN jsonb_build_object('id',v_module,'position',v_position);
END $$;
REVOKE ALL ON FUNCTION trainlive.lms_admin_create_module(uuid,uuid,text,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.lms_admin_create_module(uuid,uuid,text,text,text,integer) TO trainlive_app;

COMMIT;
