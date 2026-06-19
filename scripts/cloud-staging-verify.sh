#!/usr/bin/env bash
# Verify the staging control plane end-to-end (exploration 0205).
#
#   bash scripts/cloud-staging-verify.sh                         # checks cloud-staging.xnet.fyi
#   bash scripts/cloud-staging-verify.sh https://xnet-cloud-staging-….run.app   # or the run.app URL
#
# Checks DNS + TLS reach the service, runs the public smoke contract, and confirms
# the demo sign-in funnel redirects to WorkOS. Exits non-zero on any failure.
set -uo pipefail

BASE="${1:-https://cloud-staging.xnet.fyi}"
host="${BASE#https://}"; host="${host#http://}"; host="${host%%/*}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fail=0

echo "▶ verifying $BASE"

echo "• DNS"
if command -v dig >/dev/null; then
  dig +short "$host" | sed 's/^/    /' | head -5 || true
  [ -z "$(dig +short "$host")" ] && { echo "    ✗ $host does not resolve yet (add the Cloudflare record)"; fail=1; }
fi

echo "• TLS + reachability"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$BASE/health" || echo 000)
if [ "$code" = "200" ]; then echo "    ✓ /health 200"; else echo "    ✗ /health returned $code"; fail=1; fi

echo "• public smoke contract"
node "$here/cloud-smoke.mjs" "$BASE" || fail=1

echo "• demo funnel"
loc=$(curl -s -o /dev/null -D - --max-time 15 "$BASE/auth/start?plan=demo" 2>/dev/null | awk 'tolower($1)=="location:"{print $2}')
if echo "$loc" | grep -q 'workos.com'; then
  echo "    ✓ /auth/start?plan=demo → WorkOS"
  echo "$loc" | grep -q 'state=demo' && echo "    ✓ carries state=demo" || echo "    ⚠ no state=demo in redirect"
else
  echo "    ✗ /auth/start?plan=demo did not redirect to WorkOS (got: ${loc:-none})"; fail=1
fi

echo
if [ "$fail" = 0 ]; then echo "✅ all checks passed"; else echo "✗ some checks failed (see above)"; fi
exit "$fail"
