/**
 * Background Sync Manager (BSM) - Electron Main Process
 *
 * Runs sync independently of the renderer process lifecycle.
 * Manages Y.Doc pool, multiplexed WebSocket, and Yjs sync protocol.
 *
 * The renderer communicates via IPC for control messages (acquire/release/track)
 * and MessagePort for binary Y.Doc update streaming.
 *
 * Architecture:
 *   Renderer <--MessagePort--> Main Process BSM <--WebSocket--> Hub/Signaling
 */

import { ipcMain, MessageChannelMain, type BrowserWindow } from 'electron'
import * as Y from 'yjs'
import WebSocket from 'ws'

// ─── Types ──────────────────────────────────────────────────────────────────

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

interface PoolEntry {
  doc: Y.Doc
  refCount: number
  dirty: boolean
}

interface TrackedNode {
  nodeId: string
  schemaId: string
  lastOpened: number
}

interface BSMConfig {
  getMainWindow: () => BrowserWindow | null
}

// ─── Base64 Helpers ─────────────────────────────────────────────────────────

function toBase64(data: Uint8Array): string {
  return Buffer.from(data).toString('base64')
}

function fromBase64(str: string): Uint8Array {
  return new Uint8Array(Buffer.from(str, 'base64'))
}

// ─── BSM Service ────────────────────────────────────────────────────────────

export function setupBSM(config: BSMConfig) {
  let ws: WebSocket | null = null
  let status: ConnectionStatus = 'disconnected'
  let signalingUrl = ''
  let authorDID = ''
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let destroyed = false

  const peerId = Math.random().toString(36).slice(2, 10)

  // Y.Doc pool
  const pool = new Map<string, PoolEntry>()
  // Active MessagePort connections (renderer ↔ main)
  const activePorts = new Map<string, Electron.MessagePortMain>()
  // Room subscriptions
  const subscribedRooms = new Set<string>()
  // Tracked nodes
  const tracked = new Map<string, TrackedNode>()

  // ─── WebSocket Management ───────────────────────────────────────────────

  function setStatus(s: ConnectionStatus): void {
    status = s
    const win = config.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('xnet:bsm:status-change', { status: s })
    }
  }

  function wsSend(msg: object): void {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  }

  function connect(): void {
    if (destroyed || !signalingUrl) return

    setStatus('connecting')

    try {
      ws = new WebSocket(signalingUrl)

      ws.on('open', () => {
        setStatus('connected')

        // Re-subscribe to all rooms
        if (subscribedRooms.size > 0) {
          wsSend({ type: 'subscribe', topics: Array.from(subscribedRooms) })
        }

        // Initiate sync for all pooled docs
        for (const [nodeId, entry] of pool) {
          sendSyncStep1(nodeId, entry.doc)
        }

        // Drain offline queue
        // (In main process, offline updates are stored in-memory since SQLite
        //  persistence happens via pool.flushAll on stop)
      })

      ws.on('message', (data: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'pong') return

          if (msg.type === 'publish' && msg.topic) {
            const room = msg.topic as string
            const nodeId = room.replace('xnet-doc-', '')
            if (pool.has(nodeId)) {
              handleSyncMessage(nodeId, msg.data)
            }
          }
        } catch {
          // Ignore parse errors
        }
      })

      ws.on('close', () => {
        ws = null
        setStatus('disconnected')
        scheduleReconnect()
      })

      ws.on('error', () => {
        setStatus('error')
      })
    } catch {
      setStatus('error')
      scheduleReconnect()
    }
  }

  function disconnect(): void {
    destroyed = true
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (ws) {
      if (subscribedRooms.size > 0) {
        wsSend({ type: 'unsubscribe', topics: Array.from(subscribedRooms) })
      }
      ws.close(1000, 'BSM shutdown')
      ws = null
    }
    setStatus('disconnected')
  }

  function scheduleReconnect(): void {
    if (destroyed) return
    if (reconnectTimer) return

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, 2000)
  }

  // ─── Yjs Sync Protocol ─────────────────────────────────────────────────

  function sendSyncStep1(nodeId: string, doc: Y.Doc): void {
    const room = `xnet-doc-${nodeId}`
    const sv = Y.encodeStateVector(doc)
    wsSend({
      type: 'publish',
      topic: room,
      data: { type: 'sync-step1', from: peerId, sv: toBase64(sv) }
    })
  }

  function handleSyncMessage(nodeId: string, data: Record<string, unknown>): void {
    if (data.from === peerId) return

    const entry = pool.get(nodeId)
    if (!entry) return

    const doc = entry.doc
    const room = `xnet-doc-${nodeId}`

    switch (data.type) {
      case 'sync-step1': {
        const remoteSV = fromBase64(data.sv as string)
        const diff = Y.encodeStateAsUpdate(doc, remoteSV)
        wsSend({
          type: 'publish',
          topic: room,
          data: { type: 'sync-step2', from: peerId, to: data.from, update: toBase64(diff) }
        })
        // Also request what we're missing
        const ourSV = Y.encodeStateVector(doc)
        wsSend({
          type: 'publish',
          topic: room,
          data: { type: 'sync-step1', from: peerId, sv: toBase64(ourSV) }
        })
        break
      }

      case 'sync-step2': {
        if (data.to && data.to !== peerId) break
        const update = fromBase64(data.update as string)
        Y.applyUpdate(doc, update, 'remote')
        entry.dirty = true
        // Forward to renderer via MessagePort
        forwardToRenderer(nodeId, update)
        break
      }

      case 'sync-update': {
        const update = fromBase64(data.update as string)
        Y.applyUpdate(doc, update, 'remote')
        entry.dirty = true
        // Forward to renderer via MessagePort
        forwardToRenderer(nodeId, update)
        break
      }
    }
  }

  function forwardToRenderer(nodeId: string, update: Uint8Array): void {
    const port = activePorts.get(nodeId)
    if (port) {
      port.postMessage({ type: 'update', update: Array.from(update) })
    }
  }

  // ─── Room Management ────────────────────────────────────────────────────

  function joinRoom(nodeId: string): void {
    const room = `xnet-doc-${nodeId}`
    if (subscribedRooms.has(room)) return

    subscribedRooms.add(room)
    wsSend({ type: 'subscribe', topics: [room] })

    // Send sync-step1 if we have a doc
    const entry = pool.get(nodeId)
    if (entry) {
      sendSyncStep1(nodeId, entry.doc)
    }
  }

  function leaveRoom(nodeId: string): void {
    const room = `xnet-doc-${nodeId}`
    if (!subscribedRooms.has(room)) return

    subscribedRooms.delete(room)
    wsSend({ type: 'unsubscribe', topics: [room] })
  }

  // ─── Pool Management ────────────────────────────────────────────────────

  function getOrCreateDoc(nodeId: string): Y.Doc {
    const existing = pool.get(nodeId)
    if (existing) {
      existing.refCount++
      return existing.doc
    }

    const doc = new Y.Doc({ guid: nodeId })

    // Set up broadcast: local edits → WebSocket
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote' || origin === 'renderer') return
      if (status === 'connected') {
        const room = `xnet-doc-${nodeId}`
        wsSend({
          type: 'publish',
          topic: room,
          data: { type: 'sync-update', from: peerId, update: toBase64(update) }
        })
      }
    })

    pool.set(nodeId, { doc, refCount: 1, dirty: false })
    return doc
  }

  function releaseDoc(nodeId: string): void {
    const entry = pool.get(nodeId)
    if (!entry) return

    entry.refCount = Math.max(0, entry.refCount - 1)
    // Doc stays in pool for background sync — only evict on stop
  }

  // ─── IPC Handlers ──────────────────────────────────────────────────────

  ipcMain.handle(
    'xnet:bsm:start',
    async (_event, opts: { signalingUrl: string; authorDID?: string }) => {
      if (status !== 'disconnected') return // Already running

      signalingUrl = opts.signalingUrl
      authorDID = opts.authorDID ?? ''
      destroyed = false
      connect()
    }
  )

  ipcMain.handle('xnet:bsm:stop', async () => {
    // Close all active ports
    for (const [, port] of activePorts) {
      port.close()
    }
    activePorts.clear()

    disconnect()

    // Destroy all docs
    for (const [, entry] of pool) {
      entry.doc.destroy()
    }
    pool.clear()
    subscribedRooms.clear()
    tracked.clear()
  })

  ipcMain.handle('xnet:bsm:acquire', async (event, opts: { nodeId: string; schemaId: string }) => {
    const { nodeId, schemaId } = opts
    console.log('[BSM] acquire called for', nodeId)

    // Track the node
    tracked.set(nodeId, { nodeId, schemaId, lastOpened: Date.now() })

    // Get or create Y.Doc
    const doc = getOrCreateDoc(nodeId)

    // Join room for sync
    joinRoom(nodeId)

    // Create MessageChannel for binary Y.Doc updates
    const { port1, port2 } = new MessageChannelMain()
    console.log('[BSM] created port for', nodeId)

    // Receive updates from renderer
    port1.on('message', (msgEvent) => {
      const { type, update } = msgEvent.data
      if (type === 'update' && update) {
        const u8 = new Uint8Array(update)
        Y.applyUpdate(doc, u8, 'renderer')

        const entry = pool.get(nodeId)
        if (entry) entry.dirty = true

        // Broadcast to network
        if (status === 'connected') {
          const room = `xnet-doc-${nodeId}`
          wsSend({
            type: 'publish',
            topic: room,
            data: { type: 'sync-update', from: peerId, update: toBase64(u8) }
          })
        }
      }
    })
    port1.start()

    // Store port for forwarding remote updates
    const existingPort = activePorts.get(nodeId)
    if (existingPort) {
      existingPort.close()
    }
    activePorts.set(nodeId, port1)

    // Transfer port2 to the renderer
    console.log('[BSM] sending port to renderer for', nodeId)
    event.sender.postMessage('xnet:bsm:port', { nodeId }, [port2])
  })

  ipcMain.handle('xnet:bsm:release', async (_event, opts: { nodeId: string }) => {
    const { nodeId } = opts

    // Close the MessagePort
    const port = activePorts.get(nodeId)
    if (port) {
      port.close()
      activePorts.delete(nodeId)
    }

    // Release from pool (stays warm for background sync)
    releaseDoc(nodeId)
  })

  ipcMain.handle('xnet:bsm:track', async (_event, opts: { nodeId: string; schemaId: string }) => {
    tracked.set(opts.nodeId, {
      nodeId: opts.nodeId,
      schemaId: opts.schemaId,
      lastOpened: Date.now()
    })
    joinRoom(opts.nodeId)
  })

  ipcMain.handle('xnet:bsm:untrack', async (_event, opts: { nodeId: string }) => {
    tracked.delete(opts.nodeId)
    leaveRoom(opts.nodeId)
  })

  ipcMain.handle('xnet:bsm:status', async () => {
    return {
      status,
      poolSize: pool.size,
      trackedCount: tracked.size,
      queueSize: 0
    }
  })

  return {
    async stop() {
      // Close all ports
      for (const [, port] of activePorts) {
        port.close()
      }
      activePorts.clear()

      disconnect()

      for (const [, entry] of pool) {
        entry.doc.destroy()
      }
      pool.clear()
      subscribedRooms.clear()
      tracked.clear()
    }
  }
}
