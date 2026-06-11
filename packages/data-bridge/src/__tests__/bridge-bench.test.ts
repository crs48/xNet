/**
 * Bench comparison for the 0164 worker-resident data layer rollout.
 *
 * Runs the same query-update fanout and bulk-import workloads against
 * MainThreadBridge and the DataWorker host (in-process; the postMessage
 * hop is not part of these numbers) and logs the timings so regressions
 * in either invalidation pipeline show up in CI output. Assertions are
 * deliberately loose sanity bounds — the printed timings are the signal.
 */

import type { QueryDelta } from '../worker/worker-types'
import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { defineSchema, text, number, MemoryNodeStorageAdapter, NodeStore } from '@xnetjs/data'
import { createDID } from '@xnetjs/identity'
import { describe, it, expect, vi } from 'vitest'
import { MainThreadBridge } from '../main-thread-bridge'
import { createQueryDescriptor, serializeQueryDescriptor } from '../query-descriptor'
import { DataWorker } from '../worker/data-worker-host'

const BenchSchema = defineSchema({
  name: 'BenchTask',
  namespace: 'xnet://bench.local/',
  version: '1.0.0',
  properties: {
    title: text({ required: true }),
    rank: number({})
  }
})

const NODE_COUNT = 200
const SUBSCRIPTION_COUNT = 20
const UPDATE_COUNT = 100
const BULK_IMPORT_COUNT = 1000

function createStore(): NodeStore {
  const keyPair = generateSigningKeyPair()
  return new NodeStore({
    storage: new MemoryNodeStorageAdapter(),
    authorDID: createDID(keyPair.publicKey) as DID,
    signingKey: keyPair.privateKey
  })
}

async function createWorkerHost(): Promise<DataWorker> {
  const keyPair = generateSigningKeyPair()
  const worker = new DataWorker()
  await worker.initialize({
    dbName: 'bench',
    authorDID: createDID(keyPair.publicKey) as DID,
    signingKey: Array.from(keyPair.privateKey)
  })
  return worker
}

describe('bridge benchmarks (0164 rollout comparison)', () => {
  it('compares query-update fanout between main-thread bridge and worker host', async () => {
    // ── Main-thread bridge ──
    const store = createStore()
    await store.initialize()
    const bridge = new MainThreadBridge(store)

    const mainNodes: string[] = []
    for (let i = 0; i < NODE_COUNT; i++) {
      const node = await bridge.create(BenchSchema, { title: `Node ${i}`, rank: i })
      mainNodes.push(node.id)
    }

    let mainNotifications = 0
    const unsubscribes: Array<() => void> = []
    for (let i = 0; i < SUBSCRIPTION_COUNT; i++) {
      const sub = bridge.query(BenchSchema, { orderBy: { rank: 'asc' }, limit: 50 + i })
      unsubscribes.push(sub.subscribe(() => mainNotifications++))
    }
    await vi.waitFor(() => {
      expect(
        bridge.query(BenchSchema, { orderBy: { rank: 'asc' }, limit: 50 }).getSnapshot()
      ).not.toBeNull()
    })

    const mainStart = performance.now()
    for (let i = 0; i < UPDATE_COUNT; i++) {
      await bridge.update(mainNodes[i % 40], { title: `Updated ${i}` })
    }
    await vi.waitFor(() => expect(mainNotifications).toBeGreaterThan(0))
    const mainElapsed = performance.now() - mainStart
    unsubscribes.forEach((fn) => fn())
    bridge.destroy()

    // ── Worker host ──
    const worker = await createWorkerHost()
    const workerNodes: string[] = []
    for (let i = 0; i < NODE_COUNT; i++) {
      const node = await worker.create(BenchSchema._schemaId, { title: `Node ${i}`, rank: i })
      workerNodes.push(node.id)
    }

    let workerDeltas = 0
    for (let i = 0; i < SUBSCRIPTION_COUNT; i++) {
      const options = { orderBy: { rank: 'asc' as const }, limit: 50 + i }
      const queryId = serializeQueryDescriptor(
        createQueryDescriptor(BenchSchema._schemaId, options)
      )
      await worker.subscribe(queryId, BenchSchema._schemaId, options, () => workerDeltas++)
    }

    const workerStart = performance.now()
    for (let i = 0; i < UPDATE_COUNT; i++) {
      await worker.update(workerNodes[i % 40], { title: `Updated ${i}` })
    }
    await vi.waitFor(() => expect(workerDeltas).toBeGreaterThan(0))
    const workerElapsed = performance.now() - workerStart
    await worker.destroy()

    console.log(
      `[bench] query-update fanout (${SUBSCRIPTION_COUNT} subs × ${UPDATE_COUNT} updates): ` +
        `main-thread ${mainElapsed.toFixed(1)}ms (${mainNotifications} notifications), ` +
        `worker-host ${workerElapsed.toFixed(1)}ms (${workerDeltas} deltas)`
    )

    // Sanity bounds only — both pipelines must stay interactive-scale.
    expect(mainElapsed).toBeLessThan(10_000)
    expect(workerElapsed).toBeLessThan(10_000)
  }, 30_000)

  it('compares bulk import handling between main-thread bridge and worker host', async () => {
    const drafts = Array.from({ length: BULK_IMPORT_COUNT }, (_, i) => ({
      id: `bulk-${i}`,
      schemaId: BenchSchema._schemaId,
      properties: { title: `Bulk ${i}`, rank: i }
    }))

    // ── Main-thread bridge ──
    const store = createStore()
    await store.initialize()
    const bridge = new MainThreadBridge(store)
    const sub = bridge.query(BenchSchema, { orderBy: { rank: 'asc' } })
    const unsubscribe = sub.subscribe(() => {})
    await vi.waitFor(() => expect(sub.getSnapshot()).not.toBeNull())

    const mainStart = performance.now()
    await bridge.bulkWrite({ kind: 'deterministic-import', drafts })
    await vi.waitFor(() => expect(sub.getSnapshot()?.length).toBe(BULK_IMPORT_COUNT))
    const mainElapsed = performance.now() - mainStart
    unsubscribe()
    bridge.destroy()

    // ── Worker host ──
    const worker = await createWorkerHost()
    const queryId = serializeQueryDescriptor(
      createQueryDescriptor(BenchSchema._schemaId, { orderBy: { rank: 'asc' as const } })
    )
    const deltas: QueryDelta[] = []
    await worker.subscribe(
      queryId,
      BenchSchema._schemaId,
      { orderBy: { rank: 'asc' as const } },
      (delta) => deltas.push(delta)
    )

    const workerStart = performance.now()
    await worker.bulkWrite({ kind: 'deterministic-import', drafts })
    await vi.waitFor(() => {
      const reload = deltas.find(
        (delta): delta is Extract<QueryDelta, { type: 'reload' }> => delta.type === 'reload'
      )
      expect(reload?.data.length).toBe(BULK_IMPORT_COUNT)
    })
    const workerElapsed = performance.now() - workerStart
    await worker.destroy()

    console.log(
      `[bench] bulk import (${BULK_IMPORT_COUNT} drafts): ` +
        `main-thread ${mainElapsed.toFixed(1)}ms, worker-host ${workerElapsed.toFixed(1)}ms ` +
        `(worker numbers exclude the postMessage hop; on web the worker also ` +
        `keeps signing/invalidation off the UI thread entirely)`
    )

    expect(mainElapsed).toBeLessThan(30_000)
    expect(workerElapsed).toBeLessThan(30_000)
  }, 60_000)
})
