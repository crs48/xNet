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

import { existsSync, unlinkSync } from 'fs'
import { hashContent, createContentId } from '@xnet/core'
import { createElectronSQLiteAdapter, ElectronSQLiteAdapter } from '@xnet/sqlite/electron'
import {
  signYjsUpdate,
  verifyYjsEnvelopeV1,
  isUpdateTooLarge,
  YjsRateLimiter,
  YjsPeerScorer,
  type SignedYjsEnvelopeV1
} from '@xnet/sync'
import WebSocket from 'ws'
import * as Y from 'yjs'
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

type SyncTransportStrategy = 'ws' | 'webrtc' | 'auto'

type IceServerConfig = {
  urls: string[]
  username?: string
  credential?: string
}

type StartSyncOptions = {
  signalingUrl: string
  authorDID?: string
  signingKey?: number[]
  ucanToken?: string
  transport?: SyncTransportStrategy
  iceServers?: IceServerConfig[]
}

// Serialized types for IPC transport (matches renderer/lib/ipc-node-storage.ts)
interface SerializedNodeChange {
  protocolVersion?: number
  id: string
  type: string
  hash: string
  payload: {
    nodeId: string
    schemaId?: string
    properties: Record<string, unknown>
    deleted?: boolean
  }
  lamport: {
    time: number
    author: string
  }
  wallTime: number
  authorDID: string
  parentHash: string | null
  batchId?: string
  batchIndex?: number
  batchSize?: number
  signature: number[]
}

interface SerializedPropertyTimestamp {
  lamport: { time: number; author: string }
  wallTime: number
}

interface SerializedNodeState {
  id: string
  schemaId: string
  properties: Record<string, unknown>
  timestamps: Record<string, SerializedPropertyTimestamp>
  deleted: boolean
  deletedAt?: SerializedPropertyTimestamp
  createdAt: number
  createdBy: string
  updatedAt: number
  updatedBy: string
  documentContent?: number[]
  _unknown?: Record<string, unknown>
  _schemaVersion?: string
}

interface ListNodesOptions {
  schemaId?: string
  includeDeleted?: boolean
  limit?: number
  offset?: number
}

interface CountNodesOptions {
  schemaId?: string
  includeDeleted?: boolean
}

export interface DataService {
  initialize(): Promise<void>
  shutdown(): Promise<void>
  attachRendererPort(windowId: string, port: Electron.MessagePortMain): void
  detachRendererPort(windowId: string): void
  startSync(options: StartSyncOptions): Promise<void>
  stopSync(): Promise<void>
  getStatus(): {
    status: ConnectionStatus
    transport: SyncTransportStrategy
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

  // Node storage operations (for IPCNodeStorageAdapter)
  appendChange(change: SerializedNodeChange): Promise<void>
  getChanges(nodeId: string): Promise<SerializedNodeChange[]>
  getAllChanges(): Promise<SerializedNodeChange[]>
  getChangesSince(sinceLamport: number): Promise<SerializedNodeChange[]>
  getChangeByHash(hash: string): Promise<SerializedNodeChange | null>
  getLastChange(nodeId: string): Promise<SerializedNodeChange | null>
  getNode(id: string): Promise<SerializedNodeState | null>
  setNode(node: SerializedNodeState): Promise<void>
  deleteNode(id: string): Promise<void>
  listNodes(options?: ListNodesOptions): Promise<SerializedNodeState[]>
  countNodes(options?: CountNodesOptions): Promise<number>
  getLastLamportTime(): Promise<number>
  setLastLamportTime(time: number): Promise<void>
  getDocumentContent(nodeId: string): Promise<number[] | null>
  setDocumentContent(nodeId: string, content: number[]): Promise<void>
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

function normalizeSignalingUrl(signalingUrl: string): string {
  try {
    const url = new URL(signalingUrl)
    url.searchParams.delete('token')
    return url.toString()
  } catch {
    return signalingUrl
  }
}

function buildWebSocketProtocols(token: string): string[] {
  const protocols = ['xnet-sync.v1']
  if (token && !/[\s,]/.test(token)) {
    protocols.push(`xnet-auth.${token}`)
  }
  return protocols
}

function serializeEnvelope(envelope: SignedYjsEnvelopeV1): Record<string, unknown> {
  return {
    update: toBase64(envelope.update),
    authorDID: envelope.authorDID,
    signature: toBase64(envelope.signature),
    timestamp: envelope.timestamp,
    clientId: envelope.clientId
  }
}

function deserializeEnvelope(data: Record<string, unknown>): SignedYjsEnvelopeV1 | null {
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
  let adapter: ElectronSQLiteAdapter | null = null
  let ws: WebSocket | null = null
  let status: ConnectionStatus = 'disconnected'
  let signalingUrl = ''
  let ucanToken = ''
  let transportStrategy: SyncTransportStrategy = 'ws'
  let iceServers: IceServerConfig[] = []
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

    const url = normalizeSignalingUrl(signalingUrl)
    log('Connecting to:', url)
    setStatus('connecting')

    try {
      ws = new WebSocket(url, buildWebSocketProtocols(ucanToken), {
        headers: ucanToken ? { Authorization: `Bearer ${ucanToken}` } : undefined
      })

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

          if (
            msg.type === 'auth-denied' ||
            (msg.type === 'node-error' &&
              (msg.code === 'UNAUTHORIZED' ||
                msg.code === 'TOKEN_EXPIRED' ||
                msg.code === 'TOKEN_REVOKED'))
          ) {
            const action = peerScorer.penalize('hub-authz', 'unauthorizedUpdate')
            sendEvent('bsm:unauthorized-update', {
              code: msg.code ?? 'UNAUTHORIZED',
              resource: msg.resource ?? null,
              action: msg.action ?? 'hub/relay',
              scorerAction: action
            })
          }

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

      const result = verifyYjsEnvelopeV1(envelope)
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
    if (!adapter) return

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
    if (!adapter) return null
    const row = await adapter.queryOne<{ data: Buffer }>('SELECT data FROM blobs WHERE cid = ?', [
      cid
    ])
    return row ? new Uint8Array(row.data) : null
  }

  async function setBlobInDb(cid: string, data: Uint8Array): Promise<void> {
    if (!adapter) return
    const now = Date.now()
    await adapter.run(
      'INSERT OR REPLACE INTO blobs (cid, data, size, created_at) VALUES (?, ?, ?, ?)',
      [cid, data, data.byteLength, now]
    )
  }

  async function hasBlobInDb(cid: string): Promise<boolean> {
    if (!adapter) return false
    const row = await adapter.queryOne<{ exists: number }>(
      'SELECT 1 as exists FROM blobs WHERE cid = ?',
      [cid]
    )
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

      // Check if database exists and has old schema (without version tracking)
      if (existsSync(config.dbPath)) {
        try {
          const tempAdapter = new ElectronSQLiteAdapter()
          await tempAdapter.open({ path: config.dbPath })
          const version = await tempAdapter.getSchemaVersion()
          await tempAdapter.close()

          if (version === 0) {
            // Old database without version tracking - delete it
            log('Found old database without version tracking, removing...')
            try {
              unlinkSync(config.dbPath)
            } catch {
              // File may not exist, ignore
            }
            try {
              unlinkSync(`${config.dbPath}-wal`)
            } catch {
              // File may not exist, ignore
            }
            try {
              unlinkSync(`${config.dbPath}-shm`)
            } catch {
              // File may not exist, ignore
            }
          }
        } catch {
          // Corrupted database - delete it
          log('Found corrupted database, removing...')
          try {
            unlinkSync(config.dbPath)
          } catch {
            // File may not exist, ignore
          }
          try {
            unlinkSync(`${config.dbPath}-wal`)
          } catch {
            // File may not exist, ignore
          }
          try {
            unlinkSync(`${config.dbPath}-shm`)
          } catch {
            // File may not exist, ignore
          }
        }
      }

      // Create adapter with unified schema
      adapter = await createElectronSQLiteAdapter({
        path: config.dbPath,
        walMode: true,
        foreignKeys: true,
        busyTimeout: 5000
      })

      log('Database initialized with schema version:', await adapter.getSchemaVersion())
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

      // Close adapter (handles WAL checkpoint)
      if (adapter) {
        await adapter.close()
        adapter = null
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

    async startSync(options: StartSyncOptions): Promise<void> {
      if (status !== 'disconnected') return

      signalingUrl = options.signalingUrl
      authorDID = options.authorDID ?? ''
      signingKey = options.signingKey ? new Uint8Array(options.signingKey) : null
      ucanToken = options.ucanToken ?? ''
      iceServers = options.iceServers ?? []

      const requestedTransport = options.transport ?? 'ws'
      transportStrategy = requestedTransport
      if (requestedTransport !== 'ws') {
        // Utility process remains WS relay transport for deterministic fallback.
        transportStrategy = 'ws'
        sendEvent('bsm:transport-fallback', {
          from: requestedTransport,
          to: 'ws',
          reason: 'webrtc_unavailable_in_utility_process',
          iceServerCount: iceServers.length
        })
      }

      destroyed = false
      connect()
    },

    async stopSync(): Promise<void> {
      disconnect()
    },

    getStatus() {
      return {
        status,
        transport: transportStrategy,
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
    },

    // ─── Node Storage Operations ──────────────────────────────────────────────
    // These methods implement the NodeStorageAdapter interface for the renderer.
    // Data is stored in SQLite and changes are emitted for real-time sync.

    async appendChange(change: SerializedNodeChange): Promise<void> {
      if (!adapter) throw new Error('Database not initialized')

      // Ensure the node exists before inserting the change (foreign key constraint)
      // If this is the first change for a node (has schemaId), create the node record
      if (change.payload.schemaId) {
        await adapter.run(
          `INSERT OR IGNORE INTO nodes (id, schema_id, created_at, updated_at, created_by, deleted_at)
           VALUES (?, ?, ?, ?, ?, NULL)`,
          [
            change.payload.nodeId,
            change.payload.schemaId,
            change.wallTime,
            change.wallTime,
            change.authorDID
          ]
        )
      }

      await adapter.run(
        `INSERT OR REPLACE INTO changes (
          hash, node_id, payload, lamport_time, lamport_peer, wall_time,
          author, parent_hash, batch_id, signature
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          change.hash,
          change.payload.nodeId,
          JSON.stringify(change.payload),
          change.lamport.time,
          change.lamport.author,
          change.wallTime,
          change.authorDID,
          change.parentHash,
          change.batchId ?? null,
          Buffer.from(change.signature)
        ]
      )

      // Update sync state with latest Lamport time
      await adapter.run(
        `INSERT OR REPLACE INTO sync_state (key, value) VALUES ('lastLamportTime', ?)`,
        [String(Math.max(change.lamport.time, await this.getLastLamportTime()))]
      )

      // Emit change event for real-time sync to other windows
      sendEvent('nodes:change', { changes: [change] })

      log('appendChange:', change.hash, 'node:', change.payload.nodeId)
    },

    async getChanges(nodeId: string): Promise<SerializedNodeChange[]> {
      if (!adapter) return []

      const rows = await adapter.query<{
        hash: string
        node_id: string
        payload: string
        lamport_time: number
        lamport_peer: string
        wall_time: number
        author: string
        parent_hash: string | null
        batch_id: string | null
        signature: Buffer
      }>('SELECT * FROM changes WHERE node_id = ? ORDER BY lamport_time ASC', [nodeId])

      return rows.map(rowToSerializedChange)
    },

    async getAllChanges(): Promise<SerializedNodeChange[]> {
      if (!adapter) return []

      const rows = await adapter.query<{
        hash: string
        node_id: string
        payload: string
        lamport_time: number
        lamport_peer: string
        wall_time: number
        author: string
        parent_hash: string | null
        batch_id: string | null
        signature: Buffer
      }>('SELECT * FROM changes ORDER BY lamport_time ASC', [])

      return rows.map(rowToSerializedChange)
    },

    async getChangesSince(sinceLamport: number): Promise<SerializedNodeChange[]> {
      if (!adapter) return []

      const rows = await adapter.query<{
        hash: string
        node_id: string
        payload: string
        lamport_time: number
        lamport_peer: string
        wall_time: number
        author: string
        parent_hash: string | null
        batch_id: string | null
        signature: Buffer
      }>('SELECT * FROM changes WHERE lamport_time > ? ORDER BY lamport_time ASC', [sinceLamport])

      return rows.map(rowToSerializedChange)
    },

    async getChangeByHash(hash: string): Promise<SerializedNodeChange | null> {
      if (!adapter) return null

      const row = await adapter.queryOne<{
        hash: string
        node_id: string
        payload: string
        lamport_time: number
        lamport_peer: string
        wall_time: number
        author: string
        parent_hash: string | null
        batch_id: string | null
        signature: Buffer
      }>('SELECT * FROM changes WHERE hash = ?', [hash])

      return row ? rowToSerializedChange(row) : null
    },

    async getLastChange(nodeId: string): Promise<SerializedNodeChange | null> {
      if (!adapter) return null

      const row = await adapter.queryOne<{
        hash: string
        node_id: string
        payload: string
        lamport_time: number
        lamport_peer: string
        wall_time: number
        author: string
        parent_hash: string | null
        batch_id: string | null
        signature: Buffer
      }>('SELECT * FROM changes WHERE node_id = ? ORDER BY lamport_time DESC LIMIT 1', [nodeId])

      return row ? rowToSerializedChange(row) : null
    },

    async getNode(id: string): Promise<SerializedNodeState | null> {
      if (!adapter) return null

      const row = await adapter.queryOne<{
        id: string
        schema_id: string
        created_at: number
        updated_at: number
        created_by: string
        deleted_at: number | null
      }>('SELECT * FROM nodes WHERE id = ?', [id])

      if (!row) return null

      // Get properties
      const propRows = await adapter.query<{
        property_key: string
        value: string | null
        lamport_time: number
        updated_by: string
        updated_at: number
      }>('SELECT * FROM node_properties WHERE node_id = ?', [id])

      const properties: Record<string, unknown> = {}
      const timestamps: Record<string, SerializedPropertyTimestamp> = {}

      for (const prop of propRows) {
        properties[prop.property_key] = prop.value ? JSON.parse(prop.value) : null
        timestamps[prop.property_key] = {
          lamport: { time: prop.lamport_time, author: prop.updated_by },
          wallTime: prop.updated_at
        }
      }

      // Get document content if exists
      const yjsRow = await adapter.queryOne<{ state: Buffer }>(
        'SELECT state FROM yjs_state WHERE node_id = ?',
        [id]
      )

      return {
        id: row.id,
        schemaId: row.schema_id,
        properties,
        timestamps,
        deleted: row.deleted_at !== null,
        deletedAt: row.deleted_at
          ? { lamport: { time: 0, author: row.created_by }, wallTime: row.deleted_at }
          : undefined,
        createdAt: row.created_at,
        createdBy: row.created_by,
        updatedAt: row.updated_at,
        updatedBy: row.created_by, // TODO: Track updatedBy separately
        documentContent: yjsRow ? Array.from(yjsRow.state) : undefined
      }
    },

    async setNode(node: SerializedNodeState): Promise<void> {
      if (!adapter) throw new Error('Database not initialized')

      // Upsert node
      await adapter.run(
        `INSERT OR REPLACE INTO nodes (id, schema_id, created_at, updated_at, created_by, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          node.id,
          node.schemaId,
          node.createdAt,
          node.updatedAt,
          node.createdBy,
          node.deleted ? (node.deletedAt?.wallTime ?? Date.now()) : null
        ]
      )

      // Upsert properties
      for (const [key, value] of Object.entries(node.properties)) {
        const ts = node.timestamps[key]
        await adapter.run(
          `INSERT OR REPLACE INTO node_properties (node_id, property_key, value, lamport_time, updated_by, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            node.id,
            key,
            value !== undefined ? JSON.stringify(value) : null,
            ts?.lamport.time ?? 0,
            ts?.lamport.author ?? node.createdBy,
            ts?.wallTime ?? node.updatedAt
          ]
        )
      }

      // Store document content if present
      if (node.documentContent) {
        await adapter.run(
          `INSERT OR REPLACE INTO yjs_state (node_id, state, updated_at)
           VALUES (?, ?, ?)`,
          [node.id, Buffer.from(node.documentContent), Date.now()]
        )
      }

      log('setNode:', node.id, 'schema:', node.schemaId)
    },

    async deleteNode(id: string): Promise<void> {
      if (!adapter) throw new Error('Database not initialized')

      // Delete in order to respect foreign keys
      await adapter.run('DELETE FROM node_properties WHERE node_id = ?', [id])
      await adapter.run('DELETE FROM yjs_state WHERE node_id = ?', [id])
      await adapter.run('DELETE FROM changes WHERE node_id = ?', [id])
      await adapter.run('DELETE FROM nodes WHERE id = ?', [id])

      log('deleteNode:', id)
    },

    async listNodes(options?: ListNodesOptions): Promise<SerializedNodeState[]> {
      if (!adapter) return []

      let sql = 'SELECT * FROM nodes WHERE 1=1'
      const params: (string | number)[] = []

      if (options?.schemaId) {
        sql += ' AND schema_id = ?'
        params.push(options.schemaId)
      }

      if (!options?.includeDeleted) {
        sql += ' AND deleted_at IS NULL'
      }

      sql += ' ORDER BY updated_at DESC'

      if (options?.limit) {
        sql += ' LIMIT ?'
        params.push(options.limit)
      }

      if (options?.offset) {
        sql += ' OFFSET ?'
        params.push(options.offset)
      }

      const rows = await adapter.query<{
        id: string
        schema_id: string
        created_at: number
        updated_at: number
        created_by: string
        deleted_at: number | null
      }>(sql, params)

      // Fetch full node state for each
      const nodes: SerializedNodeState[] = []
      for (const row of rows) {
        const node = await this.getNode(row.id)
        if (node) nodes.push(node)
      }

      return nodes
    },

    async countNodes(options?: CountNodesOptions): Promise<number> {
      if (!adapter) return 0

      let sql = 'SELECT COUNT(*) as count FROM nodes WHERE 1=1'
      const params: string[] = []

      if (options?.schemaId) {
        sql += ' AND schema_id = ?'
        params.push(options.schemaId)
      }

      if (!options?.includeDeleted) {
        sql += ' AND deleted_at IS NULL'
      }

      const row = await adapter.queryOne<{ count: number }>(sql, params)
      return row?.count ?? 0
    },

    async getLastLamportTime(): Promise<number> {
      if (!adapter) return 0

      const row = await adapter.queryOne<{ value: string }>(
        "SELECT value FROM sync_state WHERE key = 'lastLamportTime'",
        []
      )
      return row ? parseInt(row.value, 10) : 0
    },

    async setLastLamportTime(time: number): Promise<void> {
      if (!adapter) throw new Error('Database not initialized')

      await adapter.run(
        `INSERT OR REPLACE INTO sync_state (key, value) VALUES ('lastLamportTime', ?)`,
        [String(time)]
      )
    },

    async getDocumentContent(nodeId: string): Promise<number[] | null> {
      if (!adapter) return null

      const row = await adapter.queryOne<{ state: Buffer }>(
        'SELECT state FROM yjs_state WHERE node_id = ?',
        [nodeId]
      )

      return row ? Array.from(row.state) : null
    },

    async setDocumentContent(nodeId: string, content: number[]): Promise<void> {
      if (!adapter) throw new Error('Database not initialized')

      await adapter.run(
        `INSERT OR REPLACE INTO yjs_state (node_id, state, updated_at)
         VALUES (?, ?, ?)`,
        [nodeId, Buffer.from(content), Date.now()]
      )

      log('setDocumentContent:', nodeId, 'size:', content.length)
    }
  }
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function rowToSerializedChange(row: {
  hash: string
  node_id: string
  payload: string
  lamport_time: number
  lamport_peer: string
  wall_time: number
  author: string
  parent_hash: string | null
  batch_id: string | null
  signature: Buffer
}): SerializedNodeChange {
  const payload = JSON.parse(row.payload) as {
    nodeId: string
    schemaId?: string
    properties: Record<string, unknown>
    deleted?: boolean
  }

  return {
    id: row.hash, // Use hash as ID for now
    type: 'node-change',
    hash: row.hash,
    payload,
    lamport: {
      time: row.lamport_time,
      author: row.lamport_peer
    },
    wallTime: row.wall_time,
    authorDID: row.author,
    parentHash: row.parent_hash,
    batchId: row.batch_id ?? undefined,
    signature: Array.from(row.signature)
  }
}
