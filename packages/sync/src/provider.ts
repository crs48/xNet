/**
 * Sync provider interfaces and types.
 *
 * A SyncProvider is responsible for connecting to the sync network,
 * broadcasting changes to peers, and receiving changes from peers.
 * Different implementations can use different transports (WebRTC, WebSocket, etc.)
 */

import type { Change } from './change'

/**
 * Connection status of a sync provider.
 */
export type SyncStatus = 'disconnected' | 'connecting' | 'synced' | 'syncing' | 'error'

/**
 * Information about a connected peer.
 */
export interface PeerInfo {
  /** Unique peer identifier */
  id: string
  /** Human-readable name (if available) */
  name?: string
  /** When the peer connected */
  connectedAt: number
  /** Last activity timestamp */
  lastSeen: number
}

/**
 * Events emitted by sync providers.
 */
export interface SyncProviderEvents<T = unknown> {
  /** Fired when sync status changes */
  'status-change': (status: SyncStatus) => void
  /** Fired when a single change is received from a peer */
  'change-received': (change: Change<T>, peerId: string) => void
  /** Fired when multiple changes are synced */
  'changes-synced': (changes: Change<T>[]) => void
  /** Fired when a peer connects */
  'peer-connected': (peer: PeerInfo) => void
  /** Fired when a peer disconnects */
  'peer-disconnected': (peerId: string) => void
  /** Fired on error */
  error: (error: Error) => void
}

/**
 * Event listener type for type-safe event handling.
 */
export type SyncEventListener<T, E extends keyof SyncProviderEvents<T>> = SyncProviderEvents<T>[E]

/**
 * Base interface for all sync providers.
 *
 * Implementations include:
 * - y-webrtc provider for Yjs documents
 * - Custom provider for event-sourced records
 * - Hybrid providers that support both
 */
export interface SyncProvider<T = unknown> {
  /** Current sync status */
  readonly status: SyncStatus

  /** List of connected peer IDs */
  readonly peers: string[]

  /** Detailed information about connected peers */
  readonly peerInfo: Map<string, PeerInfo>

  /**
   * Connect to the sync network.
   * This may involve signaling servers, DHT lookups, etc.
   */
  connect(): Promise<void>

  /**
   * Disconnect from the sync network.
   * Closes all peer connections gracefully.
   */
  disconnect(): Promise<void>

  /**
   * Broadcast a change to all connected peers.
   *
   * @param change - The change to broadcast
   */
  broadcast(change: Change<T>): Promise<void>

  /**
   * Request changes from a specific peer.
   * Used for initial sync or catching up.
   *
   * @param peerId - The peer to request from
   * @param since - Optional hash to request changes since
   * @returns Array of changes
   */
  requestChanges(peerId: string, since?: string): Promise<Change<T>[]>

  /**
   * Request changes from all connected peers.
   * Useful for catching up after reconnection.
   *
   * @param since - Optional hash to request changes since
   * @returns Array of unique changes (deduplicated)
   */
  requestChangesFromAll(since?: string): Promise<Change<T>[]>

  /**
   * Subscribe to an event.
   *
   * @param event - Event name
   * @param listener - Event listener
   */
  on<E extends keyof SyncProviderEvents<T>>(event: E, listener: SyncProviderEvents<T>[E]): void

  /**
   * Unsubscribe from an event.
   *
   * @param event - Event name
   * @param listener - Event listener to remove
   */
  off<E extends keyof SyncProviderEvents<T>>(event: E, listener: SyncProviderEvents<T>[E]): void

  /**
   * Subscribe to an event for a single occurrence.
   *
   * @param event - Event name
   * @param listener - Event listener
   */
  once<E extends keyof SyncProviderEvents<T>>(event: E, listener: SyncProviderEvents<T>[E]): void
}

/**
 * Options for creating a sync provider.
 */
export interface SyncProviderOptions {
  /** Signaling server URL(s) */
  signalingServers?: string[]
  /** Room/topic name for peer discovery */
  room: string
  /** Connection timeout in milliseconds */
  timeout?: number
  /** Whether to auto-reconnect on disconnect */
  autoReconnect?: boolean
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number
  /** Reconnection delay in milliseconds */
  reconnectDelay?: number
}

/**
 * Abstract base class for sync providers with common functionality.
 * Implementations can extend this to reduce boilerplate.
 */
export abstract class BaseSyncProvider<T = unknown> implements SyncProvider<T> {
  protected _status: SyncStatus = 'disconnected'
  protected _peers: Map<string, PeerInfo> = new Map()
  protected _listeners: Map<string, Set<(...args: unknown[]) => unknown>> = new Map()

  get status(): SyncStatus {
    return this._status
  }

  get peers(): string[] {
    return Array.from(this._peers.keys())
  }

  get peerInfo(): Map<string, PeerInfo> {
    return new Map(this._peers)
  }

  abstract connect(): Promise<void>
  abstract disconnect(): Promise<void>
  abstract broadcast(change: Change<T>): Promise<void>
  abstract requestChanges(peerId: string, since?: string): Promise<Change<T>[]>

  async requestChangesFromAll(since?: string): Promise<Change<T>[]> {
    const allChanges: Change<T>[] = []
    const seenHashes = new Set<string>()

    const promises = this.peers.map((peerId) =>
      this.requestChanges(peerId, since).catch(() => [] as Change<T>[])
    )

    const results = await Promise.all(promises)

    for (const changes of results) {
      for (const change of changes) {
        if (!seenHashes.has(change.hash)) {
          seenHashes.add(change.hash)
          allChanges.push(change)
        }
      }
    }

    return allChanges
  }

  on<E extends keyof SyncProviderEvents<T>>(event: E, listener: SyncProviderEvents<T>[E]): void {
    const listeners = this._listeners.get(event) || new Set()
    listeners.add(listener as (...args: unknown[]) => unknown)
    this._listeners.set(event, listeners)
  }

  off<E extends keyof SyncProviderEvents<T>>(event: E, listener: SyncProviderEvents<T>[E]): void {
    const listeners = this._listeners.get(event)
    if (listeners) {
      listeners.delete(listener as (...args: unknown[]) => unknown)
    }
  }

  once<E extends keyof SyncProviderEvents<T>>(event: E, listener: SyncProviderEvents<T>[E]): void {
    const onceListener = ((...args: unknown[]) => {
      this.off(event, onceListener as SyncProviderEvents<T>[E])
      ;(listener as (...args: unknown[]) => unknown)(...args)
    }) as SyncProviderEvents<T>[E]

    this.on(event, onceListener)
  }

  protected emit<E extends keyof SyncProviderEvents<T>>(
    event: E,
    ...args: Parameters<SyncProviderEvents<T>[E]>
  ): void {
    const listeners = this._listeners.get(event)
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(...args)
        } catch (error) {
          console.error(`Error in sync provider event listener for ${event}:`, error)
        }
      }
    }
  }

  protected setStatus(status: SyncStatus): void {
    if (this._status !== status) {
      this._status = status
      this.emit('status-change', status)
    }
  }

  protected addPeer(id: string, name?: string): void {
    const now = Date.now()
    this._peers.set(id, {
      id,
      name,
      connectedAt: now,
      lastSeen: now
    })
    this.emit('peer-connected', this._peers.get(id)!)
  }

  protected removePeer(id: string): void {
    this._peers.delete(id)
    this.emit('peer-disconnected', id)
  }

  protected updatePeerLastSeen(id: string): void {
    const peer = this._peers.get(id)
    if (peer) {
      peer.lastSeen = Date.now()
    }
  }
}
