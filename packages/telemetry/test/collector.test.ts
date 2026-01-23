import { describe, it, expect, beforeEach } from 'vitest'
import { TelemetryCollector } from '../src/collection/collector'
import { ConsentManager, MemoryConsentStorage } from '../src/consent'
import { TelemetrySchemaIRIs } from '../src/schemas'

describe('TelemetryCollector', () => {
  let consent: ConsentManager
  let collector: TelemetryCollector

  beforeEach(async () => {
    consent = new ConsentManager({
      storage: new MemoryConsentStorage(),
      autoLoad: false
    })
    collector = new TelemetryCollector({ consent })
  })

  describe('consent gating', () => {
    it('blocks all reports when tier is off', () => {
      const id = collector.report('xnet://test', { data: 'test' })
      expect(id).toBeNull()
    })

    it('allows reports when tier meets requirement', async () => {
      await consent.setTier('local')
      const id = collector.report('xnet://test', { data: 'test' }, { minTier: 'local' })
      expect(id).not.toBeNull()
    })

    it('blocks reports when tier is below requirement', async () => {
      await consent.setTier('local')
      const id = collector.report('xnet://test', { data: 'test' }, { minTier: 'crashes' })
      expect(id).toBeNull()
    })
  })

  describe('reportCrash', () => {
    it('requires crashes tier', async () => {
      await consent.setTier('local')
      const id = collector.reportCrash(new Error('test'))
      expect(id).toBeNull()

      await consent.setTier('crashes')
      const id2 = collector.reportCrash(new Error('test'))
      expect(id2).not.toBeNull()
    })

    it('captures error name and message', async () => {
      await consent.setTier('crashes')
      collector.reportCrash(new RangeError('Invalid length'))

      const records = collector.getLocalTelemetry()
      expect(records).toHaveLength(1)
      expect(records[0].data.exceptionType).toBe('RangeError')
      expect(records[0].data.exceptionMessage).toContain('Invalid length')
    })

    it('scrubs PII from error messages', async () => {
      await consent.setTier('crashes')
      collector.reportCrash(new Error('Failed at /Users/john/project/file.ts'))

      const records = collector.getLocalTelemetry()
      expect(records[0].data.exceptionMessage).toContain('/Users/[USER]')
      expect(records[0].data.exceptionMessage).not.toContain('john')
    })

    it('includes context fields', async () => {
      await consent.setTier('crashes')
      collector.reportCrash(new Error('fail'), {
        codeNamespace: 'sync',
        serviceVersion: '1.0.0'
      })

      const records = collector.getLocalTelemetry()
      expect(records[0].data.codeNamespace).toBe('sync')
      expect(records[0].data.serviceVersion).toBe('1.0.0')
    })
  })

  describe('reportUsage', () => {
    it('requires anonymous tier', async () => {
      await consent.setTier('crashes')
      const id = collector.reportUsage('docs_created', 5)
      expect(id).toBeNull()

      await consent.setTier('anonymous')
      const id2 = collector.reportUsage('docs_created', 5)
      expect(id2).not.toBeNull()
    })

    it('buckets values', async () => {
      await consent.setTier('anonymous')
      collector.reportUsage('docs_created', 42)

      const records = collector.getLocalTelemetry()
      expect(records[0].data.metricBucket).toBe('21-100')
    })

    it('stores period', async () => {
      await consent.setTier('anonymous')
      collector.reportUsage('syncs', 10, 'weekly')

      const records = collector.getLocalTelemetry()
      expect(records[0].data.period).toBe('weekly')
    })
  })

  describe('reportPerformance', () => {
    it('buckets duration', async () => {
      await consent.setTier('anonymous')
      collector.reportPerformance('query_time', 75)

      const records = collector.getLocalTelemetry()
      expect(records[0].data.durationBucket).toBe('50-200ms')
    })
  })

  describe('reportSecurityEvent', () => {
    it('only requires local tier', async () => {
      await consent.setTier('local')
      const id = collector.reportSecurityEvent('xnet.security.invalid_signature', 'high', {
        peerId: 'test'
      })
      expect(id).not.toBeNull()
    })

    it('truncates details to 200 chars', async () => {
      await consent.setTier('local')
      const longDetails: Record<string, unknown> = { data: 'x'.repeat(500) }
      collector.reportSecurityEvent('xnet.security.anomaly_detected', 'medium', longDetails)

      const records = collector.getLocalTelemetry()
      const details = records[0].data.eventDetails as string
      expect(details.length).toBeLessThanOrEqual(200)
    })
  })

  describe('getLocalTelemetry', () => {
    it('filters by schemaId', async () => {
      await consent.setTier('identified')
      collector.reportCrash(new Error('a'))
      collector.reportUsage('metric', 1)

      const crashes = collector.getLocalTelemetry({
        schemaId: TelemetrySchemaIRIs.CrashReport
      })
      expect(crashes).toHaveLength(1)
    })

    it('filters by status', async () => {
      await consent.setTier('identified')
      const id = collector.reportCrash(new Error('a'))!
      collector.reportCrash(new Error('b'))

      collector.approveForSharing(id)

      const pending = collector.getLocalTelemetry({ status: 'pending' })
      expect(pending).toHaveLength(1)
    })

    it('respects limit', async () => {
      await consent.setTier('identified')
      for (let i = 0; i < 10; i++) {
        collector.reportCrash(new Error(`error ${i}`))
      }

      const limited = collector.getLocalTelemetry({ limit: 3 })
      expect(limited).toHaveLength(3)
    })
  })

  describe('deletion', () => {
    it('deletes specific records', async () => {
      await consent.setTier('identified')
      const id1 = collector.reportCrash(new Error('a'))!
      collector.reportCrash(new Error('b'))

      collector.deleteTelemetry(id1)
      expect(collector.getLocalTelemetry()).toHaveLength(1)
    })

    it('deletes all records', async () => {
      await consent.setTier('identified')
      collector.reportCrash(new Error('a'))
      collector.reportCrash(new Error('b'))

      collector.deleteAllTelemetry()
      expect(collector.getLocalTelemetry()).toHaveLength(0)
    })
  })

  describe('status management', () => {
    it('approves for sharing', async () => {
      await consent.setTier('identified')
      const id = collector.reportCrash(new Error('a'))!

      collector.approveForSharing(id)
      const records = collector.getLocalTelemetry()
      expect(records[0].status).toBe('pending')
    })

    it('dismisses records', async () => {
      await consent.setTier('identified')
      const id = collector.reportCrash(new Error('a'))!

      collector.dismiss(id)
      const records = collector.getLocalTelemetry()
      expect(records[0].status).toBe('dismissed')
    })
  })

  describe('getStats', () => {
    it('counts records by status', async () => {
      await consent.setTier('identified')
      const id1 = collector.reportCrash(new Error('a'))!
      collector.reportCrash(new Error('b'))
      collector.approveForSharing(id1)

      const stats = collector.getStats()
      expect(stats.total).toBe(2)
      expect(stats.pending).toBe(1)
      expect(stats.local).toBe(1)
    })
  })
})
