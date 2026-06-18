#!/usr/bin/env bash
# Build + push the xNet Cloud control-plane image to your Artifact Registry
# (exploration 0201). Symmetric with cloud-build-hub-image.sh.
#
#   GCP_ARTIFACT_REGISTRY=us-docker.pkg.dev/xnet-cloud-staging-0/hub VERSION=$(git rev-parse --short HEAD) \
#     bash scripts/cloud-build-control-plane.sh
#
# Reuses the same Artifact Registry repo as the hub image but a distinct image
# name (control-plane). Cloud Run runs linux/amd64, so we build for that platform
# (buildx uses qemu on Apple Silicon). Requires Docker and
# `gcloud auth configure-docker <host>` — the GCP bootstrap already set that up.
set -euo pipefail

REGISTRY_REPO="${GCP_ARTIFACT_REGISTRY:-${1:-}}" # e.g. us-docker.pkg.dev/xnet-cloud-staging-0/hub
VERSION="${VERSION:-${2:-}}"                     # immutable tag, e.g. the git short sha
IMAGE_NAME="${CONTROL_PLANE_IMAGE_NAME:-control-plane}"

[ -n "$REGISTRY_REPO" ] || {
  echo "✗ Set GCP_ARTIFACT_REGISTRY (or pass as arg 1), e.g. us-docker.pkg.dev/xnet-cloud-staging-0/hub" >&2
  exit 1
}
[ -n "$VERSION" ] || {
  echo "✗ Set VERSION (or pass as arg 2), e.g. \$(git rev-parse --short HEAD)" >&2
  exit 1
}
command -v docker >/dev/null || {
  echo "✗ docker not found — install Docker Desktop or the engine." >&2
  exit 1
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Reuse the existing Artifact Registry repo (".../hub") but a distinct image name,
# so we don't need to provision a second repo: .../hub/control-plane:<tag>.
IMAGE="${REGISTRY_REPO}/${IMAGE_NAME}:${VERSION}"

echo "▶ building $IMAGE (linux/amd64) from $repo_root"
docker buildx build --platform linux/amd64 \
  -f "$repo_root/apps/cloud/Dockerfile" \
  -t "$IMAGE" --push "$repo_root"

echo
echo "✅ pushed $IMAGE"
echo "Deploy it with:"
echo "  gcloud run deploy xnet-cloud-staging --image $IMAGE --region \$GCP_REGION --allow-unauthenticated"
