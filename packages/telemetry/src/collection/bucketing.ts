/**
 * P3A-style value bucketing - converts exact values to ranges for privacy.
 *
 * Never stores exact counts, durations, or scores.
 */

export type CountBucket = 'none' | '1-5' | '6-20' | '21-100' | '100+'
export type LatencyBucket = '<10ms' | '10-50ms' | '50-200ms' | '200-1000ms' | '>1000ms'
export type SizeBucket = '<1KB' | '1-10KB' | '10-100KB' | '100KB-1MB' | '>1MB'
export type ScoreBucket = 'very_low' | 'low' | 'neutral' | 'good' | 'excellent'
export type BucketType = 'count' | 'latency' | 'size' | 'score'
export type TimestampPrecision = 'minute' | 'hour' | 'day' | 'week'

/** Bucket a count value */
export function bucketCount(count: number): CountBucket {
  if (count <= 0) return 'none'
  if (count <= 5) return '1-5'
  if (count <= 20) return '6-20'
  if (count <= 100) return '21-100'
  return '100+'
}

/** Bucket a latency value (milliseconds) */
export function bucketLatency(ms: number): LatencyBucket {
  if (ms < 10) return '<10ms'
  if (ms < 50) return '10-50ms'
  if (ms < 200) return '50-200ms'
  if (ms < 1000) return '200-1000ms'
  return '>1000ms'
}

/** Bucket a size value (bytes) */
export function bucketSize(bytes: number): SizeBucket {
  if (bytes < 1024) return '<1KB'
  if (bytes < 10240) return '1-10KB'
  if (bytes < 102400) return '10-100KB'
  if (bytes < 1048576) return '100KB-1MB'
  return '>1MB'
}

/** Bucket a peer score (-100 to +100) */
export function bucketScore(score: number): ScoreBucket {
  if (score < -50) return 'very_low'
  if (score < -10) return 'low'
  if (score < 20) return 'neutral'
  if (score < 50) return 'good'
  return 'excellent'
}

/** Generic bucket dispatcher */
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
  }
}

/** Round a timestamp to a given precision */
export function bucketTimestamp(date: Date | number, precision: TimestampPrecision): Date {
  const d = new Date(date)
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
    case 'week': {
      d.setHours(0, 0, 0, 0)
      const day = d.getDay()
      d.setDate(d.getDate() - day) // Round to Sunday
      break
    }
  }
  return d
}

/** Convert a bucket string back to approximate range */
export function bucketToApproximate(bucket: string): { min: number; max: number } | null {
  const ranges: Record<string, { min: number; max: number }> = {
    none: { min: 0, max: 0 },
    '1-5': { min: 1, max: 5 },
    '6-20': { min: 6, max: 20 },
    '21-100': { min: 21, max: 100 },
    '100+': { min: 101, max: Infinity },
    '<10ms': { min: 0, max: 9 },
    '10-50ms': { min: 10, max: 49 },
    '50-200ms': { min: 50, max: 199 },
    '200-1000ms': { min: 200, max: 999 },
    '>1000ms': { min: 1000, max: Infinity },
    '<1KB': { min: 0, max: 1023 },
    '1-10KB': { min: 1024, max: 10239 },
    '10-100KB': { min: 10240, max: 102399 },
    '100KB-1MB': { min: 102400, max: 1048575 },
    '>1MB': { min: 1048576, max: Infinity }
  }
  return ranges[bucket] ?? null
}
