/**
 * Telemetry integration tests for @xnetjs/history
 */

import type { TelemetryReporter } from './engine'
import type { DID } from '@xnetjs/core'
import type { SchemaIRI } from '@xnetjs/data'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { NodeStore, MemoryNodeStorageAdapter } from '@xnetjs/data'
import { describe, it, expect, beforeEach } from 'vitest'
import { HistoryEngine } from './engine'
import { SnapshotCache, MemorySnapshotStorage } from './snapshot-cache'
import { UndoManager } from './undo-manager'

// ─── Mock Telemetry Reporter ───────────────────────────────────────────────────

function createMockTelemetry(): TelemetryReporter & {
  calls: { method: string; args: unknown[] }[]
} {
  const calls: { method: string; args: unknown[] }[] = []
  return {
    calls,
    reportPerformance(metricName: string, durationMs: number) {
      calls.push({ method: 'reportPerformance', args: [metricName, durationMs] })
    },
    reportUsage(metricName: string, count: number) {
      calls.push({ method: 'reportUsage', args: [metricName, count] })
    },
    reportCrash(error: Error, context?: Record<string, unknown>) {
      calls.push({ method: 'reportCrash', args: [error, context] })
    }
  }
}

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const TEST_SCHEMA: SchemaIRI = 'xnet://xnet.fyi/Task' as SchemaIRI

function createTestStore(): {
  store: NodeStore
  adapter: MemoryNodeStorageAdapter
  did: DID
} {
  const keyPair = generateSigningKeyPair()
  const did = `did:key:z6Mk${Buffer.from(keyPair.publicKey).toString('base64url')}` as DID
  const adapter = new MemoryNodeStorageAdapter()
  const store = new NodeStore({
    storage: adapter,
    authorDID: did,
    signingKey: keyPair.privateKey
  })
  return { store, adapter, did }
}

// ─── HistoryEngine Telemetry Tests ────────────────────────────────────────────

describe('HistoryEngine telemetry', () => {
  let telemetry: ReturnType<typeof createMockTelemetry>
  let store: NodeStore
  let adapter: MemoryNodeStorageAdapter

  beforeEach(async () => {
    telemetry = createMockTelemetry()
    const setup = createTestStore()
    store = setup.store
    adapter = setup.adapter
    await store.initialize()
  })

  it('reports performance on materializeAt', async () => {
    // Create a node with some history
    const node = await store.create({ schemaId: TEST_SCHEMA, properties: { title: 'Task 1' } })
    await store.update(node.id, { properties: { title: 'Task 1 Updated' } })

    const snapshotStorage = new MemorySnapshotStorage()
    const snapshots = new SnapshotCache(snapshotStorage, { interval: 5 })
    const engine = new HistoryEngine(adapter, snapshots, telemetry)

    await engine.materializeAt(node.id, { type: 'latest' })

    const perfCalls = telemetry.calls.filter(
      (c) => c.method === 'reportPerformance' && c.args[0] === 'history.materialize'
    )
    expect(perfCalls).toHaveLength(1)
    expect(typeof perfCalls[0].args[1]).toBe('number')
  })

  it('works without telemetry', async () => {
    const node = await store.create({ schemaId: TEST_SCHEMA, properties: { title: 'Task 1' } })

    const snapshotStorage = new MemorySnapshotStorage()
    const snapshots = new SnapshotCache(snapshotStorage, { interval: 5 })
    const engine = new HistoryEngine(adapter, snapshots) // no telemetry

    // Should not throw
    const state = await engine.materializeAt(node.id, { type: 'latest' })
    expect(state).toBeDefined()
  })
})

// ─── UndoManager Telemetry Tests ──────────────────────────────────────────────

describe('UndoManager telemetry', () => {
  let telemetry: ReturnType<typeof createMockTelemetry>
  let store: NodeStore
  let did: DID

  beforeEach(async () => {
    telemetry = createMockTelemetry()
    const setup = createTestStore()
    store = setup.store
    did = setup.did
    await store.initialize()
  })

  it('reports performance and usage on undo', async () => {
    const node = await store.create({ schemaId: TEST_SCHEMA, properties: { title: 'Original' } })
    const manager = new UndoManager(store, did, undefined, telemetry)
    manager.start()

    await store.update(node.id, { properties: { title: 'Updated' } })
    // Allow subscription to trigger
    await new Promise((r) => setTimeout(r, 10))

    const result = await manager.undo(node.id)

    if (result) {
      const perfCalls = telemetry.calls.filter(
        (c) => c.method === 'reportPerformance' && c.args[0] === 'history.undo'
      )
      expect(perfCalls).toHaveLength(1)

      const usageCalls = telemetry.calls.filter(
        (c) => c.method === 'reportUsage' && c.args[0] === 'history.undo'
      )
      expect(usageCalls).toHaveLength(1)
    }

    manager.stop()
  })

  it('works without telemetry', async () => {
    const node = await store.create({ schemaId: TEST_SCHEMA, properties: { title: 'Original' } })
    const manager = new UndoManager(store, did) // no telemetry

    manager.start()
    await store.update(node.id, { properties: { title: 'Updated' } })
    await new Promise((r) => setTimeout(r, 10))

    // Should not throw
    await manager.undo(node.id)

    manager.stop()
  })
})
