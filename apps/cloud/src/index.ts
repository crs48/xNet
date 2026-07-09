/**
 * xNet Cloud — control-plane entrypoint.
 *
 * Wires the dev/default composition (in-memory stores + provisioner, WorkOS AuthKit
 * when configured) and serves the HTTP API. Production swaps the in-memory stores
 * for durable ones and the `MemoryProvisioner` for a real adapter (Cloud Run +
 * Litestream→R2, etc.) — the control-plane code is unchanged (explorations 0174/0175).
 */

import type { VirtualKeyManager } from '@xnetjs/cloud'
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
import { aiChatDepsFromEnv, aiKeysFromEnv } from './ai/wiring'
import { runRestoreDrills, pickDrillSample } from './backup/restore-drill'
import { dayIndex, summarizeDrill, demotionDue, httpReadyProbe } from './backup/schedule'
import { assertSyncedViaHealth } from './backup/sync-gate'
import { stripeGatewayFromEnv } from './billing/stripe-gateway'
import { FakeTenantBillingGateway, type TenantBillingGateway } from './billing-gateway'
import { ControlPlane } from './control-plane'
import { HealthSampleStore, httpHealthProbe, probeFleet } from './observability/health'
import { cloudRunProvisionerFromEnv } from './provisioner/google-cloud-run-client'
import { MemoryTenantStore, type TenantRecord, type TenantStore } from './registry'
import { createControlPlaneApp } from './server'
import { firestoreStoresFromEnv } from './stores/firestore'
import { usageLedgerFromEnv } from './stores/usage-ledger'
import { makeDidChallengeVerifier } from './verify-did'

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
export { makeDidChallengeVerifier } from './verify-did'
export {
  MemoryNonceStore,
  nonceStoreFromDocs,
  NONCE_TTL_MS,
  type NonceStore,
  type NonceRecord
} from './nonce'
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
  probeFleet,
  tenantSli,
  fleetSummary,
  type HealthProbe,
  type TenantSli,
  type FleetSummary
} from './observability/health'
export {
  publicStatus,
  STATUS_K_ANON_FLOOR,
  type PublicStatus,
  type PublicStatusInput,
  type StatusComponent,
  type ComponentStatus
} from './observability/status'
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
export {
  FirestoreDocStore,
  firestoreFromEnv,
  firestoreStoresFromEnv,
  type DurableStores
} from './stores/firestore'
export { usageLedgerFromDocs, usageLedgerFromEnv } from './stores/usage-ledger'
export { createAiRoute, type AiChatDeps, type AiTenantContext } from './ai/route'
export { aiChatDepsFromEnv, aiKeysFromEnv } from './ai/wiring'
export { pricingFromEnv, markupFromEnv, PROVIDER_RATES, DEFAULT_RATE } from './ai/pricing'
export { currentPeriodStartMs } from './control-plane'
export {
  buildCompanyMetrics,
  computeBreakEven,
  gateUsage,
  type CompanyMetrics,
  type CompanyMetricsWeek,
  type BuildMetricsInput,
  type WeeklyInput,
  type WeeklyOpex,
  type UsageSnapshot
} from './metrics/rollup'
export {
  collectUsage,
  httpHubUsageProbe,
  type CollectUsageDeps,
  type HubUsageProbe,
  type HubUsageStats,
  type StorageUsageReader,
  type UsageTenant
} from './metrics/usage'
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
export {
  dayIndex,
  summarizeDrill,
  demotionDue,
  httpReadyProbe,
  type DrillSummary
} from './backup/schedule'
export { backupSynced, assertSyncedViaHealth } from './backup/sync-gate'
export { reconcileTenant, type ReconcileInput, type ReconcileAction } from './reconcile/reconcile'
export {
  fetchHubHealth,
  composeDashboardLive,
  type HubHealth,
  type DashboardLive
} from './hub-status'

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

export interface BuildControlPlaneOptions {
  provisioner?: Provisioner
  billing?: BillingIdentityProvider
  verifyDid?: DidChallengeVerifier
  tenants?: TenantStore
  bindings?: BindingStore
  /** Managed-AI virtual-key manager; defaults to LiteLLM when configured (0200). */
  aiKeys?: VirtualKeyManager
  /** Override the over-quota usage reader (exploration 0216); defaults to a hub /health read. */
  readUsageBytes?: (record: TenantRecord) => Promise<number | null>
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
  const aiKeys = options.aiKeys ?? aiKeysFromEnv(env)
  // Managed-AI forwarder wiring (0208): when AI keys are configured AND the control
  // plane knows its own URL + internal secret, every AI-enabled hub is provisioned
  // with the forwarder env so the app's `managed` tier works with zero per-hub setup.
  const cloudUrl = env.XNET_CLOUD_URL ?? env.XNET_CLOUD_BASE_URL
  const managedAi =
    aiKeys && cloudUrl && env.XNET_CLOUD_INTERNAL_SECRET
      ? { cloudUrl, internalSecret: env.XNET_CLOUD_INTERNAL_SECRET }
      : undefined
  const controlPlane = new ControlPlane({
    tenants: options.tenants ?? stores?.tenants ?? new MemoryTenantStore(),
    bindings: options.bindings ?? stores?.bindings ?? new MemoryBindingStore(),
    provisioner: options.provisioner ?? cloudRunProvisionerFromEnv(env) ?? new MemoryProvisioner(),
    verifyDid: options.verifyDid ?? makeDidChallengeVerifier(),
    planSecret: env.XNET_PLAN_SECRET ?? 'dev-insecure-plan-secret',
    defaultTargetVersion: env.HUB_IMAGE_TAG ?? 'xnet-hub@0.0.1',
    ...(aiKeys ? { aiKeys } : {}),
    ...(managedAi ? { managedAi } : {}),
    ...(options.readUsageBytes ? { readUsageBytes: options.readUsageBytes } : {})
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
  // Durable device-claim nonces when Firestore is configured, else in-memory (default).
  const durable = firestoreStoresFromEnv(env)
  // One usage ledger, shared by the metered route and the dashboard's spend view.
  const usage = usageLedgerFromEnv(env)
  const ai = aiChatDepsFromEnv(controlPlane, usage, env)

  // Fleet observability (exploration 0201): poll each hot tenant's hub `/health`
  // on an interval and feed the rolling SLI window behind /internal/fleet/health
  // and the public /status.json. unref() so the loop never keeps the process alive.
  const health = new HealthSampleStore()
  const probe = httpHealthProbe()
  const probeMs = Number(env.XNET_CLOUD_PROBE_MS ?? 60_000)
  const timer = setInterval(() => {
    void controlPlane
      .listTenants()
      .then((tenants) => probeFleet(probe, health, tenants, Date.now()))
  }, probeMs)
  timer.unref()

  // Backup automation (exploration 0288). Both loops unref() so they never keep the
  // process alive; both are no-ops on the in-memory provisioner used in dev/tests.
  //
  // (1) Restore drill: nightly, over a rotating sample, PROVE a tenant restores from
  //     its R2 replica into a throwaway hub — "we replicate" is not "we can restore".
  const readyProbe = httpReadyProbe()
  const drillMs = Number(env.XNET_CLOUD_DRILL_MS ?? 24 * 60 * 60_000)
  const drillSample = Number(env.XNET_CLOUD_DRILL_SAMPLE ?? 20)
  const drillTimer = setInterval(() => {
    void controlPlane.listTenants().then(async (tenants) => {
      const sample = pickDrillSample(tenants, drillSample, dayIndex(Date.now()))
      const summary = summarizeDrill(await runRestoreDrills(controlPlane.provisioner, readyProbe, sample))
      if (summary.alert) {
        // eslint-disable-next-line no-console
        console.error(`[backup] restore drill FAILED for: ${summary.failures.join(', ')}`)
      }
    })
  }, drillMs)
  drillTimer.unref()

  // (2) Cold-demotion sweep: demote idle hot tenants to R2-only, but only once the
  //     hub confirms its backup is fresh — the gate FAILS CLOSED (never destroys a
  //     volume on an unproven replica; exploration 0288).
  const coldAfterMs = Number(env.XNET_CLOUD_COLD_AFTER_MS ?? 7 * 24 * 60 * 60_000)
  const sweepMs = Number(env.XNET_CLOUD_DEMOTE_SWEEP_MS ?? 60 * 60_000)
  const assertSynced = assertSyncedViaHealth(async (tenantId) => {
    const rec = await controlPlane.getTenant(tenantId)
    return rec?.hubUrl || null
  })
  const sweepTimer = setInterval(() => {
    void controlPlane.listTenants().then(async (tenants) => {
      const now = Date.now()
      for (const t of tenants) {
        if (demotionDue(t, now, coldAfterMs)) {
          await controlPlane.demoteIfCold(t.tenantId, { coldAfterMs, assertSynced }).catch(() => undefined)
        }
      }
    })
  }, sweepMs)
  sweepTimer.unref()

  const app = createControlPlaneApp({
    controlPlane,
    billing,
    payments,
    health,
    backupsConfigured: Boolean(env.R2_BUCKET),
    sessionSecret: env.XNET_CLOUD_SESSION_SECRET ?? 'dev-insecure-session-secret',
    baseUrl: env.XNET_CLOUD_BASE_URL ?? '',
    marketingUrl: env.XNET_CLOUD_MARKETING_URL ?? 'https://xnet.fyi/cloud',
    appUrl: env.XNET_CLOUD_APP_URL ?? 'https://xnet.fyi/app',
    ...(env.XNET_CLOUD_INTERNAL_SECRET ? { internalSecret: env.XNET_CLOUD_INTERNAL_SECRET } : {}),
    ...(env.SENTRY_DSN ? { sentryDsn: env.SENTRY_DSN } : {}),
    ...(durable ? { nonces: durable.nonces } : {}),
    ...(ai ? { ai } : {})
  })
  const port = Number(env.PORT ?? 4455)
  serve({ fetch: app.fetch, port })
  const mode = {
    auth: billing.name,
    payments: payments.id,
    provisioner: env.GCP_ARTIFACT_REGISTRY ? 'cloud-run' : 'memory',
    stores: env.GCP_FIRESTORE_DATABASE ? 'firestore' : 'memory',
    ai: ai ? 'litellm' : 'off',
    sentry: env.SENTRY_DSN ? 'on' : 'off'
  }
  // eslint-disable-next-line no-console
  console.log(`xnet-cloud listening on :${port} — ${JSON.stringify(mode)}`)
}

// Only start a server when run directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  start()
}
