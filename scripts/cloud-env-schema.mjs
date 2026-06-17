/**
 * xNet Cloud — the single source of truth for control-plane environment vars.
 *
 * Shared by `cloud-init-env.mjs` (scaffolds .env files) and `cloud-env-doctor.mjs`
 * (tells you what's still missing). Keep this in sync with what `apps/cloud`
 * actually reads — see docs/cloud/SETUP.md and exploration 0196.
 *
 * Each var: { key, group, secret, milestone, where, values }
 *   milestone: 'now' | 'M1' | 'M2' | 'optional'  (when it's first needed)
 *   values:    per-environment default. Special markers:
 *     '__GENERATE__' → a random 32-byte hex secret (filled in automatically)
 *     '__FILL__'     → you must paste a real value (left as CHANGEME_<KEY>)
 *     ''             → intentionally blank (e.g. dev uses an in-memory fake)
 *     anything else  → a concrete non-secret default
 */

export const ENVIRONMENTS = ['development', 'staging', 'production']

const G = '__GENERATE__'
const F = '__FILL__'

/** @type {{key:string,group:string,secret:boolean,milestone:'now'|'M1'|'M2'|'optional',where:string,values:Record<string,string>}[]} */
export const VARS = [
  // ── Service basics ───────────────────────────────────────────────────────
  {
    key: 'NODE_ENV',
    group: 'Service',
    secret: false,
    milestone: 'now',
    where: 'development | production',
    values: { development: 'development', staging: 'production', production: 'production' }
  },
  {
    key: 'PORT',
    group: 'Service',
    secret: false,
    milestone: 'now',
    where: 'control-plane HTTP port',
    values: { development: '4455', staging: '4455', production: '4455' }
  },
  {
    key: 'XNET_CLOUD_BASE_URL',
    group: 'Service',
    secret: false,
    milestone: 'now',
    where: "this service's own origin (checkout return + claim links)",
    values: {
      development: 'http://localhost:4455',
      staging: 'https://cloud-staging.xnet.fyi',
      production: 'https://cloud.xnet.fyi'
    }
  },
  {
    key: 'XNET_CLOUD_MARKETING_URL',
    group: 'Service',
    secret: false,
    milestone: 'now',
    where: 'where "sign out" sends users',
    values: {
      development: 'http://localhost:4321/cloud',
      staging: 'https://xnet.fyi/cloud',
      production: 'https://xnet.fyi/cloud'
    }
  },
  {
    key: 'HUB_IMAGE_TAG',
    group: 'Service',
    secret: false,
    milestone: 'M1',
    where: 'immutable hub image new tenants boot (NEVER :latest)',
    values: {
      development: 'xnet-hub@0.0.1',
      staging: 'xnet-hub@1.0.0',
      production: 'xnet-hub@1.0.0'
    }
  },

  // ── Control-plane secrets (auto-generated) ────────────────────────────────
  {
    key: 'XNET_PLAN_SECRET',
    group: 'Secrets',
    secret: true,
    milestone: 'now',
    where: 'signs HUB_PLAN tokens; MUST match every hub',
    values: { development: G, staging: G, production: G }
  },
  {
    key: 'XNET_CLOUD_SESSION_SECRET',
    group: 'Secrets',
    secret: true,
    milestone: 'now',
    where: 'signs the dashboard session cookie',
    values: { development: G, staging: G, production: G }
  },
  {
    key: 'XNET_CLOUD_INTERNAL_SECRET',
    group: 'Secrets',
    secret: true,
    milestone: 'M1',
    where: 'gates /internal/* admin routes (provision by hand)',
    values: { development: G, staging: G, production: G }
  },

  // ── WorkOS AuthKit — https://dashboard.workos.com ─────────────────────────
  {
    key: 'WORKOS_CLIENT_ID',
    group: 'WorkOS (https://dashboard.workos.com)',
    secret: false,
    milestone: 'M2',
    where: 'client_… (AuthKit → Configuration)',
    values: { development: '', staging: F, production: F }
  },
  {
    key: 'WORKOS_API_KEY',
    group: 'WorkOS (https://dashboard.workos.com)',
    secret: true,
    milestone: 'M2',
    where: 'sk_… (API Keys) — server-side only',
    values: { development: '', staging: F, production: F }
  },
  {
    key: 'WORKOS_REDIRECT_URI',
    group: 'WorkOS (https://dashboard.workos.com)',
    secret: false,
    milestone: 'M2',
    where: 'must match the dashboard exactly',
    values: {
      development: '',
      staging: 'https://cloud-staging.xnet.fyi/auth/callback',
      production: 'https://cloud.xnet.fyi/auth/callback'
    }
  },

  // ── Stripe — https://dashboard.stripe.com ─────────────────────────────────
  {
    key: 'STRIPE_SECRET_KEY',
    group: 'Stripe (https://dashboard.stripe.com)',
    secret: true,
    milestone: 'M2',
    where: 'sk_test_… (staging) / sk_live_… (prod) — Developers → API keys',
    values: { development: '', staging: F, production: F }
  },
  {
    key: 'STRIPE_WEBHOOK_SECRET',
    group: 'Stripe (https://dashboard.stripe.com)',
    secret: true,
    milestone: 'M2',
    where: 'whsec_… — Developers → Webhooks → <endpoint>/webhook → Signing secret',
    values: { development: '', staging: F, production: F }
  },
  {
    key: 'STRIPE_PRICE_PERSONAL',
    group: 'Stripe (https://dashboard.stripe.com)',
    secret: false,
    milestone: 'M2',
    where: 'price_… for the Personal plan',
    values: { development: '', staging: F, production: F }
  },
  {
    key: 'STRIPE_PRICE_FAMILY',
    group: 'Stripe (https://dashboard.stripe.com)',
    secret: false,
    milestone: 'M2',
    where: 'price_… for the Family plan',
    values: { development: '', staging: F, production: F }
  },
  {
    key: 'STRIPE_PRICE_TEAM',
    group: 'Stripe (https://dashboard.stripe.com)',
    secret: false,
    milestone: 'M2',
    where: 'price_… for the Team plan (per-seat)',
    values: { development: '', staging: F, production: F }
  },

  // ── Cloudflare R2 — https://dash.cloudflare.com ───────────────────────────
  {
    key: 'R2_BUCKET',
    group: 'Cloudflare R2 (https://dash.cloudflare.com → R2)',
    secret: false,
    milestone: 'M1',
    where: 'bucket name you created',
    values: { development: '', staging: 'xnet-hub-data-staging', production: 'xnet-hub-data' }
  },
  {
    key: 'R2_ACCOUNT_ID',
    group: 'Cloudflare R2 (https://dash.cloudflare.com → R2)',
    secret: false,
    milestone: 'M1',
    where: 'Cloudflare account id (forms the endpoint)',
    values: { development: '', staging: F, production: F }
  },
  {
    key: 'R2_ENDPOINT',
    group: 'Cloudflare R2 (https://dash.cloudflare.com → R2)',
    secret: false,
    milestone: 'M1',
    where: 'https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com',
    values: { development: '', staging: F, production: F }
  },
  {
    key: 'R2_ACCESS_KEY_ID',
    group: 'Cloudflare R2 (https://dash.cloudflare.com → R2)',
    secret: true,
    milestone: 'M1',
    where: 'R2 → Manage API Tokens → Object Read & Write (shown once)',
    values: { development: '', staging: F, production: F }
  },
  {
    key: 'R2_SECRET_ACCESS_KEY',
    group: 'Cloudflare R2 (https://dash.cloudflare.com → R2)',
    secret: true,
    milestone: 'M1',
    where: 'from the same R2 API token (shown once)',
    values: { development: '', staging: F, production: F }
  },

  // ── Google Cloud — https://console.cloud.google.com ───────────────────────
  {
    key: 'GCP_PROJECT_PREFIX',
    group: 'Google Cloud (https://console.cloud.google.com)',
    secret: false,
    milestone: 'M1',
    where: 'sharded as <prefix>-0, -1, … (1000 svc/project cap)',
    values: { development: '', staging: 'xnet-cloud-staging', production: 'xnet-cloud' }
  },
  {
    key: 'GCP_REGION',
    group: 'Google Cloud (https://console.cloud.google.com)',
    secret: false,
    milestone: 'M1',
    where: 'Cloud Run + Firestore region',
    values: { development: 'us-central1', staging: 'us-central1', production: 'us-central1' }
  },
  {
    key: 'GCP_ARTIFACT_REGISTRY',
    group: 'Google Cloud (https://console.cloud.google.com)',
    secret: false,
    milestone: 'M1',
    where: 'e.g. us-docker.pkg.dev/<project-0>/hub',
    values: { development: '', staging: F, production: F }
  },
  {
    key: 'GCP_FIRESTORE_DATABASE',
    group: 'Google Cloud (https://console.cloud.google.com)',
    secret: false,
    milestone: 'M1',
    where: 'Firestore database id for control-plane state',
    values: { development: '(default)', staging: '(default)', production: '(default)' }
  },
  {
    key: 'GOOGLE_APPLICATION_CREDENTIALS',
    group: 'Google Cloud (https://console.cloud.google.com)',
    secret: true,
    milestone: 'M1',
    where:
      'absolute path to the deployer SA key JSON (or blank + Workload Identity Federation in CI)',
    values: { development: '', staging: F, production: F }
  },

  // ── Optional ──────────────────────────────────────────────────────────────
  {
    key: 'AI_GATEWAY_BASE_URL',
    group: 'Optional',
    secret: false,
    milestone: 'optional',
    where: 'LiteLLM/OpenAI-compatible proxy (per-tenant keys live there)',
    values: { development: '', staging: '', production: '' }
  }
]

export const GENERATE = G
export const FILL = F

/** Resolve a var's raw value for an environment ('' if unset for that env). */
export function rawValue(spec, env) {
  return spec.values[env] ?? ''
}

/** Milestone ordering for "is X required by milestone Y" checks. */
export const MILESTONE_ORDER = { now: 0, M1: 1, M2: 2, optional: 99 }
