# xNet Cloud staging — go-live checklist (the last mile)

The staging **control plane is already deployed and serving** on its Cloud Run URL
with the real WorkOS / Stripe / Firestore / Cloud Run adapters (see
[exploration 0205](../explorations/0205_%5B_%5D_DEPLOY_XNET_CLOUD_STAGING_CONTROL_PLANE.md)).
This page is the short list of steps **only you can do** — they need DNS access, a
Google domain-ownership check, and provider dashboards — to make
`https://cloud-staging.xnet.fyi/auth/start?plan=demo` work end-to-end.

Most of it is scripted. Run each script, do the one or two manual clicks it points
you to, then run the verifier.

| What | How | Needed for |
| ---- | --- | ---------- |
| 1. Fix the R2 endpoint in your env file | one command | hub backups (paid) |
| 2. Map `cloud-staging.xnet.fyi` + add DNS | `cloud-staging-domain.sh` + Cloudflare | **everything** |
| 3. Register the WorkOS redirect URI | dashboard (manual) | **sign-in** |
| 4. Register the Stripe webhook | `cloud-staging-stripe-webhook.mjs --create` | paid checkout |
| 5. Verify | `cloud-staging-verify.sh` | proof |
| _opt._ CI auto-deploy | `cloud-staging-enable-ci.sh` | push-to-deploy |

> **You can test the demo sign-in on the run.app URL right now** — but it will bounce
> to the `cloud-staging.xnet.fyi` callback, which 404s until steps 2–3 are done. The
> full loop needs the custom domain live + WorkOS registered.

Get the current run.app URL any time with:

```bash
gcloud run services describe xnet-cloud-staging \
  --project xnet-cloud-staging-0 --region us-central1 --format='value(status.url)'
```

Prerequisites: `gcloud` authenticated as the project owner (`gcloud auth login`),
the repo checked out, and `apps/cloud/.env.staging` present (it already is).

---

## 1. Fix `R2_ENDPOINT` in your env file (10 seconds)

Litestream wants the **bare** account host (it adds the bucket itself). Your file
currently has the bucket appended, which would double the path. I already corrected
the deployed secret; this just makes your local file match so future deploys/pushes
agree:

```bash
# macOS (BSD sed). Strips a trailing /<bucket> from the R2 endpoint host.
sed -i '' -E 's#^(R2_ENDPOINT=https://[a-z0-9]+\.r2\.cloudflarestorage\.com)/.*#\1#' \
  apps/cloud/.env.staging

# confirm it now ends at .r2.cloudflarestorage.com (no /bucket)
grep '^R2_ENDPOINT=' apps/cloud/.env.staging
```

---

## 2. Map the domain + add the Cloudflare record

```bash
bash scripts/cloud-staging-domain.sh
```

The script installs the `beta` gcloud component, creates the Cloud Run domain
mapping, and prints the DNS record to add. Two things may need your hands:

- **Domain verification.** If it says `xnet.fyi` isn't verified, open
  [Google Search Console](https://search.google.com/search-console), add a **Domain**
  property for `xnet.fyi`, copy the **TXT** record it gives you into **Cloudflare DNS**
  (root `@`, type `TXT`), click **Verify**, then re-run the script.
- **The DNS record.** The script prints a row like
  `cloud-staging.xnet.fyi  CNAME  ghs.googlehosted.com`. Add it in **Cloudflare DNS**
  with **Proxy status = DNS only (grey cloud)** — a proxied/orange record breaks
  Google's managed-certificate challenge.

Then wait for the certificate to go green (usually 15–60 min). Check status with:

```bash
gcloud beta run domain-mappings describe --domain cloud-staging.xnet.fyi \
  --region us-central1 --project xnet-cloud-staging-0 \
  --format='value(status.conditions)'
```

> Prefer not to use the preview mapping? The production-grade alternative is a global
> external Application Load Balancer with a serverless NEG (own cert, an A record at
> Cloudflare). Overkill for staging — the mapping is one record.

---

## 3. Register the WorkOS redirect URI (manual — ~1 min)

WorkOS only redirects back to URIs you've allow-listed.

1. Open the [WorkOS dashboard](https://dashboard.workos.com/) → your **staging**
   application → **Redirects** (or **Configuration → Redirect URIs**).
2. Add exactly: `https://cloud-staging.xnet.fyi/auth/callback`
3. Save.

This must match the deployed `WORKOS_REDIRECT_URI` (it does — the running
`/auth/start` already sends this exact `redirect_uri`). Without it, sign-in returns a
WorkOS "redirect URI is not allowed" error after the user authenticates.

_(Optional, to also test from your laptop: add `http://localhost:4455/auth/callback`
too, and use `pnpm --filter xnet-cloud dev:staging` — see SETUP.md Part 4.)_

---

## 4. Register the Stripe webhook (scripted — paid plans only)

The free `demo` plan needs no webhook. For paid checkout (personal/family/team),
register the endpoint. There's **no webhook at the staging URL yet**, so create one:

```bash
# Safe check first (read-only):
node scripts/cloud-staging-stripe-webhook.mjs

# Create it (test mode). Prints the signing secret + the commands to land it:
node scripts/cloud-staging-stripe-webhook.mjs --create
```

`--create` registers `https://cloud-staging.xnet.fyi/webhooks/stripe` for
`checkout.session.completed` + `customer.subscription.deleted` and prints the
`whsec_…` signing secret **once**. Land it where the service reads it (the script
prints these for you):

```bash
printf '%s' 'whsec_…' | gcloud secrets versions add stripe-webhook \
  --data-file=- --project xnet-cloud-staging-0
# then update STRIPE_WEBHOOK_SECRET in apps/cloud/.env.staging to the same value
```

Redeploy so the service picks up the new secret version (or it picks it up on the
next deploy):

```bash
gcloud run services update xnet-cloud-staging \
  --project xnet-cloud-staging-0 --region us-central1 \
  --update-secrets STRIPE_WEBHOOK_SECRET=stripe-webhook:latest
```

---

## 5. Verify

```bash
# After DNS + cert are live:
bash scripts/cloud-staging-verify.sh

# Before DNS, prove the service itself on the run.app URL:
bash scripts/cloud-staging-verify.sh "$(gcloud run services describe xnet-cloud-staging \
  --project xnet-cloud-staging-0 --region us-central1 --format='value(status.url)')"
```

Green means: DNS+TLS reach the service, the public smoke contract passes, and
`/auth/start?plan=demo` redirects to WorkOS with `state=demo`. Then open
`https://cloud-staging.xnet.fyi/auth/start?plan=demo` in a browser and sign in — you
should land on `/dashboard?plan=demo`.

---

## Optional — turn on push-to-deploy (CI via Workload Identity Federation)

The manual `gcloud run deploy` already works. To make a push to `main` that touches
`apps/cloud/**` redeploy automatically:

```bash
REPO=crs48/xNet bash scripts/cloud-staging-enable-ci.sh
```

It sets up the WIF pool/provider and prints the exact `gh secret`/`gh variable`
commands. **Order matters:** set the two repo secrets first, then set
`CLOUD_DEPLOY_ENABLED=true` last — flipping the variable before the secrets exist
would fail the deploy job and red `main`.

---

## Optional — the per-tenant hub image (paid provisioning)

Paid plans provision a per-tenant hub from a container image that isn't pushed yet:
the existing build convention targets the Artifact Registry repo root
(`.../hub:1.0.0`), which AR rejects (`Missing image name`). This needs a small
code+convention fix (give the image a name like `.../hub/xnet-hub:1.0.0` and teach
the provisioner that path) — tracked as a separate follow-up task. The free `demo`
plan is pooled and does **not** need it, so it doesn't block go-live.

---

## Scripts reference

| Script | What it does |
| ------ | ------------ |
| [`scripts/cloud-staging-domain.sh`](../../scripts/cloud-staging-domain.sh) | Create the Cloud Run domain mapping; print the Cloudflare DNS record |
| [`scripts/cloud-staging-stripe-webhook.mjs`](../../scripts/cloud-staging-stripe-webhook.mjs) | Check/create the Stripe test webhook; print the signing secret to land |
| [`scripts/cloud-staging-verify.sh`](../../scripts/cloud-staging-verify.sh) | End-to-end verify (DNS, TLS, smoke contract, demo redirect) |
| [`scripts/cloud-staging-enable-ci.sh`](../../scripts/cloud-staging-enable-ci.sh) | _(optional)_ Wire WIF so CI deploys on push to main |
| [`scripts/cloud-secrets-push.mjs`](../../scripts/cloud-secrets-push.mjs) | Re-push `.env.staging` secrets to Secret Manager (rotation) |
| [`scripts/cloud-smoke.mjs`](../../scripts/cloud-smoke.mjs) | The public contract test the verifier calls |

## Troubleshooting

- **`/auth/start` 404s on `cloud-staging.xnet.fyi`** → the domain mapping/DNS isn't
  live yet (step 2). Test on the run.app URL meanwhile.
- **WorkOS "redirect URI not allowed"** after sign-in → step 3 (exact string, https).
- **Domain mapping won't create** → `xnet.fyi` not verified; do the Search Console
  TXT step and re-run. The mapping is preview and us-central1-only — fine for staging.
- **Certificate stuck "pending"** → the Cloudflare record must be **DNS-only** (grey
  cloud), not proxied; Google can't complete the challenge through the proxy.
- **Webhook signature failures** → `STRIPE_WEBHOOK_SECRET` (env + `stripe-webhook`
  secret) must equal the endpoint's signing secret from step 4.
- **Secret/Firestore errors at boot** → confirm the service runs as
  `xnet-deployer@…` (`--service-account`); the default compute SA can't read secret
  payloads.
