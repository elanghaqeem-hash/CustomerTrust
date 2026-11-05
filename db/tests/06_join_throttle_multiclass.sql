-- Verify 24 × 25 attendees behind a shared IP using 16 bounded shards.
-- Hashed identifiers are synthetic; NO real addresses or join codes stored.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE i integer; c integer; permitted boolean;
 ipkey text; classkey text;
BEGIN
 -- Brute-force attempts on the same class code must stop after 40.
 FOR i IN 1..40 LOOP
  SELECT trainlive.allow_join_attempt(repeat('b',64),repeat('c',64)) INTO permitted;
  IF NOT permitted THEN RAISE EXCEPTION 'class quota rejected legitimate attempt %',i; END IF;
 END LOOP;
 SELECT trainlive.allow_join_attempt(repeat('b',64),repeat('c',64)) INTO permitted;
 IF permitted THEN RAISE EXCEPTION 'class quota missed attempt 41'; END IF;

 -- Six hundred participants can join 24 distinct 25-person classes
 -- through 16 secret-keyed IP buckets without exhausting any bucket.
 FOR c IN 1..24 LOOP
  classkey:=lpad(to_hex(100+c),64,'0');
  FOR i IN 1..25 LOOP
   ipkey:=lpad(to_hex(((((c-1)*25+i-1)%16)+1)),64,'a');
   SELECT trainlive.allow_join_attempt(ipkey,classkey) INTO permitted;
   IF NOT permitted THEN
    RAISE EXCEPTION 'shared NAT rejected class %, user %',c,i;
   END IF;
  END LOOP;
 END LOOP;

 -- A single IP shard can never accept more than 64 attempts per window,
 -- even when trying distinct class-code pairs.
 FOR i IN 1..64 LOOP
  SELECT trainlive.allow_join_attempt(repeat('d',64),lpad(to_hex(300+i),64,'e'))
   INTO permitted;
  IF NOT permitted THEN RAISE EXCEPTION 'IP shard quota prematurely blocked %',i; END IF;
 END LOOP;
 SELECT trainlive.allow_join_attempt(repeat('d',64),repeat('f',64)) INTO permitted;
 IF permitted THEN RAISE EXCEPTION 'IP shard quota did not block attempt 65'; END IF;
END $$;
ROLLBACK;
