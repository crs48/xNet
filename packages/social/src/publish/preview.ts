/**
 * @xnetjs/social — what the user actually agrees to (0420 WP2).
 *
 * The ceremony shows the real record, not a description of one. A user
 * consenting to "publish your likes" has agreed to a sentence; a user looking
 * at three records exactly as they will appear in their repo has agreed to
 * bytes. Only the second is informed consent, and this is a one-way door.
 */

import type { PublishableEdge } from './types'
import type { BucketResult } from './buckets'
import { interactionToAffinity, interactionToBookmark } from './lenses'
import { toNodeProperties } from './queue'
import { projectRecord } from '@xnetjs/data'

export interface PublishPreview {
  /** How many records this run writes. */
  count: number
  /** Records per edge — 2 when the extension is on, 1 otherwise. */
  recordsPerEdge: number
  /** Real records, exactly as they will be written. */
  samples: Array<{ nodeId: string; bookmark: Record<string, unknown>; affinity?: Record<string, unknown> }>
  /** What is being left out, by reason — shown, never hidden. */
  excludedByReason: BucketResult['excludedByReason']
  /**
   * Rough wall-clock for the run at the PDS write budget (~11,700 creates/day).
   * Shown because "this will take nine days" is the single most useful thing a
   * user can learn before agreeing, and it is also the argument for selecting
   * less.
   */
  estimatedDays: number
}

const DAILY_CREATE_BUDGET = 11_700

/**
 * Build the preview for a selection.
 *
 * `sampleCount` defaults to 3: enough to show the shape and a little variance,
 * few enough that a person actually reads them.
 */
export function buildPublishPreview(
  bucket: BucketResult,
  options: { includeAffinity?: boolean; sampleCount?: number } = {}
): PublishPreview {
  const { includeAffinity = false, sampleCount = 3 } = options
  const recordsPerEdge = includeAffinity ? 2 : 1

  const samples = pickSamples(bucket.included, sampleCount).map((edge) => {
    const node = toNodeProperties(edge)
    const bookmark = projectRecord(interactionToBookmark, node)
    return {
      nodeId: edge.nodeId,
      bookmark,
      affinity: includeAffinity
        ? projectRecord(interactionToAffinity, { ...node, bookmarkUri: '<assigned at write time>' })
        : undefined
    }
  })

  const writes = bucket.included.length * recordsPerEdge
  return {
    count: writes,
    recordsPerEdge,
    samples,
    excludedByReason: bucket.excludedByReason,
    estimatedDays: writes / DAILY_CREATE_BUDGET
  }
}

/**
 * Spread samples across the selection rather than taking the first N.
 *
 * The first three edges of a sorted set are the three most similar edges in it,
 * which is the least informative sample a preview could show.
 */
export function pickSamples<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items]
  const step = items.length / count
  const out: T[] = []
  for (let i = 0; i < count; i++) out.push(items[Math.floor(i * step)])
  return out
}
