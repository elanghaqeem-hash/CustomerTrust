#!/usr/bin/env bash
# Prove that a pg_dump custom-format backup can be restored into an isolated,
# disposable PostgreSQL container. Never touches the TrainLive production DB.
set -euo pipefail
set +x
backup="\${1:-}"
if [[ $# -ne 1 || ! -f "$backup" || -L "$backup" ]]; then
 echo "Usage: bash deploy/hostinger/restore-drill.sh /secure/path/trainlive-YYYYmmdd.dump" >&2
 exit 2
fi
command -v docker >/dev/null || { echo "Docker Engine is required" >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker daemon unavailable" >&2; exit 1; }
backup="$(realpath "$backup")"
container="trainlive-restore-drill-$RANDOM-$$"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
# Network isolation and an unbound Postgres port prevent this recovery test
# from ever accepting external connections.
docker run --detach --name "$container" --network none \
 --env POSTGRES_HOST_AUTH_METHOD=trust \
 --env POSTGRES_DB=trainlive_restore \
 --volume "$backup:/backup.dump:ro" postgres:16-alpine >/dev/null
ready=false
for i in $(seq 1 40); do
 if docker exec "$container" pg_isready -U postgres -d trainlive_restore >/dev/null 2>&1; then
  ready=true; break
 fi
 sleep 1
done
[[ "$ready" == true ]] || { echo "NO-GO: disposable recovery database did not start" >&2; exit 1; }
# RLS policy objects refer to the application role. Recreate its NAME only in
# this disposable instance; the production credential is never used or copied.
docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d trainlive_restore \
 -c 'CREATE ROLE trainlive_app NOLOGIN' >/dev/null
if ! docker exec "$container" pg_restore --exit-on-error --no-owner --no-acl \
 -U postgres -d trainlive_restore /backup.dump >/dev/null 2>&1; then
 echo "NO-GO: backup could not be fully restored to the disposable database" >&2
 exit 1
fi
if ! docker exec "$container" psql -X -At -v ON_ERROR_STOP=1 -U postgres -d trainlive_restore \
 -c "SELECT (to_regclass('trainlive.organization') IS NOT NULL)
       AND (to_regclass('trainlive.class_session') IS NOT NULL)
       AND (SELECT count(*) FROM trainlive.content_item) >= 16
       AND (SELECT count(*) FROM trainlive.worksheet_template) >= 5" \
 | grep -qx 't'; then
 echo "NO-GO: restored schema or published content is incomplete" >&2
 exit 1
fi
echo "PASS: private backup was fully restored and checked in a network-isolated disposable PostgreSQL 16 container"
echo "The disposable database has been scheduled for removal. This is not a PITR, RTO or offsite-backup certification."
