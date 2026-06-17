#!/usr/bin/env bash
# xNet Cloud — print the three random control-plane secrets, ready to paste.
# (cloud-init-env.mjs already generates these into the .env file for you; this
#  is for when you'd rather paste them straight into GCP Secret Manager.)
set -euo pipefail

for name in XNET_PLAN_SECRET XNET_CLOUD_SESSION_SECRET XNET_CLOUD_INTERNAL_SECRET; do
  printf '%s=%s\n' "$name" "$(openssl rand -hex 32)"
done
