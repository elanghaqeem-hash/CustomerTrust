-- TrainLive 009: prevent one office NAT from rejecting multiple legitimate
-- 25-person classes while retaining a global per-IP anti-bruteforce cap.
-- Arguments MUST be HMAC-SHA256 digests computed server-side; never raw IPs
-- or join codes. No privilege for the runtime login to read these counters.
BEGIN;
CREATE FUNCTION trainlive.allow_join_attempt(p_ip_hash text,p_ip_class_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=trainlive,pg_temp AS $$
DECLARE overall integer; per_class integer;
BEGIN
 IF p_ip_hash IS NULL OR p_ip_class_hash IS NULL
    OR p_ip_hash !~ '^[a-f0-9]{64}$'
    OR p_ip_class_hash !~ '^[a-f0-9]{64}$'
    OR p_ip_hash=p_ip_class_hash THEN RETURN false; END IF;

 INSERT INTO trainlive.join_throttle(key_hash,period_start,attempt_count)
 VALUES(p_ip_hash,now(),1)
 ON CONFLICT(key_hash) DO UPDATE SET
  attempt_count=CASE WHEN join_throttle.period_start<now()-interval '10 minutes'
   THEN 1 ELSE join_throttle.attempt_count+1 END,
  period_start=CASE WHEN join_throttle.period_start<now()-interval '10 minutes'
   THEN now() ELSE join_throttle.period_start END
 RETURNING attempt_count INTO overall;
 IF overall>1000 THEN RETURN false; END IF;

 INSERT INTO trainlive.join_throttle(key_hash,period_start,attempt_count)
 VALUES(p_ip_class_hash,now(),1)
 ON CONFLICT(key_hash) DO UPDATE SET
  attempt_count=CASE WHEN join_throttle.period_start<now()-interval '10 minutes'
   THEN 1 ELSE join_throttle.attempt_count+1 END,
  period_start=CASE WHEN join_throttle.period_start<now()-interval '10 minutes'
   THEN now() ELSE join_throttle.period_start END
 RETURNING attempt_count INTO per_class;
 RETURN per_class<=40;
END $$;
REVOKE ALL ON FUNCTION trainlive.allow_join_attempt(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trainlive.allow_join_attempt(text,text) TO trainlive_app;
COMMIT;
