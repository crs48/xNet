/**
 * IPC-based Sync Manager for Electron renderer
 *
 * Implements the SyncManager interface from @xnet/react but routes all
 * operations through IPC to the main-process BSM. Y.Doc updates flow
 * through MessagePort channels for zero-copy binary transfer.
 *
 * The renderer maintains its own Y.Doc mirror (for TipTap/editor binding)
 * that stays in sync with the main-process doc via the MessagePort.
 */

import * as Y from 'yjs'
import type { SyncManager } from '@xnet/react'

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'
type StatusHandler = (status: ConnectionStatus) => void

export function createIPCSyncManager(): SyncManager {
  // Renderer-side Y.Doc mirrors (one per acquired node)
  const docs = new Map<string, Y.Doc>()
  // Cleanup functions for doc update listeners and message handlers
  const cleanups = new Map<string, () => void>()
  // Pending acquire promises to handle concurrent calls
  const pendingAcquires = new Map<string, Promise<Y.Doc>>()

  let currentStatus: ConnectionStatus = 'disconnected'
  const statusListeners = new Set<StatusHandler>()
  let statusCleanup: (() => void) | null = null

  function notifyStatus(s: ConnectionStatus): void {
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

        // Request port from main process (preload manages the actual MessagePort)
        await window.xnetBSM.acquire(nodeId, '')

        // Set up message handler for remote updates (via preload)
        const messageCleanup = window.xnetBSM.onMessage(nodeId, (data: unknown) => {
          const { type, update } = data as { type: string; update?: number[] }
          if (type === 'update' && update) {
            Y.applyUpdate(doc, new Uint8Array(update), 'remote')
          }
        })

        // Forward local edits to main process (via preload)
        const updateHandler = (update: Uint8Array, origin: unknown) => {
          if (origin === 'remote' || origin === 'storage') return
          window.xnetBSM.postMessage(nodeId, { type: 'update', update: Array.from(update) })
        }
        doc.on('update', updateHandler)

        cleanups.set(nodeId, () => {
          doc.off('update', updateHandler)
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

      // Destroy renderer mirror
      const doc = docs.get(nodeId)
      if (doc) {
        doc.destroy()
        docs.delete(nodeId)
      }

      // Notify main process
      window.xnetBSM.release(nodeId)
    },

    getAwareness(_nodeId: string) {
      // TODO: Implement awareness via IPC
      return null
    },

    async requestBlobs(_cids: string[]) {
      // TODO: Route blob requests through IPC to main process BSM
    },

    announceBlobs(_cids: string[]) {
      // TODO: Route blob announcements through IPC to main process BSM
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
    }
  }
}
