/**
 * DiffEngine - Compare node state between two points in time
 */

import type { HistoryEngine } from './engine'
import type { HistoryTarget, PropertyDiff, DiffResult } from './types'
import type { DID } from '@xnet/core'
import type { NodeId } from '@xnet/data'
import { deepEqual } from './utils'

export class DiffEngine {
  constructor(private engine: HistoryEngine) {}

  /** Compare a node between two points in time */
  async diffNode(nodeId: NodeId, from: HistoryTarget, to: HistoryTarget): Promise<DiffResult> {
    const [stateFrom, stateTo] = await Promise.all([
      this.engine.materializeAt(nodeId, from),
      this.engine.materializeAt(nodeId, to)
    ])

    const diffs: PropertyDiff[] = []
    const allKeys = new Set([
      ...Object.keys(stateFrom.node.properties),
      ...Object.keys(stateTo.node.properties)
    ])

    for (const key of allKeys) {
      const before = stateFrom.node.properties[key]
      const after = stateTo.node.properties[key]

      if (before === undefined && after !== undefined) {
        diffs.push({
          property: key,
          before: undefined,
          after,
          type: 'added',
          changedBy: (stateTo.node.timestamps?.[key]?.lamport?.author ?? stateTo.author) as DID,
          changedAt: stateTo.node.timestamps?.[key]?.wallTime ?? stateTo.timestamp
        })
      } else if (before !== undefined && after === undefined) {
        diffs.push({
          property: key,
          before,
          after: undefined,
          type: 'removed',
          changedBy: stateTo.author,
          changedAt: stateTo.timestamp
        })
      } else if (!deepEqual(before, after)) {
        diffs.push({
          property: key,
          before,
          after,
          type: 'modified',
          changedBy: (stateTo.node.timestamps?.[key]?.lamport?.author ?? stateTo.author) as DID,
          changedAt: stateTo.node.timestamps?.[key]?.wallTime ?? stateTo.timestamp
        })
      }
    }

    return {
      nodeId,
      from,
      to,
      diffs,
      summary: {
        added: diffs.filter((d) => d.type === 'added').length,
        modified: diffs.filter((d) => d.type === 'modified').length,
        removed: diffs.filter((d) => d.type === 'removed').length
      }
    }
  }

  /** Compare a node between current state and N changes ago */
  async diffFromCurrent(nodeId: NodeId, changesAgo: number): Promise<DiffResult> {
    return this.diffNode(nodeId, { type: 'relative', offset: -changesAgo }, { type: 'latest' })
  }

  /** Compare between two wall clock timestamps */
  async diffByTime(nodeId: NodeId, fromTime: number, toTime: number): Promise<DiffResult> {
    return this.diffNode(
      nodeId,
      { type: 'wall', timestamp: fromTime },
      { type: 'wall', timestamp: toTime }
    )
  }
}
