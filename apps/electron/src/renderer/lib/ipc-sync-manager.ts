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
  // MessagePort connections (one per acquired node)
  const ports = new Map<string, MessagePort>()
  // Cleanup functions for doc update listeners
  const cleanups = new Map<string, () => void>()

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
      const signalingUrl = 'ws://localhost:4444' // TODO: make configurable
      await window.xnetBSM.start({ signalingUrl })
      currentStatus = 'connecting'

      // Listen for status changes from main process
      statusCleanup = window.xnetBSM.onStatusChange((status) => {
        notifyStatus(status as ConnectionStatus)
      })
    },

    async stop() {
      // Close all MessagePorts
      for (const [nodeId, port] of ports) {
        port.close()
        const cleanup = cleanups.get(nodeId)
        if (cleanup) cleanup()
      }
      ports.clear()
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
      // Reuse existing mirror if already acquired
      const existing = docs.get(nodeId)
      if (existing) return existing

      // Create renderer-side Y.Doc mirror
      const doc = new Y.Doc({ guid: nodeId })
      docs.set(nodeId, doc)

      // Get MessagePort from main process
      const port = await window.xnetBSM.acquire(nodeId, '') // schemaId resolved by main

      // Handle messages from main process (initial state + remote updates)
      port.onmessage = (event) => {
        const { type, update } = event.data
        if ((type === 'init' || type === 'update') && update) {
          Y.applyUpdate(doc, new Uint8Array(update), 'remote')
        }
      }
      port.start()
      ports.set(nodeId, port)

      // Forward local edits to main process
      const updateHandler = (update: Uint8Array, origin: unknown) => {
        if (origin === 'remote') return // Don't echo back
        port.postMessage({ type: 'update', update: Array.from(update) })
      }
      doc.on('update', updateHandler)

      cleanups.set(nodeId, () => {
        doc.off('update', updateHandler)
      })

      return doc
    },

    release(nodeId: string) {
      // Close the MessagePort
      const port = ports.get(nodeId)
      if (port) {
        port.close()
        ports.delete(nodeId)
      }

      // Cleanup update listener
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
