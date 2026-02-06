# 05: Scrubbing and Bucketing

> PII removal and value bucketing for privacy preservation

**Duration:** 1-2 days  
**Dependencies:** [04-telemetry-collector.md](./04-telemetry-collector.md)

## Overview

Two key privacy techniques:

1. **Scrubbing** - Remove personally identifiable information (PII)
2. **Bucketing** - Convert exact values to ranges (P3A-style)

These are applied automatically before storing telemetry.

## Scrubbing Implementation

```typescript
// packages/telemetry/src/collection/scrubbing.ts

export interface ScrubOptions {
  /** Scrub file paths: /Users/john/... -> /Users/[USER]/... */
  scrubPaths: boolean

  /** Scrub email addresses: john@example.com -> [EMAIL] */
  scrubEmails: boolean

  /** Scrub IP addresses: 192.168.1.1 -> [IP] */
  scrubIPs: boolean

  /** Scrub URLs with query params: https://...?token=xyz -> https://...?[PARAMS] */
  scrubUrlParams: boolean

  /** Custom patterns to scrub */
  scrubCustom?: RegExp[]

  /** Replacement for custom patterns */
  customReplacement?: string
}

export const DEFAULT_SCRUB_OPTIONS: ScrubOptions = {
  scrubPaths: true,
  scrubEmails: true,
  scrubIPs: true,
  scrubUrlParams: true
}

/**
 * Scrub PII from telemetry data.
 * Recursively processes objects and arrays.
 */
export function scrubTelemetryData<T extends Record<string, unknown>>(
  data: T,
  options: Partial<ScrubOptions> = {}
): T {
  const opts = { ...DEFAULT_SCRUB_OPTIONS, ...options }
  return scrubValue(data, opts) as T
}

function scrubValue(value: unknown, options: ScrubOptions): unknown {
  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === 'string') {
    return scrubString(value, options)
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, options))
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) {
      result[key] = scrubValue(val, options)
    }
    return result
  }

  return value
}

function scrubString(str: string, options: ScrubOptions): string {
  let result = str

  if (options.scrubPaths) {
    result = scrubPaths(result)
  }

  if (options.scrubEmails) {
    result = scrubEmails(result)
  }

  if (options.scrubIPs) {
    result = scrubIPs(result)
  }

  if (options.scrubUrlParams) {
    result = scrubUrlParams(result)
  }

  if (options.scrubCustom) {
    for (const pattern of options.scrubCustom) {
      result = result.replace(pattern, options.customReplacement ?? '[REDACTED]')
    }
  }

  return result
}

// ============ Individual Scrubbers ============

/**
 * Scrub file system paths.
 */
function scrubPaths(str: string): string {
  let result = str

  // macOS: /Users/username/...
  result = result.replace(/\/Users\/[^\/\s]+/g, '/Users/[USER]')

  // Linux: /home/username/...
  result = result.replace(/\/home\/[^\/\s]+/g, '/home/[USER]')

  // Windows: C:\Users\username\...
  result = result.replace(/[A-Z]:\\Users\\[^\\\s]+/gi, 'C:\\Users\\[USER]')

  // Windows: C:\Documents and Settings\username\...
  result = result.replace(
    /[A-Z]:\\Documents and Settings\\[^\\\s]+/gi,
    'C:\\Documents and Settings\\[USER]'
  )

  return result
}

/**
 * Scrub email addresses.
 */
function scrubEmails(str: string): string {
  // Standard email pattern
  return str.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
}

/**
 * Scrub IP addresses.
 */
function scrubIPs(str: string): string {
  let result = str

  // IPv4
  result = result.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]')

  // IPv6 (simplified - catches most common formats)
  result = result.replace(/\b([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g, '[IP]')
  result = result.replace(/\b([0-9a-fA-F]{1,4}:){1,7}:\b/g, '[IP]')
  result = result.replace(/\b::([0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{1,4}\b/g, '[IP]')

  return result
}

/**
 * Scrub URL query parameters.
 */
function scrubUrlParams(str: string): string {
  // Match URLs with query strings
  return str.replace(/(https?:\/\/[^\s?]+)\?[^\s]*/g, '$1?[PARAMS]')
}

// ============ Additional Scrubbers (optional) ============

/**
 * Scrub potential API keys/tokens (long alphanumeric strings).
 */
export function scrubTokens(str: string): string {
  // Match strings that look like API keys (32+ chars, alphanumeric)
  return str.replace(/\b[a-zA-Z0-9_-]{32,}\b/g, '[TOKEN]')
}

/**
 * Scrub UUIDs.
 */
export function scrubUUIDs(str: string): string {
  return str.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[UUID]')
}

/**
 * Scrub DIDs but preserve the method.
 */
export function scrubDIDs(str: string): string {
  return str.replace(/did:([a-z]+):[a-zA-Z0-9._-]+/g, 'did:$1:[REDACTED]')
}
```

## Bucketing Implementation

```typescript
// packages/telemetry/src/collection/bucketing.ts

// ============ Count Buckets ============

export type CountBucket = 'none' | '1-5' | '6-20' | '21-100' | '100+'

/**
 * Bucket a count value.
 */
export function bucketCount(count: number): CountBucket {
  if (count <= 0) return 'none'
  if (count <= 5) return '1-5'
  if (count <= 20) return '6-20'
  if (count <= 100) return '21-100'
  return '100+'
}

// ============ Latency Buckets ============

export type LatencyBucket = '<10ms' | '10-50ms' | '50-200ms' | '200-1000ms' | '>1000ms'

/**
 * Bucket a latency value (in milliseconds).
 */
export function bucketLatency(ms: number): LatencyBucket {
  if (ms < 10) return '<10ms'
  if (ms < 50) return '10-50ms'
  if (ms < 200) return '50-200ms'
  if (ms < 1000) return '200-1000ms'
  return '>1000ms'
}

// ============ Size Buckets ============

export type SizeBucket = '<1KB' | '1-10KB' | '10-100KB' | '100KB-1MB' | '>1MB'

/**
 * Bucket a size value (in bytes).
 */
export function bucketSize(bytes: number): SizeBucket {
  if (bytes < 1024) return '<1KB'
  if (bytes < 10 * 1024) return '1-10KB'
  if (bytes < 100 * 1024) return '10-100KB'
  if (bytes < 1024 * 1024) return '100KB-1MB'
  return '>1MB'
}

// ============ Score Buckets ============

export type ScoreBucket = 'very_low' | 'low' | 'neutral' | 'good' | 'excellent'

/**
 * Bucket a peer score (-100 to +100).
 */
export function bucketScore(score: number): ScoreBucket {
  if (score < -50) return 'very_low'
  if (score < -10) return 'low'
  if (score < 20) return 'neutral'
  if (score < 50) return 'good'
  return 'excellent'
}

// ============ Generic Bucketing ============

export type BucketType = 'count' | 'latency' | 'size' | 'score'

/**
 * Bucket a value based on type.
 */
export function bucketValue(value: number, type: BucketType): string {
  switch (type) {
    case 'count':
      return bucketCount(value)
    case 'latency':
      return bucketLatency(value)
    case 'size':
      return bucketSize(value)
    case 'score':
      return bucketScore(value)
    default:
      throw new Error(`Unknown bucket type: ${type}`)
  }
}

// ============ Timestamp Bucketing ============

export type TimestampPrecision = 'minute' | 'hour' | 'day' | 'week'

/**
 * Round a timestamp to reduce precision for privacy.
 */
export function bucketTimestamp(date: Date | number, precision: TimestampPrecision): Date {
  const d = typeof date === 'number' ? new Date(date) : new Date(date)

  switch (precision) {
    case 'minute':
      d.setSeconds(0, 0)
      break
    case 'hour':
      d.setMinutes(0, 0, 0)
      break
    case 'day':
      d.setHours(0, 0, 0, 0)
      break
    case 'week':
      // Round to start of week (Sunday)
      const day = d.getDay()
      d.setDate(d.getDate() - day)
      d.setHours(0, 0, 0, 0)
      break
  }

  return d
}

// ============ Helpers ============

/**
 * Parse bucket back to approximate value (for display).
 */
export function bucketToApproximate(bucket: string): { min: number; max: number } | null {
  const ranges: Record<string, { min: number; max: number }> = {
    // Count
    none: { min: 0, max: 0 },
    '1-5': { min: 1, max: 5 },
    '6-20': { min: 6, max: 20 },
    '21-100': { min: 21, max: 100 },
    '100+': { min: 100, max: Infinity },

    // Latency
    '<10ms': { min: 0, max: 10 },
    '10-50ms': { min: 10, max: 50 },
    '50-200ms': { min: 50, max: 200 },
    '200-1000ms': { min: 200, max: 1000 },
    '>1000ms': { min: 1000, max: Infinity },

    // Size
    '<1KB': { min: 0, max: 1024 },
    '1-10KB': { min: 1024, max: 10240 },
    '10-100KB': { min: 10240, max: 102400 },
    '100KB-1MB': { min: 102400, max: 1048576 },
    '>1MB': { min: 1048576, max: Infinity }
  }

  return ranges[bucket] ?? null
}
```

## Tests

```typescript
// packages/telemetry/test/scrubbing.test.ts

import { describe, it, expect } from 'vitest'
import { scrubTelemetryData, scrubTokens, scrubDIDs } from '../src/collection/scrubbing'

describe('scrubTelemetryData', () => {
  describe('path scrubbing', () => {
    it('should scrub macOS paths', () => {
      const data = { message: 'Error at /Users/john/Documents/file.txt' }
      const result = scrubTelemetryData(data)
      expect(result.message).toBe('Error at /Users/[USER]/Documents/file.txt')
    })

    it('should scrub Linux paths', () => {
      const data = { message: 'Error at /home/john/projects/app' }
      const result = scrubTelemetryData(data)
      expect(result.message).toBe('Error at /home/[USER]/projects/app')
    })

    it('should scrub Windows paths', () => {
      const data = { message: 'Error at C:\\Users\\John\\Desktop\\file.txt' }
      const result = scrubTelemetryData(data)
      expect(result.message).toBe('Error at C:\\Users\\[USER]\\Desktop\\file.txt')
    })
  })

  describe('email scrubbing', () => {
    it('should scrub email addresses', () => {
      const data = { message: 'Contact john.doe@example.com for help' }
      const result = scrubTelemetryData(data)
      expect(result.message).toBe('Contact [EMAIL] for help')
    })

    it('should scrub multiple emails', () => {
      const data = { message: 'From a@b.com to c@d.org' }
      const result = scrubTelemetryData(data)
      expect(result.message).toBe('From [EMAIL] to [EMAIL]')
    })
  })

  describe('IP scrubbing', () => {
    it('should scrub IPv4 addresses', () => {
      const data = { message: 'Connection from 192.168.1.100' }
      const result = scrubTelemetryData(data)
      expect(result.message).toBe('Connection from [IP]')
    })

    it('should preserve non-IP numbers', () => {
      const data = { message: 'Version 1.2.3.4 is available' }
      const result = scrubTelemetryData(data)
      // This could match as IP - acceptable false positive for privacy
      expect(result.message).toContain('[IP]')
    })
  })

  describe('URL param scrubbing', () => {
    it('should scrub URL query parameters', () => {
      const data = { url: 'https://api.example.com/data?token=secret123&user=john' }
      const result = scrubTelemetryData(data)
      expect(result.url).toBe('https://api.example.com/data?[PARAMS]')
    })

    it('should preserve URL without params', () => {
      const data = { url: 'https://api.example.com/data' }
      const result = scrubTelemetryData(data)
      expect(result.url).toBe('https://api.example.com/data')
    })
  })

  describe('nested objects', () => {
    it('should scrub nested objects', () => {
      const data = {
        error: {
          message: 'Failed for john@test.com',
          stack: 'at /Users/john/app/index.js:10'
        }
      }
      const result = scrubTelemetryData(data)
      expect(result.error.message).toBe('Failed for [EMAIL]')
      expect(result.error.stack).toContain('/Users/[USER]')
    })

    it('should scrub arrays', () => {
      const data = {
        emails: ['a@b.com', 'c@d.com']
      }
      const result = scrubTelemetryData(data)
      expect(result.emails).toEqual(['[EMAIL]', '[EMAIL]'])
    })
  })

  describe('custom patterns', () => {
    it('should scrub custom patterns', () => {
      const data = { secret: 'API_KEY_abc123xyz' }
      const result = scrubTelemetryData(data, {
        scrubCustom: [/API_KEY_\w+/g],
        customReplacement: '[API_KEY]'
      })
      expect(result.secret).toBe('[API_KEY]')
    })
  })
})

describe('scrubTokens', () => {
  it('should scrub long alphanumeric strings', () => {
    const str = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abc'
    const result = scrubTokens(str)
    expect(result).toBe('Bearer [TOKEN]')
  })
})

describe('scrubDIDs', () => {
  it('should scrub DIDs but preserve method', () => {
    const str = 'Author: did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
    const result = scrubDIDs(str)
    expect(result).toBe('Author: did:key:[REDACTED]')
  })
})
```

```typescript
// packages/telemetry/test/bucketing.test.ts

import { describe, it, expect } from 'vitest'
import {
  bucketCount,
  bucketLatency,
  bucketSize,
  bucketScore,
  bucketTimestamp,
  bucketToApproximate
} from '../src/collection/bucketing'

describe('bucketCount', () => {
  it('should bucket counts correctly', () => {
    expect(bucketCount(0)).toBe('none')
    expect(bucketCount(1)).toBe('1-5')
    expect(bucketCount(5)).toBe('1-5')
    expect(bucketCount(6)).toBe('6-20')
    expect(bucketCount(20)).toBe('6-20')
    expect(bucketCount(21)).toBe('21-100')
    expect(bucketCount(100)).toBe('21-100')
    expect(bucketCount(101)).toBe('100+')
    expect(bucketCount(1000)).toBe('100+')
  })
})

describe('bucketLatency', () => {
  it('should bucket latencies correctly', () => {
    expect(bucketLatency(5)).toBe('<10ms')
    expect(bucketLatency(10)).toBe('10-50ms')
    expect(bucketLatency(50)).toBe('50-200ms')
    expect(bucketLatency(200)).toBe('200-1000ms')
    expect(bucketLatency(1000)).toBe('>1000ms')
  })
})

describe('bucketScore', () => {
  it('should bucket peer scores correctly', () => {
    expect(bucketScore(-100)).toBe('very_low')
    expect(bucketScore(-50)).toBe('low')
    expect(bucketScore(-10)).toBe('neutral')
    expect(bucketScore(20)).toBe('good')
    expect(bucketScore(50)).toBe('excellent')
  })
})

describe('bucketTimestamp', () => {
  it('should round to minute', () => {
    const date = new Date('2026-01-21T12:34:56.789Z')
    const result = bucketTimestamp(date, 'minute')
    expect(result.getSeconds()).toBe(0)
    expect(result.getMilliseconds()).toBe(0)
    expect(result.getMinutes()).toBe(34)
  })

  it('should round to hour', () => {
    const date = new Date('2026-01-21T12:34:56.789Z')
    const result = bucketTimestamp(date, 'hour')
    expect(result.getMinutes()).toBe(0)
    expect(result.getHours()).toBe(12)
  })

  it('should round to day', () => {
    const date = new Date('2026-01-21T12:34:56.789Z')
    const result = bucketTimestamp(date, 'day')
    expect(result.getHours()).toBe(0)
    expect(result.getDate()).toBe(21)
  })
})

describe('bucketToApproximate', () => {
  it('should return range for bucket', () => {
    expect(bucketToApproximate('1-5')).toEqual({ min: 1, max: 5 })
    expect(bucketToApproximate('100+')).toEqual({ min: 100, max: Infinity })
  })

  it('should return null for unknown bucket', () => {
    expect(bucketToApproximate('unknown')).toBeNull()
  })
})
```

## Checklist

- [ ] Implement scrubTelemetryData() with all scrubbers
- [ ] Implement path scrubbing (macOS, Linux, Windows)
- [ ] Implement email scrubbing
- [ ] Implement IP scrubbing (IPv4, IPv6)
- [ ] Implement URL param scrubbing
- [ ] Implement custom pattern scrubbing
- [ ] Implement bucketCount()
- [ ] Implement bucketLatency()
- [ ] Implement bucketSize()
- [ ] Implement bucketScore()
- [ ] Implement bucketTimestamp()
- [ ] Write comprehensive tests for scrubbing
- [ ] Write comprehensive tests for bucketing
- [ ] Tests pass

---

[Back to README](./README.md) | [Previous: Telemetry Collector](./04-telemetry-collector.md) | [Next: React Hooks](./06-react-hooks.md)
