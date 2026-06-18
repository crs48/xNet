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

## The scripts at a glance

Everything here is driven by these scripts in [`scripts/`](../../scripts/):

| Script                                     | What it does                                                                                                                         | When                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `node scripts/cloud-init-env.mjs <env>`    | Scaffolds `apps/cloud/.env.<env>` — non-secret config pre-filled, the 3 control-plane secrets generated, externals left as CHANGEME  | first, once per environment    |
| `bash scripts/cloud-gcp-bootstrap.sh`      | Provisions the entire GCP side (project, APIs, Artifact Registry, Firestore, deployer SA + roles + key, Docker auth); prints `GCP_*` | once per real environment      |
| `bash scripts/cloud-build-hub-image.sh`    | Builds + pushes the hub container image (linux/amd64) to your Artifact Registry; prints `HUB_IMAGE_TAG`                              | once per hub release           |
| `bash scripts/cloud-gen-secrets.sh`        | Prints the 3 random control-plane secrets (for pasting into Secret Manager)                                                          | optional                       |
| `node scripts/cloud-env-doctor.mjs <file>` | Reports ✓/✗ per variable + an M1/M2 readiness verdict; exits non-zero if anything required is missing                                | after filling in, and any time |

---

## Environments (dev · staging · production)

Each environment is **fully isolated** — its own GCP project, R2 bucket, WorkOS environment, Stripe mode, subdomain, and secrets — so a mistake in one can never touch another. **Development is the exception:** it runs on in-memory fakes and needs no cloud accounts at all.

|                   | Development        | Staging                     | Production                  |
| ----------------- | ------------------ | --------------------------- | --------------------------- |
| Runs on           | in-memory fakes    | real cloud                  | real cloud                  |
| GCP project       | — (none)           | `xnet-cloud-staging-0`      | `xnet-cloud-0`              |
| R2 bucket         | — (none)           | `xnet-hub-data-staging`     | `xnet-hub-data`             |
| WorkOS            | fake (skipped)     | Staging environment         | Production environment      |
| Stripe            | skipped            | **Test** mode (`sk_test_…`) | **Live** mode (`sk_live_…`) |
| Control-plane URL | `localhost:4455`   | `cloud-staging.xnet.fyi`    | `cloud.xnet.fyi`            |
| Secrets           | `.env.development` | GCP Secret Manager          | GCP Secret Manager          |
| Idle cost         | $0                 | ~$0 (scale-to-zero)         | ~$0 (scale-to-zero)         |

**The rules**

- **One GCP project family per real environment.** The project is GCP's hard isolation boundary (IAM, quota, billing, the 1,000-service cap). The provisioner _shards within_ a family — `xnet-cloud-0`, `-1`, … — only as you approach that cap, so one project per env is all you need to start.
- **Run the bootstrap once per real environment**, pointing at that env's `-0` project:
  ```bash
  PROJECT=xnet-cloud-staging-0 REGION=us-central1 BILLING_ACCOUNT=… bash scripts/cloud-gcp-bootstrap.sh   # staging
  PROJECT=xnet-cloud-0         REGION=us-central1 BILLING_ACCOUNT=… bash scripts/cloud-gcp-bootstrap.sh   # production
  ```
  Then scaffold the **matching** env file and paste the values the script printed (they override the scaffold defaults).
- **The `.env.<env>` file's environment must match the GCP project you bootstrapped.** If you created `xnet-cloud-0` (prefix `xnet-cloud`), that's **production** → use `.env.production`. Want a separate staging too? Bootstrap `xnet-cloud-staging-0` as well.
- **Deployed secrets live in GCP Secret Manager, not the `.env` file.** The `.env.<env>` file is for local runs + scaffolding; the deployed Cloud Run service reads secrets from Secret Manager (the deployer SA already has `secretAccessor`). Each environment gets its own distinct secret values.
- **You don't need all three on day one.** Dev (fakes) for the inner loop + **one** real environment to dogfood is enough. Add the second real env when you have customers and want a safe place to test changes — an idle environment costs ~nothing (scale-to-zero), so the separation is cheap insurance.

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

_CLI alternative for the bucket: `npx wrangler login && npx wrangler r2 bucket create xnet-hub-data`. The S3 API token in step 4 is still created in the dashboard (or via the Cloudflare API)._

### 1b. Google Cloud — one script does it all

**Fastest path.** [`scripts/cloud-gcp-bootstrap.sh`](../../scripts/cloud-gcp-bootstrap.sh) creates the project, enables the APIs, the Artifact Registry Docker repo, the Firestore database, the deployer service account + least-privilege roles + key, and Docker push auth — then prints the `GCP_*` values to paste. It's **idempotent** (safe to re-run). First [install the gcloud CLI](https://cloud.google.com/sdk/docs/install):

```bash
gcloud auth login
gcloud billing accounts list          # find one with OPEN: True; copy its id (XXXXXX-XXXXXX-XXXXXX)

PROJECT=xnet-cloud-0 REGION=us-central1 BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX \
  bash scripts/cloud-gcp-bootstrap.sh
```

> **Heads-up:** the billing account must be **`OPEN: True`** — a linked-but-_closed_ account still 403s every paid API with `BILLING_DISABLED` even though the project reports `billingEnabled: true`. The script verifies the account is open, links it, and waits for billing + service-account propagation, so if a step ever trips on a propagation race just **re-run it** (the whole script is idempotent).

It prints these, ready to paste into your env file:
`GCP_PROJECT_PREFIX`, `GCP_REGION`, `GCP_ARTIFACT_REGISTRY`, `GCP_FIRESTORE_DATABASE`, `GOOGLE_APPLICATION_CREDENTIALS`.
Override any default via env vars (`AR_LOCATION`, `AR_REPO`, `SA_NAME`, `KEY_FILE`). Prefer no long-lived key? Add `MAKE_KEY=0` and we'll wire Workload Identity Federation in CI.

**Prefer clicking?** The same steps by hand in the [console](https://console.cloud.google.com/): [create a project](https://console.cloud.google.com/projectcreate) `xnet-cloud-0` (the `-0` matters — we shard at 1,000 services/project) → enable [Cloud Run](https://console.cloud.google.com/apis/library/run.googleapis.com) / [Artifact Registry](https://console.cloud.google.com/apis/library/artifactregistry.googleapis.com) / [Firestore](https://console.cloud.google.com/apis/library/firestore.googleapis.com) / [Secret Manager](https://console.cloud.google.com/apis/library/secretmanager.googleapis.com) / [IAM](https://console.cloud.google.com/apis/library/iam.googleapis.com) → an [Artifact Registry](https://console.cloud.google.com/artifacts) Docker repo `hub` → a [Firestore](https://console.cloud.google.com/firestore) database (Native mode) → a [deployer service account](https://console.cloud.google.com/iam-admin/serviceaccounts) `xnet-deployer` with roles **Cloud Run Admin · Artifact Registry Writer · Service Account User · Secret Manager Secret Accessor · Cloud Datastore User**, then a JSON key.

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
4. **[Webhooks](https://dashboard.stripe.com/test/webhooks)** → add endpoint `https://cloud.xnet.fyi/webhooks/stripe`, events `checkout.session.completed` + `customer.subscription.deleted`; copy the **Signing secret** (`whsec_…`). → `STRIPE_WEBHOOK_SECRET`
   _(The webhook path is provider-scoped — `/webhooks/stripe`, not a generic `/webhook` — so other providers can have their own endpoints. We only consume v1 snapshot events; Stripe v2 "thin" event destinations, if ever adopted, would get a separate endpoint.)_
5. **Optional:** copy the **Publishable key** (`pk_test_…` / `pk_live_…`, [API keys](https://dashboard.stripe.com/test/apikeys)). → `STRIPE_PUBLISHABLE_KEY`. It's **not secret** and is only needed for embedded checkout — the hosted-Checkout flow we use doesn't require it.
6. Go live later by repeating with **Live mode** keys in `.env.production`.

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

## Troubleshooting

- **`BILLING_DISABLED` / "requires billing to be enabled"** even after linking → your billing account is **closed**. Run `gcloud billing accounts list`; you need a row with `OPEN  True`. Open it (add a payment method) at [console.cloud.google.com/billing](https://console.cloud.google.com/billing) or create a new one, then re-run the bootstrap with that account id.
- **"Service account … does not exist"** while granting roles, or any other mid-run 4xx → a freshly-created resource hadn't propagated yet. The script now waits + retries; if you still hit it, just **re-run** (idempotent — it skips what already exists).
- **Wrong environment provisioned?** Project ids are **immutable**. `xnet-cloud-0` → prefix `xnet-cloud` = **production**. For staging, bootstrap a separate `xnet-cloud-staging-0`; you can't rename the existing one.
- **The doctor says a value is missing but you filled it** → make sure it isn't still `CHANGEME_*` or empty, and that you're checking the right file (`.env.staging` vs `.env.production`). The doctor infers the environment from the filename.
- **`--env-file` not recognized** → needs Node ≥ 20.6. Otherwise export the vars first: `set -a; . apps/cloud/.env.development; set +a`.

## Reference

- Every variable, annotated (the source of truth the scaffolder reads): [`scripts/cloud-env-schema.mjs`](../../scripts/cloud-env-schema.mjs)
- Why it's built this way: [0196 runbook](../explorations/0196_[_]_XNET_CLOUD_PATH_TO_PRODUCTION_RUNBOOK.md), [0180 architecture](../explorations/0180_[_]_XNET_CLOUD_ARCHITECTURE_AND_COMPLETION_STATUS.md)
- Scripts: `scripts/cloud-init-env.mjs` (scaffold env) · `scripts/cloud-env-doctor.mjs` (check env) · `scripts/cloud-gen-secrets.sh` (secrets) · `scripts/cloud-gcp-bootstrap.sh` (provision GCP)
