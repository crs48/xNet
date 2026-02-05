/**
 * @xnet/hub - Eviction service for demo mode.
 *
 * Tracks last activity per DID and evicts user data
 * after a configurable inactivity TTL.
 */

import type { DemoOverrides } from '../types'

// ─── Types ──────────────────────────────────────────────────

export type EvictionStorage = {
  /** Upsert the last-active timestamp for a DID. */
  upsertActivity(did: string, timestamp: number): Promise<void>
  /** Return DIDs with last_active_at < cutoff. */
  getInactiveDids(cutoff: number): Promise<string[]>
  /** Delete all stored data for a DID. */
  deleteUserData(did: string): Promise<void>
  /** Delete the activity record for a DID. */
  deleteActivity(did: string): Promise<void>
}

// ─── Service ────────────────────────────────────────────────

export class EvictionService {
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private storage: EvictionStorage,
    private config: DemoOverrides
  ) {}

  /** Start periodic eviction checks. */
  start(): void {
    // Run immediately, then on interval
    void this.evict()
    this.timer = setInterval(() => void this.evict(), this.config.evictionInterval)
    console.log(
      `[eviction] Started with TTL=${this.config.evictionTtl}ms, interval=${this.config.evictionInterval}ms`
    )
  }

  /** Stop eviction checks. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** Record activity for a DID (call on every authenticated message). */
  async touch(did: string): Promise<void> {
    await this.storage.upsertActivity(did, Date.now())
  }

  /** Run one eviction pass — exposed for testing. */
  async evict(): Promise<number> {
    const cutoff = Date.now() - this.config.evictionTtl
    const stale = await this.storage.getInactiveDids(cutoff)

    if (stale.length === 0) return 0

    console.log(
      `[eviction] Evicting ${stale.length} inactive users (cutoff: ${new Date(cutoff).toISOString()})`
    )

    for (const did of stale) {
      await this.storage.deleteUserData(did)
      await this.storage.deleteActivity(did)
    }

    return stale.length
  }
}
