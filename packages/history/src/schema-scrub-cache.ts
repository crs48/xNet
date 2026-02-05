/**
 * SchemaScrubCache - Pre-computed multi-node states for smooth database scrubbing
 *
 * Pre-computes the full database state (all rows) at regular intervals along
 * the merged schema timeline, enabling fast seeking for the Database Time Machine.
 */

import type { SchemaTimeline } from './schema-timeline'
import type { SchemaTimelineEntry } from './types'
import type { NodeState, SchemaIRI } from '@xnet/data'

export class SchemaScrubCache {
  private cache = new Map<number, NodeState[]>()
  private timeline: SchemaTimelineEntry[] = []
  private resolution: number

  constructor(resolution = 20) {
    this.resolution = resolution
  }

  /** Pre-compute database states at regular intervals along the timeline */
  async precompute(schemaIRI: SchemaIRI, schemaTimeline: SchemaTimeline): Promise<void> {
    this.timeline = await schemaTimeline.getMergedTimeline(schemaIRI)
    if (this.timeline.length === 0) return

    // Pre-compute states at intervals
    for (let i = 0; i < this.timeline.length; i += this.resolution) {
      const rows = await schemaTimeline.materializeSchemaAt(this.timeline, i)
      this.cache.set(i, rows)
    }

    // Always cache the final state
    const lastIdx = this.timeline.length - 1
    if (!this.cache.has(lastIdx)) {
      const rows = await schemaTimeline.materializeSchemaAt(this.timeline, lastIdx)
      this.cache.set(lastIdx, rows)
    }
  }

  /** Get rows at a position (uses nearest cache or falls back to reconstruction) */
  async getRowsAt(position: number, schemaTimeline: SchemaTimeline): Promise<NodeState[]> {
    if (this.timeline.length === 0) return []
    const clamped = Math.max(0, Math.min(position, this.timeline.length - 1))

    // Check exact cache hit
    if (this.cache.has(clamped)) return this.cache.get(clamped)!

    // Fallback: full reconstruction from the timeline
    return schemaTimeline.materializeSchemaAt(this.timeline, clamped)
  }

  /** Total number of changes in the merged timeline */
  get totalChanges(): number {
    return this.timeline.length
  }

  /** Get the merged timeline */
  getTimeline(): SchemaTimelineEntry[] {
    return this.timeline
  }

  /** Clear the cache */
  clear(): void {
    this.cache.clear()
    this.timeline = []
  }
}
