/**
 * Scale regression rails (exploration 0272, Pillar 5).
 *
 * Seeds a deterministic large dataset — N nodes and an M-row change log, the
 * shape that caused the 0249→0260 cold-open saga (318k-row `changes` table) —
 * into a real on-disk better-sqlite3 database, then asserts the costs of the
 * hot read paths in the repo's deterministic regression currency: adapter
 * round-trips (0271), not wall-clock. Statement counts are identical on a
 * laptop and a loaded CI runner; milliseconds are not.
 *
 * Wall-clock ceilings exist but only bite in the soak lane (XNET_SOAK=1),
 * with deliberately generous bounds.
 *
 * Depth knobs: XNET_SCALE_NODES (PR default 5 000; soak 100 000) and
 * XNET_SCALE_CHANGES (PR default 20 000; soak 318 000 — the historical
 * regression scale).
 */

import type { DID, ContentId } from '@xnetjs/core'
import type { NodeState, NodeChange, NodePayload, SchemaIRI } from '@xnetjs/data'
import type { SQLiteAdapter } from '@xnetjs/sqlite'
import { existsSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SQLiteNodeStorageAdapter } from '@xnetjs/data'
import { createElectronSQLiteAdapter } from '@xnetjs/sqlite/electron'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { envInt, SimRng } from '../support/rng'

const NODES = envInt('XNET_SCALE_NODES', 5_000)
const CHANGES = envInt('XNET_SCALE_CHANGES', 20_000)
const SOAK = process.env.XNET_SOAK === '1'
const BATCH = 500

const SCHEMA_ID = 'xnet://xnet.fyi/Task' as SchemaIRI
const AUTHOR = 'did:key:z6MkscaleSuiteAuthor0272' as DID
const STATUSES = ['open', 'blocked', 'done', 'idea']

function nativeAvailable(): boolean {
  try {
    const req = createRequire(
      fileURLToPath(new URL('../../../packages/sqlite/package.json', import.meta.url))
    )
    req(req.resolve('better-sqlite3'))
    return true
  } catch {
    return false
  }
}

/** Count adapter round-trips — the 0271 regression currency. */
function countRoundTrips(real: SQLiteAdapter): {
  adapter: SQLiteAdapter
  counts: () => number
  reset: () => void
} {
  let calls = 0
  const counted = new Set(['run', 'query', 'queryOne', 'exec', 'applyNodeBatch'])
  const adapter = new Proxy(real, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof value === 'function' && counted.has(property as string)) {
        return (...args: unknown[]) => {
          calls += 1
          return (value as (...a: unknown[]) => unknown).apply(target, args)
        }
      }
      return typeof value === 'function' ? value.bind(target) : value
    }
  }) as SQLiteAdapter
  return { adapter, counts: () => calls, reset: () => (calls = 0) }
}

function makeNode(rng: SimRng, index: number): NodeState {
  const wallTime = 1_600_000_000_000 + index
  const properties: Record<string, unknown> = {
    title: `Task ${index}`,
    status: STATUSES[rng.int(STATUSES.length)],
    priority: rng.int(100),
    done: rng.chance(0.3)
  }
  return {
    id: `scale-node-${index}`,
    schemaId: SCHEMA_ID,
    properties,
    timestamps: Object.fromEntries(
      Object.keys(properties).map((key, i) => [
        key,
        { lamport: index * 8 + i + 1, author: AUTHOR, wallTime }
      ])
    ),
    deleted: false,
    createdAt: wallTime,
    createdBy: AUTHOR,
    updatedAt: wallTime,
    updatedBy: AUTHOR
  }
}

function makeChange(nodeIndex: number, lamport: number, rng: SimRng): NodeChange {
  return {
    id: `scale-change-${lamport}`,
    type: 'node-change',
    hash: `cid:blake3:scale-${lamport}` as ContentId,
    payload: {
      nodeId: `scale-node-${nodeIndex}`,
      properties: { priority: rng.int(100) }
    } as NodePayload,
    lamport,
    wallTime: 1_600_000_000_000 + lamport,
    authorDID: AUTHOR,
    parentHash: null,
    batchId: `scale-batch-${Math.floor(lamport / BATCH)}`,
    batchIndex: 0,
    batchSize: 1,
    signature: new Uint8Array([9])
  }
}

describe.skipIf(!nativeAvailable())(
  `scale rails: ${NODES} nodes / ${CHANGES} changes (0272)`,
  () => {
    const dbPath = join(tmpdir(), `xnet-scale-${process.pid}.db`)
    let db: SQLiteAdapter
    let counter: ReturnType<typeof countRoundTrips>
    let adapter: SQLiteNodeStorageAdapter
    let seedMs = 0

    beforeAll(async () => {
      db = await createElectronSQLiteAdapter({ path: dbPath })
      counter = countRoundTrips(db)
      adapter = new SQLiteNodeStorageAdapter(counter.adapter)

      const rng = new SimRng(0x5ca1e)
      const t0 = performance.now()
      // Seed N nodes in deterministic batches through the intended bulk-import
      // path (the typed adapter command — one adapter round-trip per batch).
      for (let start = 0; start < NODES; start += BATCH) {
        const nodes = Array.from({ length: Math.min(BATCH, NODES - start) }, (_, i) =>
          makeNode(rng, start + i)
        )
        await adapter.applyNodeBatch({
          batchId: `scale-seed-${start}`,
          nodes,
          changes: [],
          lastLamportTime: (start + nodes.length) * 8,
          affectedSchemaIds: [SCHEMA_ID],
          indexMode: 'touched',
          indexProperties: true
        })
      }
      // …then pad the change log to M rows (the cold-open regression shape),
      // riding the same bulk path so the log grows without per-row round-trips.
      const baseLamport = NODES * 8 + 1
      for (let start = 0; start < CHANGES; start += BATCH) {
        const changes = Array.from({ length: Math.min(BATCH, CHANGES - start) }, (_, i) =>
          makeChange(rng.int(NODES), baseLamport + start + i, rng)
        )
        await adapter.applyNodeBatch({
          batchId: `scale-pad-${start}`,
          nodes: [],
          changes,
          lastLamportTime: changes[changes.length - 1].lamport,
          affectedSchemaIds: [SCHEMA_ID],
          indexMode: 'touched',
          indexProperties: true
        })
      }
      await adapter.setLastLamportTime(baseLamport + CHANGES - 1)
      await adapter.analyze()
      seedMs = performance.now() - t0
    }, 600_000)

    afterAll(async () => {
      await db.close()
      for (const suffix of ['', '-wal', '-shm']) {
        if (existsSync(`${dbPath}${suffix}`)) rmSync(`${dbPath}${suffix}`, { force: true })
      }
    })

    it('seeding stays within its write-amplification budget (round-trips per row)', () => {
      // Seeding cost is itself a regression rail: each batch costs ~1 typed
      // adapter round-trip plus bounded preflight/bookkeeping. If a change
      // demotes the bulk path back to per-row statements, this explodes by
      // ~2 orders of magnitude (observed: 55k round-trips when the scalar
      // rebuild ran per-row) — exactly the class of regression to catch.
      const batches = Math.ceil(NODES / BATCH) + Math.ceil(CHANGES / BATCH)
      expect(counter.counts()).toBeLessThanOrEqual(batches * 8 + 64)
      if (SOAK) {
        // Generous ceiling (≥5× local p95) — only the soak lane enforces time.
        expect(seedMs).toBeLessThan(120_000)
      }
    })

    it('a filtered, ordered, limited query costs a bounded number of round-trips at any N', async () => {
      counter.reset()
      const t0 = performance.now()
      const result = await adapter.queryNodes({
        schemaId: SCHEMA_ID,
        includeDeleted: false,
        where: { status: 'open' },
        orderBy: { updatedAt: 'desc' },
        limit: 50
      })
      const elapsed = performance.now() - t0
      expect(result.nodes.length).toBeGreaterThan(0)
      expect(result.nodes.length).toBeLessThanOrEqual(50)
      // Budget: candidate query + hydrate + counts + bounded diagnostics. The
      // value is a recorded ceiling, not an aspiration — it must not grow with
      // N (that is the whole point), so a failure here means a round-trip
      // regression, not "the dataset got bigger".
      expect(counter.counts()).toBeLessThanOrEqual(12)
      if (SOAK) expect(elapsed).toBeLessThan(2_000)
    })

    it('reading the sync tail is one round-trip and does not scan the log', async () => {
      const highWater = await adapter.getLastLamportTime()
      counter.reset()
      const t0 = performance.now()
      const tail = await adapter.getChangesSince(Math.max(0, highWater - 100))
      const elapsed = performance.now() - t0
      expect(tail.length).toBeGreaterThan(0)
      expect(tail.length).toBeLessThanOrEqual(200)
      expect(counter.counts()).toBe(1)
      if (SOAK) expect(elapsed).toBeLessThan(1_000)
    })

    it('point reads stay O(1) round-trips against the full dataset', async () => {
      counter.reset()
      const node = await adapter.getNode(`scale-node-${Math.floor(NODES / 2)}`)
      expect(node).not.toBeNull()
      expect(node!.properties.title).toBe(`Task ${Math.floor(NODES / 2)}`)
      expect(counter.counts()).toBeLessThanOrEqual(3)
    })

    it('counting by schema is a single bounded round-trip', async () => {
      counter.reset()
      const count = await adapter.countNodes({ schemaId: SCHEMA_ID, includeDeleted: false })
      expect(count).toBe(NODES)
      expect(counter.counts()).toBeLessThanOrEqual(2)
    })
  }
)
