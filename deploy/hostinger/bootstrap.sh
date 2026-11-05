#!/usr/bin/env bash
# First-time, trusted-operator provisioning on an EMPTY Hostinger VPS database.
# Does not wipe an existing database, print passwords or issue staff tokens.
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/../.." && pwd)"
env_file="${TRAINLIVE_HOSTINGER_ENV:-$script_dir/hostinger.env}"
compose_file="$script_dir/compose.yaml"
cd "$repo_root"

if [[ ! -f "$env_file" ]]; then
  echo "Missing $env_file; copy hostinger.env.example and set real values." >&2
  exit 1
fi
chmod 600 "$env_file"
read_var() { sed -n "s/^$1=//p" "$env_file" | tail -n 1; }
db_owner_pass="$(read_var POSTGRES_PASSWORD)"
db_app_pass="$(read_var TRAINLIVE_APP_DB_PASSWORD)"
jwt_secret="$(read_var TRAINLIVE_JWT_SECRET)"
issuer="$(read_var TRAINLIVE_OIDC_ISSUER)"
client_id="$(read_var TRAINLIVE_OIDC_CLIENT_ID)"
domains="$(read_var TRAINLIVE_OIDC_ALLOWED_EMAIL_DOMAINS)"
if [[ ! "$db_owner_pass" =~ ^[0-9a-f]{64}$ ||
      ! "$db_app_pass" =~ ^[0-9a-f]{64}$ ||
      "$db_owner_pass" == "$db_app_pass" ]]; then
  echo "Use two DIFFERENT 64-character lowercase hex DB passwords (openssl rand -hex 32)." >&2
  exit 1
fi
if [[ "${#jwt_secret}" -lt 32 || "$jwt_secret" == *REPLACE* ||
      "$issuer" == *example.org* || "$client_id" == *REPLACE* ||
      "$domains" == *example.org* ]]; then
  echo "Set a real JWT signing secret and a real MFA-backed OIDC provider first." >&2
  exit 1
fi
compose() { docker compose --env-file "$env_file" -f "$compose_file" "$@"; }
compose config --quiet
compose up -d db

for i in $(seq 1 30); do
  if compose exec -T db pg_isready -U trainlive_owner -d trainlive >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
compose exec -T db pg_isready -U trainlive_owner -d trainlive >/dev/null
schema_exists="$(compose exec -T db psql -X -At -U trainlive_owner -d trainlive -c   "SELECT to_regclass('trainlive.organization') IS NOT NULL" | tr -d '\r')"
if [[ "$schema_exists" != "f" ]]; then
  echo "Database is already initialized/partial. Stop: do not replay non-idempotent migrations." >&2
  echo "Use a DBA-reviewed migration/restore plan instead." >&2
  exit 1
fi

for migration in "$repo_root"/db/migrations/[0-9][0-9][0-9]_*.sql; do
  echo "Applying $(basename "$migration")"
  compose exec -T db psql -X -v ON_ERROR_STOP=1 -U trainlive_owner -d trainlive < "$migration"
done
# This environment variable is scoped to the single maintenance command.
compose exec -T -e TRAINLIVE_APP_DB_PASSWORD="$db_app_pass" db sh -c   'exec psql -X -v ON_ERROR_STOP=1 -v "app_password=$TRAINLIVE_APP_DB_PASSWORD" -U trainlive_owner -d trainlive'   < "$script_dir/create-runtime-role.sql"
unset db_owner_pass db_app_pass jwt_secret
compose run --rm --build tools tools/trainlive/validate-seed.mjs
compose run --rm tools tools/trainlive/seed.mjs
compose up -d --build app proxy
echo "Bootstrap complete. Check https://$(read_var TRAINLIVE_DOMAIN)/api/health (requires real OIDC config)."
echo "DO NOT open registration until class creation, staff SSO/MFA and browser UAT pass."
