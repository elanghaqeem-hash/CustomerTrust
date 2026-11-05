#!/usr/bin/env bash
# Public, read-only acceptance probe. Requires valid DNS + TLS; no login needed.
set -euo pipefail
set +x
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
env_file="${TRAINLIVE_HOSTINGER_ENV:-$script_dir/hostinger.env}"
[[ -f "$env_file" ]] || { echo "NO-GO: private hostinger.env not found" >&2; exit 1; }
command -v curl >/dev/null || { echo "NO-GO: curl missing" >&2; exit 1; }
domain="$(sed -n 's/^TRAINLIVE_DOMAIN=//p' "$env_file" | tail -n 1)"
[[ "$domain" =~ ^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$ && "$domain" != *example* ]] ||
 { echo "NO-GO: invalid production hostname" >&2; exit 1; }
base="https://$domain"
tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT
# curl verifies the certificate and DNS by default. Do not use -k.
root_code="$(curl --silent --show-error --max-time 20 --output "$tmp/root" \
 --dump-header "$tmp/headers" --write-out '%{http_code}' "$base/")" ||
 { echo "NO-GO: public HTTPS root is unreachable or TLS invalid" >&2; exit 1; }
[[ "$root_code" == 200 ]] || { echo "NO-GO: root HTTP $root_code" >&2; exit 1; }
grep -q 'TrainLive' "$tmp/root" || { echo "NO-GO: root is not the TrainLive UI" >&2; exit 1; }
grep -qi '^content-security-policy:' "$tmp/headers" ||
 { echo "NO-GO: Content Security Policy missing" >&2; exit 1; }
grep -qi '^x-frame-options: DENY' "$tmp/headers" ||
 { echo "NO-GO: clickjacking protection missing" >&2; exit 1; }
code="$(curl --silent --show-error --max-time 20 --output "$tmp/health" \
 --dump-header "$tmp/health-headers" --write-out '%{http_code}' "$base/api/health")" ||
 { echo "NO-GO: health endpoint unreachable" >&2; exit 1; }
[[ "$code" == 200 ]] || { echo "NO-GO: health HTTP $code (database, migrations, seed or IdP not ready)" >&2; exit 1; }
grep -Eq '"service"[[:space:]]*:[[:space:]]*"trainlive"' "$tmp/health" &&
grep -Eq '"status"[[:space:]]*:[[:space:]]*"ready"' "$tmp/health" &&
grep -Eq '"ready"[[:space:]]*:[[:space:]]*true' "$tmp/health" ||
 { echo "NO-GO: health response is not trainlive ready:true" >&2; exit 1; }
grep -qi '^cache-control:.*no-store' "$tmp/health-headers" ||
 { echo "NO-GO: health endpoint must not be cached" >&2; exit 1; }
echo "PASS: TrainLive HTTPS, frontend, security headers and technical health at $base"
echo "Next: verify a real MFA staff login, 25-person browser UAT, backups and owner approval before granting bank access."
