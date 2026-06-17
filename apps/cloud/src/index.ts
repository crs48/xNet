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
  type DidChallengeVerifier
} from '@xnetjs/cloud/identity'
import { MemoryProvisioner, type Provisioner } from '@xnetjs/cloud/provisioner'
import { FakeTenantBillingGateway, type TenantBillingGateway } from './billing-gateway'
import { ControlPlane } from './control-plane'
import { MemoryTenantStore } from './registry'
import { createControlPlaneApp } from './server'

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
  env?: NodeJS.ProcessEnv
}

/** Build a fully-composed control plane with sensible defaults (in-memory). */
export function buildControlPlane(options: BuildControlPlaneOptions = {}): {
  controlPlane: ControlPlane
  billing: BillingIdentityProvider
} {
  const env = options.env ?? process.env
  const billing = options.billing ?? resolveBillingProvider(env)
  const controlPlane = new ControlPlane({
    tenants: new MemoryTenantStore(),
    bindings: new MemoryBindingStore(),
    provisioner: options.provisioner ?? new MemoryProvisioner(),
    verifyDid: options.verifyDid ?? devDidVerifier,
    planSecret: env.XNET_PLAN_SECRET ?? 'dev-insecure-plan-secret',
    defaultTargetVersion: env.HUB_IMAGE_TAG ?? 'xnet-hub@0.0.1'
  })
  return { controlPlane, billing }
}

/**
 * Pick the plan-subscription gateway. The real Stripe adapter is deferred; until
 * then a keyless fake drives the funnel locally (and in tests). The webhook secret,
 * when set, makes the fake require a signed webhook.
 */
export function resolveBillingGateway(env: NodeJS.ProcessEnv = process.env): TenantBillingGateway {
  return new FakeTenantBillingGateway(env.XNET_CLOUD_WEBHOOK_SECRET)
}

function start(): void {
  const { controlPlane, billing } = buildControlPlane()
  const env = process.env
  const app = createControlPlaneApp({
    controlPlane,
    billing,
    payments: resolveBillingGateway(env),
    sessionSecret: env.XNET_CLOUD_SESSION_SECRET ?? 'dev-insecure-session-secret',
    baseUrl: env.XNET_CLOUD_BASE_URL ?? '',
    marketingUrl: env.XNET_CLOUD_MARKETING_URL ?? 'https://xnet.fyi/cloud',
    ...(env.XNET_CLOUD_INTERNAL_SECRET ? { internalSecret: env.XNET_CLOUD_INTERNAL_SECRET } : {})
  })
  const port = Number(env.PORT ?? 4455)
  serve({ fetch: app.fetch, port })
  // eslint-disable-next-line no-console
  console.log(`xnet-cloud control plane listening on :${port} (billing: ${billing.name})`)
}

// Only start a server when run directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  start()
}
