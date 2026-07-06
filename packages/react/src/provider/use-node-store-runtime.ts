/**
 * NodeStore + runtime-bridge initialization for `XNetProvider` (0276).
 *
 * Owns the init lifecycle: open the storage adapter, create + initialize the
 * `NodeStore`, resolve the data bridge (worker / main-thread / IPC with the
 * configured fallback), report status, and tear everything down on unmount —
 * including the StrictMode double-mount `cancelled` protocol.
 */

import type { TelemetryReporter } from '../context/telemetry-context'
import type { XNetRuntimeConfig, XNetRuntimeStatus } from '../runtime'
import type { DID } from '@xnetjs/core'
import type { NodeStorageAdapter } from '@xnetjs/data'
import type {
  DataBridge,
  NodeQueryRouterThresholds,
  RemoteNodeQueryClient
} from '@xnetjs/data-bridge'
import type { SyncManager } from '@xnetjs/runtime'
import type { MutableRefObject } from 'react'
import { MemoryNodeStorageAdapter, NodeStore } from '@xnetjs/data'
import { useEffect, useRef, useState } from 'react'
import { createRuntimeStatus } from '../runtime'
import { scheduleIdle } from './debug'
import { logRuntimeStatus, reportRuntimeStatus, resolveRuntimeBridge } from './runtime-resolution'

export type NodeStoreRuntimeInput = {
  authorDID: string | undefined
  signingKey: Uint8Array | undefined
  nodeStorage: NodeStorageAdapter | undefined
  dataBridge: DataBridge | undefined
  remoteNodeQueryClient: RemoteNodeQueryClient | undefined
  remoteNodeQueryRouting: Partial<NodeQueryRouterThresholds> | undefined
  syncManager: SyncManager | undefined
  telemetry: TelemetryReporter | undefined
  hubUrl: string | null
  signalingUrls: string[]
  runtimeConfig: XNetRuntimeConfig
  runtimeWorkerUrlKey: string
}

export type NodeStoreRuntime = {
  nodeStore: NodeStore | null
  nodeStoreReady: boolean
  dataBridge: DataBridge | null
  runtimeStatus: XNetRuntimeStatus
  nodeStorageRef: MutableRefObject<NodeStorageAdapter | null>
}

export function useNodeStoreRuntime(input: NodeStoreRuntimeInput): NodeStoreRuntime {
  const {
    authorDID,
    signingKey,
    nodeStorage,
    dataBridge: configDataBridge,
    remoteNodeQueryClient,
    remoteNodeQueryRouting,
    syncManager: configSyncManager,
    telemetry,
    hubUrl,
    signalingUrls,
    runtimeConfig,
    runtimeWorkerUrlKey
  } = input

  const [nodeStore, setNodeStore] = useState<NodeStore | null>(null)
  const [nodeStoreReady, setNodeStoreReady] = useState(false)
  const [dataBridge, setDataBridge] = useState<DataBridge | null>(null)
  const nodeStorageRef = useRef<NodeStorageAdapter | null>(null)
  const [runtimeStatus, setRuntimeStatus] = useState<XNetRuntimeStatus>(() =>
    createRuntimeStatus(runtimeConfig)
  )

  useEffect(() => {
    const nodeStorageAdapter = nodeStorage ?? new MemoryNodeStorageAdapter()
    nodeStorageRef.current = nodeStorageAdapter
    setRuntimeStatus(createRuntimeStatus(runtimeConfig))

    // Skip NodeStore initialization if credentials not provided
    if (!authorDID || !signingKey) {
      console.warn(
        'XNetProvider: authorDID and signingKey not provided. NodeStore will not be initialized. ' +
          'Provide these via config.authorDID/config.signingKey or config.identity.'
      )
      setRuntimeStatus(
        createRuntimeStatus(runtimeConfig, {
          phase: 'error',
          reason: 'authorDID and signingKey are required to initialize the runtime.'
        })
      )
      return
    }

    // Track whether this effect instance is still active (handles StrictMode double-mount)
    let cancelled = false

    // Initialize the node storage adapter if it has an open() method
    const initializeNodeStore = async () => {
      if ('open' in nodeStorageAdapter && typeof nodeStorageAdapter.open === 'function') {
        await nodeStorageAdapter.open()
      }

      // Check if effect was cleaned up while we were awaiting
      if (cancelled) return

      const ns = new NodeStore({
        storage: nodeStorageAdapter,
        authorDID: authorDID as DID,
        signingKey
      })

      await ns.initialize()

      // Check again after second await
      if (cancelled) return

      const resolvedRuntime = await resolveRuntimeBridge({
        runtime: runtimeConfig,
        nodeStore: ns,
        authorDID: authorDID as DID,
        signingKey,
        signalingUrl: signalingUrls[0],
        dataBridge: configDataBridge,
        remoteNodeQueryClient,
        remoteNodeQueryRouting,
        syncManager: configSyncManager
      })

      if (cancelled) {
        if (resolvedRuntime.createdInternally && resolvedRuntime.bridge) {
          resolvedRuntime.bridge.destroy()
        }
        return
      }

      setRuntimeStatus(resolvedRuntime.status)
      reportRuntimeStatus(telemetry, resolvedRuntime.status)
      logRuntimeStatus(runtimeConfig, resolvedRuntime.status)

      if (resolvedRuntime.status.phase !== 'ready' || !resolvedRuntime.bridge) {
        telemetry?.reportCrash(new Error(resolvedRuntime.status.reason ?? 'Runtime failed'), {
          codeNamespace: 'react.runtime.initialize',
          requestedMode: resolvedRuntime.status.requestedMode
        })
        setNodeStore(null)
        setNodeStoreReady(false)
        setDataBridge(null)
        bridgeRef = null
        return
      }

      setNodeStore(ns)
      setNodeStoreReady(true)
      setDataBridge(resolvedRuntime.bridge)

      // Store bridge ref for cleanup (only if we created it)
      bridgeRef = resolvedRuntime.createdInternally ? resolvedRuntime.bridge : null

      // Expose NodeStore to window for main process access (Electron Local API)
      if (typeof window !== 'undefined') {
        const win = window as Window & { __xnetNodeStore?: NodeStore }
        win.__xnetNodeStore = ns
      }

      // Refresh query-planner statistics at idle, after first paint, so the
      // planner stays in sync as the database grows (exploration 0184). Cheap
      // (`PRAGMA optimize` only ANALYZEs drifted tables) and never blocks the
      // initial render.
      scheduleIdle(() => {
        if (!cancelled) void ns.optimize()
      })
    }

    let bridgeRef: DataBridge | null = null
    initializeNodeStore()

    return () => {
      cancelled = true
      // Clean up DataBridge first
      if (bridgeRef) {
        bridgeRef.destroy()
      }
      setDataBridge(null)
      setNodeStore(null)
      setNodeStoreReady(false)

      // Clean up window reference
      if (typeof window !== 'undefined') {
        delete (window as Window & { __xnetNodeStore?: NodeStore }).__xnetNodeStore
      }

      if ('close' in nodeStorageAdapter && typeof nodeStorageAdapter.close === 'function') {
        nodeStorageAdapter.close()
      }
    }
  }, [
    authorDID,
    nodeStorage,
    signingKey,
    configDataBridge,
    signalingUrls,
    configSyncManager,
    remoteNodeQueryClient,
    remoteNodeQueryRouting,
    telemetry,
    hubUrl,
    runtimeConfig,
    runtimeWorkerUrlKey
  ])

  return { nodeStore, nodeStoreReady, dataBridge, runtimeStatus, nodeStorageRef }
}
