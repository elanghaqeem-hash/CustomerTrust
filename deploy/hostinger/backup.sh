#!/usr/bin/env bash
# Operator-run local backup; ALSO copy offsite encrypted and test restores.
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
env_file="${TRAINLIVE_HOSTINGER_ENV:-$script_dir/hostinger.env}"
if [[ ! -f "$env_file" ]]; then echo "Missing Hostinger env file" >&2; exit 1; fi
umask 077
backup_dir="${TRAINLIVE_BACKUP_DIR:-$HOME/trainlive-backups}"
mkdir -p "$backup_dir"
dest="$backup_dir/trainlive-$(date -u +%Y%m%dT%H%M%SZ).dump"
if ! docker compose --env-file "$env_file" -f "$script_dir/compose.yaml" exec -T db \
    pg_dump -U trainlive_owner -d trainlive -Fc > "$dest"; then
  rm -f "$dest"
  echo "Backup failed" >&2
  exit 1
fi
echo "Backup created at $dest; encrypt and replicate offsite, then test restore separately."
