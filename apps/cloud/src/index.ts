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
import {
  backupHealthFrom,
  dayIndex,
  drillSampleSize,
  summarizeDrill,
  demotionDue,
  httpReadyProbe,
  type LastDrill
} from './backup/schedule'
import { assertSyncedViaHealth } from './backup/sync-gate'
import { emailNotifier, mailSenderFromEnv } from './billing/notify'
import { stripeGatewayFromEnv } from './billing/stripe-gateway'
import { FakeTenantBillingGateway, type TenantBillingGateway } from './billing-gateway'
import { ControlPlane } from './control-plane'
import { type JobRecord } from './jobs/leased'
import { JobRegistry } from './jobs/runner'
import { HealthSampleStore, httpHealthProbe, probeFleet } from './observability/health'
import { cloudRunProvisionerFromEnv } from './provisioner/google-cloud-run-client'
import { reconcileBilling } from './reconcile/billing'
import {
  applyBillingAction,
  reconcileInputFor,
  silentNotifier,
  summarizeSweep,
  type BillingNotifier,
  type BillingOutcome
} from './reconcile/billing-driver'
import { MemoryTenantStore, type TenantRecord, type TenantStore } from './registry'
import { createControlPlaneApp } from './server'
import { InMemoryDocStore } from './stores/durable'
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
  type RolloutDurability,
  type WaveDurability,
  type WaveResult,
  type WaveOptions
} from './rollout/engine'
export { controlPlaneRolloutDeps } from './rollout/control-plane-deps'
export {
  checkpoint,
  decidedTenants,
  isDecided,
  loadOrStart,
  priorVersionOf,
  startRun,
  waveResultFor,
  type RolloutRun,
  type RolloutRunStore,
  type TenantCheckpoint,
  type TenantOutcome
} from './rollout/run-record'
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
  FirestoreLeaseStore,
  firestoreFromEnv,
  firestoreStoresFromEnv,
  type DurableStores
} from './stores/firestore'
export {
  claimable,
  isStale,
  jobHealth,
  runIfDue,
  stalenessMs,
  type JobHealth,
  type JobRecord,
  type LeasedJobOptions,
  type RunOutcome
} from './jobs/leased'
export { JobRegistry, anyStale, type JobRunnerDeps, type JobSpec } from './jobs/runner'
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
  backupHealthFrom,
  backupsHealthyFor,
  drillSampleSize,
  type BackupHealth,
  type DrillSummary,
  type LastDrill
} from './backup/schedule'
export { backupSynced, assertSyncedViaHealth } from './backup/sync-gate'
export { reconcileTenant, type ReconcileInput, type ReconcileAction } from './reconcile/reconcile'
export {
  applyBillingEvent,
  reconcileBilling,
  isSubscriptionStatus,
  DUNNING_WINDOWS,
  type BillingAction,
  type BillingEvent,
  type BillingReconcileInput,
  type BillingState,
  type DunningState,
  type DunningWindows,
  type SubscriptionStatus
} from './reconcile/billing'
export {
  emailNotifier,
  mailSenderFromEnv,
  resendSender,
  formatDeadline,
  daysBetween,
  LIFECYCLE_MAIL,
  type EmailNotifierConfig,
  type MailSender
} from './billing/notify'
export {
  applyBillingAction,
  dunningStateOf,
  reconcileInputFor,
  silentNotifier,
  summarizeSweep,
  HEALTHY,
  type BillingDriverOptions,
  type BillingNotifier,
  type BillingOutcome,
  type BillingSweepSummary
} from './reconcile/billing-driver'
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
  // Diagnostics escalation wiring (0341): every managed hub gets the upstream
  // URL + its per-tenant secret so "Send to xNet" and the dashboard summary
  // work with zero per-hub config; every switch stays with the tenant.
  const diagnostics =
    cloudUrl && env.XNET_CLOUD_INTERNAL_SECRET
      ? { cloudUrl, masterSecret: env.XNET_CLOUD_INTERNAL_SECRET }
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
    ...(diagnostics ? { diagnostics } : {}),
    ...(options.readUsageBytes ? { readUsageBytes: options.readUsageBytes } : {})
  })
  return { controlPlane, billing }
}

/**
 * Pick the dunning notifier: real email when a transport is configured, else the
 * silent one (exploration 0418).
 *
 * Silence is a real choice with a real consequence, so it is made once, here,
 * and logged at boot — a dev or self-hosted control plane has no mail and should
 * not pretend otherwise. In production the pairing that matters is
 * `RESEND_API_KEY` set **and** `XNET_CLOUD_DUNNING_DELETE_ENABLED=true`: enabling
 * deletion without a transport would let the funnel destroy a replica having sent
 * nothing, which `assertNotifierSafeForDeletion` refuses at startup.
 */
export function billingNotifierFromEnv(
  controlPlane: ControlPlane,
  billing: BillingIdentityProvider,
  env: NodeJS.ProcessEnv = process.env
): BillingNotifier {
  const mail = mailSenderFromEnv(env)
  if (!mail) return silentNotifier
  const dashboardUrl = `${(env.XNET_CLOUD_BASE_URL ?? '').replace(/\/$/, '')}/dashboard`
  return emailNotifier(mail, {
    dashboardUrl,
    emailFor: async (tenant) => {
      void controlPlane
      const user = await billing.getUser(tenant.billingUserId)
      return user?.email ?? null
    }
  })
}

/**
 * Refuse to boot with deletion armed and no way to warn anyone.
 *
 * The driver already treats a failed notice as "do not apply this step", so with
 * the silent notifier every notice trivially succeeds and the funnel would run
 * to `delete` in total silence. That combination is never intentional; failing
 * loudly at startup is much better than discovering it from a deleted tenant.
 */
export function assertNotifierSafeForDeletion(env: NodeJS.ProcessEnv = process.env): void {
  if (env.XNET_CLOUD_DUNNING_DELETE_ENABLED === 'true' && !env.RESEND_API_KEY) {
    throw new Error(
      'XNET_CLOUD_DUNNING_DELETE_ENABLED=true requires a mail transport (RESEND_API_KEY): ' +
        'refusing to delete tenant data with no way to send the final notice.'
    )
  }
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

  const health = new HealthSampleStore()
  const probe = httpHealthProbe()
  const probeMs = Number(env.XNET_CLOUD_PROBE_MS ?? 60_000)
  const readyProbe = httpReadyProbe()
  const drillMs = Number(env.XNET_CLOUD_DRILL_MS ?? 24 * 60 * 60_000)
  // A cap, not a fixed size — `drillSampleSize` scales the nightly sample with the
  // fleet so three tenants aren't drilled twice over and five hundred aren't
  // covered at 4% (exploration 0418).
  const drillMax = Number(env.XNET_CLOUD_DRILL_SAMPLE ?? 20)
  // The last drill result is what `backupHealth` reports from — a bucket name in
  // an env var is not evidence that a restore works.
  let lastDrill: LastDrill | null = null
  const coldAfterMs = Number(env.XNET_CLOUD_COLD_AFTER_MS ?? 7 * 24 * 60 * 60_000)
  const sweepMs = Number(env.XNET_CLOUD_DEMOTE_SWEEP_MS ?? 60 * 60_000)
  const assertSynced = assertSyncedViaHealth(async (tenantId) => {
    const rec = await controlPlane.getTenant(tenantId)
    return rec?.hubUrl || null
  })

  // Periodic work runs through the leased-job registry (0411 G2), NOT bare
  // setInterval. The timers below are only tick frequencies: each tick asks the
  // stored completion time whether the job is actually due, so a deploy landing
  // between scheduled runs no longer skips one, a second replica cannot
  // double-run, and a job that quietly stops shows up as `stale` on
  // /internal/fleet/jobs rather than as silence.
  const jobs = new JobRegistry({
    store: durable?.jobs ?? new InMemoryDocStore<JobRecord>(),
    holder: env.K_REVISION ? `${env.K_REVISION}#${process.pid}` : `local#${process.pid}`
  })

  // Fleet observability (exploration 0201): poll each hot tenant's hub `/health`
  // and feed the rolling SLI window behind /internal/fleet/health and /status.json.
  jobs.add({
    jobId: 'fleet-probe',
    intervalMs: probeMs,
    work: async () => {
      const tenants = await controlPlane.listTenants()
      probeFleet(probe, health, tenants, Date.now())
    }
  })

  // Backup automation (exploration 0288); both are no-ops on the in-memory
  // provisioner used in dev/tests.
  //
  // (1) Restore drill: nightly, over a rotating sample, PROVE a tenant restores from
  //     its R2 replica into a throwaway hub — "we replicate" is not "we can restore".
  jobs.add({
    jobId: 'restore-drill',
    intervalMs: drillMs,
    // Tick hourly so a deploy delays the nightly drill by at most an hour.
    tickMs: Math.min(drillMs, 60 * 60_000),
    leaseMs: 30 * 60_000,
    work: async () => {
      const tenants = await controlPlane.listTenants()
      const sample = pickDrillSample(
        tenants,
        drillSampleSize(tenants.length, { max: drillMax }),
        dayIndex(Date.now())
      )
      const summary = summarizeDrill(
        await runRestoreDrills(controlPlane.provisioner, readyProbe, sample)
      )
      // Record BEFORE the throw below, so a failing drill reports `failing`
      // rather than falling back to the stale previous result.
      lastDrill = { ranAtMs: Date.now(), failures: summary.failures }
      // Throwing marks the run failed, so it stays due and is retried — and the
      // staleness alert fires if it keeps failing.
      if (summary.alert) {
        throw new Error(`restore drill FAILED for: ${summary.failures.join(', ')}`)
      }
    }
  })

  // (2) Cold-demotion sweep: demote idle hot tenants to R2-only, but only once the
  //     hub confirms its backup is fresh — the gate FAILS CLOSED (never destroys a
  //     volume on an unproven replica; exploration 0288).
  jobs.add({
    jobId: 'cold-demotion-sweep',
    intervalMs: sweepMs,
    work: async () => {
      const tenants = await controlPlane.listTenants()
      const now = Date.now()
      for (const t of tenants) {
        if (demotionDue(t, now, coldAfterMs)) {
          await controlPlane
            .demoteIfCold(t.tenantId, { coldAfterMs, assertSynced })
            .catch(() => undefined)
        }
      }
    }
  })

  // (3) Non-payment lifecycle (exploration 0418). `reconcileBilling` is the timer
  //     half of the dunning state machine — the webhook half (`recordBillingEvent`)
  //     opens grace, and until this job existed nothing ever closed it. Level-
  //     triggered like every other reconcile here: re-decide from stored state each
  //     tick, so a missed run is caught up rather than skipped.
  const notifier = billingNotifierFromEnv(controlPlane, billing, env)
  const deleteEnabled = env.XNET_CLOUD_DUNNING_DELETE_ENABLED === 'true'
  jobs.add({
    jobId: 'billing-reconcile',
    intervalMs: Number(env.XNET_CLOUD_BILLING_RECONCILE_MS ?? 60 * 60_000),
    work: async () => {
      const now = Date.now()
      const results: { tenantId: string; outcome: BillingOutcome }[] = []
      for (const t of await controlPlane.listTenants()) {
        const action = reconcileBilling(reconcileInputFor(t, now))
        const outcome = await applyBillingAction(controlPlane, notifier, t, action, now, {
          deleteEnabled
        })
        results.push({ tenantId: t.tenantId, outcome })
      }
      const summary = summarizeSweep(results)
      if (summary.applied || summary.failed || summary.skipped) {
        // eslint-disable-next-line no-console
        console.log(`billing-reconcile ${JSON.stringify(summary)}`)
      }
      // A failed transition keeps the job due and surfaces as `stale` on
      // /internal/fleet/jobs rather than as silence.
      if (summary.failed) {
        throw new Error(`billing reconcile FAILED for: ${summary.failures.join(', ')}`)
      }
    }
  })

  jobs.start()

  const app = createControlPlaneApp({
    controlPlane,
    billing,
    payments,
    health,
    jobs,
    backupHealth: () => backupHealthFrom(Boolean(env.R2_BUCKET), lastDrill),
    sessionSecret: env.XNET_CLOUD_SESSION_SECRET ?? 'dev-insecure-session-secret',
    baseUrl: env.XNET_CLOUD_BASE_URL ?? '',
    marketingUrl: env.XNET_CLOUD_MARKETING_URL ?? 'https://xnet.fyi/cloud',
    appUrl: env.XNET_CLOUD_APP_URL ?? 'https://xnet.fyi/app',
    ...(env.XNET_CLOUD_INTERNAL_SECRET ? { internalSecret: env.XNET_CLOUD_INTERNAL_SECRET } : {}),
    ...(env.SENTRY_DSN ? { sentryDsn: env.SENTRY_DSN } : {}),
    // First-seen crash-fingerprint alert (0315 P4): SSRF-guarded, content-free.
    ...(env.XNET_CLOUD_DIAGNOSTICS_ALERT_URL
      ? { diagnosticsAlertUrl: env.XNET_CLOUD_DIAGNOSTICS_ALERT_URL }
      : {}),
    ...(durable ? { nonces: durable.nonces } : {}),
    ...(ai ? { ai } : {})
  })
  assertNotifierSafeForDeletion(env)
  const port = Number(env.PORT ?? 4455)
  serve({ fetch: app.fetch, port })
  const mode = {
    auth: billing.name,
    payments: payments.id,
    provisioner: env.GCP_ARTIFACT_REGISTRY ? 'cloud-run' : 'memory',
    stores: env.GCP_FIRESTORE_DATABASE ? 'firestore' : 'memory',
    ai: ai ? 'litellm' : 'off',
    mail: mailSenderFromEnv(env) ? 'resend' : 'off',
    dunningDelete: deleteEnabled ? 'armed' : 'off',
    sentry: env.SENTRY_DSN ? 'on' : 'off'
  }
  // eslint-disable-next-line no-console
  console.log(`xnet-cloud listening on :${port} — ${JSON.stringify(mode)}`)
}

// Only start a server when run directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  start()
}
