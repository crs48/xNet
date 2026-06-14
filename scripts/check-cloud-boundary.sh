#!/usr/bin/env bash
#
# Enforce the xNet Cloud licensing/consumption boundary (exploration 0181):
#   1. packages/cloud is FSL-1.1-Apache-2.0 and ships a real LICENSE file.
#   2. Only apps/cloud may depend on @xnetjs/cloud.
#   3. The self-hostable hub must NOT import @xnetjs/cloud (only @xnetjs/entitlements),
#      so the MIT adoption engine never takes an FSL / stripe / @aws-sdk dependency.
#
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0

lic=$(node -p "require('./packages/cloud/package.json').license")
if [ "$lic" != "FSL-1.1-Apache-2.0" ]; then
  echo "✗ packages/cloud license is '$lic', expected FSL-1.1-Apache-2.0"
  fail=1
fi

if [ ! -f packages/cloud/LICENSE ]; then
  echo "✗ packages/cloud/LICENSE is missing (FSL requires the license text)"
  fail=1
fi

# Match the dependency KEY ("@xnetjs/cloud":), not the name VALUE in packages/cloud.
offenders=$(grep -rl '"@xnetjs/cloud":' packages apps --include=package.json 2>/dev/null \
  | grep -v 'apps/cloud/package.json' || true)
if [ -n "$offenders" ]; then
  echo "✗ only apps/cloud may depend on @xnetjs/cloud; found dependents:"
  echo "$offenders" | sed 's/^/    /'
  fail=1
fi

if grep -rqE "@xnetjs/cloud['\"/]" packages/hub/src 2>/dev/null; then
  echo "✗ packages/hub imports @xnetjs/cloud — it must use @xnetjs/entitlements only"
  grep -rnE "@xnetjs/cloud['\"/]" packages/hub/src | sed 's/^/    /'
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "✓ xNet Cloud license/consumption boundary OK"
fi
exit "$fail"
