-- A shared NAT IP must support at least 24 independent classes x 25 users,
-- while repeated invalid attempts against the same code are still throttled.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE i integer; c integer; permitted boolean;
 ipkey text:=repeat('b',64); classkey text;
BEGIN
 FOR i IN 1..40 LOOP
  SELECT trainlive.allow_join_attempt(ipkey,repeat('c',64)) INTO permitted;
  IF NOT permitted THEN RAISE EXCEPTION 'per-class limit prematurely blocked request %',i; END IF;
 END LOOP;
 SELECT trainlive.allow_join_attempt(ipkey,repeat('c',64)) INTO permitted;
 IF permitted THEN RAISE EXCEPTION 'per-class limit failed at 41'; END IF;
 FOR c IN 1..24 LOOP
  classkey:=lpad(to_hex(c),64,'0');
  FOR i IN 1..25 LOOP
   SELECT trainlive.allow_join_attempt(ipkey,classkey) INTO permitted;
   IF NOT permitted THEN RAISE EXCEPTION 'legitimate shared NAT blocked class %, participant %',c,i; END IF;
  END LOOP;
 END LOOP;
END $$;
ROLLBACK;
