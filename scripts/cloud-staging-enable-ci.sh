#!/usr/bin/env bash
# OPTIONAL — enable keyless CI deploys via Workload Identity Federation (exploration 0205).
#
#   REPO=crs48/xNet bash scripts/cloud-staging-enable-ci.sh
#
# The manual deploy already works; this makes a push to main (touching apps/cloud/**)
# redeploy automatically. It creates a WIF pool + GitHub OIDC provider, lets the
# deployer SA be impersonated by this repo's workflows, and prints the two repo
# secrets + the repo variable to set. Idempotent.
set -euo pipefail

PROJECT="${PROJECT:-xnet-cloud-staging-0}"
SA="${SA:-xnet-deployer@${PROJECT}.iam.gserviceaccount.com}"
POOL="${POOL:-github}"
PROVIDER="${PROVIDER:-github}"
REPO="${REPO:-}" # e.g. crs48/xNet — REQUIRED

[ -n "$REPO" ] || { echo "✗ Set REPO=<owner>/<name>, e.g. REPO=crs48/xNet"; exit 1; }

PNUM="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"

echo "▶ WIF for $REPO → SA $SA (project $PROJECT / #$PNUM)"

gcloud iam workload-identity-pools describe "$POOL" --project "$PROJECT" --location=global >/dev/null 2>&1 \
  || gcloud iam workload-identity-pools create "$POOL" --project "$PROJECT" --location=global \
       --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers describe "$PROVIDER" --project "$PROJECT" \
  --location=global --workload-identity-pool="$POOL" >/dev/null 2>&1 \
  || gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --project "$PROJECT" \
       --location=global --workload-identity-pool="$POOL" --display-name="GitHub OIDC" \
       --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
       --attribute-condition="assertion.repository=='${REPO}'" \
       --issuer-uri="https://token.actions.githubusercontent.com"

# Only this repo's workflows may impersonate the deployer SA.
gcloud iam service-accounts add-iam-policy-binding "$SA" --project "$PROJECT" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PNUM}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${REPO}" \
  --condition=None

WIF_PROVIDER="projects/${PNUM}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"

echo
echo "✅ WIF ready. Finish in GitHub (gh CLI shown; needs repo admin):"
echo "  gh secret   set WIF_PROVIDER --repo $REPO --body '$WIF_PROVIDER'"
echo "  gh secret   set DEPLOYER_SA  --repo $REPO --body '$SA'"
echo "  # create a protected Environment named 'cloud-staging' (Settings → Environments), then:"
echo "  gh variable set CLOUD_DEPLOY_ENABLED --repo $REPO --body 'true'"
echo
echo "⚠ Set CLOUD_DEPLOY_ENABLED=true ONLY after the two secrets exist, or the next"
echo "  push to main will fail the deploy job (red main)."
