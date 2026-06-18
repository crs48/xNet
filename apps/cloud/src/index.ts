/**
 * xNet Cloud — control-plane entrypoint.
 *
 * Wires the dev/default composition (in-memory stores + provisioner, WorkOS AuthKit
 * when configured) and serves the HTTP API. Production swaps the in-memory stores
 * for durable ones and the `MemoryProvisioner` for a real adapter (Cloud Run +
 * Litestream→R2, etc.) — the control-plane code is unchanged (explorations 0174/0175).
 */

import { serve } from '@hono/node-server'
import {
  MemoryBillingIdentityProvider,
  MemoryBindingStore,
  WorkOSAuthKitProvider,
  type BillingIdentityProvider,
  type BindingStore,
  type DidChallengeVerifier
} from '@xnetjs/cloud/identity'
import { MemoryProvisioner, type Provisioner } from '@xnetjs/cloud/provisioner'
import { stripeGatewayFromEnv } from './billing/stripe-gateway'
import { FakeTenantBillingGateway, type TenantBillingGateway } from './billing-gateway'
import { ControlPlane } from './control-plane'
import { cloudRunProvisionerFromEnv } from './provisioner/google-cloud-run-client'
import { MemoryTenantStore, type TenantStore } from './registry'
import { createControlPlaneApp } from './server'
import { firestoreStoresFromEnv } from './stores/firestore'

export { ControlPlane } from './control-plane'
export { MemoryTenantStore, type TenantRecord, type TenantStore } from './registry'
export { createControlPlaneApp, type ControlPlaneAppDeps } from './server'
export {
  FakeTenantBillingGateway,
  PRICE_BY_PLAN,
  WebhookSignatureError,
  type TenantBillingGateway
} from './billing-gateway'
export { sealSession, readSession, SESSION_COOKIE, type SessionData } from './session'
export {
  MemoryDeviceGrantStore,
  cryptoCodes,
  isExpired,
  DEVICE_GRANT_TTL_MS,
  type DeviceGrant,
  type DeviceGrantStore,
  type CodeGenerator
} from './device-grant'
export {
  availability,
  errorRate,
  latencyPercentile,
  errorBudgetRemaining,
  burnRate,
  backupHealthy,
  windowed,
  type HealthSample
} from './observability/sli'
export {
  sloForSla,
  sloForPlan,
  errorBudgetMs,
  budgetPolicy,
  type SloTarget,
  type BudgetPolicy
} from './observability/slo'
export {
  HealthSampleStore,
  FakeHealthProbe,
  httpHealthProbe,
  sampleTenantHealth,
  tenantSli,
  fleetSummary,
  type HealthProbe,
  type TenantSli,
  type FleetSummary
} from './observability/health'
export {
  rollWave,
  runRollout,
  type RolloutEngineDeps,
  type RolloutPlan,
  type RolloutReport,
  type WaveResult,
  type WaveOptions
} from './rollout/engine'
export { controlPlaneRolloutDeps } from './rollout/control-plane-deps'
export {
  StripeTenantBillingGateway,
  stripeGatewayFromEnv,
  type StripeClient,
  type StripeGatewayConfig
} from './billing/stripe-gateway'
export {
  InMemoryDocStore,
  tenantStoreFromDocs,
  bindingStoreFromDocs,
  type DocStore
} from './stores/durable'
export { FirestoreDocStore, firestoreStoresFromEnv, type DurableStores } from './stores/firestore'
export {
  GoogleCloudRunClient,
  cloudRunProvisionerFromEnv,
  type RunService,
  type RunServicesClient
} from './provisioner/google-cloud-run-client'
export {
  verifyRestore,
  runRestoreDrills,
  pickDrillSample,
  type RestoreProbe,
  type RestoreDrillResult
} from './backup/restore-drill'
export { reconcileTenant, type ReconcileInput, type ReconcileAction } from './reconcile/reconcile'

/**
 * Pick the billing identity provider from the environment. WorkOS AuthKit (free
 * tier) when configured; otherwise an in-memory provider for local dev.
 */
export function resolveBillingProvider(
  env: NodeJS.ProcessEnv = process.env
): BillingIdentityProvider {
  if (env.WORKOS_CLIENT_ID && env.WORKOS_API_KEY && env.WORKOS_REDIRECT_URI) {
    return new WorkOSAuthKitProvider({
      clientId: env.WORKOS_CLIENT_ID,
      apiKey: env.WORKOS_API_KEY,
      redirectUri: env.WORKOS_REDIRECT_URI
    })
  }
  return new MemoryBillingIdentityProvider()
}

// TODO(0175): wire to @xnetjs/identity to verify a real passkey-DID challenge.
// The dev verifier only checks the challenge is well-formed.
const devDidVerifier: DidChallengeVerifier = async (challenge) =>
  Boolean(challenge.did && challenge.signature && challenge.nonce)

export interface BuildControlPlaneOptions {
  provisioner?: Provisioner
  billing?: BillingIdentityProvider
  verifyDid?: DidChallengeVerifier
  tenants?: TenantStore
  bindings?: BindingStore
  env?: NodeJS.ProcessEnv
}

/**
 * Compose the control plane, selecting real implementations from the environment
 * and falling back to in-memory fakes for dev/tests:
 *   - stores      → Firestore when GCP/Firestore is configured, else in-memory
 *   - provisioner → Cloud Run + Litestream when GCP/R2 is configured, else in-memory
 * Explicit `options` always win (test injection).
 */
export function buildControlPlane(options: BuildControlPlaneOptions = {}): {
  controlPlane: ControlPlane
  billing: BillingIdentityProvider
} {
  const env = options.env ?? process.env
  const billing = options.billing ?? resolveBillingProvider(env)
  const stores = firestoreStoresFromEnv(env)
  const controlPlane = new ControlPlane({
    tenants: options.tenants ?? stores?.tenants ?? new MemoryTenantStore(),
    bindings: options.bindings ?? stores?.bindings ?? new MemoryBindingStore(),
    provisioner: options.provisioner ?? cloudRunProvisionerFromEnv(env) ?? new MemoryProvisioner(),
    verifyDid: options.verifyDid ?? devDidVerifier,
    planSecret: env.XNET_PLAN_SECRET ?? 'dev-insecure-plan-secret',
    defaultTargetVersion: env.HUB_IMAGE_TAG ?? 'xnet-hub@0.0.1'
  })
  return { controlPlane, billing }
}

/**
 * Pick the plan-subscription gateway: real Stripe when `STRIPE_SECRET_KEY` +
 * `STRIPE_WEBHOOK_SECRET` are set, otherwise the keyless fake that drives the
 * funnel locally and in tests.
 */
export function resolveBillingGateway(env: NodeJS.ProcessEnv = process.env): TenantBillingGateway {
  return stripeGatewayFromEnv(env) ?? new FakeTenantBillingGateway(env.XNET_CLOUD_WEBHOOK_SECRET)
}

function start(): void {
  const env = process.env
  const { controlPlane, billing } = buildControlPlane()
  const payments = resolveBillingGateway(env)
  const app = createControlPlaneApp({
    controlPlane,
    billing,
    payments,
    sessionSecret: env.XNET_CLOUD_SESSION_SECRET ?? 'dev-insecure-session-secret',
    baseUrl: env.XNET_CLOUD_BASE_URL ?? '',
    marketingUrl: env.XNET_CLOUD_MARKETING_URL ?? 'https://xnet.fyi/cloud',
    ...(env.XNET_CLOUD_INTERNAL_SECRET ? { internalSecret: env.XNET_CLOUD_INTERNAL_SECRET } : {})
  })
  const port = Number(env.PORT ?? 4455)
  serve({ fetch: app.fetch, port })
  const mode = {
    auth: billing.name,
    payments: payments.id,
    provisioner: env.GCP_ARTIFACT_REGISTRY ? 'cloud-run' : 'memory',
    stores: env.GCP_FIRESTORE_DATABASE ? 'firestore' : 'memory'
  }
  // eslint-disable-next-line no-console
  console.log(`xnet-cloud listening on :${port} — ${JSON.stringify(mode)}`)
}

// Only start a server when run directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  start()
}
