/**
 * Background Sync Manager (BSM) - Electron Main Process
 *
 * Runs sync independently of the renderer process lifecycle.
 * Manages Y.Doc pool, multiplexed WebSocket, and Yjs sync protocol.
 * Also handles blob synchronization between peers.
 *
 * The renderer communicates via IPC for control messages (acquire/release/track)
 * and MessagePort for binary Y.Doc update streaming.
 *
 * Architecture:
 *   Renderer <--MessagePort--> Main Process BSM <--WebSocket--> Hub/Signaling
 */

// Debug logging - always enabled for now to diagnose sync issues
const DEBUG = true
function log(...args: unknown[]): void {
  if (DEBUG) {
    console.log('[BSM]', ...args)
  }
}

import { ipcMain, MessageChannelMain, type BrowserWindow } from 'electron'
import * as Y from 'yjs'
import WebSocket from 'ws'
import { hashContent, createContentId } from '@xnet/core'

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

/** Storage interface for blob operations */
interface BlobStorage {
  getBlob(cid: string): Promise<Uint8Array | null>
  setBlob(cid: string, data: Uint8Array): Promise<void>
  hasBlob(cid: string): Promise<boolean>
}

interface BSMConfig {
  getMainWindow: () => BrowserWindow | null
  /** Optional blob storage for blob sync (e.g., SQLiteAdapter) */
  blobStorage?: BlobStorage
}

// ─── Base64 Helpers ─────────────────────────────────────────────────────────

function toBase64(data: Uint8Array): string {
  return Buffer.from(data).toString('base64')
}

function fromBase64(str: string): Uint8Array {
  return new Uint8Array(Buffer.from(str, 'base64'))
}

// ─── BSM Service ────────────────────────────────────────────────────────────

/** The room name used for all blob sync messages */
const BLOB_SYNC_ROOM = 'xnet-blob-sync'

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
  // Pending blob requests
  const pendingBlobRequests = new Set<string>()

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
    if (destroyed || !signalingUrl) {
      log('connect() aborted - destroyed:', destroyed, 'signalingUrl:', signalingUrl)
      return
    }

    log('Connecting to:', signalingUrl)
    setStatus('connecting')

    try {
      ws = new WebSocket(signalingUrl)

      ws.on('open', () => {
        log('WebSocket connected')
        setStatus('connected')

        // Re-subscribe to all rooms
        if (subscribedRooms.size > 0) {
          log('Re-subscribing to', subscribedRooms.size, 'rooms')
          wsSend({ type: 'subscribe', topics: Array.from(subscribedRooms) })
        }

        // Join blob sync room if blob storage is configured
        if (config.blobStorage) {
          joinBlobSyncRoom()
        }

        // Initiate sync for all pooled docs
        log('Initiating sync for', pool.size, 'pooled docs')
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

          log('WS message received:', msg.type, msg.topic ? `topic=${msg.topic}` : '')

          if (msg.type === 'publish' && msg.topic) {
            const room = msg.topic as string

            // Handle blob sync messages
            if (room === BLOB_SYNC_ROOM) {
              log('Handling blob sync message:', msg.data?.type)
              handleBlobSyncMessage(msg.data)
              return
            }

            // Handle Y.Doc sync messages
            const nodeId = room.replace('xnet-doc-', '')
            if (pool.has(nodeId)) {
              log('Handling sync message for node:', nodeId, 'type:', msg.data?.type)
              handleSyncMessage(nodeId, msg.data)
            } else {
              log('No doc in pool for node:', nodeId)
            }
          }
        } catch (err) {
          log('WS message parse error:', err)
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
    log(
      'sendSyncStep1 for node:',
      nodeId,
      'SV size:',
      sv.length,
      'doc meta keys:',
      doc.getMap('meta').size
    )
    wsSend({
      type: 'publish',
      topic: room,
      data: { type: 'sync-step1', from: peerId, sv: toBase64(sv) }
    })
  }

  function handleSyncMessage(nodeId: string, data: Record<string, unknown>): void {
    if (data.from === peerId) {
      log('Ignoring own message')
      return
    }

    const entry = pool.get(nodeId)
    if (!entry) {
      log('No pool entry for node:', nodeId)
      return
    }

    const doc = entry.doc
    const room = `xnet-doc-${nodeId}`

    switch (data.type) {
      case 'sync-step1': {
        const remoteSV = fromBase64(data.sv as string)
        const diff = Y.encodeStateAsUpdate(doc, remoteSV)
        log(
          'Received sync-step1 from',
          data.from,
          'remoteSV size:',
          remoteSV.length,
          'diff size:',
          diff.length
        )

        // Send sync-step2 with what they're missing
        wsSend({
          type: 'publish',
          topic: room,
          data: { type: 'sync-step2', from: peerId, to: data.from, update: toBase64(diff) }
        })

        // DON'T send sync-step1 back here - that causes an infinite loop.
        // If we need content from them, we'll get it from our initial sync-step1
        // that we send when joining the room.
        break
      }

      case 'sync-step2': {
        if (data.to && data.to !== peerId) {
          log('Ignoring sync-step2 addressed to:', data.to)
          break
        }
        const update = fromBase64(data.update as string)
        log('Received sync-step2, applying update size:', update.length)
        Y.applyUpdate(doc, update, 'remote')
        entry.dirty = true
        log('Doc after sync-step2 - meta keys:', doc.getMap('meta').size)
        // Forward to renderer via MessagePort
        forwardToRenderer(nodeId, update)
        break
      }

      case 'sync-update': {
        const update = fromBase64(data.update as string)
        log('Received sync-update, size:', update.length)
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
      log('Forwarding update to renderer for node:', nodeId, 'size:', update.length)
      port.postMessage({ type: 'update', update: Array.from(update) })
    } else {
      log('No active port for node:', nodeId, '- cannot forward to renderer')
    }
  }

  // ─── Blob Sync Protocol ─────────────────────────────────────────────────

  function joinBlobSyncRoom(): void {
    if (subscribedRooms.has(BLOB_SYNC_ROOM)) return
    subscribedRooms.add(BLOB_SYNC_ROOM)
    wsSend({ type: 'subscribe', topics: [BLOB_SYNC_ROOM] })
    log('Joined blob sync room')
  }

  async function handleBlobSyncMessage(data: Record<string, unknown>): Promise<void> {
    if (!config.blobStorage) {
      log('Blob sync message received but no blob storage configured')
      return
    }

    const msgType = data.type as string
    log('Handling blob sync message:', msgType)

    switch (msgType) {
      case 'blob-want': {
        // Peer wants blobs, send them if we have them
        const cids = data.cids as string[]
        for (const cid of cids) {
          const blobData = await config.blobStorage.getBlob(cid)
          if (blobData) {
            log('Sending blob:', cid, 'size:', blobData.length)
            wsSend({
              type: 'publish',
              topic: BLOB_SYNC_ROOM,
              data: { type: 'blob-data', cid, data: toBase64(blobData) }
            })
          } else {
            log('Blob not found:', cid)
            wsSend({
              type: 'publish',
              topic: BLOB_SYNC_ROOM,
              data: { type: 'blob-not-found', cid }
            })
          }
        }
        break
      }

      case 'blob-data': {
        // Received blob data, store it
        const cid = data.cid as string
        const blobData = fromBase64(data.data as string)
        log('Received blob:', cid, 'size:', blobData.length)
        await config.blobStorage.setBlob(cid, blobData)
        pendingBlobRequests.delete(cid)

        // Notify renderer that blob was received
        const win = config.getMainWindow()
        if (win && !win.isDestroyed()) {
          win.webContents.send('xnet:bsm:blob-received', { cid })
        }
        break
      }

      case 'blob-not-found': {
        // Peer doesn't have the blob
        const cid = data.cid as string
        log('Peer does not have blob:', cid)
        pendingBlobRequests.delete(cid)
        break
      }

      case 'blob-have': {
        // Peer announces they have blobs - check if we need any
        const cids = data.cids as string[]
        const needed: string[] = []
        for (const cid of cids) {
          if (!(await config.blobStorage.hasBlob(cid))) {
            needed.push(cid)
          }
        }
        if (needed.length > 0) {
          log('Requesting', needed.length, 'blobs from peer')
          wsSend({
            type: 'publish',
            topic: BLOB_SYNC_ROOM,
            data: { type: 'blob-want', cids: needed }
          })
          for (const cid of needed) {
            pendingBlobRequests.add(cid)
          }
        }
        break
      }
    }
  }

  function requestBlobs(cids: string[]): void {
    if (!config.blobStorage || cids.length === 0) return

    // Filter to only request blobs we don't have
    const checkAndRequest = async () => {
      const missing: string[] = []
      for (const cid of cids) {
        if (!(await config.blobStorage!.hasBlob(cid))) {
          missing.push(cid)
        }
      }
      if (missing.length > 0 && status === 'connected') {
        log('Requesting', missing.length, 'blobs')
        wsSend({
          type: 'publish',
          topic: BLOB_SYNC_ROOM,
          data: { type: 'blob-want', cids: missing }
        })
        for (const cid of missing) {
          pendingBlobRequests.add(cid)
        }
      }
    }
    checkAndRequest()
  }

  function announceBlobs(cids: string[]): void {
    if (cids.length === 0 || status !== 'connected') return
    log('Announcing', cids.length, 'blobs')
    wsSend({
      type: 'publish',
      topic: BLOB_SYNC_ROOM,
      data: { type: 'blob-have', cids }
    })
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
      log(
        'Received message from renderer for',
        nodeId,
        'type:',
        type,
        'update size:',
        update?.length
      )
      if (type === 'update' && update) {
        const u8 = new Uint8Array(update)
        log('Applying renderer update to BSM doc, size:', u8.length)
        Y.applyUpdate(doc, u8, 'renderer')

        const entry = pool.get(nodeId)
        if (entry) entry.dirty = true

        log('BSM doc after renderer update - meta keys:', doc.getMap('meta').size)

        // Broadcast to network
        if (status === 'connected') {
          const room = `xnet-doc-${nodeId}`
          log('Broadcasting renderer update to network')
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
      queueSize: 0,
      pendingBlobCount: pendingBlobRequests.size
    }
  })

  // ─── Blob IPC Handlers ─────────────────────────────────────────────────

  ipcMain.handle('xnet:bsm:request-blobs', async (_event, opts: { cids: string[] }) => {
    requestBlobs(opts.cids)
  })

  ipcMain.handle('xnet:bsm:announce-blobs', async (_event, opts: { cids: string[] }) => {
    announceBlobs(opts.cids)
  })

  ipcMain.handle('xnet:bsm:get-blob', async (_event, opts: { cid: string }) => {
    if (!config.blobStorage) return null
    const data = await config.blobStorage.getBlob(opts.cid)
    return data ? Array.from(data) : null
  })

  ipcMain.handle('xnet:bsm:put-blob', async (_event, opts: { data: number[] }) => {
    if (!config.blobStorage) throw new Error('Blob storage not configured')
    const data = new Uint8Array(opts.data)
    const hash = hashContent(data)
    const cid = createContentId(hash)
    await config.blobStorage.setBlob(cid, data)
    return cid
  })

  ipcMain.handle('xnet:bsm:has-blob', async (_event, opts: { cid: string }) => {
    if (!config.blobStorage) return false
    return config.blobStorage.hasBlob(opts.cid)
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
