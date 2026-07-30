/**
 * Runtime-bridge resolution for `XNetProvider` (0276): picks worker / main
 * thread / IPC, applies the configured fallback policy, and reports the
 * resulting `XNetRuntimeStatus` to telemetry/diagnostics.
 */

import type { TelemetryReporter } from '../context/telemetry-context'
import type { XNetRuntimeConfig, XNetRuntimeStatus, XNetRuntimeMode } from '../runtime'
import type { DID } from '@xnetjs/core'
import type { NodeStore } from '@xnetjs/data'
import type { SyncManager } from '@xnetjs/runtime'
import {
  createDataBridge,
  createMainThreadBridge,
  MainThreadBridge,
  WorkerBridge,
  type DataBridge,
  type MainThreadBridgeOptions,
  type NodeQueryRouterThresholds,
  type RemoteNodeQueryClient,
  type SyncManagerLike
} from '@xnetjs/data-bridge'
import { createRuntimeStatus } from '../runtime'

export type RuntimeResolution = {
  bridge: DataBridge | null
  createdInternally: boolean
  status: XNetRuntimeStatus
}

export type SyncManagedBridge = DataBridge & {
  setSyncManager?: (syncManager: SyncManagerLike | null) => void
}

function getRuntimeErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function inferBridgeMode(bridge: DataBridge): XNetRuntimeMode | null {
  if (bridge instanceof WorkerBridge) return 'worker'
  if (bridge instanceof MainThreadBridge) return 'main-thread'
  return null
}

export function reportRuntimeStatus(
  telemetry: TelemetryReporter | undefined,
  status: XNetRuntimeStatus
): void {
  telemetry?.reportUsage(`react.runtime.request.${status.requestedMode}`, 1)

  if (status.activeMode) {
    telemetry?.reportUsage(`react.runtime.active.${status.activeMode}`, 1)
  }

  if (status.usedFallback && status.fallbackMode) {
    telemetry?.reportUsage(`react.runtime.fallback.${status.fallbackMode}`, 1)
  }
}

export function logRuntimeStatus(runtime: XNetRuntimeConfig, status: XNetRuntimeStatus): void {
  if (!runtime.diagnostics) return

  if (status.phase === 'error') {
    console.error('[XNetProvider] Runtime initialization failed:', status)
    return
  }

  if (status.usedFallback) {
    console.warn('[XNetProvider] Runtime fallback activated:', status)
    return
  }

  console.info('[XNetProvider] Runtime ready:', status)
}

function resolveRuntimeFailure(
  runtime: XNetRuntimeConfig,
  nodeStore: NodeStore,
  reason: string,
  bridgeOptions?: MainThreadBridgeOptions
): RuntimeResolution {
  if (runtime.fallback === 'main-thread') {
    return {
      bridge: createMainThreadBridge(nodeStore, bridgeOptions),
      createdInternally: true,
      status: createRuntimeStatus(runtime, {
        activeMode: 'main-thread',
        fallbackMode: 'main-thread',
        usedFallback: true,
        phase: 'ready',
        reason
      })
    }
  }

  return {
    bridge: null,
    createdInternally: false,
    status: createRuntimeStatus(runtime, {
      phase: 'error',
      reason
    })
  }
}

export async function resolveRuntimeBridge(input: {
  runtime: XNetRuntimeConfig
  nodeStore: NodeStore
  authorDID: DID
  signingKey: Uint8Array
  signalingUrl?: string
  dataBridge?: DataBridge
  remoteNodeQueryClient?: RemoteNodeQueryClient
  remoteNodeQueryRouting?: Partial<NodeQueryRouterThresholds>
  syncManager?: SyncManager
}): Promise<RuntimeResolution> {
  const {
    runtime,
    nodeStore,
    authorDID,
    signingKey,
    signalingUrl,
    dataBridge,
    remoteNodeQueryClient,
    remoteNodeQueryRouting,
    syncManager
  } = input

  if (runtime.mode === 'ipc') {
    if (!syncManager) {
      return resolveRuntimeFailure(
        runtime,
        nodeStore,
        'IPC runtime requires config.syncManager to be provided explicitly.',
        { remoteNodeQueryClient, remoteNodeQueryRouting }
      )
    }

    return {
      bridge:
        dataBridge ??
        createMainThreadBridge(nodeStore, {
          remoteNodeQueryClient,
          remoteNodeQueryRouting
        }),
      createdInternally: !dataBridge,
      status: createRuntimeStatus(runtime, {
        activeMode: 'ipc',
        phase: 'ready'
      })
    }
  }

  if (dataBridge) {
    const activeMode = inferBridgeMode(dataBridge) ?? runtime.mode
    const usedFallback = activeMode !== runtime.mode

    return {
      bridge: dataBridge,
      createdInternally: false,
      status: createRuntimeStatus(runtime, {
        activeMode,
        fallbackMode: usedFallback ? activeMode : null,
        usedFallback,
        phase: 'ready',
        reason: usedFallback
          ? `Configured runtime "${runtime.mode}" resolved to "${activeMode}" through the supplied dataBridge.`
          : null
      })
    }
  }

  if (runtime.mode === 'worker') {
    try {
      const bridge = await createDataBridge({
        nodeStore,
        config: {
          dbName: runtime.worker?.dbName,
          authorDID,
          signingKey,
          signalingUrl: runtime.worker?.signalingUrl ?? signalingUrl,
          storagePort: runtime.worker?.storagePort,
          remoteNodeQueryClient,
          remoteNodeQueryRouting
        },
        workerUrl: runtime.worker?.url,
        mode: 'worker'
      })

      return {
        bridge,
        createdInternally: true,
        status: createRuntimeStatus(runtime, {
          activeMode: 'worker',
          phase: 'ready'
        })
      }
    } catch (err) {
      return resolveRuntimeFailure(
        runtime,
        nodeStore,
        `Worker runtime unavailable: ${getRuntimeErrorMessage(err)}`,
        { remoteNodeQueryClient, remoteNodeQueryRouting }
      )
    }
  }

  const bridge = await createDataBridge({
    nodeStore,
    config: {
      authorDID,
      signingKey,
      signalingUrl,
      remoteNodeQueryClient,
      remoteNodeQueryRouting
    },
    mode: 'main-thread'
  })

  return {
    bridge,
    createdInternally: true,
    status: createRuntimeStatus(runtime, {
      activeMode: 'main-thread',
      phase: 'ready'
    })
  }
}
