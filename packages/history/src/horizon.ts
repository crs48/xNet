/**
 * History horizon (exploration 0329).
 *
 * After pruning, a node's retained chain no longer starts at genesis: the
 * earliest retained change has a non-null `parentHash` pointing at a deleted
 * ancestor. Targets that resolve below that point must fail *loudly* — the
 * pre-0329 behavior silently remapped index/wall targets onto the shortened
 * array, materializing the wrong state.
 */

import type { HistoryTarget } from './types'
import type { ContentId } from '@xnetjs/core'
import { TaggedError } from '@xnetjs/core'
import type { NodeChange, NodeId } from '@xnetjs/data'

/** The earliest retained point of a pruned chain. */
export interface HistoryHorizon {
  nodeId: NodeId
  /** Hash of the earliest retained change. */
  hash: ContentId
  wallTime: number
  lamport: number
}

/**
 * Thrown when a history target resolves below the prune horizon: the state
 * cannot be reconstructed on this device ("older history was compacted").
 */
export class HistoryHorizonError extends TaggedError<'HistoryHorizonError'> {
  readonly _tag = 'HistoryHorizonError' as const

  constructor(
    readonly horizon: HistoryHorizon,
    readonly target: HistoryTarget
  ) {
    super(
      `History for node ${horizon.nodeId} was compacted below ${new Date(
        horizon.wallTime
      ).toISOString()}; the requested target is unreachable on this device`
    )
  }
}

/**
 * The horizon of a topologically-sorted retained chain, or null when the
 * chain still starts at genesis (nothing pruned below it).
 */
export function horizonOf(nodeId: NodeId, sorted: readonly NodeChange[]): HistoryHorizon | null {
  const first = sorted[0]
  if (!first || first.parentHash === null) return null
  return {
    nodeId,
    hash: first.hash,
    wallTime: first.wallTime,
    lamport: first.lamport
  }
}
