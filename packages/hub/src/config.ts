/**
 * @xnetjs/hub - Configuration resolution.
 */

import type { HubConfig, HubRole, DemoOverrides } from './types'
import { entitlementsFromEnv } from '@xnetjs/entitlements'
import { HUB_ROLES, isHubRole, rolePreset } from './roles'
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
 * The single per-user storage cap every grower is metered against: the change
 * log, backups, and file uploads. In demo mode that is the small disposable
 * demo override (10 MB by default); otherwise it is the plan quota resolved from
 * the signed `HUB_PLAN` entitlement, falling back to `DEFAULT_CONFIG` for a
 * self-hosted hub (exploration 0291/0216, wired for managed hubs by 0381).
 *
 * One function so a new grower cannot pick a different cap than the meter the
 * dashboard shows — the change log did exactly that and went ungated on every
 * non-demo hub.
 *
 * DECIDED (0383 W1, R6): the cap applies to self-hosted hubs too — a
 * self-hosted operator gets `DEFAULT_CONFIG.defaultQuota` (1 GiB/user) unless
 * they raise it, for consistency with backups and files rather than a special
 * uncapped change log. Operators who want no cap set `defaultQuota` explicitly;
 * the discriminator for ever narrowing this to managed-only is `HUB_PLAN`
 * presence, and that narrowing was considered and declined.
 */
export const resolvePerUserQuota = (config: HubConfig): number =>
  config.demo && config.demoOverrides ? config.demoOverrides.quota : config.defaultQuota

// ─── Per-cap resolvers (0383 W1) ─────────────────────────────────────────────
// The #603 rule, applied wholesale: every demo-vs-plan decision is made HERE,
// once, by name. Server code calls a resolver and branches on its result; it
// never re-derives `demo ? x : y` inline (0382's "demo ternaries" anti-pattern
// — the open-coded copies are exactly how the change-log quota gate was missed).

/** Per-user blob ceiling: the demo override, else the plan/config ceiling. */
export const resolveMaxBlobBytes = (config: HubConfig): number =>
  config.demo && config.demoOverrides ? config.demoOverrides.maxBlob : config.maxBlobSize

/** Disk-watchdog budget; `null` = no watchdog (watchdog stays demo-only, 0291). */
export const resolveDiskWatchdogBytes = (config: HubConfig): number | null =>
  config.demo && config.demoOverrides ? config.demoOverrides.diskLimitBytes : null

/** Periodic full-reset cadence; `null` = never (demo's disposable volume only). */
export const resolveResetIntervalMs = (config: HubConfig): number | null =>
  config.demo && config.demoOverrides ? config.demoOverrides.resetInterval : null

/** Whether a corrupt base DB is wiped-and-rebooted instead of crash-looping. */
export const resolveResetOnCorruption = (config: HubConfig): boolean => !!config.demo

/** The handshake's advertised per-user limits; `undefined` outside demo. */
export const resolveHandshakeDemoLimits = (
  config: HubConfig
):
  | { quotaBytes: number; maxDocs: number; maxBlobBytes: number; evictionTtlMs: number }
  | undefined =>
  config.demo && config.demoOverrides
    ? {
        quotaBytes: config.demoOverrides.quota,
        maxDocs: config.demoOverrides.maxDocs,
        maxBlobBytes: config.demoOverrides.maxBlob,
        evictionTtlMs: config.demoOverrides.evictionTtl
      }
    : undefined

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

  // Role resolution (0382/0383 W1): explicit flag/env wins; the legacy `--demo`
  // flag and `HUB_MODE=demo` env are aliases for `--role demo`.
  const rawRole = cliOptions.role ?? process.env.HUB_ROLE
  if (rawRole !== undefined && !isHubRole(rawRole)) {
    throw new Error(
      `Unknown hub role: ${JSON.stringify(rawRole)} (valid: ${Object.keys(HUB_ROLES).join(', ')})`
    )
  }
  const legacyDemo = cliOptions.demo ?? process.env.HUB_MODE === 'demo'
  const role: HubRole = rawRole ?? (legacyDemo ? 'demo' : 'personal')
  const preset = rolePreset(role)

  const demo = preset.demo ?? legacyDemo
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
    // Role preset (0383 W1): between defaults and explicit options, so a role
    // can never override a choice the operator made by hand.
    ...preset,
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
    role,
    demo,
    demoOverrides
  }
}
