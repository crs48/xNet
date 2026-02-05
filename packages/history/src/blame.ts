/**
 * BlameEngine - Per-property attribution history
 *
 * Shows who last edited each property and the full history of changes
 * for each field.
 */

import type { DID } from '@xnet/core'
import { topologicalSort } from '@xnet/sync'
import type { NodeStorageAdapter, NodeId } from '@xnet/data'
import type { BlameInfo } from './types'

export class BlameEngine {
  constructor(private storage: NodeStorageAdapter) {}

  /** Get blame info for all properties of a node */
  async getBlame(nodeId: NodeId): Promise<BlameInfo[]> {
    const changes = await this.storage.getChanges(nodeId)
    const sorted = topologicalSort(changes)

    const blame = new Map<string, BlameInfo>()

    for (let i = 0; i < sorted.length; i++) {
      const change = sorted[i]
      for (const [prop, value] of Object.entries(change.payload.properties ?? {})) {
        if (!blame.has(prop)) {
          blame.set(prop, {
            property: prop,
            currentValue: value,
            lastChangedBy: change.authorDID,
            lastChangedAt: change.wallTime,
            totalEdits: 0,
            history: []
          })
        }

        const info = blame.get(prop)!
        info.currentValue = value
        info.lastChangedBy = change.authorDID
        info.lastChangedAt = change.wallTime
        info.totalEdits++
        info.history.push({
          value,
          author: change.authorDID,
          wallTime: change.wallTime,
          lamport: change.lamport,
          changeHash: change.hash,
          changeIndex: i
        })
      }
    }

    return [...blame.values()]
  }

  /** Get blame for a specific property */
  async getPropertyBlame(nodeId: NodeId, property: string): Promise<BlameInfo | null> {
    const all = await this.getBlame(nodeId)
    return all.find((b) => b.property === property) ?? null
  }

  /** Get "what changed since" summary */
  async getChangesSince(
    nodeId: NodeId,
    since: number
  ): Promise<{
    properties: string[]
    authors: DID[]
    changeCount: number
  }> {
    const changes = await this.storage.getChanges(nodeId)
    const recent = changes.filter((c) => c.wallTime > since)
    return {
      properties: [...new Set(recent.flatMap((c) => Object.keys(c.payload.properties ?? {})))],
      authors: [...new Set(recent.map((c) => c.authorDID))],
      changeCount: recent.length
    }
  }
}
