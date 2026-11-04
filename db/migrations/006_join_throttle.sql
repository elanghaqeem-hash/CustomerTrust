-- Runtime join limiter; server only stores an HMAC digest, never raw IP addresses.
BEGIN;
CREATE TABLE trainlive.join_throttle (
  key_hash text PRIMARY KEY CHECK(length(key_hash)=64),
  period_start timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 1 CHECK(attempt_count>=1)
);
REVOKE ALL ON trainlive.join_throttle FROM PUBLIC, trainlive_app;
CREATE FUNCTION trainlive.allow_join_attempt(p_key_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=trainlive,pg_temp AS $$
DECLARE n integer;
BEGIN
  IF p_key_hash IS NULL OR p_key_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN false;
  END IF;
  INSERT INTO trainlive.join_throttle(key_hash,period_start,attempt_count)
  VALUES(p_key_hash,now(),1)
  ON CONFLICT (key_hash) DO UPDATE SET
    attempt_count=CASE WHEN join_throttle.period_start < now()-interval '10 minutes'
      THEN 1 ELSE join_throttle.attempt_count+1 END,
    period_start=CASE WHEN join_throttle.period_start < now()-interval '10 minutes'
      THEN now() ELSE join_throttle.period_start END
  RETURNING attempt_count INTO n;
  RETURN n<=100;
END $$;
REVOKE ALL ON FUNCTION trainlive.allow_join_attempt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.allow_join_attempt(text) TO trainlive_app;
COMMIT;
