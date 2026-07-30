#!/usr/bin/env bash
#
# Enforce the xNet Cloud licensing/consumption boundary (exploration 0181):
#   1. packages/cloud is FSL-1.1-Apache-2.0 and ships a real LICENSE file.
#   2. Only apps/cloud may depend on @xnetjs/cloud.
#   3. The self-hostable hub must NOT import @xnetjs/cloud (only @xnetjs/entitlements),
#      so the MIT adoption engine never takes an FSL / stripe / @aws-sdk dependency.
#   4. ANCHOR TENANCY (exploration 0358): xNet Cloud must provision the SAME hub the
#      public can install. There is exactly one hub image source — packages/hub — and
#      hub images are pinned to immutable tags, never `latest`. A Cloud-only hub fork
#      would be the enclosure CHARTER §6 refuses.
#
# Run with --selftest to verify the gate actually catches planted violations.
#
set -euo pipefail
cd "$(dirname "$0")/.."

# --selftest: plant each violation in turn and assert the gate catches it. A gate
# nobody has seen fail is a gate nobody should trust.
if [ "${1:-}" = "--selftest" ]; then
  self="$0"
  planted=""
  cleanup() { [ -n "$planted" ] && rm -f "$planted"; return 0; }
  trap cleanup EXIT

  expect_fail() {
    local what="$1"
    if "$self" >/dev/null 2>&1; then
      echo "✗ selftest: gate did NOT catch $what"
      exit 1
    fi
    echo "  ✓ caught $what"
  }

  echo "selftest: planting violations…"

  # Baseline: the tree must be clean before we can trust a failure signal.
  if ! "$self" >/dev/null 2>&1; then
    echo "✗ selftest: baseline tree already fails the gate — fix that first"
    exit 1
  fi
  echo "  ✓ baseline clean"

  planted="packages/cloud/Dockerfile.selftest"
  echo "FROM scratch" > "$planted"
  echo "COPY packages/hub /hub" >> "$planted"
  expect_fail "a Cloud-only hub image"
  rm -f "$planted"

  planted="packages/cloud/src/provisioner/selftest-latest.ts"
  echo "export const image = 'registry/hub:latest'" > "$planted"
  expect_fail "a mutable \`latest\` hub tag"
  rm -f "$planted"
  planted=""

  echo "✓ selftest passed — the anchor-tenancy gate catches planted violations"
  exit 0
fi

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

# 4. Anchor tenancy — Cloud runs the hub everyone else can run.
#
# The hub reaches a tenant as a container image, not an npm dependency, so the
# property to protect is: one hub image source, and immutable tags.
if [ ! -f packages/hub/Dockerfile ]; then
  echo "✗ packages/hub/Dockerfile is missing — the publicly installable hub image"
  echo "    must exist for anchor tenancy to mean anything (CHARTER §6)"
  fail=1
fi

# A hub Dockerfile inside the commercial layer would be a Cloud-only fork.
cloud_hub_images=$(find packages/cloud apps/cloud -name 'Dockerfile*' 2>/dev/null \
  | xargs grep -ln 'xnetjs/hub\|packages/hub' 2>/dev/null || true)
if [ -n "$cloud_hub_images" ]; then
  echo "✗ Cloud-only hub image found — Cloud must provision the same hub the public runs:"
  echo "$cloud_hub_images" | sed 's/^/    /'
  fail=1
fi

# Never `latest`: staged rollouts pin a per-tenant immutable target version (0174).
latest_tags=$(grep -rnE ':latest|"latest"' packages/cloud/src/provisioner apps/cloud/src/provisioner 2>/dev/null \
  | grep -v '\.test\.' || true)
if [ -n "$latest_tags" ]; then
  echo "✗ provisioner references a mutable \`latest\` tag; hub images must be immutable:"
  echo "$latest_tags" | sed 's/^/    /'
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "✓ xNet Cloud license/consumption boundary OK"
fi
exit "$fail"
