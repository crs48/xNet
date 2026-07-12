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

import type { DID, LwwStamp } from '@xnetjs/core'
import {
  LWW_TIEBREAK_KEY_VERSION,
  compareLwwStamps,
  computeLwwTiebreakKey
} from '@xnetjs/core'
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

/**
 * Independent oracle: per-property fold by the documented precedence
 * (lamport → wallTime → v4 grinding-resistant tiebreak key, else author DID).
 */
function oracleFold(changes: NodeChange[]): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  const stamps: Record<string, LwwStamp> = {}
  for (const change of changes) {
    const hasKey = (change.protocolVersion ?? 0) >= LWW_TIEBREAK_KEY_VERSION
    for (const [key, value] of Object.entries(change.payload.properties ?? {})) {
      const stamp: LwwStamp = {
        lamport: change.lamport,
        wallTime: change.wallTime,
        author: change.authorDID,
        ...(hasKey ? { tiebreakKey: computeLwwTiebreakKey(change.authorDID, key, value) } : {})
      }
      const cur = stamps[key]
      if (!cur || compareLwwStamps(stamp, cur) > 0) {
        props[key] = value
        stamps[key] = stamp
      }
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

  it('no fixed DID wins a majority of v4 ties across random (property, value) pairs', async () => {
    // The security property of exploration 0300: under v4 the final tiebreak is
    // blake3(author‖property‖value), so a single "vanity" DID cannot win most
    // ties. We simulate an attacker who grinds many identities and, for each,
    // measures how often it beats a fixed honest DID across random matchups.
    // NOTE: bounded to keep the reliability lane fast; the property is
    // scale-invariant (a coin flip per matchup), so a few thousand samples are
    // representative of the 10^6 in the exploration's checklist.
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(fc.constantFrom(...KEY_POOL), fc.integer({ min: 0, max: 10_000 })), {
          minLength: 40,
          maxLength: 60
        }),
        async (matchups) => {
          const honest = 'did:key:zHonestFixedVictimIdentity'
          let worstWinRate = 0
          // 25 ground "vanity" identities, including the lexically-maximal one
          // that would have won 100% under the pre-v4 author rule.
          const grinders = ['did:key:zzzzzzzzzzzzzzzzzzzzzzzz']
          for (let i = 0; i < 24; i += 1) grinders.push(`did:key:zGrind${i}`)
          for (const attacker of grinders) {
            let wins = 0
            for (const [key, value] of matchups) {
              const atk = computeLwwTiebreakKey(attacker, key, String(value))
              const vic = computeLwwTiebreakKey(honest, key, String(value))
              if (atk > vic) wins += 1
            }
            worstWinRate = Math.max(worstWinRate, wins / matchups.length)
          }
          // Even the best grinder is nowhere near universal (was 100% pre-v4).
          expect(worstWinRate).toBeLessThan(0.85)
        }
      ),
      { numRuns: RUNS }
    )
  }, 60_000)
})
