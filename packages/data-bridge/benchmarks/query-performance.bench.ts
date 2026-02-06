/**
 * Performance benchmarks for DataBridge query operations
 *
 * Run with: npx vitest bench packages/data-bridge/benchmarks/
 */

import type { DID } from '@xnet/core'
import { generateSigningKeyPair } from '@xnet/crypto'
import { NodeStore, MemoryNodeStorageAdapter, defineSchema, text, number, date } from '@xnet/data'
import { bench, describe, beforeAll, afterAll } from 'vitest'
import { MainThreadBridge } from '../src/main-thread-bridge'

// ─── Test Schema ──────────────────────────────────────────────────────────────

const BenchTaskSchema = defineSchema({
  name: 'BenchTask',
  namespace: 'xnet://bench/',
  properties: {
    title: text({ required: true }),
    status: text({}),
    priority: number({}),
    dueDate: date({})
  }
})

// ─── Setup ────────────────────────────────────────────────────────────────────

let bridge: MainThreadBridge
let store: NodeStore
const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID
let signingKey: Uint8Array

async function setupBridge(nodeCount: number): Promise<void> {
  const storage = new MemoryNodeStorageAdapter()
  const keyPair = generateSigningKeyPair()
  signingKey = keyPair.privateKey

  store = new NodeStore({
    storage,
    authorDID: testDID,
    signingKey
  })
  await store.initialize()

  // Pre-populate with nodes
  for (let i = 0; i < nodeCount; i++) {
    await store.create({
      schemaId: BenchTaskSchema._schemaId,
      properties: {
        title: `Task ${i}`,
        status: i % 3 === 0 ? 'done' : i % 2 === 0 ? 'in-progress' : 'todo',
        priority: i % 5,
        dueDate: Date.now() + i * 86400000
      }
    })
  }

  bridge = new MainThreadBridge(store)
}

async function teardownBridge(): Promise<void> {
  bridge.destroy()
}

// ─── Benchmarks ───────────────────────────────────────────────────────────────

describe('Query Performance - 100 nodes', () => {
  beforeAll(async () => {
    await setupBridge(100)
  })

  afterAll(async () => {
    await teardownBridge()
  })

  bench('list all nodes', () => {
    const subscription = bridge.query(BenchTaskSchema)
    const snapshot = subscription.getSnapshot()
    if (snapshot === null) {
      throw new Error('Expected snapshot to be available')
    }
  })

  bench('query with filter', () => {
    const subscription = bridge.query(BenchTaskSchema, {
      where: { status: 'todo' }
    })
    const snapshot = subscription.getSnapshot()
    if (snapshot === null) {
      throw new Error('Expected snapshot to be available')
    }
  })

  bench('query with ordering', () => {
    const subscription = bridge.query(BenchTaskSchema, {
      orderBy: { priority: 'desc' }
    })
    const snapshot = subscription.getSnapshot()
    if (snapshot === null) {
      throw new Error('Expected snapshot to be available')
    }
  })
})

describe('Query Performance - 1000 nodes', () => {
  beforeAll(async () => {
    await setupBridge(1000)
  })

  afterAll(async () => {
    await teardownBridge()
  })

  bench('list all nodes', () => {
    const subscription = bridge.query(BenchTaskSchema)
    const snapshot = subscription.getSnapshot()
    if (snapshot === null) {
      throw new Error('Expected snapshot to be available')
    }
  })

  bench('query with filter', () => {
    const subscription = bridge.query(BenchTaskSchema, {
      where: { status: 'todo' }
    })
    const snapshot = subscription.getSnapshot()
    if (snapshot === null) {
      throw new Error('Expected snapshot to be available')
    }
  })

  bench('query with ordering', () => {
    const subscription = bridge.query(BenchTaskSchema, {
      orderBy: { priority: 'desc' }
    })
    const snapshot = subscription.getSnapshot()
    if (snapshot === null) {
      throw new Error('Expected snapshot to be available')
    }
  })

  bench('query with limit', () => {
    const subscription = bridge.query(BenchTaskSchema, {
      limit: 10
    })
    const snapshot = subscription.getSnapshot()
    if (snapshot === null) {
      throw new Error('Expected snapshot to be available')
    }
  })
})

describe('Mutation Performance - 100 nodes baseline', () => {
  beforeAll(async () => {
    await setupBridge(100)
  })

  afterAll(async () => {
    await teardownBridge()
  })

  const createdIds: string[] = []

  bench('create node', async () => {
    const node = await bridge.create(BenchTaskSchema, {
      title: 'New Task',
      status: 'todo',
      priority: 1,
      dueDate: Date.now()
    })
    createdIds.push(node.id)
  })

  bench('update node', async () => {
    if (createdIds.length === 0) return
    const id = createdIds[createdIds.length - 1]
    await bridge.update(id, { title: 'Updated Task' })
  })

  bench('delete node', async () => {
    if (createdIds.length === 0) return
    const id = createdIds.pop()!
    await bridge.delete(id)
  })
})

describe('Subscription Performance', () => {
  beforeAll(async () => {
    await setupBridge(100)
  })

  afterAll(async () => {
    await teardownBridge()
  })

  bench('subscribe and unsubscribe', () => {
    const subscription = bridge.query(BenchTaskSchema)
    const unsubscribe = subscription.subscribe(() => {})
    subscription.getSnapshot()
    unsubscribe()
  })

  bench('multiple subscriptions', () => {
    const subscriptions = Array.from({ length: 10 }, () => {
      const sub = bridge.query(BenchTaskSchema)
      return {
        sub,
        unsubscribe: sub.subscribe(() => {})
      }
    })

    for (const { unsubscribe } of subscriptions) {
      unsubscribe()
    }
  })
})
