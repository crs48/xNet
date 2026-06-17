#!/usr/bin/env bash
# xNet Cloud — bootstrap a GCP project for the control plane + hub fleet.
#
# Creates everything M1 (the dogfood hub) needs on Google Cloud, via the gcloud
# CLI: the project, the APIs, an Artifact Registry Docker repo, a Firestore
# database, the deployer service account + roles (+ an optional key), and Docker
# push auth. Then it prints the GCP_* values to paste into your env file.
#
# Idempotent — safe to re-run (each resource is created only if missing).
#
# Prerequisites:
#   • gcloud CLI installed + authenticated:  https://cloud.google.com/sdk/docs/install
#       gcloud auth login
#   • a billing account id (Cloud Run + Artifact Registry require billing):
#       gcloud billing accounts list
#
# Usage:
#   PROJECT=xnet-cloud-0 REGION=us-central1 BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX \
#     bash scripts/cloud-gcp-bootstrap.sh
set -euo pipefail

# ── CONFIG (override via env) ───────────────────────────────────────────────
PROJECT="${PROJECT:-xnet-cloud-0}"          # globally-unique project id; the -0 is the first shard
REGION="${REGION:-us-central1}"             # Cloud Run + Firestore region
AR_LOCATION="${AR_LOCATION:-us}"            # Artifact Registry location ('us' multi-region → us-docker.pkg.dev)
AR_REPO="${AR_REPO:-hub}"                   # Docker repo name
SA_NAME="${SA_NAME:-xnet-deployer}"         # deployer service-account id
BILLING_ACCOUNT="${BILLING_ACCOUNT:-}"      # optional but required to enable Run/AR (XXXXXX-XXXXXX-XXXXXX)
MAKE_KEY="${MAKE_KEY:-1}"                    # 1 = create an SA key JSON; 0 = skip (use Workload Identity Federation)
KEY_FILE="${KEY_FILE:-$HOME/.config/xnet/${SA_NAME}-${PROJECT}.json}"  # key path — OUTSIDE the repo by default
# ────────────────────────────────────────────────────────────────────────────

SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
AR_HOST="${AR_LOCATION}-docker.pkg.dev"

command -v gcloud >/dev/null || {
  echo "✗ gcloud not found. Install: https://cloud.google.com/sdk/docs/install" >&2
  exit 1
}

echo "▶ project=$PROJECT region=$REGION registry=${AR_HOST}/${PROJECT}/${AR_REPO}"

# 1. Project ------------------------------------------------------------------
if ! gcloud projects describe "$PROJECT" >/dev/null 2>&1; then
  echo "• creating project $PROJECT"
  gcloud projects create "$PROJECT" --name="xNet Cloud"
fi
gcloud config set project "$PROJECT" >/dev/null

# 2. Billing (Cloud Run + Artifact Registry need it) --------------------------
if [ -n "$BILLING_ACCOUNT" ]; then
  echo "• linking billing account"
  gcloud billing projects link "$PROJECT" --billing-account="$BILLING_ACCOUNT" >/dev/null
else
  echo "⚠ BILLING_ACCOUNT not set — link billing in the console or the next step fails."
fi

# 3. Enable APIs --------------------------------------------------------------
echo "• enabling APIs"
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com

# 4. Artifact Registry (Docker) -----------------------------------------------
if ! gcloud artifacts repositories describe "$AR_REPO" --location="$AR_LOCATION" >/dev/null 2>&1; then
  echo "• creating Artifact Registry repo $AR_REPO ($AR_LOCATION)"
  gcloud artifacts repositories create "$AR_REPO" \
    --repository-format=docker --location="$AR_LOCATION" --description="xNet hub images"
fi

# 5. Firestore (Native mode, default database) --------------------------------
if ! gcloud firestore databases describe --database="(default)" >/dev/null 2>&1; then
  echo "• creating Firestore database (Native mode, $REGION)"
  gcloud firestore databases create --location="$REGION" --type=firestore-native \
    || echo "  (continuing — Firestore database may already exist)"
fi

# 6. Deployer service account + least-privilege roles -------------------------
if ! gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
  echo "• creating service account $SA_NAME"
  gcloud iam service-accounts create "$SA_NAME" --display-name="xNet Cloud deployer"
fi
echo "• granting roles to $SA_EMAIL"
for role in run.admin artifactregistry.writer iam.serviceAccountUser \
  secretmanager.secretAccessor datastore.user; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:${SA_EMAIL}" --role="roles/${role}" --condition=None >/dev/null
done

# 7. Service-account key (or skip for Workload Identity Federation) ------------
if [ "$MAKE_KEY" = "1" ]; then
  if [ -f "$KEY_FILE" ]; then
    echo "• key already exists: $KEY_FILE"
  else
    echo "• creating SA key → $KEY_FILE"
    mkdir -p "$(dirname "$KEY_FILE")"
    gcloud iam service-accounts keys create "$KEY_FILE" --iam-account="$SA_EMAIL"
    chmod 600 "$KEY_FILE"
  fi
fi

# 8. Let Docker push to Artifact Registry -------------------------------------
gcloud auth configure-docker "$AR_HOST" --quiet >/dev/null

# ── Summary: paste into your env file ────────────────────────────────────────
echo
echo "✅ GCP ready. Paste these into apps/cloud/.env.<env>:"
echo "  GCP_PROJECT_PREFIX=${PROJECT%-*}"
echo "  GCP_REGION=${REGION}"
echo "  GCP_ARTIFACT_REGISTRY=${AR_HOST}/${PROJECT}/${AR_REPO}"
echo "  GCP_FIRESTORE_DATABASE=(default)"
if [ "$MAKE_KEY" = "1" ]; then
  echo "  GOOGLE_APPLICATION_CREDENTIALS=${KEY_FILE}"
else
  echo "  (no key created — wire Workload Identity Federation for GOOGLE_APPLICATION_CREDENTIALS)"
fi
echo
echo "Then run: node scripts/cloud-env-doctor.mjs apps/cloud/.env.staging"
