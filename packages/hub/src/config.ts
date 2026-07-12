/**
 * @xnetjs/hub - Configuration resolution.
 */

import type { HubConfig, DemoOverrides } from './types'
import { entitlementsFromEnv } from '@xnetjs/entitlements'
import { DEFAULT_CONFIG, DEMO_DEFAULTS } from './types'

const toNumber = (value: string | undefined): number | undefined => {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const toBoolean = (value: string | undefined): boolean | undefined => {
  if (!value) return undefined
  if (value.toLowerCase() === 'false') return false
  if (value.toLowerCase() === 'true') return true
  return undefined
}

const detectPlatform = (): HubConfig['runtime'] => {
  const isFly = Boolean(process.env.FLY_REGION || process.env.FLY_MACHINE_ID)
  const isRailway = Boolean(process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.RAILWAY_PROJECT_ID)
  // GCP Cloud Run sets K_SERVICE/K_REVISION; AWS ECS/Fargate sets the ECS metadata
  // URI / AWS_EXECUTION_ENV. These are the managed-fleet substrates from 0175.
  const isCloudRun = Boolean(process.env.K_SERVICE)
  const isFargate = Boolean(
    process.env.ECS_CONTAINER_METADATA_URI_V4 || process.env.AWS_EXECUTION_ENV?.includes('ECS')
  )

  if (isFly) {
    return {
      platform: 'fly',
      region: process.env.FLY_REGION,
      machineId: process.env.FLY_MACHINE_ID
    }
  }

  if (isRailway) {
    return {
      platform: 'railway'
    }
  }

  if (isCloudRun) {
    return {
      platform: 'cloud-run',
      region: process.env.GOOGLE_CLOUD_REGION,
      machineId: process.env.K_REVISION
    }
  }

  if (isFargate) {
    return {
      platform: 'fargate',
      region: process.env.AWS_REGION
    }
  }

  return { platform: 'local' }
}

/**
 * When running under xNet Cloud, the control plane injects a signed `HUB_PLAN`
 * token (and `XNET_PLAN_SECRET`). Resolve the plan-driven quotas from it so the hub
 * enforces its tenant's limits (exploration 0175). With no `HUB_PLAN`, this returns
 * `{}` and a self-hosted hub keeps its own `DEFAULT_CONFIG` limits — the hub never
 * depends on the control plane (anti-lock-in invariant from 0174).
 */
const resolvePlanLimits = (): Partial<HubConfig> => {
  if (!process.env.HUB_PLAN) return {}
  const entitlements = entitlementsFromEnv(process.env)
  return {
    defaultQuota: entitlements.quotaBytes,
    maxBlobSize: entitlements.maxBlobBytes,
    maxConnections: entitlements.maxConnections
  }
}

/**
 * Resolve demo overrides from environment or return null if not in demo mode.
 */
export const getDemoOverrides = (isDemo: boolean): DemoOverrides | null => {
  const fromEnv = process.env.HUB_MODE === 'demo'
  if (!isDemo && !fromEnv) return null

  return {
    quota: toNumber(process.env.DEMO_QUOTA) ?? DEMO_DEFAULTS.quota,
    maxDocs: toNumber(process.env.DEMO_MAX_DOCS) ?? DEMO_DEFAULTS.maxDocs,
    maxBlob: toNumber(process.env.DEMO_MAX_BLOB) ?? DEMO_DEFAULTS.maxBlob,
    evictionTtl: toNumber(process.env.DEMO_EVICTION_TTL) ?? DEMO_DEFAULTS.evictionTtl,
    evictionInterval:
      toNumber(process.env.DEMO_EVICTION_INTERVAL) ?? DEMO_DEFAULTS.evictionInterval,
    resetInterval: toNumber(process.env.DEMO_RESET_INTERVAL) ?? DEMO_DEFAULTS.resetInterval,
    diskLimitBytes: toNumber(process.env.DEMO_DISK_LIMIT) ?? DEMO_DEFAULTS.diskLimitBytes
  }
}

/**
 * Resolve Hub configuration from environment variables, CLI flags, and defaults.
 */
export const resolveConfig = (cliOptions: Partial<HubConfig>): HubConfig => {
  const port =
    toNumber(process.env.PORT) ??
    toNumber(process.env.HUB_PORT) ??
    cliOptions.port ??
    DEFAULT_CONFIG.port

  const dataDir =
    process.env.RAILWAY_VOLUME_MOUNT_PATH ??
    process.env.HUB_DATA_DIR ??
    cliOptions.dataDir ??
    DEFAULT_CONFIG.dataDir

  const auth = toBoolean(process.env.HUB_AUTH) ?? cliOptions.auth ?? DEFAULT_CONFIG.auth

  const storage =
    (process.env.HUB_STORAGE as HubConfig['storage'] | undefined) ??
    cliOptions.storage ??
    DEFAULT_CONFIG.storage

  const logLevel =
    (process.env.HUB_LOG_LEVEL as HubConfig['logLevel'] | undefined) ??
    cliOptions.logLevel ??
    DEFAULT_CONFIG.logLevel
  const allowUnsignedReplication =
    toBoolean(process.env.HUB_ALLOW_UNSIGNED_REPLICATION) ??
    cliOptions.sync?.compatibility?.allowUnsignedReplication ??
    false

  const runtime = detectPlatform()

  const shutdownGraceMs =
    toNumber(process.env.RAILWAY_GRACE_MS) ??
    (runtime?.platform === 'fly' ? 4000 : (DEFAULT_CONFIG.shutdownGraceMs ?? 8000))
  const awarenessMaxUpdateSize =
    toNumber(process.env.HUB_AWARENESS_MAX_UPDATE_SIZE) ??
    cliOptions.awarenessMaxUpdateSize ??
    DEFAULT_CONFIG.awarenessMaxUpdateSize

  const demo = cliOptions.demo ?? process.env.HUB_MODE === 'demo'
  const demoOverrides = getDemoOverrides(demo) ?? undefined

  // Loudly flag security-relevant footguns at startup (exploration 0307). These
  // stay non-default; a warning makes an intentional relaxation visible in logs
  // rather than silent.
  if (!auth) {
    console.warn(
      '[hub] SECURITY: auth is DISABLED (HUB_AUTH=false) — every connection is ' +
        'treated as an anonymous client with wildcard capabilities and room ' +
        'authorization is skipped. Do not run this on an open network.'
    )
  }
  if (allowUnsignedReplication) {
    console.warn(
      '[hub] SECURITY: HUB_ALLOW_UNSIGNED_REPLICATION is enabled — unsigned Yjs ' +
        'updates are accepted and applied to hub-held document state without ' +
        'authorship verification. Enable only for trusted, closed deployments.'
    )
  }

  return {
    ...DEFAULT_CONFIG,
    ...cliOptions,
    // Plan-driven quotas (managed fleet) override defaults but not explicit fields below.
    ...resolvePlanLimits(),
    port,
    dataDir,
    auth,
    storage,
    logLevel,
    awarenessMaxUpdateSize,
    sync: allowUnsignedReplication
      ? { compatibility: { allowUnsignedReplication: true } }
      : cliOptions.sync,
    publicUrl: process.env.HUB_PUBLIC_URL ?? cliOptions.publicUrl,
    appUrl: process.env.HUB_APP_URL ?? cliOptions.appUrl,
    appleAppId: process.env.HUB_APPLE_APP_ID ?? cliOptions.appleAppId,
    androidPackage: process.env.HUB_ANDROID_PACKAGE ?? cliOptions.androidPackage,
    androidCertSha256:
      process.env.HUB_ANDROID_CERT_SHA256?.split(',')
        .map((entry) => entry.trim())
        .filter(Boolean) ?? cliOptions.androidCertSha256,
    runtime,
    shutdownGraceMs,
    demo,
    demoOverrides
  }
}
