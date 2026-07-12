/**
 * Property-based convergence tests for the NodeStore LWW reducer
 * (exploration 0238, layer L1.5).
 *
 * Strong eventual consistency is the core promise that makes Electron ⇄ hub ⇄
 * web ⇄ native interop trustworthy: any two replicas that observe the SAME set
 * of changes must converge to the SAME materialized state, regardless of the
 * order in which those changes arrive. These tests author genuinely concurrent
 * edits from multiple signing identities (same node, same Lamport time), then
 * replay the resulting change set into fresh replicas in many shuffled orders
 * and assert byte-identical materialized properties.
 *
 * They exercise the real ingestion path — NodeStore.applyRemoteChange(s) and the
 * per-property LWW winner (Lamport time → wallTime → UTF-16 authorDID tiebreak,
 * `shouldReplace` in ./store.ts) — not a reimplementation. An independent
 * reference fold (`expectedProperties`) mirrors that precedence so the tests
 * prove correctness, not merely self-consistency.
 */
import type { NodeChange } from './types'
import type { SchemaIRI } from '../schema/node'
import type { DID, LwwStamp } from '@xnetjs/core'
import {
  LWW_TIEBREAK_KEY_VERSION,
  compareLwwStamps,
  computeLwwTiebreakKey
} from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { createDID } from '@xnetjs/identity'
import { describe, expect, it } from 'vitest'
import { MemoryNodeStorageAdapter } from './memory-adapter'
import { NodeStore } from './store'

const SCHEMA: SchemaIRI = 'xnet://xnet.fyi/Task'
const NODE_ID = 'shared-node'
const SEEDS = [1, 7, 42, 99, 1234, 65535, 2718281, 314159]

function makeStore(): { store: NodeStore; did: DID } {
  const keyPair = generateSigningKeyPair()
  const did = createDID(keyPair.publicKey) as DID
  const store = new NodeStore({
    storage: new MemoryNodeStorageAdapter(),
    authorDID: did,
    signingKey: keyPair.privateKey
  })
  return { store, did }
}

// Deterministic PRNG (mulberry32) so a failing shuffle is reproducible from its seed.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: readonly T[], seed: number): T[] {
  const rng = mulberry32(seed)
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function dedupeByHash(changes: readonly NodeChange[]): NodeChange[] {
  const seen = new Map<string, NodeChange>()
  for (const c of changes) seen.set(c.hash, c)
  return [...seen.values()]
}

/**
 * Independent reference fold: materialize the expected property map from a change
 * set using the documented LWW precedence (Lamport → wallTime → and, for v4+
 * changes, the grinding-resistant tiebreak key, else the UTF-16 author DID).
 * Per-property, mirroring `shouldReplace` in ./store.ts but written separately on
 * purpose, so a regression in the store reducer cannot also silently move the
 * oracle.
 */
function expectedProperties(changes: readonly NodeChange[]): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  const stamps: Record<string, LwwStamp> = {}
  for (const c of changes) {
    if (c.payload.deleted) continue
    const hasKey = (c.protocolVersion ?? 0) >= LWW_TIEBREAK_KEY_VERSION
    for (const [k, v] of Object.entries(c.payload.properties ?? {})) {
      const stamp: LwwStamp = {
        lamport: c.lamport,
        wallTime: c.wallTime,
        author: c.authorDID,
        ...(hasKey ? { tiebreakKey: computeLwwTiebreakKey(c.authorDID, k, v) } : {})
      }
      const cur = stamps[k]
      if (!cur || compareLwwStamps(stamp, cur) > 0) {
        props[k] = v
        stamps[k] = stamp
      }
    }
  }
  return props
}

async function materialize(changes: readonly NodeChange[]): Promise<Record<string, unknown>> {
  const { store } = makeStore()
  await store.applyRemoteChanges(changes.slice())
  const node = await store.get(NODE_ID)
  if (!node) throw new Error('node did not materialize')
  return node.properties
}

/**
 * Author a concurrent change set: a creator plus `peers` extra identities, each
 * issuing one update at the same Lamport time after observing the create. They
 * write one shared key ("title") plus a per-writer disjoint key, so every set
 * has both a real conflict and writes that must all survive.
 */
async function buildConcurrentChangeSet(peers: number): Promise<NodeChange[]> {
  const creator = makeStore()
  await creator.store.create({
    id: NODE_ID,
    schemaId: SCHEMA,
    properties: { title: 'origin', status: 'open' }
  })
  const createChanges = await creator.store.getAllChanges()

  const writers = [creator]
  for (let i = 0; i < peers; i += 1) {
    const peer = makeStore()
    await peer.store.applyRemoteChanges(createChanges.slice())
    writers.push(peer)
  }

  // Concurrent edits: each writer is at the same Lamport time post-create, so
  // their updates collide on "title" and the tiebreak chain decides the winner.
  await creator.store.update(NODE_ID, { properties: { title: 'from-0', only0: 0 } })
  for (let i = 1; i <= peers; i += 1) {
    await writers[i].store.update(NODE_ID, {
      properties: { title: `from-${i}`, [`only${i}`]: i }
    })
  }

  const all: NodeChange[] = []
  for (const w of writers) all.push(...(await w.store.getAllChanges()))
  return dedupeByHash(all)
}

describe('NodeStore convergence (strong eventual consistency)', () => {
  it('converges to identical state for any apply order (two concurrent writers)', async () => {
    const changes = await buildConcurrentChangeSet(1)
    const oracle = expectedProperties(changes)

    const results = SEEDS.map((s) => shuffle(changes, s))
    const materialized = []
    for (const order of results) materialized.push(await materialize(order))

    // Every shuffle yields the same state...
    for (const m of materialized) expect(m).toEqual(materialized[0])
    // ...and that state matches the independent LWW oracle.
    expect(materialized[0]).toMatchObject(oracle)
    // Disjoint concurrent writes both survive; the contended key has one winner.
    expect(materialized[0]).toMatchObject({ status: 'open', only0: 0, only1: 1 })
    expect(['from-0', 'from-1']).toContain(materialized[0].title)
  })

  it('converges under incremental causal delivery (one change at a time)', async () => {
    const changes = await buildConcurrentChangeSet(1)
    const oracle = expectedProperties(changes)
    const createChange = changes.find((c) => c.payload.schemaId !== undefined)
    expect(createChange).toBeDefined()
    const updates = changes.filter((c) => c !== createChange)

    const finals: Array<Record<string, unknown>> = []
    for (const seed of SEEDS) {
      const { store } = makeStore()
      await store.applyRemoteChange(createChange!) // causal root arrives first
      for (const c of shuffle(updates, seed)) {
        await store.applyRemoteChange(c)
      }
      const node = await store.get(NODE_ID)
      finals.push(node!.properties)
    }

    for (const f of finals) expect(f).toEqual(finals[0])
    expect(finals[0]).toMatchObject(oracle)
  })

  it('resolves same-property conflicts by the documented precedence', async () => {
    const changes = await buildConcurrentChangeSet(1)
    // The winner under (Lamport → wallTime → tiebreak key / author), computed by
    // the independent per-property reference fold.
    const expectedTitle = expectedProperties(changes).title

    const materialized = await materialize(shuffle(changes, 12345))
    expect(materialized.title).toBe(expectedTitle)
  })

  it('converges with three-way concurrent fan-in', async () => {
    const changes = await buildConcurrentChangeSet(2)
    const oracle = expectedProperties(changes)

    const materialized = []
    for (const seed of SEEDS) materialized.push(await materialize(shuffle(changes, seed)))

    for (const m of materialized) expect(m).toEqual(materialized[0])
    expect(materialized[0]).toMatchObject(oracle)
    // All three writers' disjoint keys survive the merge.
    expect(materialized[0]).toMatchObject({ only0: 0, only1: 1, only2: 2 })
  })
})
