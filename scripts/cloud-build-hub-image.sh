#!/usr/bin/env bash
# Build + push the xNet hub image to your Artifact Registry, for the managed fleet.
#
#   GCP_ARTIFACT_REGISTRY=us-docker.pkg.dev/xnet-cloud-0/hub VERSION=1.0.0 \
#     bash scripts/cloud-build-hub-image.sh
#
# Cloud Run runs linux/amd64, so we build for that platform (buildx uses qemu on
# Apple Silicon). Requires Docker and `gcloud auth configure-docker <host>` — the
# GCP bootstrap (cloud-gcp-bootstrap.sh) already set that up.
set -euo pipefail

REGISTRY="${GCP_ARTIFACT_REGISTRY:-${1:-}}"   # AR repo, e.g. us-docker.pkg.dev/xnet-cloud-0/hub
VERSION="${VERSION:-${2:-}}"                   # immutable tag, e.g. 1.0.0
IMAGE_NAME="${HUB_IMAGE_NAME:-xnet-hub}"       # image name under the repo (provisioner pins <repo>/<name>:<tag>)

[ -n "$REGISTRY" ] || {
  echo "✗ Set GCP_ARTIFACT_REGISTRY (or pass as arg 1), e.g. us-docker.pkg.dev/xnet-cloud-0/hub" >&2
  exit 1
}
[ -n "$VERSION" ] || {
  echo "✗ Set VERSION (or pass as arg 2), e.g. 1.0.0" >&2
  exit 1
}
command -v docker >/dev/null || {
  echo "✗ docker not found — install Docker Desktop or the engine." >&2
  exit 1
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# AR requires an image name under the repo (a bare repo-root push 4xxes with
# "Missing image name"); the provisioner pins tenants to this same <repo>/<name>:<tag>.
IMAGE="${REGISTRY}/${IMAGE_NAME}:${VERSION}"

echo "▶ building $IMAGE (linux/amd64) from $repo_root"
# The hub Dockerfile builds from the monorepo root (it COPYs several packages).
docker buildx build --platform linux/amd64 \
  -f "$repo_root/packages/hub/Dockerfile" \
  -t "$IMAGE" --push "$repo_root"

echo
echo "✅ pushed $IMAGE"
echo "Set in your env file:"
echo "  GCP_ARTIFACT_REGISTRY=$REGISTRY"
echo "  HUB_IMAGE_TAG=$VERSION"
