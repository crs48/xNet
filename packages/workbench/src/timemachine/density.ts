/**
 * Change-density bucketing for the Time Machine minibar (exploration 0329):
 * changes bucketed by wall time over the timeline's span, rendered as a thin
 * strip of bars above the scrubber so bursts of activity are visible at a
 * glance. Pure so it stays unit-testable.
 */

export interface DensityBucket {
  /** Changes whose wallTime falls in this bucket. */
  count: number
  /** Inclusive wall-time start of the bucket. */
  start: number
  /** Exclusive wall-time end (inclusive for the last bucket). */
  end: number
  /** Timeline index of the first change in the bucket, or -1 when empty. */
  firstIndex: number
}

/**
 * Bucket `wallTimes` (assumed roughly ascending, as timeline order is) into
 * `bucketCount` equal wall-time spans. A single instant (or single change)
 * collapses into one occupied bucket.
 */
export function bucketDensity(wallTimes: readonly number[], bucketCount: number): DensityBucket[] {
  if (wallTimes.length === 0 || bucketCount <= 0) return []

  let min = Infinity
  let max = -Infinity
  for (const t of wallTimes) {
    if (t < min) min = t
    if (t > max) max = t
  }

  const span = max - min
  if (span === 0) {
    return [{ count: wallTimes.length, start: min, end: max, firstIndex: 0 }]
  }

  const width = span / bucketCount
  const buckets: DensityBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    count: 0,
    start: min + i * width,
    end: min + (i + 1) * width,
    firstIndex: -1
  }))

  wallTimes.forEach((t, index) => {
    const bucketIndex = Math.min(Math.floor((t - min) / width), bucketCount - 1)
    const bucket = buckets[bucketIndex]
    bucket.count += 1
    if (bucket.firstIndex === -1 || index < bucket.firstIndex) bucket.firstIndex = index
  })

  return buckets
}

/** The bucket index a wall time falls into, mirroring {@link bucketDensity}. */
export function bucketIndexFor(buckets: readonly DensityBucket[], wallTime: number): number {
  if (buckets.length === 0) return -1
  for (let i = 0; i < buckets.length; i++) {
    if (wallTime < buckets[i].end || i === buckets.length - 1) return i
  }
  return buckets.length - 1
}
