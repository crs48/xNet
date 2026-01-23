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
 * - Message types: 'sync-step1', 'sync-step2', 'sync-update'
 *
 * Sync flow:
 * 1. On connect: subscribe to room, broadcast sync-step1 (state vector)
 * 2. On receiving sync-step1: respond with sync-step2 (diff for their vector)
 * 3. On local update: broadcast sync-update to room
 * 4. On receiving sync-update: apply to local doc
 */
import * as Y from 'yjs'

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

type SyncEventType = 'status' | 'synced' | 'peers'
type SyncEventHandler = (event: unknown) => void

export class WebSocketSyncProvider {
  readonly doc: Y.Doc
  readonly room: string
  readonly url: string

  private ws: WebSocket | null = null
  private reconnectDelay: number
  private maxReconnectAttempts: number
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false
  private connected = false
  private synced = false
  private peerId: string
  private eventHandlers = new Map<SyncEventType, Set<SyncEventHandler>>()

  constructor(doc: Y.Doc, options: WebSocketSyncProviderOptions) {
    this.doc = doc
    this.room = options.room
    this.url = options.url
    this.reconnectDelay = options.reconnectDelay ?? 2000
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? Infinity

    // Generate a unique peer ID for this provider instance
    this.peerId = Math.random().toString(36).slice(2, 10)

    // Listen for local doc updates
    this.doc.on('update', this._onDocUpdate)

    // Connect
    this._connect()
  }

  get isConnected(): boolean {
    return this.connected
  }

  get isSynced(): boolean {
    return this.synced
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
        this.connected = true
        this.reconnectAttempts = 0
        this.emit('status', { connected: true })

        // Subscribe to the room
        this._send({ type: 'subscribe', topics: [this.room] })

        // Initiate sync: broadcast our state vector (sync-step1)
        const sv = Y.encodeStateVector(this.doc)
        this._publish({
          type: 'sync-step1',
          from: this.peerId,
          sv: toBase64(sv)
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

      this.ws.onclose = () => {
        this.connected = false
        this.synced = false
        this.emit('status', { connected: false })
        this._scheduleReconnect()
      }

      this.ws.onerror = () => {
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

    switch (data.type) {
      case 'sync-step1': {
        // Peer sent their state vector, respond with the diff they need
        const remoteSV = fromBase64(data.sv as string)
        const diff = Y.encodeStateAsUpdate(this.doc, remoteSV)

        // Send sync-step2 (the actual update data)
        this._publish({
          type: 'sync-step2',
          from: this.peerId,
          to: data.from,
          update: toBase64(diff)
        })

        // Also send our state vector so they can send us what we're missing
        if (!this.synced) {
          const sv = Y.encodeStateVector(this.doc)
          this._publish({
            type: 'sync-step1',
            from: this.peerId,
            sv: toBase64(sv)
          })
        }
        break
      }

      case 'sync-step2': {
        // Only process if addressed to us (or broadcast)
        if (data.to && data.to !== this.peerId) return

        const update = fromBase64(data.update as string)
        Y.applyUpdate(this.doc, update, this)

        if (!this.synced) {
          this.synced = true
          this.emit('synced', { synced: true })
        }
        break
      }

      case 'sync-update': {
        // Incremental update from a peer
        const update = fromBase64(data.update as string)
        Y.applyUpdate(this.doc, update, this)
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
}
