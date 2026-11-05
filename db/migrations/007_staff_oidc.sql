-- TrainLive 007: bind verified, MFA-protected OIDC identities to pre-assigned class staff.
-- The web runtime may EXECUTE this narrow function but cannot manage staff assignments.
BEGIN;
ALTER TABLE trainlive.staff_user
  ADD COLUMN IF NOT EXISTS oidc_issuer text,
  ADD COLUMN IF NOT EXISTS oidc_subject text;
ALTER TABLE trainlive.staff_user
  ADD CONSTRAINT staff_oidc_binding_complete
  CHECK ((oidc_issuer IS NULL AND oidc_subject IS NULL) OR
         (oidc_issuer IS NOT NULL AND oidc_subject IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS staff_oidc_identity_unique
  ON trainlive.staff_user(oidc_issuer,oidc_subject)
  WHERE oidc_issuer IS NOT NULL AND oidc_subject IS NOT NULL;

CREATE FUNCTION trainlive.resolve_staff_oidc(
  p_class uuid, p_email text, p_issuer text, p_subject text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=trainlive,pg_temp AS $$
DECLARE v_id uuid; v_issuer text; v_subject text;
BEGIN
  -- Called ONLY after the API has cryptographically verified an OIDC ID token,
  -- nonce, verified email, MFA and its configured trusted issuer.
  IF p_class IS NULL OR p_email IS NULL OR p_issuer IS NULL OR p_subject IS NULL
     OR length(p_email)>254 OR length(p_issuer)>2048 OR length(p_subject)>512
     OR length(p_subject)=0 OR p_email<>lower(btrim(p_email))
  THEN RETURN NULL; END IF;
  SELECT u.id,u.oidc_issuer,u.oidc_subject INTO v_id,v_issuer,v_subject
    FROM trainlive.staff_user u
    JOIN trainlive.class_staff s ON s.user_id=u.id
    WHERE u.email=p_email AND s.class_id=p_class
      AND s.role IN ('facilitator','cohost','observer')
    FOR UPDATE OF u;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_issuer IS NULL AND v_subject IS NULL THEN
    UPDATE trainlive.staff_user
      SET oidc_issuer=p_issuer,oidc_subject=p_subject WHERE id=v_id;
  ELSIF v_issuer IS DISTINCT FROM p_issuer OR
        v_subject IS DISTINCT FROM p_subject THEN
    RETURN NULL;
  END IF;
  INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
  VALUES(v_id,'staff',p_class,'auth.oidc.login','staff-user',
         jsonb_build_object('issuer',p_issuer));
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION trainlive.resolve_staff_oidc(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.resolve_staff_oidc(uuid,text,text,text) TO trainlive_app;
COMMIT;
