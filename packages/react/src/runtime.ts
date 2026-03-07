/**
 * Runtime configuration helpers for @xnetjs/react
 */
import type { Platform } from '@xnetjs/plugins'

export type XNetRuntimeMode = 'main-thread' | 'worker' | 'ipc'
export type XNetRuntimeFallback = 'main-thread' | 'error'
export type XNetRuntimePhase = 'initializing' | 'ready' | 'error'

export interface XNetRuntimeWorkerConfig {
  /**
   * Worker entry URL for the data runtime.
   * When omitted, worker mode will fall back or error explicitly.
   */
  url?: string | URL
  /**
   * Optional database name for worker-backed storage.
   */
  dbName?: string
  /**
   * Optional signaling URL override for worker-backed sync.
   */
  signalingUrl?: string
}

export interface XNetRuntimeConfig {
  /**
   * Requested runtime mode for data and sync orchestration.
   */
  mode: XNetRuntimeMode
  /**
   * Fallback behavior when the requested runtime cannot be activated.
   */
  fallback?: XNetRuntimeFallback
  /**
   * Emit runtime diagnostics through console logging.
   */
  diagnostics?: boolean
  /**
   * Worker-specific bootstrap options.
   */
  worker?: XNetRuntimeWorkerConfig
}

export interface XNetRuntimeStatus {
  /**
   * Runtime mode requested by app bootstrap.
   */
  requestedMode: XNetRuntimeMode
  /**
   * Runtime mode currently active.
   * Null while initializing or when runtime activation failed.
   */
  activeMode: XNetRuntimeMode | null
  /**
   * Fallback mode that was used, if any.
   */
  fallbackMode: XNetRuntimeMode | null
  /**
   * Whether the provider had to deviate from the requested runtime mode.
   */
  usedFallback: boolean
  /**
   * Runtime initialization phase.
   */
  phase: XNetRuntimePhase
  /**
   * Human-readable reason for fallback or failure.
   */
  reason: string | null
}

const DEFAULT_RUNTIME_BY_PLATFORM: Record<Platform, XNetRuntimeConfig> = {
  web: {
    mode: 'worker',
    fallback: 'main-thread',
    diagnostics: false
  },
  electron: {
    mode: 'ipc',
    fallback: 'error',
    diagnostics: false
  },
  mobile: {
    mode: 'main-thread',
    fallback: 'main-thread',
    diagnostics: false
  }
}

export function resolveRuntimeConfig(
  runtime: XNetRuntimeConfig | undefined,
  platform: Platform
): XNetRuntimeConfig {
  const base = DEFAULT_RUNTIME_BY_PLATFORM[platform]

  return {
    ...base,
    ...runtime,
    worker: runtime?.worker ? { ...runtime.worker } : undefined
  }
}

export function createRuntimeStatus(
  runtime: XNetRuntimeConfig,
  overrides: Partial<XNetRuntimeStatus> = {}
): XNetRuntimeStatus {
  return {
    requestedMode: overrides.requestedMode ?? runtime.mode,
    activeMode: overrides.activeMode ?? null,
    fallbackMode: overrides.fallbackMode ?? null,
    usedFallback: overrides.usedFallback ?? false,
    phase: overrides.phase ?? 'initializing',
    reason: overrides.reason ?? null
  }
}
