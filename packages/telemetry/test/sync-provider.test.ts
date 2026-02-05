import type { TelemetryRecord } from '../src/collection/collector'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ConsentManager } from '../src/consent/manager'
import { MemoryConsentStorage } from '../src/consent/storage'
import { TelemetrySyncProvider } from '../src/sync/provider'

describe('TelemetrySyncProvider', () => {
  let consent: ConsentManager
  let records: TelemetryRecord[]
  let syncedIds: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let transport: any
  let provider: TelemetrySyncProvider

  beforeEach(async () => {
    vi.useFakeTimers()

    consent = new ConsentManager({
      storage: new MemoryConsentStorage(),
      autoLoad: false
    })

    records = []
    syncedIds = []
    transport = vi.fn().mockResolvedValue({ accepted: true, processed: 0 })
  })

  afterEach(() => {
    provider?.destroy()
    vi.useRealTimers()
  })

  function createProvider(overrides = {}) {
    provider = new TelemetrySyncProvider(
      {
        aggregators: ['aggregator-1', 'aggregator-2'],
        syncIntervalMs: 1000,
        jitterMs: 0, // No jitter for predictable tests
        batchSize: 10,
        transport,
        ...overrides
      },
      consent,
      () => records,
      (ids) => {
        syncedIds.push(...ids)
      }
    )
    return provider
  }

  function addPendingRecord(id: string): TelemetryRecord {
    const record: TelemetryRecord = {
      id,
      schemaId: 'xnet://xnet.fyi/telemetry/UsageMetric',
      data: { metricName: 'test', metricBucket: '1-5' },
      createdAt: Date.now(),
      status: 'pending'
    }
    records.push(record)
    return record
  }

  describe('initialization', () => {
    it('should not start when sharing disabled', () => {
      createProvider()
      expect(provider.isStarted).toBe(false)
    })

    it('should start when sharing already enabled', async () => {
      await consent.setTier('crashes')
      createProvider()
      expect(provider.isStarted).toBe(true)
    })
  })

  describe('consent changes', () => {
    it('should start syncing when tier upgraded to crashes', async () => {
      createProvider()
      expect(provider.isStarted).toBe(false)

      await consent.setTier('crashes')
      expect(provider.isStarted).toBe(true)
    })

    it('should start syncing when tier upgraded to anonymous', async () => {
      createProvider()
      await consent.setTier('anonymous')
      expect(provider.isStarted).toBe(true)
    })

    it('should stop syncing when tier downgraded to local', async () => {
      await consent.setTier('crashes')
      createProvider()
      expect(provider.isStarted).toBe(true)

      await consent.setTier('local')
      expect(provider.isStarted).toBe(false)
    })

    it('should stop syncing when tier set to off', async () => {
      await consent.setTier('anonymous')
      createProvider()

      await consent.setTier('off')
      expect(provider.isStarted).toBe(false)
    })
  })

  describe('syncNow', () => {
    it('should return error when sharing not enabled', async () => {
      createProvider()
      const result = await provider.syncNow()
      expect(result.synced).toBe(0)
      expect(result.error).toBe('sharing_not_enabled')
    })

    it('should sync pending records', async () => {
      await consent.setTier('anonymous')
      createProvider()

      addPendingRecord('r1')
      addPendingRecord('r2')

      transport.mockResolvedValueOnce({ accepted: true, processed: 2 })

      const result = await provider.syncNow()
      expect(result.synced).toBe(2)
      expect(syncedIds).toEqual(['r1', 'r2'])
    })

    it('should return 0 when no pending records', async () => {
      await consent.setTier('crashes')
      createProvider()

      const result = await provider.syncNow()
      expect(result.synced).toBe(0)
      expect(result.skipped).toBe(0)
    })

    it('should skip non-pending records', async () => {
      await consent.setTier('crashes')
      createProvider()

      records.push({
        id: 'local-only',
        schemaId: 'test',
        data: {},
        createdAt: Date.now(),
        status: 'local' // Not pending
      })

      const result = await provider.syncNow()
      expect(result.synced).toBe(0)
    })

    it('should respect batchSize', async () => {
      await consent.setTier('crashes')
      createProvider({ batchSize: 3 })

      for (let i = 0; i < 10; i++) addPendingRecord(`r${i}`)

      transport.mockResolvedValueOnce({ accepted: true, processed: 3 })

      const result = await provider.syncNow()
      expect(result.synced).toBe(3)
      expect(syncedIds).toHaveLength(3)
    })

    it('should prevent concurrent syncs', async () => {
      await consent.setTier('crashes')
      createProvider()
      addPendingRecord('r1')

      // Slow transport using a deferred promise
      let resolveTransport: (value: any) => void
      transport.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveTransport = resolve
          })
      )

      const p1 = provider.syncNow()
      const result2 = await provider.syncNow() // Should get "already_syncing" immediately

      expect(result2.error).toBe('already_syncing')

      // Now resolve the first sync
      resolveTransport!({ accepted: true, processed: 1 })
      const result1 = await p1
      expect(result1.synced).toBe(1)
    })
  })

  describe('aggregator failover', () => {
    it('should try next aggregator on failure', async () => {
      await consent.setTier('crashes')
      createProvider()
      addPendingRecord('r1')

      // First aggregator fails, second succeeds
      transport
        .mockRejectedValueOnce(new Error('connection refused'))
        .mockResolvedValueOnce({ accepted: true, processed: 1 })

      const result = await provider.syncNow()
      expect(result.synced).toBe(1)
      expect(transport).toHaveBeenCalledTimes(2)
      expect(transport.mock.calls[0][0]).toBe('aggregator-1')
      expect(transport.mock.calls[1][0]).toBe('aggregator-2')
    })

    it('should report error when all aggregators fail', async () => {
      await consent.setTier('crashes')
      createProvider()
      addPendingRecord('r1')

      transport
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))

      const result = await provider.syncNow()
      expect(result.synced).toBe(0)
      expect(result.error).toBe('all_aggregators_failed')
      expect(syncedIds).toHaveLength(0) // Not marked as synced
    })

    it('should not mark as synced if aggregator rejects', async () => {
      await consent.setTier('crashes')
      createProvider({ aggregators: ['only-one'] })
      addPendingRecord('r1')

      transport.mockResolvedValueOnce({ accepted: false, processed: 0, error: 'quota exceeded' })

      const result = await provider.syncNow()
      expect(result.synced).toBe(0)
      expect(syncedIds).toHaveLength(0)
    })
  })

  describe('batch creation', () => {
    it('should strip local IDs from batch records', async () => {
      await consent.setTier('crashes')
      createProvider()
      addPendingRecord('secret-local-id')

      transport.mockImplementation(async (_agg: string, batch: any) => {
        // Batch records should not contain the local ID
        for (const record of batch.records) {
          expect(record).not.toHaveProperty('id')
          expect(record).not.toHaveProperty('status')
          expect(record).toHaveProperty('schemaId')
          expect(record).toHaveProperty('data')
          expect(record).toHaveProperty('createdAt')
        }
        return { accepted: true, processed: batch.records.length }
      })

      await provider.syncNow()
      expect(transport).toHaveBeenCalledTimes(1)
    })

    it('should include batch metadata', async () => {
      await consent.setTier('crashes')
      createProvider()
      addPendingRecord('r1')

      transport.mockImplementation(async (_agg: string, batch: any) => {
        expect(batch.batchId).toMatch(/^batch_/)
        expect(batch.timestamp).toBeGreaterThan(0)
        expect(batch.records).toHaveLength(1)
        return { accepted: true, processed: 1 }
      })

      await provider.syncNow()
    })
  })

  describe('periodic sync', () => {
    it('should auto-sync on interval', async () => {
      await consent.setTier('crashes')
      createProvider({ syncIntervalMs: 1000, jitterMs: 0 })
      addPendingRecord('r1')

      transport.mockResolvedValue({ accepted: true, processed: 1 })

      // Advance past first interval
      await vi.advanceTimersByTimeAsync(1001)

      expect(transport).toHaveBeenCalledTimes(1)
    })

    it('should stop periodic sync on destroy', async () => {
      await consent.setTier('crashes')
      createProvider({ syncIntervalMs: 1000, jitterMs: 0 })

      provider.destroy()

      await vi.advanceTimersByTimeAsync(2000)
      expect(transport).not.toHaveBeenCalled()
    })
  })

  describe('start/stop', () => {
    it('should be idempotent', async () => {
      await consent.setTier('crashes')
      createProvider()

      provider.start()
      provider.start() // Should not throw or create duplicate timers
      expect(provider.isStarted).toBe(true)
    })

    it('should stop cleanly', async () => {
      await consent.setTier('crashes')
      createProvider()

      provider.stop()
      expect(provider.isStarted).toBe(false)
    })
  })
})
