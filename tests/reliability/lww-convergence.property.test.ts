/**
 * LWW convergence property (exploration 0272, Pillar 1).
 *
 * Generalises packages/data/src/store/convergence.test.ts (fixed seeds,
 * hand-built change sets) with generated ones: arbitrary concurrent update
 * sets from three identities — including cross-author Lamport ties and
 * wallTime ties, the hardest cases for the ordering triple — delivered to
 * three real NodeStore replicas in arbitrary chunked orders WITH duplication,
 * followed by one full anti-entropy delivery (the reconnect shape: the
 * protocol guarantees convergence under eventual delivery, not under
 * message loss).
 *
 * Every replica must materialize the identical state, and that state must
 * match an independent oracle fold of the documented precedence
 * (lamport → wallTime → author code-units) — proving correctness, not just
 * self-consistency.
 *
 * fast-check prints a seed + counterexample path on failure; replay with
 * `fc.assert(..., { seed, path })`. Depth via XNET_PBT_RUNS.
 */

import type { DID } from '@xnetjs/core'
import type { NodeChange, NodePayload } from '@xnetjs/data'
import { MemoryNodeStorageAdapter, NodeStore } from '@xnetjs/data'
import { identityFromPrivateKey } from '@xnetjs/identity'
import { createUnsignedChange, signChange } from '@xnetjs/sync'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { SimRng } from './support/rng'

const RUNS = Number.parseInt(process.env.XNET_PBT_RUNS ?? '', 10) || 20
const NODE_ID = 'pbt-node'
const SCHEMA_ID = 'xnet://xnet.fyi/Task'
const KEY_POOL = ['title', 'status', 'count'] as const

// Deterministic identities so counterexamples replay exactly.
const IDENTITIES = [11, 22, 33].map((seed) => {
  const privateKey = new SimRng(seed).bytes32()
  const identity = identityFromPrivateKey(privateKey)
  return { privateKey, did: identity.did as DID }
})

interface UpdateSpec {
  author: number
  key: (typeof KEY_POOL)[number]
  value: number
  wall: number
}

const arbUpdates = fc.array(
  fc.record({
    author: fc.nat(IDENTITIES.length - 1),
    key: fc.constantFrom(...KEY_POOL),
    value: fc.integer({ min: 0, max: 999 }),
    // A tiny wallTime domain forces cross-author (lamport, wallTime) ties —
    // the case only the author tiebreak can resolve.
    wall: fc.constantFrom(1_000, 2_000)
  }),
  { minLength: 1, maxLength: 12 }
)

/**
 * Build the signed change set: one create (author 0, lamport 1) plus one
 * change per update spec. Per-author lamports increase strictly (like the
 * real clock — an author never reuses a lamport), while cross-author
 * collisions stay likely.
 */
function buildChangeSet(updates: UpdateSpec[]): NodeChange[] {
  const changes: NodeChange[] = []
  const creator = IDENTITIES[0]
  changes.push(
    signChange(
      createUnsignedChange({
        id: 'pbt-create',
        type: 'node-change',
        payload: { nodeId: NODE_ID, schemaId: SCHEMA_ID, properties: {} } as NodePayload,
        parentHash: null,
        authorDID: creator.did,
        lamport: 1,
        wallTime: 500
      }),
      creator.privateKey
    ) as NodeChange
  )
  const clocks = IDENTITIES.map(() => 1)
  updates.forEach((update, index) => {
    const identity = IDENTITIES[update.author]
    clocks[update.author] += 1
    changes.push(
      signChange(
        createUnsignedChange({
          id: `pbt-update-${index}`,
          type: 'node-change',
          payload: {
            nodeId: NODE_ID,
            properties: { [update.key]: update.value }
          } as NodePayload,
          parentHash: null,
          authorDID: identity.did,
          lamport: clocks[update.author],
          wallTime: update.wall
        }),
        identity.privateKey
      ) as NodeChange
    )
  })
  return changes
}

/** Independent oracle: fold by the documented precedence. */
function oracleFold(changes: NodeChange[]): Record<string, unknown> {
  const ordered = [...changes].sort(
    (a, b) =>
      a.lamport - b.lamport ||
      a.wallTime - b.wallTime ||
      (a.authorDID < b.authorDID ? -1 : a.authorDID > b.authorDID ? 1 : 0)
  )
  const props: Record<string, unknown> = {}
  for (const change of ordered) {
    for (const [key, value] of Object.entries(change.payload.properties ?? {})) {
      props[key] = value
    }
  }
  return props
}

/** Chaotic chunked delivery with duplication, then one full anti-entropy pass. */
async function deliverChaotically(
  store: NodeStore,
  changes: NodeChange[],
  scheduleSeed: number
): Promise<void> {
  const rng = new SimRng(scheduleSeed)
  const shuffled = rng.shuffle(changes)
  let cursor = 0
  while (cursor < shuffled.length) {
    const size = 1 + rng.int(4)
    const chunk = shuffled.slice(cursor, cursor + size)
    cursor += size
    await store.applyRemoteChanges(chunk.slice())
    if (rng.chance(0.3)) await store.applyRemoteChanges(chunk.slice()) // duplicate delivery
  }
  await store.applyRemoteChanges(changes.slice()) // eventual full delivery
}

describe('LWW convergence property (0272)', () => {
  it('replicas converge to the oracle under any chunked, duplicated delivery order', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbUpdates,
        fc.integer({ min: 0, max: 2 ** 30 }),
        async (updates, scheduleSeed) => {
          const changes = buildChangeSet(updates)
          const oracle = oracleFold(changes)

          const states: Array<Record<string, unknown>> = []
          for (let replica = 0; replica < 3; replica += 1) {
            const identity = IDENTITIES[replica]
            const store = new NodeStore({
              storage: new MemoryNodeStorageAdapter(),
              authorDID: identity.did,
              signingKey: identity.privateKey
            })
            await deliverChaotically(store, changes, scheduleSeed ^ (replica * 0x9e3779b9))
            const node = await store.get(NODE_ID)
            expect(node, `replica ${replica} materialized nothing`).not.toBeNull()
            states.push(node!.properties)
          }

          for (const state of states) expect(state).toEqual(states[0])
          expect(states[0]).toEqual(oracle)
        }
      ),
      { numRuns: RUNS }
    )
  }, 120_000)
})
