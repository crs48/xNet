/**
 * @xnet/hub - Configuration resolution.
 */

import type { HubConfig } from './types'
import { DEFAULT_CONFIG } from './types'

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

  return { platform: 'local' }
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

  const auth =
    toBoolean(process.env.HUB_AUTH) ??
    cliOptions.auth ??
    DEFAULT_CONFIG.auth

  const storage =
    (process.env.HUB_STORAGE as HubConfig['storage'] | undefined) ??
    cliOptions.storage ??
    DEFAULT_CONFIG.storage

  const logLevel =
    (process.env.HUB_LOG_LEVEL as HubConfig['logLevel'] | undefined) ??
    cliOptions.logLevel ??
    DEFAULT_CONFIG.logLevel

  const runtime = detectPlatform()

  const shutdownGraceMs =
    toNumber(process.env.RAILWAY_GRACE_MS) ??
    (runtime.platform === 'fly' ? 4000 : DEFAULT_CONFIG.shutdownGraceMs ?? 8000)

  return {
    ...DEFAULT_CONFIG,
    ...cliOptions,
    port,
    dataDir,
    auth,
    storage,
    logLevel,
    publicUrl: process.env.HUB_PUBLIC_URL ?? cliOptions.publicUrl,
    runtime,
    shutdownGraceMs
  }
}
