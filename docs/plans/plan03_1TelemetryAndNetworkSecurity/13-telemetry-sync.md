# 13: Telemetry Sync

> Opt-in telemetry sharing with aggregator nodes

**Duration:** 2 days  
**Dependencies:** [04-telemetry-collector.md](./04-telemetry-collector.md), existing sync infrastructure

## Overview

When users opt into sharing telemetry (tier >= 'crashes'), telemetry nodes can be synced to aggregator nodes. This uses the existing xNet sync infrastructure with some modifications for privacy.

## Implementation

### Telemetry Sync Provider

```typescript
// packages/telemetry/src/sync/provider.ts

import type { SyncProvider, Change } from '@xnet/sync'
import type { ConsentManager } from '../consent/manager'
import type { TelemetryRecord } from '../collection/collector'
import { scheduleWithJitter } from '../collection/timing'

/**
 * Configuration for telemetry sync.
 */
export interface TelemetrySyncConfig {
  /** Aggregator node addresses */
  aggregators: string[]

  /** Sync interval in ms (default: 5 minutes) */
  syncIntervalMs?: number

  /** Maximum records per sync batch */
  batchSize?: number

  /** Random jitter range in ms (default: 0-60000) */
  jitterMs?: number
}

/**
 * Telemetry-specific sync provider.
 *
 * Key differences from regular sync:
 * 1. Only syncs outbound (to aggregators)
 * 2. Strips any remaining PII before sync
 * 3. Uses random timing for privacy
 * 4. Only syncs when consent allows
 */
export class TelemetrySyncProvider {
  private syncTimer: NodeJS.Timeout | null = null
  private pendingSync = false

  constructor(
    private config: TelemetrySyncConfig,
    private consent: ConsentManager,
    private getRecords: () => Promise<TelemetryRecord[]>,
    private markSynced: (ids: string[]) => Promise<void>
  ) {
    // Listen for consent changes
    this.consent.on('tier-changed', this.handleConsentChange.bind(this))

    // Start sync timer if sharing enabled
    if (this.consent.isSharingEnabled) {
      this.startSyncTimer()
    }
  }

  /**
   * Stop the sync provider.
   */
  stop(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer)
      this.syncTimer = null
    }
  }

  /**
   * Manually trigger a sync (respects consent).
   */
  async syncNow(): Promise<{ synced: number; skipped: number }> {
    if (!this.consent.isSharingEnabled) {
      return { synced: 0, skipped: 0 }
    }

    if (this.pendingSync) {
      return { synced: 0, skipped: 0 } // Already syncing
    }

    this.pendingSync = true
    try {
      return await this.performSync()
    } finally {
      this.pendingSync = false
    }
  }

  // ============ Private ============

  private startSyncTimer(): void {
    const interval = this.config.syncIntervalMs ?? 5 * 60_000
    const jitter = this.config.jitterMs ?? 60_000

    const scheduleNext = () => {
      this.syncTimer = scheduleWithJitter(
        async () => {
          await this.syncNow()
          scheduleNext()
        },
        { minDelay: interval, maxDelay: interval + jitter }
      )
    }

    scheduleNext()
  }

  private stopSyncTimer(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer)
      this.syncTimer = null
    }
  }

  private handleConsentChange(oldTier: string, newTier: string): void {
    const wasSharing = this.tierAllowsSharing(oldTier)
    const nowSharing = this.tierAllowsSharing(newTier)

    if (!wasSharing && nowSharing) {
      // Start syncing
      this.startSyncTimer()
    } else if (wasSharing && !nowSharing) {
      // Stop syncing
      this.stopSyncTimer()
    }
  }

  private tierAllowsSharing(tier: string): boolean {
    return ['crashes', 'anonymous', 'identified'].includes(tier)
  }

  private async performSync(): Promise<{ synced: number; skipped: number }> {
    // Get pending records
    const records = await this.getRecords()
    const toSync = records
      .filter((r) => r.status === 'pending')
      .slice(0, this.config.batchSize ?? 100)

    if (toSync.length === 0) {
      return { synced: 0, skipped: 0 }
    }

    // Final privacy check - strip any remaining sensitive data
    const sanitized = toSync.map((r) => this.sanitizeForSync(r))

    // Sync to aggregators
    let synced = 0
    for (const aggregator of this.config.aggregators) {
      try {
        await this.sendToAggregator(aggregator, sanitized)
        synced = sanitized.length
        break // Success, don't need to try other aggregators
      } catch (error) {
        console.warn(`Failed to sync to ${aggregator}:`, error)
      }
    }

    // Mark as synced
    if (synced > 0) {
      await this.markSynced(toSync.map((r) => r.id))
    }

    return { synced, skipped: records.length - synced }
  }

  private sanitizeForSync(record: TelemetryRecord): object {
    // Remove any fields that shouldn't be synced
    const { id, ...rest } = record

    return {
      ...rest.properties,
      schemaId: record.schemaId
      // Don't include local ID or any other identifying info
    }
  }

  private async sendToAggregator(aggregator: string, records: object[]): Promise<void> {
    // In a real implementation, this would use the network layer
    // to send to the aggregator node

    // For now, just a placeholder
    console.log(`Would sync ${records.length} records to ${aggregator}`)

    // TODO: Implement actual aggregator protocol
    // - Connect to aggregator via libp2p
    // - Send batch of telemetry records
    // - Receive acknowledgment
  }
}
```

### Aggregator Protocol

```typescript
// packages/telemetry/src/sync/protocol.ts

/**
 * Telemetry aggregator protocol definition.
 *
 * This is a simple push-only protocol where clients send
 * telemetry batches to aggregators.
 */

export const TELEMETRY_PROTOCOL = '/xnet/telemetry/1.0.0'

/**
 * Telemetry batch message.
 */
export interface TelemetryBatch {
  /** Batch ID for deduplication */
  batchId: string

  /** Timestamp of batch creation */
  timestamp: number

  /** Telemetry records */
  records: TelemetryRecord[]

  /** App identifier (for routing) */
  appId?: string
}

/**
 * Aggregator response.
 */
export interface AggregatorResponse {
  /** Whether batch was accepted */
  accepted: boolean

  /** Number of records processed */
  processed: number

  /** Error message if not accepted */
  error?: string
}

// Protocol handler would be implemented in @xnet/network
```

## Usage Example

```typescript
import { TelemetrySyncProvider } from '@xnet/telemetry/sync'

// Configure sync
const syncProvider = new TelemetrySyncProvider(
  {
    aggregators: [
      '/ip4/aggregator1.xnet.dev/tcp/4001/p2p/12D3KooW...',
      '/ip4/aggregator2.xnet.dev/tcp/4001/p2p/12D3KooW...'
    ],
    syncIntervalMs: 5 * 60_000, // 5 minutes
    batchSize: 100,
    jitterMs: 60_000 // 0-1 minute random delay
  },
  consentManager,
  () => collector.getLocalTelemetry({ status: 'pending' }),
  (ids) => collector.markSynced(ids)
)

// Manual sync trigger (if user wants immediate feedback)
document.getElementById('send-report').onclick = async () => {
  const result = await syncProvider.syncNow()
  console.log(`Synced ${result.synced} records`)
}
```

## Checklist

- [ ] Create TelemetrySyncProvider class
- [ ] Implement consent-aware sync timing
- [ ] Implement batch collection and sanitization
- [ ] Define aggregator protocol
- [ ] Implement aggregator connection (placeholder)
- [ ] Add random jitter for privacy
- [ ] Handle consent changes (start/stop sync)
- [ ] Write tests
- [ ] Tests pass

---

[Back to README](./README.md) | [Previous: Allowlist/Denylist](./12-allowlist-denylist.md) | [Next: Security Dashboard](./14-security-dashboard.md)
