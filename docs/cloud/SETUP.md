# xNet Cloud — Setup (the click-through version)

This is the do-it-yourself checklist for standing up xNet Cloud. Click each link,
do the thing, copy the value it gives you into your `.env` file. The companion
deep-dive is [exploration 0196](../explorations/0196_[_]_XNET_CLOUD_PATH_TO_PRODUCTION_RUNBOOK.md).

**The deal:** _you_ create the accounts and paste the credentials; _I_ (Claude)
write the code that consumes them and the deploy. I can't create your accounts or
handle raw keys — that's the correct security boundary, and it's why this is a
checklist for you.

---

## The golden path (3 commands)

```bash
# 1. Scaffold an env file (secrets auto-generated, externals left as CHANGEME_*)
node scripts/cloud-init-env.mjs development     # or: staging | production

# 2. Fill in the CHANGEME_* values using the steps below (skip for development)
$EDITOR apps/cloud/.env.development

# 3. Ask what's still missing (per-milestone readiness verdict)
node scripts/cloud-env-doctor.mjs apps/cloud/.env.development
```

The generated `.env.*` files are **git-ignored** — they hold real secrets, never
commit them. Load one when running locally with Node's built-in flag:

```bash
node --env-file=apps/cloud/.env.development apps/cloud/dist/index.js
```

There are **two milestones**, so you only provision what you need next:

- **M1 — dogfood hub:** Cloudflare R2 + Google Cloud only. No WorkOS, no Stripe.
- **M2 — money path:** add WorkOS (sign-in) + Stripe (payments).

---

## Part 0 — Local development (zero setup)

```bash
node scripts/cloud-init-env.mjs development
```

That's it. Dev runs on in-memory fakes — no external accounts. The doctor will
report all external keys as `–` (not needed). Come back here when you want a real
hub.

---

## Part 1 — M1: a real hub (Cloudflare R2 + Google Cloud)

### 1a. Cloudflare R2 — where every hub's database lives

1. Open **[Cloudflare dashboard → R2](https://dash.cloudflare.com/?to=/:account/r2)**. (Create a free account if needed; R2 has no egress fees.)
2. **Create a bucket** named `xnet-hub-data` (or `-staging`). → `R2_BUCKET`
3. Note your **account id** (top of the R2 page). → `R2_ACCOUNT_ID`, and `R2_ENDPOINT = https://<account-id>.r2.cloudflarestorage.com`
4. **[R2 → Manage API Tokens](https://dash.cloudflare.com/?to=/:account/r2/api-tokens)** → _Create API token_ → **Object Read & Write**, scoped to your bucket → Create.
5. Copy the **Access Key ID** and **Secret Access Key** (shown once). → `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`

### 1b. Google Cloud — compute + durable state

1. Open the **[Google Cloud console](https://console.cloud.google.com/)** and **[create a project](https://console.cloud.google.com/projectcreate)** named `xnet-cloud-0` (the `-0` matters — we shard at 1,000 services/project). → `GCP_PROJECT_PREFIX=xnet-cloud`
2. **Enable the APIs** (one click each, or the `gcloud` line below):
   [Cloud Run](https://console.cloud.google.com/apis/library/run.googleapis.com) ·
   [Artifact Registry](https://console.cloud.google.com/apis/library/artifactregistry.googleapis.com) ·
   [Firestore](https://console.cloud.google.com/apis/library/firestore.googleapis.com) ·
   [Secret Manager](https://console.cloud.google.com/apis/library/secretmanager.googleapis.com) ·
   [IAM](https://console.cloud.google.com/apis/library/iam.googleapis.com)
   ```bash
   gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
     firestore.googleapis.com secretmanager.googleapis.com iam.googleapis.com --project xnet-cloud-0
   ```
3. **[Artifact Registry → create a Docker repo](https://console.cloud.google.com/artifacts)** named `hub` in your region (`us-central1`). → `GCP_ARTIFACT_REGISTRY=us-docker.pkg.dev/xnet-cloud-0/hub`
4. **[Create a Firestore database](https://console.cloud.google.com/firestore)** in **Native mode**, same region. → `GCP_FIRESTORE_DATABASE=(default)`
5. **[Create a deployer service account](https://console.cloud.google.com/iam-admin/serviceaccounts)** `xnet-deployer`, then grant it these roles ([IAM](https://console.cloud.google.com/iam-admin/iam)):
   `Cloud Run Admin`, `Artifact Registry Writer`, `Service Account User`, `Secret Manager Secret Accessor`, `Cloud Datastore User`.
   ```bash
   for role in run.admin artifactregistry.writer iam.serviceAccountUser \
     secretmanager.secretAccessor datastore.user; do
     gcloud projects add-iam-policy-binding xnet-cloud-0 \
       --member="serviceAccount:xnet-deployer@xnet-cloud-0.iam.gserviceaccount.com" \
       --role="roles/$role"
   done
   ```
6. Create a **key** for that service account (JSON) and save it somewhere safe on your machine. → `GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/key.json`
   _(Prefer no long-lived keys? Skip this and we'll wire Workload Identity Federation in CI for M2.)_

### 1c. Generate the control-plane secrets

`cloud-init-env.mjs` already generated `XNET_PLAN_SECRET`, `XNET_CLOUD_SESSION_SECRET`,
and `XNET_CLOUD_INTERNAL_SECRET` for you. To regenerate or paste into GCP Secret
Manager instead: `./scripts/cloud-gen-secrets.sh`.

✅ **M1 done when** `node scripts/cloud-env-doctor.mjs apps/cloud/.env.staging` prints **✓ M1**. Then tell me — I'll build the hub image, implement the Cloud Run provisioner + Firestore stores, and we deploy + provision your first hub by hand.

---

## Part 2 — M2: the money path (WorkOS + Stripe)

### 2a. WorkOS AuthKit — sign-in & account recovery

1. **[WorkOS dashboard](https://dashboard.workos.com/)** → create an **AuthKit** application.
2. Copy the **Client ID** ([Configuration](https://dashboard.workos.com/configuration)) → `WORKOS_CLIENT_ID`, and an **API Key** ([API Keys](https://dashboard.workos.com/api-keys)) → `WORKOS_API_KEY`.
3. Under **Redirects**, add `https://cloud.xnet.fyi/auth/callback` (and a staging one). → `WORKOS_REDIRECT_URI` (already pre-filled per environment).

### 2b. Stripe — subscriptions

1. **[Stripe dashboard](https://dashboard.stripe.com/)** — start in **Test mode**.
2. **[Products](https://dashboard.stripe.com/test/products)** → create _Personal_, _Family_, _Team_ with **recurring** Prices; copy each `price_…`. → `STRIPE_PRICE_PERSONAL` / `_FAMILY` / `_TEAM`
3. **[API keys](https://dashboard.stripe.com/test/apikeys)** → copy the **Secret key** (`sk_test_…`). → `STRIPE_SECRET_KEY`
4. **[Webhooks](https://dashboard.stripe.com/test/webhooks)** → add endpoint `https://cloud.xnet.fyi/webhook`, events `checkout.session.completed` + `customer.subscription.deleted`; copy the **Signing secret** (`whsec_…`). → `STRIPE_WEBHOOK_SECRET`
5. Go live later by repeating with **Live mode** keys in `.env.production`.

✅ **M2 done when** the doctor prints **✓ M2**.

---

## Anything you can hand me to go faster

- The **non-secret** config (project id, region, Artifact Registry path, R2 bucket + endpoint) — paste it in chat; none of it is sensitive.
- For deploys, either run the `gcloud`/Pulumi commands I'll give you yourself, or set up **GitHub Actions + Workload Identity Federation** (no long-lived keys) and I'll wire the workflow.
- **Never paste raw secret values to me** — put them in your `.env` (git-ignored) or GCP Secret Manager. The code reads them at runtime; I never need to see them.

## Security checklist

- [ ] `.env.*` files are git-ignored (already configured) — confirm `git status` never shows them.
- [ ] No `dev-insecure-*` value survives into staging/production (the doctor + generated secrets handle this).
- [ ] In production, store secrets in **GCP Secret Manager**, not a file on disk; the deployer SA reads them at boot.
- [ ] The R2 token is scoped to **one bucket**, Object Read & Write only.

## Reference

- Every variable, annotated (the source of truth the scaffolder reads): [`scripts/cloud-env-schema.mjs`](../../scripts/cloud-env-schema.mjs)
- Why it's built this way: [0196 runbook](../explorations/0196_[_]_XNET_CLOUD_PATH_TO_PRODUCTION_RUNBOOK.md), [0180 architecture](../explorations/0180_[_]_XNET_CLOUD_ARCHITECTURE_AND_COMPLETION_STATUS.md)
- Scripts: `scripts/cloud-init-env.mjs` (scaffold) · `scripts/cloud-env-doctor.mjs` (check) · `scripts/cloud-gen-secrets.sh` (secrets)
