/**
 * Cross-implementation LWW conformance (explorations 0200/0276).
 *
 * The protocol's Last-Write-Wins ordering now lives in ONE place —
 * `@xnetjs/core`'s `compareLwwStamps` — and every materializer must fold a
 * change set to exactly the state that ordering predicts. This suite replays
 * concurrent, signed change sets in shuffled orders through BOTH storage
 * implementations (the in-memory adapter and the SQLite adapter, whose LWW
 * lives in SQL `ON CONFLICT` guards) and asserts each result equals the
 * shared-comparator oracle. The golden-vector corpus derives the same rule in
 * `packages/runtime/src/conformance.test.ts`; the hub's change ordering is
 * pinned in `packages/hub/test/lww-order.test.ts`.
 */
import type { DID } from '@xnetjs/core'
import {
  LWW_TIEBREAK_KEY_VERSION,
  compareLwwStamps,
  computeLwwTiebreakKey,
  type LwwStamp
} from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { createDID } from '@xnetjs/identity'
import { createMemorySQLiteAdapter } from '@xnetjs/sqlite/memory'
import { createUnsignedChange, signChange } from '@xnetjs/sync'
import { describe, expect, it } from 'vitest'
import type { SchemaIRI } from '../schema/node'
import type { NodeChange, NodeStorageAdapter } from './types'
import { MemoryNodeStorageAdapter } from './memory-adapter'
import { SQLiteNodeStorageAdapter } from './sqlite-adapter'
import { NodeStore } from './store'

const SCHEMA: SchemaIRI = 'xnet://xnet.fyi/Task'
const NODE_ID = 'conformance-node'
const SHUFFLE_SEEDS = [1, 42, 99, 314159]

function makeStore(storage: NodeStorageAdapter = new MemoryNodeStorageAdapter()): NodeStore {
  const keyPair = generateSigningKeyPair()
  const did = createDID(keyPair.publicKey) as DID
  return new NodeStore({
    storage,
    authorDID: did,
    signingKey: keyPair.privateKey
  })
}

// Deterministic PRNG (mulberry32) so a failing shuffle reproduces from its seed.
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
 * The oracle: fold properties using the SHARED comparator from
 * `@xnetjs/core`. Any implementation that converges somewhere else disagrees
 * with the protocol ordering itself, not merely with a sibling.
 */
function oracleFold(changes: readonly NodeChange[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const stamps: Record<string, LwwStamp> = {}
  for (const change of changes) {
    const hasKey = (change.protocolVersion ?? 0) >= LWW_TIEBREAK_KEY_VERSION
    for (const [key, value] of Object.entries(change.payload.properties ?? {})) {
      // Mirror the store: v4+ changes carry a grinding-resistant tiebreak key
      // (exploration 0300); legacy changes fall back to the author DID.
      const stamp: LwwStamp = {
        lamport: change.lamport,
        wallTime: change.wallTime,
        author: change.authorDID,
        ...(hasKey ? { tiebreakKey: computeLwwTiebreakKey(change.authorDID, key, value) } : {})
      }
      const current = stamps[key]
      if (!current || compareLwwStamps(stamp, current) > 0) {
        properties[key] = value
        stamps[key] = stamp
      }
    }
  }
  return properties
}

/** Concurrent writers: same Lamport time, one shared key + disjoint keys. */
async function buildConcurrentChangeSet(peers: number): Promise<NodeChange[]> {
  const creator = makeStore()
  await creator.create({
    id: NODE_ID,
    schemaId: SCHEMA,
    properties: { title: 'origin', status: 'open' }
  })
  const createChanges = await creator.getAllChanges()

  const writers = [creator]
  for (let i = 0; i < peers; i += 1) {
    const peer = makeStore()
    await peer.applyRemoteChanges(createChanges.slice())
    writers.push(peer)
  }

  await creator.update(NODE_ID, { properties: { title: 'from-0', only0: 0 } })
  for (let i = 1; i <= peers; i += 1) {
    await writers[i].update(NODE_ID, {
      properties: { title: `from-${i}`, [`only${i}`]: i }
    })
  }

  const all: NodeChange[] = []
  for (const w of writers) all.push(...(await w.getAllChanges()))
  return dedupeByHash(all)
}

async function materializeVia(
  makeStorage: () => Promise<NodeStorageAdapter> | NodeStorageAdapter,
  changes: readonly NodeChange[],
  nodeId: string = NODE_ID
): Promise<Record<string, unknown>> {
  const store = makeStore(await makeStorage())
  await store.applyRemoteChanges(changes.slice())
  const node = await store.get(nodeId)
  if (!node) throw new Error('node did not materialize')
  return node.properties
}

describe('LWW conformance across implementations (0200 golden ordering)', () => {
  it('memory adapter, SQLite adapter, and the shared oracle agree for every order', async () => {
    const changes = await buildConcurrentChangeSet(2)
    const oracle = oracleFold(changes)

    for (const seed of SHUFFLE_SEEDS) {
      const order = shuffle(changes, seed)

      const viaMemory = await materializeVia(() => new MemoryNodeStorageAdapter(), order)
      expect(viaMemory, `memory adapter diverged from oracle (seed ${seed})`).toEqual(oracle)

      const viaSqlite = await materializeVia(async () => {
        const db = await createMemorySQLiteAdapter()
        return new SQLiteNodeStorageAdapter(db)
      }, order)
      expect(viaSqlite, `sqlite adapter diverged from oracle (seed ${seed})`).toEqual(oracle)
    }
  })

  it('mixed protocol versions converge (v3 vs v4): no split-brain', async () => {
    // A legacy v3 change (no tiebreak key) and a v4 change (has one) write the
    // same property at the same lamport+wallTime. Because only ONE side carries
    // a key, the comparator MUST fall back to the author DID — the same result
    // old (v3-only) code computes — so mixed fleets don't diverge. Both adapters
    // and the shared oracle must agree, in every delivery order.
    const NODE = 'mixed-version-node'
    const mkChange = (
      seedFill: number,
      value: string,
      protocolVersion: number,
      lamport: number
    ): NodeChange => {
      const keyPair = generateSigningKeyPair()
      const did = createDID(keyPair.publicKey) as DID
      const unsigned = createUnsignedChange({
        id: `mv-${protocolVersion}-${seedFill}`,
        type: 'node-change',
        payload: { nodeId: NODE, schemaId: SCHEMA, properties: { title: value } },
        parentHash: null,
        authorDID: did,
        wallTime: 1000,
        lamport
      })
      // Force the protocol version (the hash covers it) to simulate a fleet
      // where one peer predates protocol v4.
      unsigned.protocolVersion = protocolVersion
      return signChange(unsigned, keyPair.privateKey) as NodeChange
    }

    // Same lamport+wallTime, different authors and versions → author tiebreak.
    const v3 = mkChange(0xa1, 'from-v3', 3, 5)
    const v4 = mkChange(0xb2, 'from-v4', 4, 5)
    const changes = [v3, v4]
    const oracle = oracleFold(changes)
    // The oracle (falls back to author since one side lacks a key) is what a
    // pre-v4 peer would also compute — that is the no-split-brain guarantee.

    for (const seed of SHUFFLE_SEEDS) {
      const order = seed % 2 === 0 ? changes : [...changes].reverse()
      const viaMemory = await materializeVia(() => new MemoryNodeStorageAdapter(), order, NODE)
      const viaSqlite = await materializeVia(
        async () => {
          const db = await createMemorySQLiteAdapter()
          return new SQLiteNodeStorageAdapter(db)
        },
        order,
        NODE
      )
      expect(viaMemory).toEqual(oracle)
      expect(viaSqlite).toEqual(oracle)
    }
  })

  it('author tiebreak converges by code units in both adapters (golden vector 0004)', async () => {
    // Two writers with identical lamport+wallTime force the author tiebreak.
    // We can't choose DIDs (they're derived from keys), so instead assert the
    // adapters agree with the oracle — which resolves the tie via the shared
    // code-unit comparator — over many independent identity draws.
    for (let round = 0; round < 5; round += 1) {
      const changes = await buildConcurrentChangeSet(1)
      const oracle = oracleFold(changes)
      const viaMemory = await materializeVia(() => new MemoryNodeStorageAdapter(), changes)
      const viaSqlite = await materializeVia(async () => {
        const db = await createMemorySQLiteAdapter()
        return new SQLiteNodeStorageAdapter(db)
      }, changes)
      expect(viaMemory).toEqual(oracle)
      expect(viaSqlite).toEqual(oracle)
    }
  })
})
