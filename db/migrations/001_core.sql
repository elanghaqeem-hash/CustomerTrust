-- TrainLive schema, PostgreSQL 15+. Apply as a migration owner; NEVER as the web runtime role.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS trainlive;
CREATE TABLE trainlive.organization (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE,
 branding_json jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE trainlive.program (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES trainlive.organization(id),
 code text NOT NULL UNIQUE, title text NOT NULL, description text, UNIQUE(id,organization_id)
);
CREATE TABLE trainlive.content_version (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES trainlive.program(id),
 version_no integer NOT NULL CHECK(version_no>0), status text NOT NULL DEFAULT 'draft'
 CHECK(status IN ('draft','published','archived')), published_at timestamptz, source_yaml text NOT NULL DEFAULT '',
 UNIQUE(program_id,version_no), UNIQUE(id,program_id),
 CHECK((status='draft' AND published_at IS NULL) OR (status<>'draft' AND published_at IS NOT NULL))
);
CREATE TABLE trainlive.content_item (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content_version_id uuid NOT NULL REFERENCES trainlive.content_version(id),
 item_key text NOT NULL, type text NOT NULL, module_no integer NOT NULL, slide_ref integer,
 order_no integer NOT NULL, payload jsonb NOT NULL, UNIQUE(content_version_id,item_key)
);
CREATE TABLE trainlive.worksheet_template (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content_version_id uuid NOT NULL REFERENCES trainlive.content_version(id),
 ws_key text NOT NULL, title text NOT NULL, module_no integer NOT NULL, slide_ref integer, payload jsonb NOT NULL,
 UNIQUE(content_version_id,ws_key)
);
CREATE TABLE trainlive.class_session (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES trainlive.program(id),
 content_version_id uuid NOT NULL, name text NOT NULL, batch_no text NOT NULL,
 start_at timestamptz NOT NULL, end_at timestamptz NOT NULL, timezone text NOT NULL DEFAULT 'Asia/Makassar',
 join_code text NOT NULL UNIQUE CHECK(join_code ~ '^[A-Z2-9]{6}$'),
 join_open_from timestamptz NOT NULL, join_open_until timestamptz NOT NULL,
 capacity integer NOT NULL DEFAULT 25 CHECK(capacity BETWEEN 1 AND 10000),
 status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','live','closed','archived')),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(content_version_id,program_id) REFERENCES trainlive.content_version(id,program_id),
 CHECK(end_at>start_at AND join_open_until>join_open_from)
);
CREATE TABLE trainlive.staff_user (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, display_name text NOT NULL,
 is_super_admin boolean NOT NULL DEFAULT false
);
CREATE TABLE trainlive.class_staff (
 class_id uuid NOT NULL REFERENCES trainlive.class_session(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES trainlive.staff_user(id),
 role text NOT NULL CHECK(role IN ('facilitator','cohost','observer')), PRIMARY KEY(class_id,user_id)
);
CREATE TABLE trainlive.class_item (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), class_id uuid NOT NULL REFERENCES trainlive.class_session(id) ON DELETE CASCADE,
 source_item_id uuid NOT NULL REFERENCES trainlive.content_item(id), item_key text NOT NULL, type text NOT NULL,
 module_no integer NOT NULL, slide_ref integer, order_no integer NOT NULL, payload jsonb NOT NULL,
 hidden boolean NOT NULL DEFAULT false, state text NOT NULL DEFAULT 'idle'
 CHECK(state IN ('idle','open','closed','revealed')), timer_sec integer NOT NULL DEFAULT 30
 CHECK(timer_sec BETWEEN 0 AND 86400), opened_at timestamptz, closed_at timestamptz,
 UNIQUE(class_id,id), UNIQUE(class_id,item_key), UNIQUE(class_id,source_item_id)
);
CREATE TABLE trainlive.class_worksheet (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), class_id uuid NOT NULL REFERENCES trainlive.class_session(id) ON DELETE CASCADE,
 source_template_id uuid NOT NULL REFERENCES trainlive.worksheet_template(id),
 ws_key text NOT NULL, title text NOT NULL, module_no integer NOT NULL,
 slide_ref integer, payload jsonb NOT NULL, due_at timestamptz NOT NULL,
 UNIQUE(class_id,id), UNIQUE(class_id,ws_key)
);
CREATE TABLE trainlive.participant (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), class_id uuid NOT NULL REFERENCES trainlive.class_session(id) ON DELETE CASCADE,
 display_name text NOT NULL, unit text NOT NULL, email text, consent_at timestamptz NOT NULL,
 joined_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(class_id,id)
);
-- An anonymous response has NO participant_id; anonymous_key is a per-class-item HMAC for deduplication.
CREATE TABLE trainlive.response (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), class_id uuid NOT NULL,
 class_item_id uuid NOT NULL, participant_id uuid, anonymous_key text,
 answer_json jsonb NOT NULL, is_correct boolean, answered_at timestamptz NOT NULL DEFAULT now(),
 latency_ms integer CHECK(latency_ms>=0),
 FOREIGN KEY(class_id,class_item_id) REFERENCES trainlive.class_item(class_id,id) ON DELETE CASCADE,
 FOREIGN KEY(class_id,participant_id) REFERENCES trainlive.participant(class_id,id) ON DELETE CASCADE,
 CHECK ((participant_id IS NOT NULL AND anonymous_key IS NULL) OR
        (participant_id IS NULL AND anonymous_key IS NOT NULL)),
 UNIQUE(class_id,class_item_id,participant_id), UNIQUE(class_id,class_item_id,anonymous_key)
);
CREATE TABLE trainlive.worksheet_submission (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), class_id uuid NOT NULL,
 class_worksheet_id uuid NOT NULL, participant_id uuid NOT NULL,
 data_json jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted')), submitted_at timestamptz,
 FOREIGN KEY(class_id,class_worksheet_id) REFERENCES trainlive.class_worksheet(class_id,id) ON DELETE CASCADE,
 FOREIGN KEY(class_id,participant_id) REFERENCES trainlive.participant(class_id,id) ON DELETE CASCADE,
 UNIQUE(class_id,class_worksheet_id,participant_id)
);
CREATE TABLE trainlive.chat_message (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), class_id uuid NOT NULL, participant_id uuid NOT NULL,
 body text NOT NULL, hidden boolean NOT NULL DEFAULT false, read_aloud boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(class_id,participant_id) REFERENCES trainlive.participant(class_id,id) ON DELETE CASCADE,
 UNIQUE(class_id,id)
);
CREATE TABLE trainlive.point_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), class_id uuid NOT NULL, participant_id uuid NOT NULL,
 points integer NOT NULL CHECK(points IN (5,10,20)),
 reason text NOT NULL CHECK(reason IN ('quiz_correct','chat_read_aloud','worksheet_complete')),
 source_ref uuid NOT NULL, event_key text NOT NULL,
 awarded_by uuid REFERENCES trainlive.staff_user(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(class_id,participant_id) REFERENCES trainlive.participant(class_id,id) ON DELETE CASCADE,
 UNIQUE(class_id,event_key)
);
CREATE TABLE trainlive.attendance_log (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 class_id uuid NOT NULL, participant_id uuid NOT NULL,
 event text NOT NULL CHECK(event IN ('join','heartbeat','leave')), at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(class_id,participant_id) REFERENCES trainlive.participant(class_id,id) ON DELETE CASCADE
);
CREATE TABLE trainlive.followup (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), class_id uuid NOT NULL, participant_id uuid NOT NULL,
 stage text NOT NULL CHECK(stage IN ('h1','h7','h30','h60')),
 data_json jsonb NOT NULL DEFAULT '{}'::jsonb, sent_at timestamptz, completed_at timestamptz,
 FOREIGN KEY(class_id,participant_id) REFERENCES trainlive.participant(class_id,id) ON DELETE CASCADE,
 UNIQUE(class_id,participant_id,stage)
);
CREATE TABLE trainlive.audit_log (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid, actor_role text NOT NULL,
 class_id uuid REFERENCES trainlive.class_session(id), action text NOT NULL, target text NOT NULL,
 payload_json jsonb NOT NULL DEFAULT '{}'::jsonb, at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON trainlive.class_staff(class_id,role);
CREATE INDEX ON trainlive.class_item(class_id,order_no);
CREATE INDEX ON trainlive.class_worksheet(class_id,ws_key);
CREATE INDEX ON trainlive.participant(class_id,joined_at);
CREATE INDEX ON trainlive.response(class_id,class_item_id);
CREATE INDEX ON trainlive.worksheet_submission(class_id,class_worksheet_id);
CREATE INDEX ON trainlive.chat_message(class_id,created_at);
CREATE INDEX ON trainlive.point_ledger(class_id,participant_id);
CREATE INDEX ON trainlive.attendance_log(class_id,participant_id,at);
CREATE INDEX ON trainlive.followup(class_id,stage);
CREATE INDEX ON trainlive.audit_log(class_id,at);

-- Neither published versions nor their children can be changed, except published -> archived.
CREATE FUNCTION trainlive.guard_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
   IF OLD.status<>'draft' THEN RAISE EXCEPTION 'published version immutable'; END IF;
   RETURN OLD;
 END IF;
 IF OLD.status <> 'draft' THEN
   IF OLD.status='published' AND NEW.status='archived'
     AND (to_jsonb(NEW)-'status')=(to_jsonb(OLD)-'status') THEN RETURN NEW; END IF;
   RAISE EXCEPTION 'published version immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER content_version_guard BEFORE UPDATE OR DELETE ON trainlive.content_version
 FOR EACH ROW EXECUTE FUNCTION trainlive.guard_version();

CREATE FUNCTION trainlive.guard_content_child() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE vid uuid; s text;
BEGIN
 vid:=CASE WHEN TG_OP='DELETE' THEN OLD.content_version_id ELSE NEW.content_version_id END;
 SELECT status INTO s FROM trainlive.content_version WHERE id=vid;
 IF s<>'draft' THEN RAISE EXCEPTION 'published content immutable'; END IF;
 IF TG_OP='UPDATE' AND OLD.content_version_id<>NEW.content_version_id THEN
   RAISE EXCEPTION 'moving item to another version is prohibited';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER content_item_guard BEFORE INSERT OR UPDATE OR DELETE ON trainlive.content_item
 FOR EACH ROW EXECUTE FUNCTION trainlive.guard_content_child();
CREATE TRIGGER worksheet_guard BEFORE INSERT OR UPDATE OR DELETE ON trainlive.worksheet_template
 FOR EACH ROW EXECUTE FUNCTION trainlive.guard_content_child();

-- Copy snapshots atomically when a class is created from a published master version.
CREATE FUNCTION trainlive.snapshot_class() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (SELECT status FROM trainlive.content_version WHERE id=NEW.content_version_id)<>'published' THEN
   RAISE EXCEPTION 'class requires a published version';
 END IF;
 INSERT INTO trainlive.class_item(class_id,source_item_id,item_key,type,module_no,slide_ref,order_no,payload,timer_sec)
 SELECT NEW.id,id,item_key,type,module_no,slide_ref,order_no,payload,
        COALESCE((payload->>'timer_sec')::integer,30)
 FROM trainlive.content_item WHERE content_version_id=NEW.content_version_id;
 INSERT INTO trainlive.class_worksheet(class_id,source_template_id,ws_key,title,module_no,slide_ref,payload,due_at)
 SELECT NEW.id,id,ws_key,title,module_no,slide_ref,payload,
        ((NEW.end_at AT TIME ZONE NEW.timezone)::date + 1 + time '23:59') AT TIME ZONE NEW.timezone
 FROM trainlive.worksheet_template WHERE content_version_id=NEW.content_version_id;
 RETURN NEW;
END $$;
CREATE TRIGGER class_snapshot AFTER INSERT ON trainlive.class_session
 FOR EACH ROW EXECUTE FUNCTION trainlive.snapshot_class();

-- Snapshotted content never changes, but timer/ordering/visibility may be adjusted pre-start.
CREATE FUNCTION trainlive.guard_class_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.class_id<>NEW.class_id OR OLD.source_item_id<>NEW.source_item_id OR
   OLD.item_key<>NEW.item_key OR OLD.payload<>NEW.payload OR OLD.type<>NEW.type OR
   OLD.module_no<>NEW.module_no OR OLD.slide_ref IS DISTINCT FROM NEW.slide_ref
 THEN RAISE EXCEPTION 'class content is immutable'; END IF;
 IF (SELECT status FROM trainlive.class_session WHERE id=OLD.class_id)<>'scheduled'
   AND (OLD.timer_sec<>NEW.timer_sec OR OLD.hidden<>NEW.hidden OR OLD.order_no<>NEW.order_no)
 THEN RAISE EXCEPTION 'class config locked after start'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER class_item_guard BEFORE UPDATE ON trainlive.class_item
 FOR EACH ROW EXECUTE FUNCTION trainlive.guard_class_item();

CREATE FUNCTION trainlive.guard_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'point ledger is append-only'; END $$;
CREATE TRIGGER ledger_append_only BEFORE UPDATE OR DELETE ON trainlive.point_ledger
 FOR EACH ROW EXECUTE FUNCTION trainlive.guard_ledger();

COMMIT;
