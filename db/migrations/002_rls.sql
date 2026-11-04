-- Class isolation: every runtime operation must be executed after a verified JWT sets
-- LOCAL trainlive.class_id and participant_id or staff_id on an isolated DB transaction.
-- Never expose this DB role / SQL connection to browsers or untrusted clients.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='trainlive_app') THEN
  CREATE ROLE trainlive_app NOLOGIN NOBYPASSRLS;
 END IF;
END $$;
GRANT USAGE ON SCHEMA trainlive TO trainlive_app;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA trainlive TO trainlive_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA trainlive TO trainlive_app;
REVOKE ALL ON trainlive.organization,trainlive.program,trainlive.content_version,
 trainlive.content_item,trainlive.worksheet_template,trainlive.staff_user FROM trainlive_app;
REVOKE DELETE ON ALL TABLES IN SCHEMA trainlive FROM trainlive_app;

CREATE FUNCTION trainlive.claim_class() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT NULLIF(current_setting('trainlive.class_id',true),'')::uuid
$$;
CREATE FUNCTION trainlive.claim_participant() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT NULLIF(current_setting('trainlive.participant_id',true),'')::uuid
$$;
CREATE FUNCTION trainlive.claim_staff() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT NULLIF(current_setting('trainlive.staff_id',true),'')::uuid
$$;
-- SECURITY DEFINER to inspect class_staff without recursive RLS. Owner must be trusted.
CREATE FUNCTION trainlive.assigned(_class uuid,_roles text[] DEFAULT ARRAY['facilitator','cohost','observer'])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM trainlive.class_staff s
 WHERE s.class_id=_class AND s.user_id=trainlive.claim_staff() AND s.role=ANY(_roles))
$$;
CREATE FUNCTION trainlive.staff_scope(_class uuid,_roles text[] DEFAULT ARRAY['facilitator','cohost','observer'])
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT _class=trainlive.claim_class() AND trainlive.assigned(_class,_roles)
$$;
CREATE FUNCTION trainlive.own_scope(_class uuid,_participant uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT _class=trainlive.claim_class() AND _participant=trainlive.claim_participant()
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA trainlive TO trainlive_app;

DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['class_session','class_staff','class_item','class_worksheet',
 'participant','response','worksheet_submission','chat_message','point_ledger',
 'attendance_log','followup','audit_log'] LOOP
   EXECUTE format('ALTER TABLE trainlive.%I ENABLE ROW LEVEL SECURITY',t);
 END LOOP;
END $$;

CREATE POLICY class_select ON trainlive.class_session FOR SELECT TO trainlive_app
USING (id=trainlive.claim_class() AND
 (trainlive.claim_participant() IS NOT NULL OR trainlive.assigned(id)));

CREATE POLICY class_staff_select ON trainlive.class_staff FOR SELECT TO trainlive_app
USING (trainlive.staff_scope(class_id));
CREATE POLICY class_item_select ON trainlive.class_item FOR SELECT TO trainlive_app
USING (class_id=trainlive.claim_class() AND
 (trainlive.claim_participant() IS NOT NULL OR trainlive.assigned(class_id)));
CREATE POLICY class_item_update ON trainlive.class_item FOR UPDATE TO trainlive_app
USING (trainlive.staff_scope(class_id,ARRAY['facilitator','cohost']))
WITH CHECK (trainlive.staff_scope(class_id,ARRAY['facilitator','cohost']));
CREATE POLICY class_worksheet_select ON trainlive.class_worksheet FOR SELECT TO trainlive_app
USING (class_id=trainlive.claim_class() AND
 (trainlive.claim_participant() IS NOT NULL OR trainlive.assigned(class_id)));

CREATE POLICY participant_select ON trainlive.participant FOR SELECT TO trainlive_app
USING (trainlive.own_scope(class_id,id) OR trainlive.staff_scope(class_id));
CREATE POLICY participant_update ON trainlive.participant FOR UPDATE TO trainlive_app
USING (trainlive.own_scope(class_id,id))
WITH CHECK (trainlive.own_scope(class_id,id));

CREATE POLICY response_select ON trainlive.response FOR SELECT TO trainlive_app
USING (trainlive.own_scope(class_id,participant_id) OR trainlive.staff_scope(class_id));
CREATE POLICY response_insert ON trainlive.response FOR INSERT TO trainlive_app
WITH CHECK (
 class_id=trainlive.claim_class()
 AND trainlive.claim_participant() IS NOT NULL
 AND (participant_id=trainlive.claim_participant() OR
      (participant_id IS NULL AND anonymous_key IS NOT NULL))
);

CREATE POLICY submission_select ON trainlive.worksheet_submission FOR SELECT TO trainlive_app
USING (trainlive.own_scope(class_id,participant_id) OR trainlive.staff_scope(class_id));
CREATE POLICY submission_insert ON trainlive.worksheet_submission FOR INSERT TO trainlive_app
WITH CHECK (trainlive.own_scope(class_id,participant_id));
CREATE POLICY submission_update ON trainlive.worksheet_submission FOR UPDATE TO trainlive_app
USING (trainlive.own_scope(class_id,participant_id))
WITH CHECK (trainlive.own_scope(class_id,participant_id));

CREATE POLICY chat_select ON trainlive.chat_message FOR SELECT TO trainlive_app
USING (trainlive.own_scope(class_id,participant_id) OR trainlive.staff_scope(class_id));
CREATE POLICY chat_insert ON trainlive.chat_message FOR INSERT TO trainlive_app
WITH CHECK (trainlive.own_scope(class_id,participant_id));
CREATE POLICY chat_staff_update ON trainlive.chat_message FOR UPDATE TO trainlive_app
USING (trainlive.staff_scope(class_id,ARRAY['facilitator','cohost']))
WITH CHECK (trainlive.staff_scope(class_id,ARRAY['facilitator','cohost']));

CREATE POLICY ledger_select ON trainlive.point_ledger FOR SELECT TO trainlive_app
USING (trainlive.own_scope(class_id,participant_id) OR trainlive.staff_scope(class_id));
CREATE POLICY ledger_insert ON trainlive.point_ledger FOR INSERT TO trainlive_app
WITH CHECK (trainlive.staff_scope(class_id,ARRAY['facilitator','cohost']));

CREATE POLICY attendance_select ON trainlive.attendance_log FOR SELECT TO trainlive_app
USING (trainlive.own_scope(class_id,participant_id) OR trainlive.staff_scope(class_id));
CREATE POLICY attendance_insert ON trainlive.attendance_log FOR INSERT TO trainlive_app
WITH CHECK (trainlive.own_scope(class_id,participant_id));

CREATE POLICY followup_select ON trainlive.followup FOR SELECT TO trainlive_app
USING (trainlive.own_scope(class_id,participant_id) OR trainlive.staff_scope(class_id));
CREATE POLICY followup_update ON trainlive.followup FOR UPDATE TO trainlive_app
USING (trainlive.own_scope(class_id,participant_id) OR trainlive.staff_scope(class_id))
WITH CHECK (trainlive.own_scope(class_id,participant_id) OR trainlive.staff_scope(class_id));
CREATE POLICY followup_insert ON trainlive.followup FOR INSERT TO trainlive_app
WITH CHECK (trainlive.staff_scope(class_id,ARRAY['facilitator','cohost']));

CREATE POLICY audit_select ON trainlive.audit_log FOR SELECT TO trainlive_app
USING (class_id IS NOT NULL AND trainlive.staff_scope(class_id));
CREATE POLICY audit_insert ON trainlive.audit_log FOR INSERT TO trainlive_app
WITH CHECK (class_id IS NOT NULL AND trainlive.staff_scope(class_id,ARRAY['facilitator','cohost']));

-- Login/management APIs use separately trusted server-side roles, never client SQL.
COMMIT;
