/**
 * WebSocketSyncProvider - Syncs Y.Doc via WebSocket relay
 *
 * Unlike y-webrtc (which uses WebRTC DataChannels for P2P), this provider
 * relays all Yjs updates through the signaling server. This works in all
 * environments (same-machine, different networks, behind NATs) at the cost
 * of server-relayed traffic.
 *
 * Protocol (extends the y-webrtc signaling protocol):
 * - Uses the same subscribe/publish mechanism as y-webrtc signaling
 * - Sync messages are published as JSON with base64-encoded binary data
 * - Message types: 'sync-step1', 'sync-step2', 'sync-update', 'awareness'
 *
 * Sync flow:
 * 1. On connect: subscribe to room, broadcast sync-step1 (state vector)
 * 2. On receiving sync-step1: respond with sync-step2 (diff for their vector)
 * 3. On local update: broadcast sync-update to room
 * 4. On receiving sync-update: apply to local doc
 *
 * Awareness flow:
 * 1. On connect: broadcast local awareness state
 * 2. On awareness change: broadcast updated state
 * 3. On receiving awareness: apply to local awareness instance
 * 4. On disconnect: peers remove the disconnected client's state
 */
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates
} from 'y-protocols/awareness'
import * as Y from 'yjs'

// Debug logging - enable via localStorage.setItem('xnet:sync:debug', 'true')
function log(provider: WebSocketSyncProvider, ...args: unknown[]): void {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('xnet:sync:debug') === 'true') {
    console.log(`[WSSyncProvider:${provider.room}]`, ...args)
  }
}

// Encode/decode binary as base64 for JSON transport
function toBase64(data: Uint8Array): string {
  // Works in both Node.js and browser
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(data).toString('base64')
  }
  let binary = ''
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i])
  }
  return btoa(binary)
}

function fromBase64(str: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(str, 'base64'))
  }
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export interface WebSocketSyncProviderOptions {
  /** WebSocket URL of the signaling/relay server */
  url: string
  /** Room name (peers in the same room sync together) */
  room: string
  /** Reconnect delay in ms (default: 2000) */
  reconnectDelay?: number
  /** Maximum reconnect attempts (default: Infinity) */
  maxReconnectAttempts?: number
}

type SyncEventType = 'status' | 'synced' | 'peers' | 'awareness-snapshot'
type SyncEventHandler = (event: unknown) => void

export interface AwarenessSnapshotUser {
  did: string
  state: {
    user?: { name?: string; color?: string; avatar?: string; did?: string }
    cursor?: { anchor: number; head: number }
    selection?: unknown
    online?: boolean
    [key: string]: unknown
  }
  lastSeen: number
  isStale: boolean
}

export class WebSocketSyncProvider {
  readonly doc: Y.Doc
  readonly room: string
  readonly url: string
  readonly awareness: Awareness

  private ws: WebSocket | null = null
  private reconnectDelay: number
  private maxReconnectAttempts: number
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false
  private connected = false
  private synced = false
  private peerId: string
  private remotePeerIds = new Set<string>()
  private eventHandlers = new Map<SyncEventType, Set<SyncEventHandler>>()

  constructor(doc: Y.Doc, options: WebSocketSyncProviderOptions) {
    this.doc = doc
    this.room = options.room
    this.url = options.url
    this.reconnectDelay = options.reconnectDelay ?? 2000
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? Infinity

    // Generate a unique peer ID for this provider instance
    this.peerId = Math.random().toString(36).slice(2, 10)

    // Create awareness instance for presence/cursors
    this.awareness = new Awareness(doc)

    // Listen for local doc updates
    this.doc.on('update', this._onDocUpdate)

    // Listen for local awareness changes
    this.awareness.on('update', this._onAwarenessUpdate)

    // Connect
    this._connect()
  }

  get isConnected(): boolean {
    return this.connected
  }

  get isSynced(): boolean {
    return this.synced
  }

  /** Helper to get XML fragment length for debug logging */
  private _getFragmentLength(): number {
    try {
      const fragment = this.doc.getXmlFragment('default')
      return fragment?.length ?? 0
    } catch {
      return 0
    }
  }

  on(event: SyncEventType, handler: SyncEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set())
    }
    this.eventHandlers.get(event)!.add(handler)
  }

  off(event: SyncEventType, handler: SyncEventHandler): void {
    this.eventHandlers.get(event)?.delete(handler)
  }

  private emit(event: SyncEventType, data: unknown): void {
    this.eventHandlers.get(event)?.forEach((handler) => handler(data))
  }

  destroy(): void {
    this.destroyed = true
    this.doc.off('update', this._onDocUpdate)
    this.awareness.off('update', this._onAwarenessUpdate)

    // Remove our own awareness state
    removeAwarenessStates(this.awareness, [this.doc.clientID], this)

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      // Unsubscribe before closing
      this._send({ type: 'unsubscribe', topics: [this.room] })
      this.ws.close()
      this.ws = null
    }

    this.connected = false
    this.emit('status', { connected: false })
  }

  private _connect(): void {
    if (this.destroyed) return

    try {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => {
        log(this, 'WebSocket connected to', this.url)
        this.connected = true
        this.reconnectAttempts = 0
        this.emit('status', { connected: true })

        // Subscribe to the room
        log(this, 'Subscribing to room:', this.room)
        this._send({ type: 'subscribe', topics: [this.room] })

        // Initiate sync: broadcast our state vector (sync-step1)
        const sv = Y.encodeStateVector(this.doc)
        log(this, 'Sending sync-step1, state vector size:', sv.length)
        this._publish({
          type: 'sync-step1',
          from: this.peerId,
          sv: toBase64(sv)
        })

        // Broadcast our awareness state
        const awarenessUpdate = encodeAwarenessUpdate(this.awareness, [this.doc.clientID])
        log(this, 'Sending initial awareness update')
        this._publish({
          type: 'awareness',
          from: this.peerId,
          update: toBase64(awarenessUpdate)
        })
      }

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string)
          if (msg.type === 'publish' && msg.topic === this.room) {
            this._handleSyncMessage(msg.data)
          } else if (msg.type === 'pong') {
            // Keepalive response, ignore
          }
        } catch {
          // Ignore parse errors
        }
      }

      this.ws.onclose = (event) => {
        log(this, 'WebSocket closed, code:', event.code, 'reason:', event.reason || '(none)')
        this.connected = false
        this.synced = false
        this.remotePeerIds.clear()
        this.emit('peers', { count: 0 })
        this.emit('status', { connected: false })
        this._scheduleReconnect()
      }

      this.ws.onerror = (event) => {
        log(this, 'WebSocket error:', event)
        // onclose will fire after this
      }
    } catch {
      this._scheduleReconnect()
    }
  }

  private _scheduleReconnect(): void {
    if (this.destroyed) return
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return

    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(() => {
      this._connect()
    }, this.reconnectDelay)
  }

  private _send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  private _publish(data: object): void {
    this._send({
      type: 'publish',
      topic: this.room,
      data
    })
  }

  /** Handle incoming sync messages from other peers */
  private _handleSyncMessage(data: Record<string, unknown>): void {
    if (!data || data.from === this.peerId) return // Ignore own messages

    // Track remote peers
    if (data.from && typeof data.from === 'string') {
      const hadPeer = this.remotePeerIds.has(data.from)
      this.remotePeerIds.add(data.from)
      if (!hadPeer) {
        this.emit('peers', { count: this.remotePeerIds.size })
      }
    }

    log(this, 'Received message type:', data.type, 'from:', data.from)

    switch (data.type) {
      case 'sync-step1': {
        // Peer sent their state vector, respond with the diff they need
        const remoteSV = fromBase64(data.sv as string)
        const diff = Y.encodeStateAsUpdate(this.doc, remoteSV)
        log(
          this,
          'Received sync-step1 from peer, their SV size:',
          remoteSV.length,
          'our diff size:',
          diff.length
        )

        // Send sync-step2 (the actual update data)
        log(this, 'Sending sync-step2 to peer:', data.from, 'update size:', diff.length)
        this._publish({
          type: 'sync-step2',
          from: this.peerId,
          to: data.from,
          update: toBase64(diff)
        })

        // Also send our state vector so they can send us what we're missing
        if (!this.synced) {
          const sv = Y.encodeStateVector(this.doc)
          log(this, 'Sending our sync-step1 in response, SV size:', sv.length)
          this._publish({
            type: 'sync-step1',
            from: this.peerId,
            sv: toBase64(sv)
          })
        }

        // Send our awareness state to the new peer
        const awarenessUpdate = encodeAwarenessUpdate(this.awareness, [this.doc.clientID])
        this._publish({
          type: 'awareness',
          from: this.peerId,
          update: toBase64(awarenessUpdate)
        })
        break
      }

      case 'sync-step2': {
        // Only process if addressed to us (or broadcast)
        if (data.to && data.to !== this.peerId) {
          log(this, 'Ignoring sync-step2 addressed to different peer:', data.to)
          return
        }

        const update = fromBase64(data.update as string)
        log(
          this,
          'Received sync-step2, applying update size:',
          update.length,
          'doc content before:',
          this.doc.getMap('meta').size,
          'keys'
        )
        Y.applyUpdate(this.doc, update, this)
        log(
          this,
          'After applying update, doc content:',
          this.doc.getMap('meta').size,
          'keys, XML fragment length:',
          this._getFragmentLength()
        )

        if (!this.synced) {
          this.synced = true
          log(this, 'Sync complete! Emitting synced event')
          this.emit('synced', { synced: true })
        }
        break
      }

      case 'sync-update': {
        // Incremental update from a peer
        const update = fromBase64(data.update as string)
        log(this, 'Received sync-update, size:', update.length)
        Y.applyUpdate(this.doc, update, this)
        break
      }

      case 'awareness': {
        // Apply remote awareness state
        const update = fromBase64(data.update as string)
        log(this, 'Received awareness update')
        applyAwarenessUpdate(this.awareness, update, this)
        break
      }

      case 'awareness-snapshot': {
        const users = Array.isArray(data.users) ? (data.users as AwarenessSnapshotUser[]) : []
        this.emit('awareness-snapshot', users)
        break
      }
    }
  }

  /** Broadcast local doc updates to peers */
  private _onDocUpdate = (update: Uint8Array, origin: unknown): void => {
    // Don't re-broadcast updates that came from this provider (via sync)
    if (origin === this) return

    if (this.connected) {
      this._publish({
        type: 'sync-update',
        from: this.peerId,
        update: toBase64(update)
      })
    }
  }

  /** Broadcast local awareness changes to peers */
  private _onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ): void => {
    // Don't re-broadcast awareness updates that came from remote peers
    if (origin === this) return

    const changedClients = [...added, ...updated, ...removed]
    if (changedClients.length === 0) return

    if (this.connected) {
      const update = encodeAwarenessUpdate(this.awareness, changedClients)
      this._publish({
        type: 'awareness',
        from: this.peerId,
        update: toBase64(update)
      })
    }
  }
}
