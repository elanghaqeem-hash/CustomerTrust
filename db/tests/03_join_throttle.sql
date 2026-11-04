BEGIN;
DO $$
DECLARE n integer; permitted boolean;
BEGIN
  FOR n IN 1..100 LOOP
    SELECT trainlive.allow_join_attempt(repeat('a',64)) INTO permitted;
    IF NOT permitted THEN RAISE EXCEPTION 'throttle rejected attempt % too early', n; END IF;
  END LOOP;
  SELECT trainlive.allow_join_attempt(repeat('a',64)) INTO permitted;
  IF permitted THEN RAISE EXCEPTION 'throttle did not reject attempt 101'; END IF;
END $$;
ROLLBACK;
