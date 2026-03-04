/**
 * @xnetjs/hub - Peer discovery service.
 */

import type { HubStorage, PeerEndpoint, PeerRecord } from '../storage/interface'

export type DiscoveryConfig = {
  /** How long before a peer is considered stale (default: 7 days) */
  staleTtlMs: number
  /** How often to clean stale peers (default: 6 hours) */
  cleanupIntervalMs: number
  /** Max peers to store (default: 10000) */
  maxPeers: number
}

const DEFAULT_CONFIG: DiscoveryConfig = {
  staleTtlMs: 7 * 24 * 60 * 60 * 1000,
  cleanupIntervalMs: 6 * 60 * 60 * 1000,
  maxPeers: 10000
}

export type RegisterInput = {
  did: string
  publicKeyB64: string
  displayName?: string
  endpoints: PeerEndpoint[]
  hubUrl?: string
  capabilities?: string[]
}

const ENDPOINT_TYPES = new Set(['websocket', 'webrtc-signaling', 'libp2p', 'http'])

const normalizeEndpoints = (endpoints: PeerEndpoint[]): PeerEndpoint[] =>
  endpoints
    .filter((endpoint) =>
      Boolean(
        endpoint &&
        ENDPOINT_TYPES.has(endpoint.type) &&
        typeof endpoint.address === 'string' &&
        endpoint.address.length > 0
      )
    )
    .map((endpoint, index) => ({
      type: endpoint.type,
      address: endpoint.address,
      priority: Number.isFinite(endpoint.priority) ? endpoint.priority : index
    }))

export class DiscoveryService {
  private config: DiscoveryConfig
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private storage: HubStorage,
    config?: Partial<DiscoveryConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  start(): void {
    if (this.cleanupTimer) return
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch((err) => console.error('[discovery] cleanup failed', err))
    }, this.config.cleanupIntervalMs)
  }

  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  /**
   * Register or update a peer's endpoint info.
   */
  async register(input: RegisterInput, authenticatedDid: string): Promise<PeerRecord> {
    if (authenticatedDid !== 'did:key:anonymous' && input.did !== authenticatedDid) {
      throw new DiscoveryError(
        'UNAUTHORIZED',
        `Cannot register endpoints for ${input.did} as ${authenticatedDid}`
      )
    }

    const endpoints = normalizeEndpoints(input.endpoints)
    if (endpoints.length === 0) {
      throw new DiscoveryError('INVALID_INPUT', 'At least one valid endpoint is required')
    }

    const existing = await this.storage.getPeer(input.did)
    const record: PeerRecord = {
      did: input.did,
      publicKeyB64: input.publicKeyB64 ?? '',
      displayName: input.displayName,
      endpoints,
      hubUrl: input.hubUrl,
      capabilities: input.capabilities ?? [],
      lastSeen: Date.now(),
      registeredAt: existing?.registeredAt ?? Date.now(),
      version: (existing?.version ?? 0) + 1
    }

    await this.storage.upsertPeer(record)
    return record
  }

  /**
   * Resolve a DID to its peer record.
   */
  async resolve(did: string): Promise<PeerRecord | null> {
    const record = await this.storage.getPeer(did)
    if (!record) return null

    if (Date.now() - record.lastSeen > this.config.staleTtlMs) {
      return null
    }

    return record
  }

  /**
   * Update last-seen timestamp for a connected peer.
   */
  async heartbeat(did: string): Promise<void> {
    const record = await this.storage.getPeer(did)
    if (!record) return

    const updated: PeerRecord = {
      ...record,
      lastSeen: Date.now()
    }

    await this.storage.upsertPeer(updated)
  }

  /**
   * List recently active peers.
   */
  async listRecent(limit = 50): Promise<PeerRecord[]> {
    return this.storage.listRecentPeers(limit)
  }

  /**
   * Get hub statistics.
   */
  async getStats(): Promise<{ totalPeers: number; activePeers: number }> {
    const total = await this.storage.getPeerCount()
    const recent = await this.storage.listRecentPeers(this.config.maxPeers)
    const cutoff = Date.now() - 5 * 60 * 1000
    const active = recent.filter((peer) => peer.lastSeen > cutoff).length
    return { totalPeers: total, activePeers: active }
  }

  private async cleanup(): Promise<void> {
    const removed = await this.storage.removeStalePeers(this.config.staleTtlMs)
    if (removed > 0) {
      console.info(`[discovery] Removed ${removed} stale peers`)
    }
  }
}

export class DiscoveryError extends Error {
  constructor(
    public code: 'UNAUTHORIZED' | 'INVALID_INPUT' | 'NOT_FOUND',
    message: string
  ) {
    super(message)
    this.name = 'DiscoveryError'
  }
}
