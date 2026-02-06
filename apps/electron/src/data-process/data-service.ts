/**
 * Data Service - Core BSM functionality for utility process
 *
 * This is the heart of the off-main-thread data layer. It manages:
 * - SQLite storage via better-sqlite3
 * - Y.Doc pool for collaborative editing
 * - WebSocket connection to signaling server
 * - Blob sync between peers
 * - Signature verification for Yjs updates
 *
 * Communication with renderers happens via MessagePort for binary efficiency.
 * Events are sent to main process for relay to the appropriate window.
 */

import { hashContent, createContentId } from '@xnet/core'
import {
  signYjsUpdate,
  verifyYjsEnvelope,
  isUpdateTooLarge,
  YjsRateLimiter,
  YjsPeerScorer,
  type SignedYjsEnvelope
} from '@xnet/sync'
import Database from 'better-sqlite3'
import WebSocket from 'ws'
import * as Y from 'yjs'
import { createSQLiteBatchWriter, type SQLiteBatchWriter } from './sqlite-batch'
import { sendEvent } from './index'

// ─── Types ──────────────────────────────────────────────────────────────────

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

interface PoolEntry {
  doc: Y.Doc
  refCount: number
  dirty: boolean
  /** Windows that have acquired this doc */
  windows: Set<string>
}

interface TrackedNode {
  nodeId: string
  schemaId: string
  lastOpened: number
}

interface DataServiceConfig {
  dbPath: string
}

export interface DataService {
  initialize(): Promise<void>
  shutdown(): Promise<void>
  attachRendererPort(windowId: string, port: Electron.MessagePortMain): void
  detachRendererPort(windowId: string): void
  startSync(signalingUrl: string, authorDID?: string, signingKey?: number[]): Promise<void>
  stopSync(): Promise<void>
  getStatus(): {
    status: ConnectionStatus
    poolSize: number
    trackedCount: number
    queueSize: number
    pendingBlobCount: number
  }
  acquireDoc(nodeId: string, schemaId: string, windowId: string): Promise<void>
  releaseDoc(nodeId: string, windowId: string): void
  trackNode(nodeId: string, schemaId: string): void
  untrackNode(nodeId: string): void
  getBlob(cid: string): Promise<Uint8Array | null>
  putBlob(data: Uint8Array): Promise<string>
  hasBlob(cid: string): Promise<boolean>
  requestBlobs(cids: string[]): void
  announceBlobs(cids: string[]): void
}

// ─── Debug Logging ──────────────────────────────────────────────────────────

let debugEnabled = false
function log(...args: unknown[]): void {
  if (debugEnabled) {
    console.log('[DataService]', ...args)
  }
}

export function setDebug(enabled: boolean): void {
  debugEnabled = enabled
}

// ─── Base64 Helpers ─────────────────────────────────────────────────────────

function toBase64(data: Uint8Array): string {
  return Buffer.from(data).toString('base64')
}

function fromBase64(str: string): Uint8Array {
  return new Uint8Array(Buffer.from(str, 'base64'))
}

function serializeEnvelope(envelope: SignedYjsEnvelope): Record<string, unknown> {
  return {
    update: toBase64(envelope.update),
    authorDID: envelope.authorDID,
    signature: toBase64(envelope.signature),
    timestamp: envelope.timestamp,
    clientId: envelope.clientId
  }
}

function deserializeEnvelope(data: Record<string, unknown>): SignedYjsEnvelope | null {
  try {
    return {
      update: fromBase64(data.update as string),
      authorDID: data.authorDID as string,
      signature: fromBase64(data.signature as string),
      timestamp: data.timestamp as number,
      clientId: data.clientId as number
    }
  } catch {
    return null
  }
}

function hasEnvelope(data: Record<string, unknown>): boolean {
  return (
    typeof data.envelope === 'object' &&
    data.envelope !== null &&
    'update' in (data.envelope as object) &&
    'authorDID' in (data.envelope as object) &&
    'signature' in (data.envelope as object)
  )
}

// ─── Constants ──────────────────────────────────────────────────────────────

const BLOB_SYNC_ROOM = 'xnet-blob-sync'
const PEER_TIMEOUT_MS = 4444
const PEER_CHECK_INTERVAL_MS = 1111
const HEARTBEAT_INTERVAL_MS = 1111

// ─── Data Service Factory ───────────────────────────────────────────────────

export function createDataService(config: DataServiceConfig): DataService {
  let db: Database.Database | null = null
  let batchWriter: SQLiteBatchWriter | null = null
  let ws: WebSocket | null = null
  let status: ConnectionStatus = 'disconnected'
  let signalingUrl = ''
  let authorDID = ''
  let signingKey: Uint8Array | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let destroyed = false

  const peerId = Math.random().toString(36).slice(2, 10)

  // Security primitives
  const rateLimiter = new YjsRateLimiter()
  const peerScorer = new YjsPeerScorer()

  // Score recovery timer
  let scorerRecoveryInterval: ReturnType<typeof setInterval> | null = null

  // Y.Doc pool
  const pool = new Map<string, PoolEntry>()

  // Active MessagePort connections per window
  const rendererPorts = new Map<string, Electron.MessagePortMain>()

  // Room subscriptions
  const subscribedRooms = new Set<string>()

  // Tracked nodes
  const tracked = new Map<string, TrackedNode>()

  // Pending blob requests
  const pendingBlobRequests = new Set<string>()

  // Known peers
  const knownPeers = new Map<string, { lastSeen: number; rooms: Set<string> }>()

  // Timers
  let peerTimeoutInterval: ReturnType<typeof setInterval> | null = null
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null

  // ─── Status Management ──────────────────────────────────────────────────

  function setStatus(s: ConnectionStatus): void {
    if (s === status) return
    status = s
    sendEvent('bsm:status-change', { status: s })
  }

  // ─── Peer Management ────────────────────────────────────────────────────

  function trackPeer(remotePeerId: string, room: string): void {
    const existing = knownPeers.get(remotePeerId)
    if (existing) {
      existing.lastSeen = Date.now()
      existing.rooms.add(room)
    } else {
      knownPeers.set(remotePeerId, { lastSeen: Date.now(), rooms: new Set([room]) })
      sendEvent('bsm:peer-connected', {
        peerId: remotePeerId,
        room,
        totalPeers: knownPeers.size
      })
      log('Peer connected:', remotePeerId, 'total:', knownPeers.size)
    }
  }

  function removePeer(remotePeerId: string, reason: string): void {
    if (!knownPeers.has(remotePeerId)) return
    knownPeers.delete(remotePeerId)
    sendEvent('bsm:peer-disconnected', {
      peerId: remotePeerId,
      reason,
      totalPeers: knownPeers.size
    })
    log('Peer disconnected:', remotePeerId, 'reason:', reason, 'total:', knownPeers.size)
  }

  function checkPeerTimeouts(): void {
    const now = Date.now()
    for (const [peerId, info] of knownPeers) {
      if (now - info.lastSeen > PEER_TIMEOUT_MS) {
        log('Peer timeout:', peerId)
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

  // ─── WebSocket Management ───────────────────────────────────────────────

  function wsSend(msg: object): void {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  }

  function connect(): void {
    if (destroyed || !signalingUrl) return
    if (ws) return

    log('Connecting to:', signalingUrl)
    setStatus('connecting')

    try {
      ws = new WebSocket(signalingUrl)

      ws.on('open', () => {
        log('WebSocket connected')
        setStatus('connected')

        startPeerTimeoutCheck()
        startHeartbeat()

        if (!scorerRecoveryInterval) {
          scorerRecoveryInterval = setInterval(() => peerScorer.tick(), 60_000)
        }

        // Re-subscribe to all rooms
        if (subscribedRooms.size > 0) {
          log('Re-subscribing to', subscribedRooms.size, 'rooms')
          wsSend({ type: 'subscribe', topics: Array.from(subscribedRooms) })
        }

        // Join blob sync room
        joinBlobSyncRoom()

        // Initiate sync for all pooled docs
        for (const [nodeId, entry] of pool) {
          sendSyncStep1(nodeId, entry.doc)
        }
      })

      ws.on('message', (data: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'pong') return

          log('WS message:', msg.type, msg.topic ? `topic=${msg.topic}` : '')

          if (msg.type === 'publish' && msg.topic) {
            const room = msg.topic as string

            if (room === BLOB_SYNC_ROOM) {
              handleBlobSyncMessage(msg.data)
              return
            }

            const nodeId = room.replace('xnet-doc-', '')
            if (pool.has(nodeId)) {
              handleSyncMessage(nodeId, msg.data)
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
        if (scorerRecoveryInterval) {
          clearInterval(scorerRecoveryInterval)
          scorerRecoveryInterval = null
        }
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
    if (scorerRecoveryInterval) {
      clearInterval(scorerRecoveryInterval)
      scorerRecoveryInterval = null
    }
    rateLimiter.clear()
    peerScorer.clear()
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (ws) {
      if (subscribedRooms.size > 0) {
        wsSend({ type: 'unsubscribe', topics: Array.from(subscribedRooms) })
      }
      ws.close(1000, 'Data process shutdown')
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

  // ─── Yjs Sync Protocol ──────────────────────────────────────────────────

  function createOutgoingUpdate(
    update: Uint8Array,
    doc: Y.Doc
  ): { envelope: Record<string, unknown> } | { update: string } {
    if (signingKey && authorDID) {
      const envelope = signYjsUpdate(update, authorDID, signingKey, doc.clientID)
      return { envelope: serializeEnvelope(envelope) }
    }
    return { update: toBase64(update) }
  }

  function verifyIncomingUpdate(
    remotePeerId: string,
    data: Record<string, unknown>
  ): Uint8Array | null {
    if (!rateLimiter.allow(remotePeerId)) {
      const action = peerScorer.penalize(remotePeerId, 'rateExceeded')
      log('Rate limit exceeded for peer:', remotePeerId, 'action:', action)
      return null
    }

    if (hasEnvelope(data)) {
      const envelope = deserializeEnvelope(data.envelope as Record<string, unknown>)
      if (!envelope) {
        peerScorer.penalize(remotePeerId, 'invalidSignature')
        return null
      }

      if (isUpdateTooLarge(envelope.update)) {
        peerScorer.penalize(remotePeerId, 'oversizedUpdate')
        return null
      }

      const result = verifyYjsEnvelope(envelope)
      if (!result.valid) {
        peerScorer.penalize(remotePeerId, 'invalidSignature')
        return null
      }

      peerScorer.recordValid(remotePeerId)
      return envelope.update
    }

    // Legacy unsigned format
    if (typeof data.update === 'string') {
      const update = fromBase64(data.update)
      if (isUpdateTooLarge(update)) {
        peerScorer.penalize(remotePeerId, 'oversizedUpdate')
        return null
      }
      log('WARNING: Received unsigned update from peer:', remotePeerId)
      peerScorer.penalize(remotePeerId, 'unsignedUpdate')
      peerScorer.recordValid(remotePeerId)
      return update
    }

    return null
  }

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
        trackPeer(data.from as string, room)
        const remoteSV = fromBase64(data.sv as string)
        const diff = Y.encodeStateAsUpdate(doc, remoteSV)

        const updateData = createOutgoingUpdate(diff, doc)
        wsSend({
          type: 'publish',
          topic: room,
          data: { type: 'sync-step2', from: peerId, to: data.from, ...updateData }
        })

        requestAwarenessFromRenderer(nodeId)
        break
      }

      case 'sync-step2': {
        if (data.to && data.to !== peerId) break
        const remotePeerId = data.from as string
        if (remotePeerId) trackPeer(remotePeerId, room)

        const update = verifyIncomingUpdate(remotePeerId, data)
        if (!update) break

        Y.applyUpdate(doc, update, 'remote')
        entry.dirty = true
        forwardToRenderer(nodeId, update)
        break
      }

      case 'sync-update': {
        const remotePeerId = data.from as string
        if (remotePeerId) trackPeer(remotePeerId, room)

        const update = verifyIncomingUpdate(remotePeerId, data)
        if (!update) break

        Y.applyUpdate(doc, update, 'remote')
        entry.dirty = true
        forwardToRenderer(nodeId, update)
        break
      }

      case 'heartbeat': {
        if (data.from) trackPeer(data.from as string, room)
        break
      }

      case 'peer-leave': {
        if (data.from) removePeer(data.from as string, 'left')
        break
      }

      case 'awareness': {
        if (data.from) trackPeer(data.from as string, room)
        const update = fromBase64(data.update as string)
        forwardAwarenessToRenderer(nodeId, update)
        break
      }

      case 'awareness-snapshot': {
        const users = Array.isArray(data.users) ? data.users : []
        forwardAwarenessSnapshotToRenderer(nodeId, users)
        break
      }
    }
  }

  // ─── Renderer Communication ─────────────────────────────────────────────

  function forwardToRenderer(nodeId: string, update: Uint8Array): void {
    const entry = pool.get(nodeId)
    if (!entry) return

    // Forward to all windows that have this doc acquired
    for (const windowId of entry.windows) {
      const port = rendererPorts.get(windowId)
      if (port) {
        port.postMessage({ type: 'update', nodeId, update: Array.from(update) })
      }
    }
  }

  function forwardAwarenessToRenderer(nodeId: string, update: Uint8Array): void {
    const entry = pool.get(nodeId)
    if (!entry) return

    for (const windowId of entry.windows) {
      const port = rendererPorts.get(windowId)
      if (port) {
        port.postMessage({ type: 'awareness', nodeId, update: Array.from(update) })
      }
    }
  }

  function forwardAwarenessSnapshotToRenderer(nodeId: string, users: unknown[]): void {
    const entry = pool.get(nodeId)
    if (!entry) return

    for (const windowId of entry.windows) {
      const port = rendererPorts.get(windowId)
      if (port) {
        port.postMessage({ type: 'awareness-snapshot', nodeId, users })
      }
    }
  }

  function requestAwarenessFromRenderer(nodeId: string): void {
    const entry = pool.get(nodeId)
    if (!entry) return

    for (const windowId of entry.windows) {
      const port = rendererPorts.get(windowId)
      if (port) {
        port.postMessage({ type: 'request-awareness', nodeId })
      }
    }
  }

  // ─── Blob Sync ──────────────────────────────────────────────────────────

  function joinBlobSyncRoom(): void {
    if (subscribedRooms.has(BLOB_SYNC_ROOM)) return
    subscribedRooms.add(BLOB_SYNC_ROOM)
    wsSend({ type: 'subscribe', topics: [BLOB_SYNC_ROOM] })
  }

  async function handleBlobSyncMessage(data: Record<string, unknown>): Promise<void> {
    if (!db) return

    const msgType = data.type as string

    switch (msgType) {
      case 'blob-want': {
        const cids = data.cids as string[]
        for (const cid of cids) {
          const blobData = await getBlobFromDb(cid)
          if (blobData) {
            wsSend({
              type: 'publish',
              topic: BLOB_SYNC_ROOM,
              data: { type: 'blob-data', cid, data: toBase64(blobData) }
            })
          } else {
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
        const cid = data.cid as string
        const blobData = fromBase64(data.data as string)
        await setBlobInDb(cid, blobData)
        pendingBlobRequests.delete(cid)
        sendEvent('bsm:blob-received', { cid })
        break
      }

      case 'blob-not-found': {
        const cid = data.cid as string
        pendingBlobRequests.delete(cid)
        break
      }

      case 'blob-have': {
        const cids = data.cids as string[]
        const needed: string[] = []
        for (const cid of cids) {
          if (!(await hasBlobInDb(cid))) {
            needed.push(cid)
          }
        }
        if (needed.length > 0) {
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

  // ─── SQLite Operations ──────────────────────────────────────────────────

  async function getBlobFromDb(cid: string): Promise<Uint8Array | null> {
    if (!db) return null
    const row = db.prepare('SELECT data FROM blobs WHERE cid = ?').get(cid) as
      | { data: Buffer }
      | undefined
    return row ? new Uint8Array(row.data) : null
  }

  async function setBlobInDb(cid: string, data: Uint8Array): Promise<void> {
    if (!batchWriter) return
    batchWriter.putBlob(cid, data)
    // Note: putBlob schedules auto-flush, no need to await here
  }

  async function hasBlobInDb(cid: string): Promise<boolean> {
    if (!db) return false
    const row = db.prepare('SELECT 1 FROM blobs WHERE cid = ?').get(cid)
    return !!row
  }

  // ─── Room Management ────────────────────────────────────────────────────

  function joinRoom(nodeId: string): void {
    const room = `xnet-doc-${nodeId}`
    if (subscribedRooms.has(room)) return

    subscribedRooms.add(room)
    wsSend({ type: 'subscribe', topics: [room] })

    const entry = pool.get(nodeId)
    if (entry) {
      sendSyncStep1(nodeId, entry.doc)
    }
  }

  function leaveRoom(nodeId: string): void {
    const room = `xnet-doc-${nodeId}`
    if (!subscribedRooms.has(room)) return

    wsSend({
      type: 'publish',
      topic: room,
      data: { type: 'peer-leave', from: peerId }
    })

    subscribedRooms.delete(room)
    wsSend({ type: 'unsubscribe', topics: [room] })
  }

  // ─── Pool Management ────────────────────────────────────────────────────

  function getOrCreateDoc(nodeId: string, windowId: string): Y.Doc {
    const existing = pool.get(nodeId)
    if (existing) {
      existing.refCount++
      existing.windows.add(windowId)
      return existing.doc
    }

    const doc = new Y.Doc({ guid: nodeId, gc: false })

    // Broadcast local edits to network
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote' || origin === 'renderer') return
      if (status === 'connected') {
        const room = `xnet-doc-${nodeId}`
        const updateData = createOutgoingUpdate(update, doc)
        wsSend({
          type: 'publish',
          topic: room,
          data: { type: 'sync-update', from: peerId, ...updateData }
        })
      }
    })

    pool.set(nodeId, { doc, refCount: 1, dirty: false, windows: new Set([windowId]) })
    return doc
  }

  function releaseDocFromPool(nodeId: string, windowId: string): void {
    const entry = pool.get(nodeId)
    if (!entry) return

    entry.windows.delete(windowId)
    entry.refCount = Math.max(0, entry.refCount - 1)
    // Doc stays in pool for background sync
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  return {
    async initialize(): Promise<void> {
      log('Initializing database at:', config.dbPath)
      db = new Database(config.dbPath)
      db.pragma('journal_mode = WAL')

      db.exec(`
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY,
          content BLOB,
          metadata TEXT,
          version INTEGER
        );

        CREATE TABLE IF NOT EXISTS updates (
          doc_id TEXT,
          update_hash TEXT,
          update_data TEXT,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          PRIMARY KEY (doc_id, update_hash)
        );

        CREATE TABLE IF NOT EXISTS snapshots (
          doc_id TEXT PRIMARY KEY,
          snapshot_data TEXT
        );

        CREATE TABLE IF NOT EXISTS blobs (
          cid TEXT PRIMARY KEY,
          data BLOB
        );

        CREATE INDEX IF NOT EXISTS idx_updates_doc ON updates(doc_id);
      `)

      // Create batch writer for efficient writes
      batchWriter = createSQLiteBatchWriter(db, {
        maxBatchSize: 100,
        maxWaitMs: 50,
        debug: debugEnabled
      })

      log('Database initialized')
    },

    async shutdown(): Promise<void> {
      log('Shutting down')
      disconnect()

      // Close all renderer ports
      for (const [, port] of rendererPorts) {
        port.close()
      }
      rendererPorts.clear()

      // Destroy all docs
      for (const [, entry] of pool) {
        entry.doc.destroy()
      }
      pool.clear()
      subscribedRooms.clear()
      tracked.clear()

      // Flush and close batch writer
      if (batchWriter) {
        await batchWriter.close()
        batchWriter = null
      }

      if (db) {
        db.close()
        db = null
      }
    },

    attachRendererPort(windowId: string, port: Electron.MessagePortMain): void {
      // Close existing port if any
      const existing = rendererPorts.get(windowId)
      if (existing) {
        existing.close()
      }

      // Set up message handler
      port.on('message', (msgEvent) => {
        const { type, nodeId, update } = msgEvent.data as {
          type: string
          nodeId: string
          update?: number[]
        }

        log('Renderer message:', type, 'node:', nodeId)

        const entry = pool.get(nodeId)
        if (!entry) return

        if (type === 'update' && update) {
          const u8 = new Uint8Array(update)
          Y.applyUpdate(entry.doc, u8, 'renderer')
          entry.dirty = true

          // Broadcast to network
          if (status === 'connected') {
            const room = `xnet-doc-${nodeId}`
            const updateData = createOutgoingUpdate(u8, entry.doc)
            wsSend({
              type: 'publish',
              topic: room,
              data: { type: 'sync-update', from: peerId, ...updateData }
            })
          }
        } else if (type === 'awareness' && update) {
          // Forward awareness to network
          if (status === 'connected') {
            const room = `xnet-doc-${nodeId}`
            wsSend({
              type: 'publish',
              topic: room,
              data: { type: 'awareness', from: peerId, update: toBase64(new Uint8Array(update)) }
            })
          }
        }
      })

      port.start()
      rendererPorts.set(windowId, port)
      log('Attached renderer port for window:', windowId)
    },

    detachRendererPort(windowId: string): void {
      const port = rendererPorts.get(windowId)
      if (port) {
        port.close()
        rendererPorts.delete(windowId)
      }

      // Clean up any docs this window had acquired
      for (const [, entry] of pool) {
        if (entry.windows.has(windowId)) {
          entry.windows.delete(windowId)
          entry.refCount = Math.max(0, entry.refCount - 1)
        }
      }
    },

    async startSync(url: string, author?: string, key?: number[]): Promise<void> {
      if (status !== 'disconnected') return

      signalingUrl = url
      authorDID = author ?? ''
      signingKey = key ? new Uint8Array(key) : null
      destroyed = false
      connect()
    },

    async stopSync(): Promise<void> {
      disconnect()
    },

    getStatus() {
      return {
        status,
        poolSize: pool.size,
        trackedCount: tracked.size,
        queueSize: 0,
        pendingBlobCount: pendingBlobRequests.size
      }
    },

    async acquireDoc(nodeId: string, schemaId: string, windowId: string): Promise<void> {
      tracked.set(nodeId, { nodeId, schemaId, lastOpened: Date.now() })
      getOrCreateDoc(nodeId, windowId)
      joinRoom(nodeId)
    },

    releaseDoc(nodeId: string, windowId: string): void {
      releaseDocFromPool(nodeId, windowId)
      leaveRoom(nodeId)
    },

    trackNode(nodeId: string, schemaId: string): void {
      tracked.set(nodeId, { nodeId, schemaId, lastOpened: Date.now() })
      joinRoom(nodeId)
    },

    untrackNode(nodeId: string): void {
      tracked.delete(nodeId)
      leaveRoom(nodeId)
    },

    async getBlob(cid: string): Promise<Uint8Array | null> {
      return getBlobFromDb(cid)
    },

    async putBlob(data: Uint8Array): Promise<string> {
      const hash = hashContent(data)
      const cid = createContentId(hash)
      await setBlobInDb(cid, data)
      return cid
    },

    async hasBlob(cid: string): Promise<boolean> {
      return hasBlobInDb(cid)
    },

    requestBlobs(cids: string[]): void {
      if (cids.length === 0 || status !== 'connected') return

      const checkAndRequest = async () => {
        const missing: string[] = []
        for (const cid of cids) {
          if (!(await hasBlobInDb(cid))) {
            missing.push(cid)
          }
        }
        if (missing.length > 0) {
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
    },

    announceBlobs(cids: string[]): void {
      if (cids.length === 0 || status !== 'connected') return
      wsSend({
        type: 'publish',
        topic: BLOB_SYNC_ROOM,
        data: { type: 'blob-have', cids }
      })
    }
  }
}
