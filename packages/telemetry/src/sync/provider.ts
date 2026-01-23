/**
 * TelemetrySyncProvider - opt-in telemetry sharing with aggregator nodes.
 *
 * Key differences from regular sync:
 * 1. Only syncs outbound (push to aggregators)
 * 2. Strips remaining PII before sync
 * 3. Uses random timing jitter for privacy
 * 4. Only syncs when consent tier >= 'crashes'
 */

import type { ConsentManager } from '../consent/manager'
import type { TelemetryTier } from '../consent/types'
import type { TelemetryRecord } from '../collection/collector'
import { scheduleWithJitter } from '../collection/timing'
import type { TelemetryBatch, TelemetryBatchRecord, AggregatorResponse } from './protocol'

export interface TelemetrySyncConfig {
  /** Aggregator node addresses (multiaddr or URL) */
  aggregators: string[]
  /** Sync interval in ms (default: 5 minutes) */
  syncIntervalMs?: number
  /** Maximum records per sync batch (default: 100) */
  batchSize?: number
  /** Random jitter range in ms (default: 0-60000) */
  jitterMs?: number
  /** Optional transport function (for testing or custom protocols) */
  transport?: (aggregator: string, batch: TelemetryBatch) => Promise<AggregatorResponse>
}

export interface SyncResult {
  synced: number
  skipped: number
  error?: string
}

export class TelemetrySyncProvider {
  private syncTimer: ReturnType<typeof setTimeout> | null = null
  private syncing = false
  private started = false

  constructor(
    private config: TelemetrySyncConfig,
    private consent: ConsentManager,
    private getRecords: () => TelemetryRecord[],
    private markSynced: (ids: string[]) => void
  ) {
    this.consent.on('tier-changed', this.handleTierChange.bind(this))

    if (this.consent.isSharingEnabled) {
      this.start()
    }
  }

  /** Start the periodic sync timer. */
  start(): void {
    if (this.started) return
    this.started = true
    this.scheduleNext()
  }

  /** Stop the sync timer. */
  stop(): void {
    this.started = false
    if (this.syncTimer) {
      clearTimeout(this.syncTimer)
      this.syncTimer = null
    }
  }

  /** Whether the provider is actively syncing. */
  get isStarted(): boolean {
    return this.started
  }

  /** Manually trigger a sync (respects consent). */
  async syncNow(): Promise<SyncResult> {
    if (!this.consent.isSharingEnabled) {
      return { synced: 0, skipped: 0, error: 'sharing_not_enabled' }
    }

    if (this.syncing) {
      return { synced: 0, skipped: 0, error: 'already_syncing' }
    }

    this.syncing = true
    try {
      return await this.performSync()
    } finally {
      this.syncing = false
    }
  }

  /** Clean up. */
  destroy(): void {
    this.stop()
  }

  // ============ Private ============

  private scheduleNext(): void {
    if (!this.started) return

    const interval = this.config.syncIntervalMs ?? 5 * 60_000
    const jitter = this.config.jitterMs ?? 60_000

    this.syncTimer = scheduleWithJitter(
      async () => {
        await this.syncNow()
        this.scheduleNext()
      },
      { minDelay: interval, maxDelay: interval + jitter }
    )
  }

  private handleTierChange(_oldTier: TelemetryTier, newTier: TelemetryTier): void {
    const nowSharing = ['crashes', 'anonymous', 'identified'].includes(newTier)

    if (nowSharing && !this.started) {
      this.start()
    } else if (!nowSharing && this.started) {
      this.stop()
    }
  }

  private async performSync(): Promise<SyncResult> {
    const allRecords = this.getRecords()
    const pending = allRecords
      .filter((r) => r.status === 'pending')
      .slice(0, this.config.batchSize ?? 100)

    if (pending.length === 0) {
      return { synced: 0, skipped: 0 }
    }

    const batch = this.createBatch(pending)

    // Try aggregators in order (failover)
    for (const aggregator of this.config.aggregators) {
      try {
        const response = await this.send(aggregator, batch)
        if (response.accepted) {
          this.markSynced(pending.map((r) => r.id))
          return { synced: response.processed, skipped: allRecords.length - response.processed }
        }
      } catch {
        // Try next aggregator
      }
    }

    return { synced: 0, skipped: pending.length, error: 'all_aggregators_failed' }
  }

  private createBatch(records: TelemetryRecord[]): TelemetryBatch {
    return {
      batchId: `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      records: records.map((r) => this.sanitizeRecord(r))
    }
  }

  private sanitizeRecord(record: TelemetryRecord): TelemetryBatchRecord {
    // Strip local ID and status - only send schema + data + timestamp
    return {
      schemaId: record.schemaId,
      data: record.data,
      createdAt: record.createdAt
    }
  }

  private async send(aggregator: string, batch: TelemetryBatch): Promise<AggregatorResponse> {
    if (this.config.transport) {
      return this.config.transport(aggregator, batch)
    }

    // Default: no-op placeholder. Real implementation would use libp2p or HTTP.
    // This allows the provider to be fully testable without network deps.
    return { accepted: true, processed: batch.records.length }
  }
}
