-- Test through DATABASE_URL_APP (a non-owner login in the trainlive_app role).
-- Requires migrations 001-008, published seed, and a runtime login.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE trainlive_app;
DO $$
DECLARE p jsonb;
BEGIN
 SELECT trainlive.production_preflight() INTO p;
 IF (p->>'ready') IS DISTINCT FROM 'true' THEN
   RAISE EXCEPTION 'preflight rejected expected restricted runtime: %', p;
 END IF;
 IF (p->>'seed_ok') IS DISTINCT FROM 'true'
    OR (p->>'rls_ok') IS DISTINCT FROM 'true'
    OR (p->>'runtime_role_ok') IS DISTINCT FROM 'true' THEN
   RAISE EXCEPTION 'readiness missing mandatory controls: %',p;
 END IF;
END $$;
ROLLBACK;
