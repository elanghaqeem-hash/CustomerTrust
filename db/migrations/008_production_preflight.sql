-- Runtime readiness: tenant isolation, least privilege and canonical training seed.
-- Apply with the trusted migration owner, AFTER 001-007. This is not a migration executor.
BEGIN;

CREATE FUNCTION trainlive.production_preflight()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=trainlive,pg_temp AS $$
DECLARE
  v_role_ok boolean := false;
  v_rls_ok boolean := false;
  v_seed_ok boolean := false;
  v_functions_ok boolean := false;
BEGIN
  -- session_user remains the original login even when the API calls
  -- SET LOCAL ROLE trainlive_app. Reject migration/owner/superuser logins.
  SELECT NOT r.rolsuper
    AND NOT r.rolbypassrls
    AND NOT r.rolcreaterole
    AND r.rolcanlogin
    AND r.rolname <> 'trainlive_app'
    AND pg_has_role(r.rolname, 'trainlive_app', 'MEMBER')
    AND NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='trainlive' AND c.relkind IN ('r','p')
        AND c.relowner=r.oid
    )
    INTO v_role_ok
    FROM pg_roles r WHERE r.rolname=session_user;

  SELECT (count(*)=12) AND COALESCE(bool_and(c.relrowsecurity),false)
    INTO v_rls_ok
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='trainlive' AND c.relkind IN ('r','p')
      AND c.relname=ANY(ARRAY[
        'class_session','class_staff','class_item','class_worksheet',
        'participant','response','worksheet_submission','chat_message',
        'point_ledger','attendance_log','followup','audit_log'
      ]);

  -- The canonical published Bank Sulteng release must exist before GO.
  SELECT EXISTS (
    SELECT 1 FROM trainlive.content_version v
      JOIN trainlive.program p ON p.id=v.program_id
    WHERE p.code='CTC-BPDSULTENG'
      AND v.status='published' AND v.version_no=1
      AND (SELECT count(*) FROM trainlive.content_item i WHERE i.content_version_id=v.id)=16
      AND (SELECT count(*) FROM trainlive.worksheet_template w WHERE w.content_version_id=v.id)=5
  ) INTO v_seed_ok;

  v_functions_ok := to_regprocedure('trainlive.join_class(text,text,text,text,boolean)') IS NOT NULL
    AND to_regprocedure('trainlive.claim_class()') IS NOT NULL
    AND to_regprocedure('trainlive.allow_join_attempt(text)') IS NOT NULL
    AND to_regprocedure('trainlive.resolve_staff_oidc(uuid,text,text,text)') IS NOT NULL
    AND NOT has_table_privilege('trainlive_app','trainlive.join_throttle','SELECT')
    AND NOT has_table_privilege('trainlive_app','trainlive.staff_user','SELECT');

  RETURN jsonb_build_object(
    'ready', COALESCE(v_role_ok,false) AND COALESCE(v_rls_ok,false)
      AND COALESCE(v_seed_ok,false) AND COALESCE(v_functions_ok,false),
    'runtime_role_ok', COALESCE(v_role_ok,false),
    'rls_ok', COALESCE(v_rls_ok,false),
    'seed_ok', COALESCE(v_seed_ok,false),
    'schema_ok', COALESCE(v_functions_ok,false)
  );
END $$;
REVOKE ALL ON FUNCTION trainlive.production_preflight() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.production_preflight() TO trainlive_app;
COMMIT;
