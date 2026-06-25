/**
 * Runner integration tests against a real NodeStore + in-memory adapter.
 * Proves idempotency (converge), volume growth (accrete) and clean rebuild
 * (reseed).
 */

import { describe, it, expect } from 'vitest'
import { MemoryNodeStorageAdapter, NodeStore, ProjectSchema, TaskSchema, SpaceSchema } from '@xnetjs/data'
import type { SchemaIRI } from '@xnetjs/data'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { createDID } from '@xnetjs/identity'
import { runSeed } from './seed-runner'

function makeStore(): NodeStore {
  const kp = generateSigningKeyPair()
  const did = createDID(kp.publicKey)
  return new NodeStore({
    storage: new MemoryNodeStorageAdapter(),
    authorDID: did,
    signingKey: kp.privateKey
  })
}

async function count(store: NodeStore, schemaId: SchemaIRI): Promise<number> {
  const res = await store.query({ schemaId, includeDeleted: false, count: 'exact' })
  return res.totalCount ?? res.nodes.length
}

describe('runSeed — converge (idempotent)', () => {
  it('re-running does not duplicate', async () => {
    const store = makeStore()
    const r1 = await runSeed({ store, scale: 'small' })
    const tasks1 = await count(store, TaskSchema._schemaId)
    const projects1 = await count(store, ProjectSchema._schemaId)
    const spaces1 = await count(store, SpaceSchema._schemaId)

    expect(r1.created).toBeGreaterThan(0)
    expect(tasks1).toBeGreaterThan(0)

    const r2 = await runSeed({ store, scale: 'small' })
    const tasks2 = await count(store, TaskSchema._schemaId)
    const projects2 = await count(store, ProjectSchema._schemaId)
    const spaces2 = await count(store, SpaceSchema._schemaId)

    expect(r2.created).toBe(0)
    expect(tasks2).toBe(tasks1)
    expect(projects2).toBe(projects1)
    expect(spaces2).toBe(spaces1)
  })
})

describe('runSeed — accrete (grows)', () => {
  it('appends fresh volume nodes each run', async () => {
    const store = makeStore()
    await runSeed({ store, scale: 'small' })
    const before = await count(store, TaskSchema._schemaId)

    await runSeed({ store, scale: 'small', mode: 'accrete', accreteNonce: 'a' })
    const mid = await count(store, TaskSchema._schemaId)
    expect(mid).toBeGreaterThan(before)

    await runSeed({ store, scale: 'small', mode: 'accrete', accreteNonce: 'b' })
    const after = await count(store, TaskSchema._schemaId)
    expect(after).toBeGreaterThan(mid)
  })
})

describe('runSeed — reseed (clean rebuild)', () => {
  it('rebuilds to the same live count with no duplicates', async () => {
    const store = makeStore()
    await runSeed({ store, scale: 'small' })
    const before = await count(store, TaskSchema._schemaId)

    const r = await runSeed({ store, scale: 'small', mode: 'reseed' })
    const after = await count(store, TaskSchema._schemaId)

    expect(r.mode).toBe('reseed')
    expect(after).toBe(before)
  })
})
