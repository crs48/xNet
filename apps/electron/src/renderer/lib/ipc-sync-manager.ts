/**
 * IPC-based Sync Manager for Electron renderer
 *
 * Implements the SyncManager interface from @xnet/react but routes all
 * operations through IPC to the main-process BSM. Y.Doc updates flow
 * through MessagePort channels for zero-copy binary transfer.
 *
 * The renderer maintains its own Y.Doc mirror (for TipTap/editor binding)
 * that stays in sync with the main-process doc via the MessagePort.
 *
 * Awareness is managed in the renderer and synced via IPC to the main process,
 * which broadcasts it over WebSocket to other peers.
 */

import type { SyncManager } from '@xnet/react'
import { createYWebRTCProvider, type YWebRTCProvider } from '@xnet/network'
import {
  Awareness,
  encodeAwarenessUpdate,
  applyAwarenessUpdate,
  removeAwarenessStates
} from 'y-protocols/awareness'
import * as Y from 'yjs'

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'
type StatusHandler = (status: ConnectionStatus) => void
type AwarenessSnapshotHandler = Parameters<SyncManager['onAwarenessSnapshot']>[1]
type AwarenessSnapshotUsers = Parameters<AwarenessSnapshotHandler>[0]
type DocType = 'page' | 'database' | 'canvas'

// DevTools event bus type (optional - for instrumentation)
interface DevToolsEventBus {
  emit(event: {
    type: string
    room?: string
    previousStatus?: string
    newStatus?: string
    error?: string
    peer?: { id: string; name?: string; connectedAt: number; lastSeen: number }
    totalPeers?: number
    peerId?: string
  }): void
}

export interface IPCSyncManager extends SyncManager {
  /** Instrument with devtools event bus for sync monitoring */
  instrument(eventBus: DevToolsEventBus): () => void
  /** Set identity for signing outgoing updates */
  setIdentity(authorDID: string, signingKey: Uint8Array): void
  /** Reconfigure relay + auth transport options at runtime */
  configureShareSession(input: {
    signalingUrl: string
    ucanToken?: string
    transport?: 'ws' | 'webrtc' | 'auto'
    iceServers?: Array<{ urls: string[]; username?: string; credential?: string }>
  }): Promise<void>
}

export function createIPCSyncManager(): IPCSyncManager {
  // Renderer-side Y.Doc mirrors (one per acquired node)
  const docs = new Map<string, Y.Doc>()
  // Awareness instances per node (for cursor presence, etc.)
  const awarenessMap = new Map<string, Awareness>()
  const awarenessSnapshots = new Map<string, AwarenessSnapshotUsers>()
  const awarenessSnapshotListeners = new Map<string, Set<AwarenessSnapshotHandler>>()
  // Cleanup functions for doc update listeners and message handlers
  const cleanups = new Map<string, () => void>()
  // Pending acquire promises to handle concurrent calls
  const pendingAcquires = new Map<string, Promise<Y.Doc>>()
  const trackedSchemas = new Map<string, string>()
  const webrtcProviders = new Map<string, YWebRTCProvider>()

  let currentStatus: ConnectionStatus = 'disconnected'
  let previousStatus: ConnectionStatus = 'disconnected'
  const statusListeners = new Set<StatusHandler>()
  let statusCleanup: (() => void) | null = null
  let instrumentedEventBus: DevToolsEventBus | null = null
  let statusPollInterval: ReturnType<typeof setInterval> | null = null
  let bsmStartOptions: {
    signalingUrl: string
    ucanToken?: string
    transport?: 'ws' | 'webrtc' | 'auto'
    iceServers?: Array<{ urls: string[]; username?: string; credential?: string }>
  } = {
    signalingUrl: import.meta.env.VITE_HUB_URL || 'ws://localhost:4444',
    transport:
      (import.meta.env.VITE_XNET_SYNC_TRANSPORT as 'ws' | 'webrtc' | 'auto' | undefined) ?? 'auto'
  }
  const envPreferredDocTypes = import.meta.env.VITE_XNET_WEBRTC_DOC_TYPES
  let preferredDocTypes = new Set<DocType>(['page', 'database', 'canvas'])
  if (typeof envPreferredDocTypes === 'string' && envPreferredDocTypes.trim().length > 0) {
    preferredDocTypes = new Set(
      envPreferredDocTypes
        .split(',')
        .map((value) => value.trim())
        .filter(
          (value): value is DocType =>
            value === 'page' || value === 'database' || value === 'canvas'
        )
    )
  }

  function schemaIdToDocType(schemaId: string): DocType | null {
    const lower = schemaId.toLowerCase()
    if (lower.includes('page')) return 'page'
    if (lower.includes('database')) return 'database'
    if (lower.includes('canvas')) return 'canvas'
    return null
  }

  function shouldUseWebRTC(nodeId: string): boolean {
    const strategy = bsmStartOptions.transport ?? 'auto'
    const webrtcEnabled = import.meta.env.VITE_XNET_ENABLE_WEBRTC === 'true'
    if (!webrtcEnabled) {
      return false
    }
    if (strategy === 'ws') {
      return false
    }

    const schemaId = trackedSchemas.get(nodeId)
    const docType = schemaId ? schemaIdToDocType(schemaId) : null
    if (docType && !preferredDocTypes.has(docType)) {
      return false
    }

    return true
  }

  function setupWebRTCProvider(nodeId: string, doc: Y.Doc): void {
    if (!shouldUseWebRTC(nodeId) || webrtcProviders.has(nodeId)) {
      return
    }

    const signalingServer = bsmStartOptions.signalingUrl
      .replace(/^http:/, 'ws:')
      .replace(/^https:/, 'wss:')
    const room = `xnet-doc-${nodeId}`

    try {
      const provider = createYWebRTCProvider(doc, room, {
        signalingServers: [signalingServer],
        password: bsmStartOptions.ucanToken,
        iceServers: bsmStartOptions.iceServers
      })
      webrtcProviders.set(nodeId, provider)

      // Downgrade immediately on auth/ICE failures.
      provider.provider.on('status', (event: { status: string }) => {
        if (event.status === 'failed' || event.status === 'disconnected') {
          const existing = webrtcProviders.get(nodeId)
          existing?.destroy()
          webrtcProviders.delete(nodeId)
        }
      })
    } catch (err) {
      console.warn('[IPCSyncManager] WebRTC setup failed, continuing over WS relay:', err)
    }
  }

  // Identity for signing outgoing updates
  let identityAuthorDID: string | null = null
  let identitySigningKey: number[] | null = null

  function notifyStatus(s: ConnectionStatus): void {
    if (s === currentStatus) return // Skip duplicate status updates
    previousStatus = currentStatus
    currentStatus = s
    for (const handler of statusListeners) {
      try {
        handler(s)
      } catch {
        // Listener errors don't break the manager
      }
    }
  }

  function emitAwarenessSnapshot(nodeId: string, users: AwarenessSnapshotUsers): void {
    awarenessSnapshots.set(nodeId, users)
    const listeners = awarenessSnapshotListeners.get(nodeId)
    if (!listeners) return
    for (const handler of listeners) {
      try {
        handler(users)
      } catch {
        // Listener errors don't break the manager
      }
    }
  }

  return {
    async start() {
      // Guard against multiple start calls (React StrictMode)
      if (statusCleanup) {
        return
      }

      // Listen for status changes from main process
      statusCleanup = window.xnetBSM.onStatusChange((status) => {
        notifyStatus(status as ConnectionStatus)
      })

      // Tell BSM to start (it may already be running)
      try {
        await window.xnetBSM.start({
          ...bsmStartOptions,
          authorDID: identityAuthorDID ?? undefined,
          signingKey: identitySigningKey ?? undefined
        })
      } catch (err) {
        console.warn('[IPCSyncManager] Failed to start:', err)
      }
    },

    setIdentity(authorDID: string, signingKey: Uint8Array) {
      identityAuthorDID = authorDID
      identitySigningKey = Array.from(signingKey)
    },

    async configureShareSession(input) {
      bsmStartOptions = {
        signalingUrl: input.signalingUrl,
        ucanToken: input.ucanToken,
        transport: input.transport ?? bsmStartOptions.transport,
        iceServers: input.iceServers
      }

      try {
        await window.xnetBSM.reconfigure({
          ...bsmStartOptions,
          authorDID: identityAuthorDID ?? undefined,
          signingKey: identitySigningKey ?? undefined
        })
      } catch (err) {
        console.warn('[IPCSyncManager] Failed to reconfigure sync transport:', err)
      }
    },

    async stop() {
      // Clean up all nodes
      for (const [nodeId] of docs) {
        const cleanup = cleanups.get(nodeId)
        if (cleanup) cleanup()
        const provider = webrtcProviders.get(nodeId)
        if (provider) {
          provider.destroy()
          webrtcProviders.delete(nodeId)
        }
        window.xnetBSM.release(nodeId)
      }
      cleanups.clear()

      // Destroy renderer-side mirrors
      for (const [, doc] of docs) {
        doc.destroy()
      }
      docs.clear()

      if (statusCleanup) {
        statusCleanup()
        statusCleanup = null
      }

      // Don't actually stop the BSM - it runs in the main process
      // and should persist across React lifecycle. Only stop on app quit.
      // await window.xnetBSM.stop()
      // currentStatus = 'disconnected'
    },

    track(nodeId: string, schemaId: string) {
      trackedSchemas.set(nodeId, schemaId)
      window.xnetBSM.track(nodeId, schemaId)
    },

    untrack(nodeId: string) {
      trackedSchemas.delete(nodeId)
      window.xnetBSM.untrack(nodeId)
    },

    async acquire(nodeId: string): Promise<Y.Doc> {
      // Reuse existing mirror if already fully acquired
      const existing = docs.get(nodeId)
      if (existing) return existing

      // If there's already a pending acquire for this node, wait for it
      const pending = pendingAcquires.get(nodeId)
      if (pending) return pending

      // Create the acquire promise and store it BEFORE starting async work
      const acquirePromise = (async () => {
        // Create renderer-side Y.Doc mirror
        const doc = new Y.Doc({ guid: nodeId, gc: false })

        // Create awareness for this doc
        const awareness = new Awareness(doc)
        awarenessMap.set(nodeId, awareness)

        // Request port from main process (preload manages the actual MessagePort)
        await window.xnetBSM.acquire(nodeId, '')

        // Set up message handler for remote updates (via preload)
        const messageCleanup = window.xnetBSM.onMessage(nodeId, (data: unknown) => {
          const { type, update, users } = data as {
            type: string
            update?: number[]
            users?: unknown
          }
          if (type === 'update' && update) {
            Y.applyUpdate(doc, new Uint8Array(update), 'remote')
          } else if (type === 'awareness' && update) {
            applyAwarenessUpdate(awareness, new Uint8Array(update), 'remote')
          } else if (type === 'awareness-snapshot' && Array.isArray(users)) {
            emitAwarenessSnapshot(nodeId, users as AwarenessSnapshotUsers)
          } else if (type === 'request-awareness') {
            // BSM is asking us to re-broadcast our awareness (a new peer joined)
            const localState = awareness.getLocalState()
            if (localState) {
              const awarenessUpdate = encodeAwarenessUpdate(awareness, [awareness.clientID])
              window.xnetBSM.postMessage(nodeId, {
                type: 'awareness',
                update: Array.from(awarenessUpdate)
              })
            }
          }
        })

        // Forward local edits to main process (via preload)
        // Note: We skip 'remote' origin to avoid echo, but we DO forward 'storage'
        // origin updates so the main process gets the initial content loaded from local SQLite storage
        const updateHandler = (update: Uint8Array, origin: unknown) => {
          if (origin === 'remote') return // Don't echo back remote updates
          window.xnetBSM.postMessage(nodeId, { type: 'update', update: Array.from(update) })
        }
        doc.on('update', updateHandler)

        // Forward local awareness changes to main process
        const awarenessHandler = (
          changes: { added: number[]; updated: number[]; removed: number[] },
          origin: unknown
        ) => {
          if (origin === 'remote') return // Don't echo back remote awareness
          const changedClients = [...changes.added, ...changes.updated, ...changes.removed]
          if (changedClients.length > 0) {
            const update = encodeAwarenessUpdate(awareness, changedClients)
            window.xnetBSM.postMessage(nodeId, { type: 'awareness', update: Array.from(update) })
          }
        }
        awareness.on('change', awarenessHandler)

        cleanups.set(nodeId, () => {
          doc.off('update', updateHandler)
          awareness.off('change', awarenessHandler)
          messageCleanup()
        })

        // Store doc only after fully set up, then clean up pending
        docs.set(nodeId, doc)
        setupWebRTCProvider(nodeId, doc)
        pendingAcquires.delete(nodeId)

        return doc
      })()

      // Store pending promise synchronously before any await
      pendingAcquires.set(nodeId, acquirePromise)
      return acquirePromise
    },

    release(nodeId: string) {
      // Cleanup update listener and message handler
      const cleanup = cleanups.get(nodeId)
      if (cleanup) {
        cleanup()
        cleanups.delete(nodeId)
      }

      // Clean up awareness - broadcast removal before destroying
      const awareness = awarenessMap.get(nodeId)
      if (awareness) {
        // Broadcast awareness removal to peers so they clear our presence immediately
        removeAwarenessStates(awareness, [awareness.clientID], 'local')
        // Send the removal update to the network
        const removalUpdate = encodeAwarenessUpdate(awareness, [awareness.clientID])
        window.xnetBSM.postMessage(nodeId, {
          type: 'awareness',
          update: Array.from(removalUpdate)
        })
        awareness.destroy()
        awarenessMap.delete(nodeId)
      }

      awarenessSnapshots.delete(nodeId)
      awarenessSnapshotListeners.delete(nodeId)
      trackedSchemas.delete(nodeId)

      const provider = webrtcProviders.get(nodeId)
      if (provider) {
        provider.destroy()
        webrtcProviders.delete(nodeId)
      }

      // Destroy renderer mirror
      const doc = docs.get(nodeId)
      if (doc) {
        doc.destroy()
        docs.delete(nodeId)
      }

      // Notify main process
      window.xnetBSM.release(nodeId)
    },

    getAwareness(nodeId: string) {
      return awarenessMap.get(nodeId) ?? null
    },

    onAwarenessSnapshot(nodeId, handler) {
      const listeners = awarenessSnapshotListeners.get(nodeId) ?? new Set()
      listeners.add(handler)
      awarenessSnapshotListeners.set(nodeId, listeners)
      const existing = awarenessSnapshots.get(nodeId)
      if (existing) {
        handler(existing)
      }
      return () => {
        const current = awarenessSnapshotListeners.get(nodeId)
        if (!current) return
        current.delete(handler)
        if (current.size === 0) {
          awarenessSnapshotListeners.delete(nodeId)
        }
      }
    },

    async requestBlobs(cids: string[]) {
      if (cids.length === 0) return
      await window.xnetBSM.requestBlobs(cids)
    },

    announceBlobs(cids: string[]) {
      if (cids.length === 0) return
      window.xnetBSM.announceBlobs(cids)
    },

    get status() {
      return currentStatus
    },
    get poolSize() {
      return docs.size
    },
    get trackedCount() {
      return 0 // Tracked count is managed by main process
    },
    get queueSize() {
      return 0 // Queue is managed by main process
    },
    get pendingBlobCount() {
      return 0 // Managed by main process
    },

    on(event: 'status', handler: (status: ConnectionStatus) => void): () => void {
      if (event === 'status') {
        statusListeners.add(handler)
        return () => statusListeners.delete(handler)
      }
      return () => {}
    },

    instrument(eventBus: DevToolsEventBus): () => void {
      // Store event bus for emitting
      instrumentedEventBus = eventBus

      // Track last emitted status to avoid duplicate events
      let lastEmittedStatus: ConnectionStatus | null = null

      const emitStatus = () => {
        if (!instrumentedEventBus) return
        if (currentStatus === lastEmittedStatus) return
        instrumentedEventBus.emit({
          type: 'sync:status-change',
          room: 'ipc-bsm',
          previousStatus: lastEmittedStatus ?? previousStatus,
          newStatus: currentStatus
        })
        lastEmittedStatus = currentStatus
      }

      // Emit current status immediately
      emitStatus()

      // Subscribe to status changes from notifyStatus()
      const statusHandler = () => emitStatus()
      statusListeners.add(statusHandler)

      // Start polling BSM for actual status (handles race condition where
      // BSM connects before we set up listeners)
      if (statusPollInterval) {
        clearInterval(statusPollInterval)
      }
      let pollCount = 0
      statusPollInterval = setInterval(async () => {
        pollCount++
        try {
          const bsmStatus = await window.xnetBSM.getStatus()
          const actualStatus = bsmStatus.status as ConnectionStatus
          if (actualStatus !== currentStatus) {
            previousStatus = currentStatus
            currentStatus = actualStatus
            emitStatus()
          }
          // Stop polling once connected or after 10 attempts (5 seconds)
          if (actualStatus === 'connected' || pollCount >= 10) {
            if (statusPollInterval) {
              clearInterval(statusPollInterval)
              statusPollInterval = null
            }
          }
        } catch {
          if (statusPollInterval) {
            clearInterval(statusPollInterval)
            statusPollInterval = null
          }
        }
      }, 500)

      // Subscribe to peer events from main process
      const peerConnectedCleanup = window.xnetBSM.onPeerConnected((peerId, room, totalPeers) => {
        eventBus.emit({
          type: 'sync:peer-connected',
          room,
          peer: {
            id: peerId,
            connectedAt: Date.now(),
            lastSeen: Date.now()
          },
          totalPeers
        })
      })

      const peerDisconnectedCleanup = window.xnetBSM.onPeerDisconnected(
        (peerId, _reason, totalPeers) => {
          eventBus.emit({
            type: 'sync:peer-disconnected',
            room: 'ipc-bsm',
            peerId,
            totalPeers
          })
        }
      )

      const transportFallbackCleanup = window.xnetBSM.onTransportFallback((payload) => {
        eventBus.emit({
          type: 'sync:status-change',
          room: 'ipc-bsm',
          previousStatus: payload.from,
          newStatus: payload.to,
          error: payload.reason
        })
      })

      const unauthorizedUpdateCleanup = window.xnetBSM.onUnauthorizedUpdate((payload) => {
        eventBus.emit({
          type: 'sync:status-change',
          room: payload.resource ?? 'ipc-bsm',
          previousStatus: payload.action,
          newStatus: payload.code,
          error: `unauthorized_update:${payload.scorerAction}`
        })
      })

      return () => {
        if (statusPollInterval) {
          clearInterval(statusPollInterval)
          statusPollInterval = null
        }
        statusListeners.delete(statusHandler)
        peerConnectedCleanup()
        peerDisconnectedCleanup()
        transportFallbackCleanup()
        unauthorizedUpdateCleanup()
        instrumentedEventBus = null
      }
    }
  }
}
