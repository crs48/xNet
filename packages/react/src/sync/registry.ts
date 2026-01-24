/**
 * Registry - Persistent tracked-Node set that survives app restarts
 *
 * The Registry maintains the set of Nodes the BSM should keep synced.
 * Nodes are added automatically when opened and expire after a configurable TTL.
 * Pinned Nodes never expire.
 */

export interface TrackedNode {
  nodeId: string
  schemaId: string
  /** When the user last opened this Node */
  lastOpened: number
  /** When sync last completed for this Node */
  lastSynced: number
  /** Whether explicitly pinned (never expires) */
  pinned: boolean
}

export interface RegistryStorage {
  get(key: string): Promise<TrackedNode[] | null>
  set(key: string, entries: TrackedNode[]): Promise<void>
}

export interface RegistryConfig {
  /** Storage adapter for persistence */
  storage: RegistryStorage
  /** TTL for tracked Nodes in ms (default: 7 days) */
  trackTTL?: number
  /** Storage key for the tracked set */
  storageKey?: string
}

export interface Registry {
  /** Add a Node to the tracked set */
  track(nodeId: string, schemaId: string): void
  /** Remove a Node from the tracked set */
  untrack(nodeId: string): void
  /** Pin a Node (never expires) */
  pin(nodeId: string): void
  /** Unpin a Node (subject to TTL expiry) */
  unpin(nodeId: string): void
  /** Mark a Node as recently opened (refreshes TTL) */
  touch(nodeId: string): void
  /** Mark a Node as synced */
  markSynced(nodeId: string): void
  /** Get all tracked Nodes (excluding expired) */
  getTracked(): TrackedNode[]
  /** Check if a Node is tracked */
  isTracked(nodeId: string): boolean
  /** Load from storage */
  load(): Promise<void>
  /** Persist to storage */
  save(): Promise<void>
  /** Remove expired entries */
  prune(): number
}

export function createRegistry(config: RegistryConfig): Registry {
  const trackTTL = config.trackTTL ?? 7 * 24 * 60 * 60 * 1000 // 7 days
  const storageKey = config.storageKey ?? '_xnet_tracked_nodes'
  const tracked = new Map<string, TrackedNode>()

  return {
    track(nodeId, schemaId) {
      const existing = tracked.get(nodeId)
      if (existing) {
        existing.lastOpened = Date.now()
        return
      }
      tracked.set(nodeId, {
        nodeId,
        schemaId,
        lastOpened: Date.now(),
        lastSynced: 0,
        pinned: false
      })
    },

    untrack(nodeId) {
      tracked.delete(nodeId)
    },

    pin(nodeId) {
      const entry = tracked.get(nodeId)
      if (entry) entry.pinned = true
    },

    unpin(nodeId) {
      const entry = tracked.get(nodeId)
      if (entry) entry.pinned = false
    },

    touch(nodeId) {
      const entry = tracked.get(nodeId)
      if (entry) entry.lastOpened = Date.now()
    },

    markSynced(nodeId) {
      const entry = tracked.get(nodeId)
      if (entry) entry.lastSynced = Date.now()
    },

    getTracked() {
      const now = Date.now()
      const result: TrackedNode[] = []
      for (const entry of tracked.values()) {
        if (entry.pinned || now - entry.lastOpened < trackTTL) {
          result.push(entry)
        }
      }
      return result
    },

    isTracked(nodeId) {
      const entry = tracked.get(nodeId)
      if (!entry) return false
      return entry.pinned || Date.now() - entry.lastOpened < trackTTL
    },

    async load() {
      try {
        const entries = await config.storage.get(storageKey)
        if (entries) {
          for (const entry of entries) {
            tracked.set(entry.nodeId, entry)
          }
        }
      } catch {
        // First run, no stored registry
      }
    },

    async save() {
      const entries = Array.from(tracked.values())
      try {
        await config.storage.set(storageKey, entries)
      } catch (err) {
        console.warn('[Registry] Failed to persist:', err)
      }
    },

    prune() {
      const now = Date.now()
      let pruned = 0
      for (const [id, entry] of tracked) {
        if (!entry.pinned && now - entry.lastOpened >= trackTTL) {
          tracked.delete(id)
          pruned++
        }
      }
      return pruned
    }
  }
}
