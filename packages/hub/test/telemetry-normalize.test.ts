import { describe, it, expect } from 'vitest'
import { classifyKind, clip, clipJson, hashDid, normalizeRecord } from '../src/telemetry/normalize'

describe('telemetry normalize', () => {
  describe('classifyKind', () => {
    it('maps schema IRIs to coarse kinds', () => {
      expect(classifyKind('xnet://xnet.fyi/telemetry/CrashReport')).toBe('crash')
      expect(classifyKind('xnet://xnet.fyi/telemetry/UsageMetric')).toBe('usage')
      expect(classifyKind('xnet://xnet.fyi/telemetry/PerformanceMetric')).toBe('performance')
      expect(classifyKind('xnet://xnet.fyi/telemetry/SecurityEvent')).toBe('security')
      expect(classifyKind('xnet://something/else')).toBe('event')
    })
  })

  describe('clip', () => {
    it('clips long strings and passes through short ones', () => {
      expect(clip('hello', 10)).toBe('hello')
      expect(clip('hello world', 5)).toBe('hello')
      expect(clip(undefined, 5)).toBeNull()
      expect(clip(null, 5)).toBeNull()
      expect(clip(42, 5)).toBe('42')
    })
  })

  describe('clipJson', () => {
    it('serializes and bounds payloads', () => {
      expect(clipJson({ a: 1 }, 100)).toBe('{"a":1}')
      expect(clipJson({}, 100)).toBeNull()
      expect(clipJson(null, 100)).toBeNull()
      expect(clipJson({ big: 'x'.repeat(50) }, 10)).toHaveLength(10)
    })
  })

  describe('hashDid', () => {
    it('is deterministic and salt-dependent', () => {
      const a = hashDid('did:key:zABC', 'salt1')
      const b = hashDid('did:key:zABC', 'salt1')
      const c = hashDid('did:key:zABC', 'salt2')
      expect(a).toBe(b)
      expect(a).not.toBe(c)
      expect(a).not.toContain('did:key')
    })
  })

  describe('normalizeRecord', () => {
    const now = 1_000_000

    it('flattens a usage record into an OTel-aligned row', () => {
      const row = normalizeRecord(
        {
          schemaId: 'xnet://xnet.fyi/telemetry/UsageMetric',
          createdAt: 555,
          data: {
            metricName: 'editor.save',
            metricBucket: '1-5',
            serviceVersion: '0.0.1',
            osType: 'macos'
          }
        },
        { didHash: 'hash123', now }
      )
      expect(row).not.toBeNull()
      expect(row).toMatchObject({
        ts: 555,
        producer: 'client',
        didHash: 'hash123',
        kind: 'usage',
        name: 'editor.save',
        valueBucket: '1-5',
        serviceVersion: '0.0.1',
        osType: 'macos'
      })
      expect(row!.attributes).toContain('editor.save')
    })

    it('reads name from eventName / exceptionType depending on kind', () => {
      const security = normalizeRecord(
        {
          schemaId: 'xnet://xnet.fyi/telemetry/SecurityEvent',
          createdAt: now,
          data: { eventName: 'hub.rate_limit.rejections', eventSeverity: 'medium' }
        },
        { didHash: null, now }
      )
      expect(security).toMatchObject({ kind: 'security', name: 'hub.rate_limit.rejections', severity: 'medium' })

      const crash = normalizeRecord(
        {
          schemaId: 'xnet://xnet.fyi/telemetry/CrashReport',
          createdAt: now,
          data: { exceptionType: 'RangeError' }
        },
        { didHash: null, now }
      )
      expect(crash).toMatchObject({ kind: 'crash', name: 'RangeError' })
    })

    it('returns null for a record with no schema', () => {
      expect(normalizeRecord({ data: {}, createdAt: now }, { didHash: null, now })).toBeNull()
    })

    it('falls back to now for a missing/invalid timestamp', () => {
      const row = normalizeRecord(
        { schemaId: 'xnet://x/UsageMetric', data: {} },
        { didHash: null, now }
      )
      expect(row!.ts).toBe(now)
    })

    it('honours an explicit producer', () => {
      const row = normalizeRecord(
        { schemaId: 'xnet://x/UsageMetric', data: {}, createdAt: now },
        { didHash: null, now, producer: 'hub' }
      )
      expect(row!.producer).toBe('hub')
    })
  })
})
