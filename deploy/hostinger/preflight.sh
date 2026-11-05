#!/usr/bin/env bash
# Read-only VPS readiness gate. Never print the resolved Compose environment.
set -euo pipefail
set +x
script_dir="$(cd -- "$(dirname -- "\${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/../.." && pwd)"
env_file="\${TRAINLIVE_HOSTINGER_ENV:-$script_dir/hostinger.env}"
check_dns=false
if [[ "\${1:-}" == "--check-dns" ]]; then check_dns=true
elif [[ $# -ne 0 ]]; then echo "Usage: bash deploy/hostinger/preflight.sh [--check-dns]" >&2; exit 2
fi

die() { printf 'NO-GO: %s\n' "$1" >&2; exit 1; }
note() { printf 'CHECK: %s\n' "$1"; }
command -v docker >/dev/null || die "Install Docker Engine on the VPS"
docker compose version >/dev/null 2>&1 || die "Install Docker Compose plugin"
docker info >/dev/null 2>&1 || die "Docker daemon is not available to this operator"
command -v curl >/dev/null || die "Install curl"
[[ -f "$env_file" && ! -L "$env_file" ]] || die "Create a regular private hostinger.env from hostinger.env.example"
permission="$(stat -c %a "$env_file")"
[[ "$permission" =~ ^[0-7]{3,4}$ ]] || die "Cannot evaluate permissions on hostinger.env"
(( (8#$permission & 077) == 0 )) || die "Restrict hostinger.env permissions: chmod 600 (or 400)"
read_var() { sed -n "s/^$1=//p" "$env_file" | tail -n 1; }
owner="$(read_var POSTGRES_PASSWORD)"
runtime="$(read_var TRAINLIVE_APP_DB_PASSWORD)"
jwt="$(read_var TRAINLIVE_JWT_SECRET)"
domain="$(read_var TRAINLIVE_DOMAIN)"
issuer="$(read_var TRAINLIVE_OIDC_ISSUER)"
client="$(read_var TRAINLIVE_OIDC_CLIENT_ID)"
domains="$(read_var TRAINLIVE_OIDC_ALLOWED_EMAIL_DOMAINS)"
[[ "$owner" =~ ^[0-9a-f]{64}$ && "$runtime" =~ ^[0-9a-f]{64}$ && "$owner" != "$runtime" ]] ||
 die "Set two different 64-hex PostgreSQL passwords with openssl rand -hex 32"
[[ "$jwt" =~ ^[0-9a-f]{64}$ && "$jwt" != "$owner" && "$jwt" != "$runtime" ]] ||
 die "Set a third independent 64-hex JWT signing secret"
[[ "$domain" =~ ^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$ && "$domain" != *example* && "$domain" != *localhost* ]] ||
 die "Set a real hostname such as trainlive.seraya.id"
[[ "$issuer" == https://* && "$issuer" != *example.* && "$issuer" != *localhost* &&
   "$client" != "" && "$client" != *REPLACE* &&
   "$domains" != "" && "$domains" != *example.* && "$domains" != *REPLACE* ]] ||
 die "Configure a real HTTPS OIDC issuer, client ID and approved email domains"
[[ "$domains" =~ ^[a-z0-9.-]+(\.[a-z]{2,})(,[a-z0-9.-]+(\.[a-z]{2,}))*$ ]] ||
 die "Allowed email domains must be a comma-separated list of real domains"
(
 cd "$repo_root"
 docker compose --env-file "$env_file" -f "$script_dir/compose.yaml" config --quiet >/dev/null
) || die "Invalid private Docker Compose configuration"
note "Secrets, DNS hostname, SSO field shape and Compose configuration are valid"
[[ -d /proc ]] && command -v free >/dev/null && {
 ram_mb="$(free -m | awk '/^Mem:/ {print $2}')"
 if [[ "$ram_mb" =~ ^[0-9]+$ ]] && (( ram_mb < 4096 )); then
  note "WARNING: Under 4 GiB RAM; verify memory sizing before load testing"
 fi
}
if [[ "$check_dns" == true ]]; then
 command -v getent >/dev/null || die "DNS check requires getent"
 resolved="$(getent ahostsv4 "$domain" | awk 'NR==1 {print $1}')" || true
 [[ -n "$resolved" ]] || die "Domain does not resolve to an IPv4 address yet"
 expected="$(read_var TRAINLIVE_EXPECTED_VPS_IPV4)"
 if [[ -n "$expected" && "$resolved" != "$expected" ]]; then
  die "DNS does not resolve to the approved VPS IPv4"
 fi
 note "Domain DNS resolves. Independently confirm it points to YOUR VPS, not another server"
fi
note "PASS: safe to begin FIRST-TIME bootstrap only on a new empty database volume"
note "This is not a production go-live certificate; browser MFA, restore, UAT and privacy approval remain mandatory"
