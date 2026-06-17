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

# The provisioner shards tenants across projects named <prefix>-0, -1, … so the
# bootstrapped project MUST be the first shard, <prefix>-0. Derive the prefix by
# stripping a trailing -<number>; warn loudly if PROJECT doesn't follow that.
if [[ "$PROJECT" =~ ^(.+)-[0-9]+$ ]]; then
  PROJECT_PREFIX="${BASH_REMATCH[1]}"
else
  PROJECT_PREFIX="$PROJECT"
  echo "⚠ PROJECT '$PROJECT' doesn't end in a shard number." >&2
  echo "  The fleet shards as <prefix>-0, -1, … — name it '${PROJECT}-0' instead" >&2
  echo "  (e.g. staging → xnet-cloud-staging-0). Ctrl-C now to rename, or continue." >&2
  sleep 3
fi

command -v gcloud >/dev/null || {
  echo "✗ gcloud not found. Install: https://cloud.google.com/sdk/docs/install" >&2
  exit 1
}

echo "▶ project=$PROJECT prefix=$PROJECT_PREFIX region=$REGION registry=${AR_HOST}/${PROJECT}/${AR_REPO}"

# 1. Project ------------------------------------------------------------------
if ! gcloud projects describe "$PROJECT" >/dev/null 2>&1; then
  echo "• creating project $PROJECT"
  gcloud projects create "$PROJECT" --name="xNet Cloud"
fi
gcloud config set project "$PROJECT" >/dev/null

# 2. Billing (Cloud Run + Artifact Registry + Firestore all require it) -------
# The account must be OPEN *and* linked. A closed account still reports
# billingEnabled:true once linked, but every paid API 403s with BILLING_DISABLED.
if [ -n "$BILLING_ACCOUNT" ]; then
  acct_open="$(gcloud billing accounts describe "$BILLING_ACCOUNT" \
    --format='value(open)' 2>/dev/null || echo '')"
  if [ "$acct_open" != "True" ]; then
    echo "✗ Billing account $BILLING_ACCOUNT is not OPEN (open=${acct_open:-unknown})." >&2
    echo "  A closed account can't fund a project — this is why paid APIs 403." >&2
    echo "  • Open it / add a payment method: https://console.cloud.google.com/billing" >&2
    echo "  • Or create a new one, then: gcloud billing accounts list   # need OPEN: True" >&2
    echo "  • Then re-run this script (it's idempotent)." >&2
    exit 1
  fi
  echo "• linking billing account $BILLING_ACCOUNT (open ✓)"
  gcloud billing projects link "$PROJECT" --billing-account="$BILLING_ACCOUNT"
fi
# Linking still takes a few seconds to propagate to the paid APIs.
echo "• waiting for billing to propagate"
billing_enabled=""
for attempt in $(seq 1 18); do
  billing_enabled="$(gcloud billing projects describe "$PROJECT" \
    --format='value(billingEnabled)' 2>/dev/null || echo '')"
  [ "$billing_enabled" = "True" ] && break
  sleep 5
done
if [ "$billing_enabled" != "True" ]; then
  echo "✗ Billing is not active on $PROJECT — see https://console.cloud.google.com/billing" >&2
  exit 1
fi
echo "  billing active ✓"

# 3. Enable APIs --------------------------------------------------------------
echo "• enabling APIs"
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com
# Right after a service is enabled, its IAM permissions lag for the project owner
# (the next call 403s with IAM_PERMISSION_DENIED). Let it settle, then retry below.
echo "• waiting for APIs to settle"
sleep 15

# 4. Artifact Registry (Docker) -----------------------------------------------
echo "• ensuring Artifact Registry repo $AR_REPO ($AR_LOCATION)"
for attempt in $(seq 1 8); do
  gcloud artifacts repositories describe "$AR_REPO" --location="$AR_LOCATION" >/dev/null 2>&1 && break
  gcloud artifacts repositories create "$AR_REPO" \
    --repository-format=docker --location="$AR_LOCATION" --description="xNet hub images" >/dev/null 2>&1 && break
  [ "$attempt" = "8" ] && {
    echo "✗ Could not create the Artifact Registry repo (API/IAM still propagating?) — re-run." >&2
    exit 1
  }
  sleep 10
done

# 5. Firestore (Native mode, default database) --------------------------------
echo "• ensuring Firestore database (Native mode, $REGION)"
for attempt in $(seq 1 8); do
  gcloud firestore databases describe --database="(default)" >/dev/null 2>&1 && break
  gcloud firestore databases create --location="$REGION" --type=firestore-native >/dev/null 2>&1 && break
  [ "$attempt" = "8" ] && {
    echo "✗ Could not create the Firestore database (API/IAM still propagating?) — re-run." >&2
    exit 1
  }
  sleep 10
done

# 6. Deployer service account + least-privilege roles -------------------------
if ! gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
  echo "• creating service account $SA_NAME"
  gcloud iam service-accounts create "$SA_NAME" --display-name="xNet Cloud deployer"
fi
# A freshly-created SA takes a few seconds to become visible to IAM bindings
# (otherwise the grants below 400 with "Service account ... does not exist").
echo "• waiting for service account to propagate"
for attempt in $(seq 1 18); do
  gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1 && break
  sleep 5
done
echo "• granting roles to $SA_EMAIL"
for role in run.admin artifactregistry.writer iam.serviceAccountUser \
  secretmanager.secretAccessor datastore.user; do
  for attempt in $(seq 1 6); do
    if gcloud projects add-iam-policy-binding "$PROJECT" \
      --member="serviceAccount:${SA_EMAIL}" --role="roles/${role}" --condition=None >/dev/null 2>&1; then
      break
    fi
    if [ "$attempt" = "6" ]; then
      echo "✗ Could not grant roles/${role} (SA still propagating?) — re-run the script." >&2
      exit 1
    fi
    sleep 5
  done
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
echo "  GCP_PROJECT_PREFIX=${PROJECT_PREFIX}"
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
