#!/usr/bin/env bash
# Map cloud-staging.xnet.fyi → the deployed Cloud Run service (exploration 0205).
#
#   bash scripts/cloud-staging-domain.sh
#
# Cloud Run custom-domain mapping needs the parent domain verified for your Google
# account, then emits the DNS record you add at Cloudflare. This script:
#   1. installs the gcloud `beta` component (managed-Cloud-Run mappings live there),
#   2. checks domain verification and tells you how to fix it if needed,
#   3. creates the mapping (idempotent),
#   4. prints the exact DNS record to add at Cloudflare (DNS-only / grey cloud).
#
# Override any of these via env: PROJECT, REGION, SERVICE, DOMAIN, PARENT.
set -uo pipefail

PROJECT="${PROJECT:-xnet-cloud-staging-0}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-xnet-cloud-staging}"
DOMAIN="${DOMAIN:-cloud-staging.xnet.fyi}"
PARENT="${PARENT:-xnet.fyi}"

echo "▶ mapping $DOMAIN → service $SERVICE ($PROJECT / $REGION)"

# 1. The managed-Cloud-Run domain-mapping commands are in the beta component.
if ! gcloud beta --help >/dev/null 2>&1; then
  echo "• installing the gcloud 'beta' component"
  gcloud components install beta --quiet \
    || { echo "✗ Could not install 'beta' (gcloud installed via a package manager?)."; \
         echo "  Install it, or map the domain in the console:"; \
         echo "  https://console.cloud.google.com/run/domains?project=$PROJECT"; exit 1; }
fi

# 2. Verification: a Search Console *domain* property for the parent covers every
#    subdomain. If it isn't verified, the create below 4xxes with a verify URL.
if ! gcloud domains list-user-verified --format='value(id)' 2>/dev/null | grep -qx "$PARENT"; then
  echo "⚠ '$PARENT' is not yet verified for this account."
  echo "  1) Open https://search.google.com/search-console  → add a *Domain* property for $PARENT"
  echo "  2) It gives you a TXT record — add it at Cloudflare DNS (root @, type TXT)."
  echo "  3) Click Verify, then re-run this script."
  echo "  (Continuing in case it's already verified another way…)"
fi

# 3. Create the mapping if it doesn't already exist.
if gcloud beta run domain-mappings describe --domain "$DOMAIN" \
     --region "$REGION" --project "$PROJECT" >/dev/null 2>&1; then
  echo "• mapping already exists"
else
  echo "• creating domain mapping"
  if ! gcloud beta run domain-mappings create --service "$SERVICE" --domain "$DOMAIN" \
        --region "$REGION" --project "$PROJECT"; then
    echo
    echo "✗ Mapping not created. If the error above mentions verification, do the 3"
    echo "  steps printed earlier, then re-run. Console fallback:"
    echo "  https://console.cloud.google.com/run/domains?project=$PROJECT"
    exit 1
  fi
fi

# 4. Print the DNS record(s) to add at Cloudflare (PROXY OFF — Google manages the
#    cert via an ACME challenge, which a Cloudflare proxy would break).
echo
echo "✅ Add this at Cloudflare DNS for $DOMAIN  (Proxy status: DNS only / grey cloud):"
gcloud beta run domain-mappings describe --domain "$DOMAIN" --region "$REGION" --project "$PROJECT" \
  --flatten='status.resourceRecords[]' \
  --format='table(status.resourceRecords.name, status.resourceRecords.type, status.resourceRecords.rrdata)' \
  2>/dev/null || echo "  (re-run once the mapping is created to see the records)"
echo
echo "Then wait for the managed certificate (usually 15–60 min) and run:"
echo "  bash scripts/cloud-staging-verify.sh"
