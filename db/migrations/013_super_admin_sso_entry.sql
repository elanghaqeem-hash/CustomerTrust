-- TrainLive 013: allow one stable, class-independent SSO login entry for an
-- ALREADY-approved super admin. Never promote users via this function.
-- The API must verify a signed ID token, email_verified, nonce, issuer and MFA
-- before calling this restricted SECURITY DEFINER function.
BEGIN;
CREATE FUNCTION trainlive.resolve_super_admin_oidc(
 p_email text,p_issuer text,p_subject text
) RETURNS TABLE(staff_id uuid,class_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE v_id uuid; v_class uuid; v_issuer text; v_subject text;
BEGIN
 IF p_email IS NULL OR p_email<>lower(btrim(p_email))
    OR length(p_email)>254 OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+
    OR p_issuer IS NULL OR p_issuer !~ '^https://'
    OR length(p_issuer)>2048 OR p_subject IS NULL
    OR length(p_subject)<1 OR length(p_subject)>512
 THEN RETURN; END IF;

 -- A Super Admin must be preprovisioned and assigned as a facilitator.
 -- Lock the staff identity to prevent changing issuer/subject concurrently.
 SELECT u.id,u.oidc_issuer,u.oidc_subject,s.class_id
 INTO v_id,v_issuer,v_subject,v_class
 FROM trainlive.staff_user u
 JOIN trainlive.class_staff s ON s.user_id=u.id
 WHERE u.email=p_email AND u.is_super_admin IS TRUE
   AND s.role='facilitator'
 ORDER BY s.class_id
 LIMIT 1 FOR UPDATE OF u;

 IF NOT FOUND THEN RETURN; END IF;
 IF v_issuer IS NULL AND v_subject IS NULL THEN
  UPDATE trainlive.staff_user
   SET oidc_issuer=p_issuer,oidc_subject=p_subject WHERE id=v_id;
 ELSIF v_issuer IS DISTINCT FROM p_issuer OR v_subject IS DISTINCT FROM p_subject THEN
  RETURN;
 END IF;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(v_id,'super_admin',v_class,'auth.oidc.admin_login','staff_user',
  jsonb_build_object('issuer',p_issuer));
 staff_id:=v_id; class_id:=v_class; RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION trainlive.resolve_super_admin_oidc(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.resolve_super_admin_oidc(text,text,text) TO trainlive_app;
COMMIT;

    OR p_issuer IS NULL OR p_issuer !~ '^https://'
    OR length(p_issuer)>2048 OR p_subject IS NULL
    OR length(p_subject)<1 OR length(p_subject)>512
 THEN RETURN; END IF;

 -- A Super Admin must be preprovisioned and assigned as a facilitator.
 -- Lock the staff identity to prevent changing issuer/subject concurrently.
 SELECT u.id,u.oidc_issuer,u.oidc_subject,s.class_id
 INTO v_id,v_issuer,v_subject,v_class
 FROM trainlive.staff_user u
 JOIN trainlive.class_staff s ON s.user_id=u.id
 WHERE u.email=p_email AND u.is_super_admin IS TRUE
   AND s.role='facilitator'
 ORDER BY s.class_id
 LIMIT 1 FOR UPDATE OF u;

 IF NOT FOUND THEN RETURN; END IF;
 IF v_issuer IS NULL AND v_subject IS NULL THEN
  UPDATE trainlive.staff_user
   SET oidc_issuer=p_issuer,oidc_subject=p_subject WHERE id=v_id;
 ELSIF v_issuer IS DISTINCT FROM p_issuer OR v_subject IS DISTINCT FROM p_subject THEN
  RETURN;
 END IF;
 INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
 VALUES(v_id,'super_admin',v_class,'auth.oidc.admin_login','staff_user',
  jsonb_build_object('issuer',p_issuer));
 staff_id:=v_id; class_id:=v_class; RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION trainlive.resolve_super_admin_oidc(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.resolve_super_admin_oidc(text,text,text) TO trainlive_app;
COMMIT;
