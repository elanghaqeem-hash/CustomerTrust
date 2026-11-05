-- Run with psql -v app_password=... as database migration owner.
-- psql literal quoting prevents SQL injection; never echo the secret.
SELECT format('CREATE ROLE trainlive_web LOGIN PASSWORD %L', :'app_password')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='trainlive_web')
\gexec
GRANT trainlive_app TO trainlive_web;
