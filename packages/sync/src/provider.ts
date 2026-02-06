/**
 * Sync provider interfaces and types.
 *
 * A SyncProvider is responsible for connecting to the sync network,
 * broadcasting changes to peers, and receiving changes from peers.
 * Different implementations can use different transports (WebRTC, WebSocket, etc.)
 */

import type { Change } from './change'
import type { FeatureFlag } from './features'
import type { PeerCapabilities, NegotiatedSession, NegotiationResult } from './negotiation'
import { VersionNegotiator, createLocalCapabilities } from './negotiation'

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
  /** Peer's advertised capabilities (after handshake) */
  capabilities?: PeerCapabilities
  /** Negotiated session with this peer */
  negotiatedSession?: NegotiatedSession
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
  /**
   * Fired when a change with an unknown type is received.
   * The change is still stored in the change log for forward compatibility,
   * but cannot be processed by the current version.
   */
  'unknown-change-type': (change: Change<unknown>, peerId: string) => void
  /**
   * Fired when capability negotiation completes with a peer.
   * Includes the negotiated session with common features.
   */
  'negotiation-complete': (peerId: string, session: NegotiatedSession) => void
  /**
   * Fired when capability negotiation fails with a peer.
   * The peer will be disconnected after this event.
   */
  'negotiation-failed': (peerId: string, error: string, suggestion: string) => void
  /**
   * Fired when operating with degraded features due to peer compatibility.
   * Includes warnings about unavailable features.
   */
  'capability-degraded': (peerId: string, warnings: string[]) => void
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

  /** Local peer's capabilities */
  readonly localCapabilities: PeerCapabilities

  /**
   * Check if a feature can be used with a specific peer.
   * Returns false if not negotiated or feature unavailable.
   */
  canUseFeature(peerId: string, feature: FeatureFlag): boolean

  /**
   * Get the negotiated session for a peer.
   * Returns undefined if not yet negotiated.
   */
  getNegotiatedSession(peerId: string): NegotiatedSession | undefined

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

  // ─── Capability Negotiation Options ──────────────────────────────────────────

  /** Local peer's DID for capability advertisement */
  localDID?: string
  /** Features to advertise (defaults to all enabled at current protocol version) */
  enabledFeatures?: FeatureFlag[]
  /** Minimum protocol version to accept from peers */
  minProtocolVersion?: number
  /** Whether to reject peers with incompatible versions (default: false, just warn) */
  strictVersionCheck?: boolean
  /** Package version string for debugging */
  packageVersion?: string
}

/**
 * Abstract base class for sync providers with common functionality.
 * Implementations can extend this to reduce boilerplate.
 */
export abstract class BaseSyncProvider<T = unknown> implements SyncProvider<T> {
  protected _status: SyncStatus = 'disconnected'
  protected _peers: Map<string, PeerInfo> = new Map()
  protected _listeners: Map<string, Set<(...args: unknown[]) => unknown>> = new Map()

  /** Local capabilities for negotiation */
  protected _localCapabilities: PeerCapabilities

  /** Version negotiator instance */
  protected _negotiator: VersionNegotiator

  /** Provider options */
  protected _options: SyncProviderOptions

  constructor(options: SyncProviderOptions) {
    this._options = options
    this._negotiator = new VersionNegotiator()

    // Create local capabilities from options
    this._localCapabilities = createLocalCapabilities(
      options.localDID ?? `anonymous-${Date.now()}`,
      options.enabledFeatures,
      {
        packageVersion: options.packageVersion,
        minProtocolVersion: options.minProtocolVersion
      }
    )
  }

  get status(): SyncStatus {
    return this._status
  }

  get peers(): string[] {
    return Array.from(this._peers.keys())
  }

  get peerInfo(): Map<string, PeerInfo> {
    return new Map(this._peers)
  }

  get localCapabilities(): PeerCapabilities {
    return this._localCapabilities
  }

  /**
   * Check if a feature can be used with a specific peer.
   */
  canUseFeature(peerId: string, feature: FeatureFlag): boolean {
    const peer = this._peers.get(peerId)
    if (!peer?.negotiatedSession) {
      return false
    }
    return peer.negotiatedSession.canUse(feature)
  }

  /**
   * Get the negotiated session for a peer.
   */
  getNegotiatedSession(peerId: string): NegotiatedSession | undefined {
    return this._peers.get(peerId)?.negotiatedSession
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

  /**
   * Negotiate capabilities with a peer.
   * Called when a peer connects and sends their capabilities.
   *
   * @param peerId - The peer's ID
   * @param remoteCapabilities - The peer's advertised capabilities
   * @returns Negotiation result (success or failure)
   */
  protected negotiateWithPeer(
    peerId: string,
    remoteCapabilities: PeerCapabilities
  ): NegotiationResult {
    const peer = this._peers.get(peerId)
    if (!peer) {
      return {
        success: false,
        error: 'invalid-capabilities',
        message: `Peer ${peerId} not found`,
        localVersion: this._localCapabilities.protocolVersion,
        remoteVersion: remoteCapabilities.protocolVersion,
        suggestion: 'contact-support'
      }
    }

    // Store remote capabilities
    peer.capabilities = remoteCapabilities

    // Perform negotiation
    const result = this._negotiator.negotiate(this._localCapabilities, remoteCapabilities)

    if (result.success) {
      // Store negotiated session
      peer.negotiatedSession = result

      // Emit success event
      this.emit('negotiation-complete', peerId, result)

      // Emit degradation warnings if any
      if (result.warnings.length > 0) {
        const warningMessages = result.warnings.map((w) => w.message)
        this.emit('capability-degraded', peerId, warningMessages)
      }
    } else {
      // Emit failure event
      this.emit('negotiation-failed', peerId, result.message, result.suggestion)

      // If strict mode, disconnect the peer
      if (this._options.strictVersionCheck) {
        this.removePeer(peerId)
      }
    }

    return result
  }

  /**
   * Get features available with all connected peers.
   * Returns the intersection of all negotiated feature sets.
   */
  getCommonFeatures(): FeatureFlag[] {
    const negotiatedPeers = Array.from(this._peers.values()).filter((p) => p.negotiatedSession)

    if (negotiatedPeers.length === 0) {
      // No negotiated peers, return local features
      return this._localCapabilities.features
    }

    // Start with first peer's features
    let common = new Set(negotiatedPeers[0].negotiatedSession!.commonFeatures)

    // Intersect with all other peers
    for (let i = 1; i < negotiatedPeers.length; i++) {
      const peerFeatures = new Set(negotiatedPeers[i].negotiatedSession!.commonFeatures)
      common = new Set([...common].filter((f) => peerFeatures.has(f)))
    }

    return [...common]
  }

  /**
   * Check if a feature can be used with all connected peers.
   */
  canUseFeatureWithAll(feature: FeatureFlag): boolean {
    return this.getCommonFeatures().includes(feature)
  }
}
