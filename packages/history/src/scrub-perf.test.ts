/**
 * Scrub seek latency validation (exploration 0329): a 5k-change page and a
 * 100k-change workspace seek at interactive latency (<100 ms per seek after
 * a warm ScrubCache), with states verified against golden replays.
 *
 * Changes are synthesized directly (unique hashes, chained parents, rising
 * lamports) — replay never verifies signatures, and signing 100k changes
 * would test the signer, not the scrubber.
 */

import type { ContentId, DID } from '@xnetjs/core'
import { MemoryNodeStorageAdapter } from '@xnetjs/data'
import type { NodeChange, NodeId, SchemaIRI } from '@xnetjs/data'
import { describe, it, expect } from 'vitest'
import { applyChangeToState, createEmptyState } from './engine'
import { ScopeTimeline, ScopeScrubCache } from './scope-timeline'
import { ScrubCache } from './scrub-cache'

const SCHEMA: SchemaIRI = 'xnet://bench/ScrubNode' as SchemaIRI
const AUTHOR = 'did:key:z6MkscrubBench' as DID

let lamportCounter = 1

function syntheticChange(nodeId: NodeId, index: number, parentHash: ContentId | null): NodeChange {
  const lamport = lamportCounter++
  return {
    id: `chg-${nodeId}-${index}`,
    type: 'node-change',
    payload: {
      nodeId,
      ...(index === 0 ? { schemaId: SCHEMA } : {}),
      properties: { title: `v${index}`, counter: index }
    },
    hash: `cid:blake3:${nodeId}-${index}` as ContentId,
    parentHash,
    authorDID: AUTHOR,
    signature: new Uint8Array(0),
    wallTime: 1_700_000_000_000 + lamport,
    lamport
  }
}

async function seedNode(
  adapter: MemoryNodeStorageAdapter,
  nodeId: NodeId,
  changeCount: number
): Promise<void> {
  let parent: ContentId | null = null
  for (let i = 0; i < changeCount; i++) {
    const change = syntheticChange(nodeId, i, parent)
    await adapter.appendChange(change)
    parent = change.hash
  }
}

describe('scrub seek latency (0329 validation)', () => {
  it('a 5k-change page seeks < 100ms per position after warm cache, correctly', async () => {
    const adapter = new MemoryNodeStorageAdapter()
    const pageId = 'page-5k' as NodeId
    await seedNode(adapter, pageId, 5_000)

    const cache = new ScrubCache(50)
    await cache.precompute(pageId, adapter)
    expect(cache.totalChanges).toBe(5_000)

    const positions = [0, 1_249, 2_500, 3_751, 4_999]
    for (const position of positions) {
      const t0 = performance.now()
      const state = await cache.getStateAt(position)
      const ms = performance.now() - t0
      expect(ms).toBeLessThan(100)
      // Golden replay: fold the log from genesis to the position.
      const changes = (await adapter.getChanges(pageId)).slice(0, position + 1)
      let golden = createEmptyState(pageId, changes[0])
      for (const change of changes) golden = applyChangeToState(golden, change)
      expect(state?.properties).toEqual(golden.properties)
    }
  })

  it('a 100k-change workspace seeks < 100ms per position after warm cache', async () => {
    const adapter = new MemoryNodeStorageAdapter()
    const nodeIds: NodeId[] = []
    // 200 members × 500 changes = 100k-change merged workspace line.
    for (let n = 0; n < 200; n++) {
      const nodeId = `ws-node-${n}` as NodeId
      nodeIds.push(nodeId)
      await seedNode(adapter, nodeId, 500)
    }

    const scope = new ScopeTimeline(adapter)
    const cache = new ScopeScrubCache(2_000)
    await cache.precompute(nodeIds, scope)
    expect(cache.totalChanges).toBe(100_000)

    // Cached interval positions seek instantly; off-interval positions fall
    // back to reconstruction — both must stay interactive.
    const positions = [0, 25_000 /* cached */, 25_017 /* fallback */, 99_999]
    for (const position of positions) {
      const t0 = performance.now()
      const states = await cache.getStatesAt(position, scope)
      const ms = performance.now() - t0
      expect(states.length).toBeGreaterThan(0)
      expect(ms).toBeLessThan(100)
    }

    // Spot-check correctness at the final position: every member at v499.
    const finalStates = await cache.getStatesAt(99_999, scope)
    expect(finalStates.length).toBe(200)
    for (const state of finalStates) {
      expect(state.properties.counter).toBe(499)
    }
  }, 60_000)
})
