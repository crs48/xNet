/**
 * Data Process Entry Point (Electron Utility Process)
 *
 * This utility process handles all data-intensive operations:
 * - SQLite storage (better-sqlite3)
 * - Y.Doc pool management
 * - WebSocket sync with signaling server
 * - Blob synchronization
 * - Ed25519/BLAKE3 crypto operations
 *
 * The renderer communicates via MessagePort for binary Y.Doc updates.
 * The main process uses parentPort for control messages and relaying
 * renderer events (since utility process can't directly message renderer).
 *
 * Architecture:
 *   Renderer <--MessagePort--> Main Process <--parentPort--> Data Process
 *                                                               |
 *                                                           WebSocket
 *                                                               |
 *                                                          Hub/Signaling
 */

import { createDataService, type DataService } from './data-service'

// Debug logging - controllable via message from main process
let debugEnabled = false
function log(...args: unknown[]): void {
  if (debugEnabled) {
    console.log('[DataProcess]', ...args)
  }
}

let dataService: DataService | null = null

// Handle messages from main process via parentPort
process.parentPort?.on('message', async (event) => {
  const { type, requestId, ...payload } = event.data as {
    type: string
    requestId?: string
    [key: string]: unknown
  }

  log('Received message:', type, requestId ? `(${requestId})` : '')

  try {
    switch (type) {
      // ─── Lifecycle ───────────────────────────────────────────────────────

      case 'init': {
        const { dbPath } = payload as { dbPath: string }
        log('Initializing data service with dbPath:', dbPath)
        dataService = createDataService({ dbPath })
        await dataService.initialize()
        sendResponse(requestId, { success: true })
        break
      }

      case 'shutdown': {
        log('Shutting down data service')
        if (dataService) {
          await dataService.shutdown()
          dataService = null
        }
        sendResponse(requestId, { success: true })
        break
      }

      // ─── Renderer Port ───────────────────────────────────────────────────

      case 'renderer-port': {
        // Received MessagePort from renderer (via main process relay)
        const [port] = event.ports
        if (port && dataService) {
          const { windowId } = payload as { windowId: string }
          log('Attaching renderer port for window:', windowId)
          dataService.attachRendererPort(windowId, port)
        }
        break
      }

      case 'renderer-disconnected': {
        const { windowId } = payload as { windowId: string }
        log('Renderer disconnected:', windowId)
        if (dataService) {
          dataService.detachRendererPort(windowId)
        }
        break
      }

      // ─── BSM Control ─────────────────────────────────────────────────────

      case 'bsm:start': {
        const { signalingUrl, authorDID, signingKey } = payload as {
          signalingUrl: string
          authorDID?: string
          signingKey?: number[]
        }
        log('Starting BSM with signalingUrl:', signalingUrl)
        if (dataService) {
          await dataService.startSync(signalingUrl, authorDID, signingKey)
        }
        sendResponse(requestId, { success: true })
        break
      }

      case 'bsm:stop': {
        log('Stopping BSM')
        if (dataService) {
          await dataService.stopSync()
        }
        sendResponse(requestId, { success: true })
        break
      }

      case 'bsm:status': {
        if (dataService) {
          const status = dataService.getStatus()
          sendResponse(requestId, status)
        } else {
          sendResponse(requestId, {
            status: 'disconnected',
            poolSize: 0,
            trackedCount: 0,
            queueSize: 0,
            pendingBlobCount: 0
          })
        }
        break
      }

      case 'bsm:acquire': {
        const { nodeId, schemaId, windowId } = payload as {
          nodeId: string
          schemaId: string
          windowId: string
        }
        log('Acquiring doc:', nodeId, 'for window:', windowId)
        if (dataService) {
          await dataService.acquireDoc(nodeId, schemaId, windowId)
        }
        sendResponse(requestId, { success: true })
        break
      }

      case 'bsm:release': {
        const { nodeId, windowId } = payload as { nodeId: string; windowId: string }
        log('Releasing doc:', nodeId, 'from window:', windowId)
        if (dataService) {
          dataService.releaseDoc(nodeId, windowId)
        }
        sendResponse(requestId, { success: true })
        break
      }

      case 'bsm:track': {
        const { nodeId, schemaId } = payload as { nodeId: string; schemaId: string }
        log('Tracking node:', nodeId)
        if (dataService) {
          dataService.trackNode(nodeId, schemaId)
        }
        sendResponse(requestId, { success: true })
        break
      }

      case 'bsm:untrack': {
        const { nodeId } = payload as { nodeId: string }
        log('Untracking node:', nodeId)
        if (dataService) {
          dataService.untrackNode(nodeId)
        }
        sendResponse(requestId, { success: true })
        break
      }

      // ─── Blob Storage ────────────────────────────────────────────────────

      case 'blob:get': {
        const { cid } = payload as { cid: string }
        if (dataService) {
          const data = await dataService.getBlob(cid)
          sendResponse(requestId, { data: data ? Array.from(data) : null })
        } else {
          sendResponse(requestId, { data: null })
        }
        break
      }

      case 'blob:put': {
        const { data } = payload as { data: number[] }
        if (dataService) {
          const cid = await dataService.putBlob(new Uint8Array(data))
          sendResponse(requestId, { cid })
        } else {
          sendResponse(requestId, { cid: null, error: 'Data service not initialized' })
        }
        break
      }

      case 'blob:has': {
        const { cid } = payload as { cid: string }
        if (dataService) {
          const has = await dataService.hasBlob(cid)
          sendResponse(requestId, { has })
        } else {
          sendResponse(requestId, { has: false })
        }
        break
      }

      case 'blob:request': {
        const { cids } = payload as { cids: string[] }
        if (dataService) {
          dataService.requestBlobs(cids)
        }
        sendResponse(requestId, { success: true })
        break
      }

      case 'blob:announce': {
        const { cids } = payload as { cids: string[] }
        if (dataService) {
          dataService.announceBlobs(cids)
        }
        sendResponse(requestId, { success: true })
        break
      }

      // ─── Debug ───────────────────────────────────────────────────────────

      case 'debug:set': {
        const { enabled } = payload as { enabled: boolean }
        debugEnabled = enabled
        console.log(`[DataProcess] Debug logging ${enabled ? 'enabled' : 'disabled'}`)
        sendResponse(requestId, { success: true })
        break
      }

      case 'debug:get': {
        sendResponse(requestId, { enabled: debugEnabled })
        break
      }

      // ─── Node Storage ─────────────────────────────────────────────────────
      // These handlers implement the NodeStorageAdapter interface for the renderer.
      // See: docs/explorations/0074_ELECTRON_IPC_NODE_STORAGE.md

      case 'nodes:appendChange': {
        const { change } = payload as { change: unknown }
        if (dataService) {
          await dataService.appendChange(change as Parameters<typeof dataService.appendChange>[0])
        }
        sendResponse(requestId, { success: true })
        break
      }

      case 'nodes:getChanges': {
        const { nodeId } = payload as { nodeId: string }
        if (dataService) {
          const changes = await dataService.getChanges(nodeId)
          sendResponse(requestId, { changes })
        } else {
          sendResponse(requestId, { changes: [] })
        }
        break
      }

      case 'nodes:getAllChanges': {
        if (dataService) {
          const changes = await dataService.getAllChanges()
          sendResponse(requestId, { changes })
        } else {
          sendResponse(requestId, { changes: [] })
        }
        break
      }

      case 'nodes:getChangesSince': {
        const { sinceLamport } = payload as { sinceLamport: number }
        if (dataService) {
          const changes = await dataService.getChangesSince(sinceLamport)
          sendResponse(requestId, { changes })
        } else {
          sendResponse(requestId, { changes: [] })
        }
        break
      }

      case 'nodes:getChangeByHash': {
        const { hash } = payload as { hash: string }
        if (dataService) {
          const change = await dataService.getChangeByHash(hash)
          sendResponse(requestId, { change })
        } else {
          sendResponse(requestId, { change: null })
        }
        break
      }

      case 'nodes:getLastChange': {
        const { nodeId } = payload as { nodeId: string }
        if (dataService) {
          const change = await dataService.getLastChange(nodeId)
          sendResponse(requestId, { change })
        } else {
          sendResponse(requestId, { change: null })
        }
        break
      }

      case 'nodes:getNode': {
        const { id } = payload as { id: string }
        if (dataService) {
          const node = await dataService.getNode(id)
          sendResponse(requestId, { node })
        } else {
          sendResponse(requestId, { node: null })
        }
        break
      }

      case 'nodes:setNode': {
        const { node } = payload as { node: unknown }
        if (dataService) {
          await dataService.setNode(node as Parameters<typeof dataService.setNode>[0])
        }
        sendResponse(requestId, { success: true })
        break
      }

      case 'nodes:deleteNode': {
        const { id } = payload as { id: string }
        if (dataService) {
          await dataService.deleteNode(id)
        }
        sendResponse(requestId, { success: true })
        break
      }

      case 'nodes:listNodes': {
        if (dataService) {
          const nodes = await dataService.listNodes(
            payload as Parameters<typeof dataService.listNodes>[0]
          )
          sendResponse(requestId, { nodes })
        } else {
          sendResponse(requestId, { nodes: [] })
        }
        break
      }

      case 'nodes:countNodes': {
        if (dataService) {
          const count = await dataService.countNodes(
            payload as Parameters<typeof dataService.countNodes>[0]
          )
          sendResponse(requestId, { count })
        } else {
          sendResponse(requestId, { count: 0 })
        }
        break
      }

      case 'nodes:getLastLamportTime': {
        if (dataService) {
          const time = await dataService.getLastLamportTime()
          sendResponse(requestId, { time })
        } else {
          sendResponse(requestId, { time: 0 })
        }
        break
      }

      case 'nodes:setLastLamportTime': {
        const { time } = payload as { time: number }
        if (dataService) {
          await dataService.setLastLamportTime(time)
        }
        sendResponse(requestId, { success: true })
        break
      }

      case 'nodes:getDocumentContent': {
        const { nodeId } = payload as { nodeId: string }
        if (dataService) {
          const content = await dataService.getDocumentContent(nodeId)
          sendResponse(requestId, { content })
        } else {
          sendResponse(requestId, { content: null })
        }
        break
      }

      case 'nodes:setDocumentContent': {
        const { nodeId, content } = payload as { nodeId: string; content: number[] }
        if (dataService) {
          await dataService.setDocumentContent(nodeId, content)
        }
        sendResponse(requestId, { success: true })
        break
      }

      default:
        log('Unknown message type:', type)
        sendResponse(requestId, { error: `Unknown message type: ${type}` })
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    log('Error handling message:', type, errorMessage)
    sendResponse(requestId, { error: errorMessage })
  }
})

/**
 * Send a response back to the main process
 */
function sendResponse(requestId: string | undefined, data: unknown): void {
  if (!requestId) return
  const payload = typeof data === 'object' && data !== null ? data : { value: data }
  process.parentPort?.postMessage({ type: 'response', requestId, ...(payload as object) })
}

/**
 * Send an event to the main process (for forwarding to renderer)
 */
export function sendEvent(eventType: string, data: unknown): void {
  const payload = typeof data === 'object' && data !== null ? data : { value: data }
  process.parentPort?.postMessage({ type: 'event', eventType, ...(payload as object) })
}

// Signal ready to main process
process.parentPort?.postMessage({ type: 'ready' })
log('Data process started')
