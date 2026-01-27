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

import * as Y from 'yjs'
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness'
import type { SyncManager } from '@xnet/react'

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'
type StatusHandler = (status: ConnectionStatus) => void

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
}

export function createIPCSyncManager(): IPCSyncManager {
  // Renderer-side Y.Doc mirrors (one per acquired node)
  const docs = new Map<string, Y.Doc>()
  // Awareness instances per node (for cursor presence, etc.)
  const awarenessMap = new Map<string, Awareness>()
  // Cleanup functions for doc update listeners and message handlers
  const cleanups = new Map<string, () => void>()
  // Pending acquire promises to handle concurrent calls
  const pendingAcquires = new Map<string, Promise<Y.Doc>>()

  let currentStatus: ConnectionStatus = 'disconnected'
  let previousStatus: ConnectionStatus = 'disconnected'
  const statusListeners = new Set<StatusHandler>()
  let statusCleanup: (() => void) | null = null

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

  return {
    async start() {
      // Listen for status changes from main process BEFORE starting
      // This ensures we capture status updates even if start() fails
      statusCleanup = window.xnetBSM.onStatusChange((status) => {
        notifyStatus(status as ConnectionStatus)
      })

      notifyStatus('connecting')

      const signalingUrl = 'ws://localhost:4444' // TODO: make configurable
      try {
        await window.xnetBSM.start({ signalingUrl })
      } catch (err) {
        // Start failed (e.g., signaling server unavailable)
        // Keep the manager usable for local-only operation
        console.warn('[IPCSyncManager] Failed to start:', err)
        notifyStatus('disconnected')
      }
    },

    async stop() {
      // Clean up all nodes
      for (const [nodeId] of docs) {
        const cleanup = cleanups.get(nodeId)
        if (cleanup) cleanup()
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

      await window.xnetBSM.stop()
      currentStatus = 'disconnected'
    },

    track(nodeId: string, schemaId: string) {
      window.xnetBSM.track(nodeId, schemaId)
    },

    untrack(nodeId: string) {
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
        const doc = new Y.Doc({ guid: nodeId })

        // Create awareness for this doc
        const awareness = new Awareness(doc)
        awarenessMap.set(nodeId, awareness)

        // Request port from main process (preload manages the actual MessagePort)
        await window.xnetBSM.acquire(nodeId, '')

        // Set up message handler for remote updates (via preload)
        const messageCleanup = window.xnetBSM.onMessage(nodeId, (data: unknown) => {
          const { type, update } = data as { type: string; update?: number[] }
          if (type === 'update' && update) {
            Y.applyUpdate(doc, new Uint8Array(update), 'remote')
          } else if (type === 'awareness' && update) {
            applyAwarenessUpdate(awareness, new Uint8Array(update), 'remote')
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
        // origin updates so the main process gets the initial content loaded from IndexedDB
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

      // Clean up awareness
      const awareness = awarenessMap.get(nodeId)
      if (awareness) {
        awareness.destroy()
        awarenessMap.delete(nodeId)
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
      // Emit initial status
      eventBus.emit({
        type: 'sync:status-change',
        room: 'ipc-bsm',
        previousStatus: 'disconnected',
        newStatus: currentStatus
      })

      // Subscribe to status changes
      const statusHandler = () => {
        eventBus.emit({
          type: 'sync:status-change',
          room: 'ipc-bsm',
          previousStatus: previousStatus,
          newStatus: currentStatus
        })
      }
      statusListeners.add(statusHandler)

      // Subscribe to peer events from main process
      const peerCleanup = window.xnetBSM.onPeerConnected((peerId, room, totalPeers) => {
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

      return () => {
        statusListeners.delete(statusHandler)
        peerCleanup()
      }
    }
  }
}
