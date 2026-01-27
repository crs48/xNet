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

// Debug logging - disabled by default, enable for diagnosing sync issues
const DEBUG = false
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
  // Known peers (from sync messages)
  const knownPeers = new Map<string, { lastSeen: number; rooms: Set<string> }>()
  // Peer timeout: check every 1111ms, timeout after 4444ms of no heartbeat
  const PEER_TIMEOUT_MS = 4444
  const PEER_CHECK_INTERVAL_MS = 1111
  // Heartbeat: send every 1111ms to all subscribed rooms
  const HEARTBEAT_INTERVAL_MS = 1111
  let peerTimeoutInterval: ReturnType<typeof setInterval> | null = null
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null

  // ─── WebSocket Management ───────────────────────────────────────────────

  function setStatus(s: ConnectionStatus): void {
    if (s === status) return // Skip duplicate status updates
    status = s
    const win = config.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('xnet:bsm:status-change', { status: s })
    }
  }

  function trackPeer(remotePeerId: string, room: string): void {
    const existing = knownPeers.get(remotePeerId)
    if (existing) {
      existing.lastSeen = Date.now()
      existing.rooms.add(room)
    } else {
      // New peer - notify renderer
      knownPeers.set(remotePeerId, { lastSeen: Date.now(), rooms: new Set([room]) })
      const win = config.getMainWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send('xnet:bsm:peer-connected', {
          peerId: remotePeerId,
          room,
          totalPeers: knownPeers.size
        })
      }
      log('Peer connected:', remotePeerId, 'total:', knownPeers.size)
    }
  }

  function removePeer(remotePeerId: string, reason: string): void {
    if (!knownPeers.has(remotePeerId)) return
    knownPeers.delete(remotePeerId)
    const win = config.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('xnet:bsm:peer-disconnected', {
        peerId: remotePeerId,
        reason,
        totalPeers: knownPeers.size
      })
    }
    log('Peer disconnected:', remotePeerId, 'reason:', reason, 'total:', knownPeers.size)
  }

  function checkPeerTimeouts(): void {
    const now = Date.now()
    for (const [peerId, info] of knownPeers) {
      const elapsed = now - info.lastSeen
      if (elapsed > PEER_TIMEOUT_MS) {
        log('Peer timeout:', peerId, 'elapsed:', elapsed, 'ms')
        removePeer(peerId, 'timeout')
      }
    }
  }

  function startPeerTimeoutCheck(): void {
    if (peerTimeoutInterval) return
    peerTimeoutInterval = setInterval(checkPeerTimeouts, PEER_CHECK_INTERVAL_MS)
  }

  function stopPeerTimeoutCheck(): void {
    if (peerTimeoutInterval) {
      clearInterval(peerTimeoutInterval)
      peerTimeoutInterval = null
    }
  }

  function sendHeartbeat(): void {
    // Send heartbeat to all subscribed doc rooms
    for (const room of subscribedRooms) {
      if (room.startsWith('xnet-doc-')) {
        wsSend({
          type: 'publish',
          topic: room,
          data: { type: 'heartbeat', from: peerId }
        })
      }
    }
  }

  function startHeartbeat(): void {
    if (heartbeatInterval) return
    // Send initial heartbeat immediately
    sendHeartbeat()
    heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS)
  }

  function stopHeartbeat(): void {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval)
      heartbeatInterval = null
    }
  }

  function clearAllPeers(): void {
    for (const peerId of knownPeers.keys()) {
      removePeer(peerId, 'disconnected')
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
    if (ws) {
      log('connect() aborted - already connected or connecting')
      return
    }

    log('Connecting to:', signalingUrl)
    setStatus('connecting')

    try {
      ws = new WebSocket(signalingUrl)

      ws.on('open', () => {
        log('WebSocket connected')
        setStatus('connected')

        // Start peer timeout checking and heartbeat
        startPeerTimeoutCheck()
        startHeartbeat()

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
        stopHeartbeat()
        stopPeerTimeoutCheck()
        clearAllPeers()
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
    stopHeartbeat()
    stopPeerTimeoutCheck()
    clearAllPeers()
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
        // Track peer connection
        trackPeer(data.from as string, room)

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

        // Ask renderer to re-broadcast its awareness state so the new peer sees us
        requestAwarenessFromRenderer(nodeId)

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
        // Track peer connection
        if (data.from) trackPeer(data.from as string, room)

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
        // Track peer connection
        if (data.from) trackPeer(data.from as string, room)

        const update = fromBase64(data.update as string)
        log('Received sync-update, size:', update.length)
        Y.applyUpdate(doc, update, 'remote')
        entry.dirty = true
        // Forward to renderer via MessagePort
        forwardToRenderer(nodeId, update)
        break
      }

      case 'heartbeat': {
        // Track peer - heartbeat keeps them alive
        if (data.from) trackPeer(data.from as string, room)
        break
      }

      case 'peer-leave': {
        // Peer explicitly left - remove them immediately
        if (data.from) {
          log('Peer left room:', data.from, room)
          removePeer(data.from as string, 'left')
        }
        break
      }

      case 'awareness': {
        // Track peer connection
        if (data.from) trackPeer(data.from as string, room)

        // Forward awareness updates to renderer
        const update = fromBase64(data.update as string)
        log('Received awareness update, size:', update.length)
        forwardAwarenessToRenderer(nodeId, update)
        break
      }
    }
  }

  function forwardAwarenessToRenderer(nodeId: string, update: Uint8Array): void {
    const port = activePorts.get(nodeId)
    if (port) {
      log('Forwarding awareness to renderer for node:', nodeId, 'size:', update.length)
      port.postMessage({ type: 'awareness', update: Array.from(update) })
    }
  }

  function requestAwarenessFromRenderer(nodeId: string): void {
    const port = activePorts.get(nodeId)
    if (port) {
      log('Requesting awareness broadcast from renderer for node:', nodeId)
      port.postMessage({ type: 'request-awareness' })
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
    log(
      'requestBlobs called with',
      cids.length,
      'CIDs, blobStorage:',
      !!config.blobStorage,
      'status:',
      status
    )
    if (!config.blobStorage || cids.length === 0) {
      log('requestBlobs: early return - no storage or empty CIDs')
      return
    }

    // Filter to only request blobs we don't have
    const checkAndRequest = async () => {
      const missing: string[] = []
      for (const cid of cids) {
        const has = await config.blobStorage!.hasBlob(cid)
        log('requestBlobs: checking CID', cid, 'has:', has)
        if (!has) {
          missing.push(cid)
        }
      }
      log('requestBlobs: missing count:', missing.length, 'connected:', status === 'connected')
      if (missing.length > 0 && status === 'connected') {
        log('requestBlobs: sending blob-want for', missing.length, 'blobs to room', BLOB_SYNC_ROOM)
        wsSend({
          type: 'publish',
          topic: BLOB_SYNC_ROOM,
          data: { type: 'blob-want', cids: missing }
        })
        for (const cid of missing) {
          pendingBlobRequests.add(cid)
        }
      } else if (status !== 'connected') {
        log('requestBlobs: not sending - not connected')
      }
    }
    checkAndRequest()
  }

  function announceBlobs(cids: string[]): void {
    log('announceBlobs called with', cids.length, 'CIDs, status:', status)
    if (cids.length === 0 || status !== 'connected') {
      log('announceBlobs: early return - empty or not connected')
      return
    }
    log('announceBlobs: sending blob-have for', cids.length, 'blobs to room', BLOB_SYNC_ROOM)
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

    // Broadcast peer-leave so other peers know we left immediately
    wsSend({
      type: 'publish',
      topic: room,
      data: { type: 'peer-leave', from: peerId }
    })

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
      } else if (type === 'awareness' && update) {
        // Forward awareness updates to network
        if (status === 'connected') {
          const room = `xnet-doc-${nodeId}`
          log('Broadcasting awareness update to network')
          wsSend({
            type: 'publish',
            topic: room,
            data: { type: 'awareness', from: peerId, update: toBase64(new Uint8Array(update)) }
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

    // Leave the room (broadcasts peer-leave to other peers)
    leaveRoom(nodeId)

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
    log('IPC request-blobs:', opts.cids.length, 'CIDs, status:', status)
    requestBlobs(opts.cids)
  })

  ipcMain.handle('xnet:bsm:announce-blobs', async (_event, opts: { cids: string[] }) => {
    log('IPC announce-blobs:', opts.cids.length, 'CIDs, status:', status)
    announceBlobs(opts.cids)
  })

  ipcMain.handle('xnet:bsm:get-blob', async (_event, opts: { cid: string }) => {
    if (!config.blobStorage) {
      log('IPC get-blob: no blob storage configured')
      return null
    }
    const data = await config.blobStorage.getBlob(opts.cid)
    log('IPC get-blob:', opts.cid, data ? `found (${data.length} bytes)` : 'not found')
    return data ? Array.from(data) : null
  })

  ipcMain.handle('xnet:bsm:put-blob', async (_event, opts: { data: number[] }) => {
    if (!config.blobStorage) throw new Error('Blob storage not configured')
    const data = new Uint8Array(opts.data)
    const hash = hashContent(data)
    const cid = createContentId(hash)
    log('IPC put-blob:', cid, 'size:', data.length)
    await config.blobStorage.setBlob(cid, data)
    return cid
  })

  ipcMain.handle('xnet:bsm:has-blob', async (_event, opts: { cid: string }) => {
    if (!config.blobStorage) return false
    const has = await config.blobStorage.hasBlob(opts.cid)
    log('IPC has-blob:', opts.cid, has)
    return has
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
