import type { ApplyNodeBatchInput } from './types'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { createDID } from '@xnetjs/identity'
import { describe, expect, it } from 'vitest'
import { MemoryNodeStorageAdapter } from './memory-adapter'
import { NodeStore } from './store'

async function setup(storage = new MemoryNodeStorageAdapter()) {
  const pair = generateSigningKeyPair()
  const store = new NodeStore({
    storage,
    authorDID: createDID(pair.publicKey),
    signingKey: pair.privateKey
  })
  await store.initialize()
  const node = await store.create({
    id: 'task',
    schemaId: 'xnet://xnet.fyi/Task',
    properties: { title: 'Before' }
  })
  return { store, storage, node }
}
describe('conditional NodeStore transactions', () => {
  it('commits a matching snapshot and refuses stale, expired, and uncovered writes', async () => {
    const { store, node } = await setup()
    const write = [
      { type: 'update' as const, nodeId: node.id, options: { properties: { title: 'After' } } }
    ]
    const conditions = { nodes: [{ id: node.id, expected: node }], deadline: Date.now() + 5000 }
    await store.transaction(write, conditions)
    await expect(store.transaction(write, conditions)).rejects.toThrow('changed')
    await expect(store.transaction(write, { ...conditions, deadline: 0 })).rejects.toThrow(
      'expired'
    )
    await expect(store.transaction(write, { ...conditions, nodes: [] })).rejects.toThrow(
      'precondition'
    )
    await expect(
      store.transaction(write, {
        ...conditions,
        nodes: [{ id: node.id, expected: { ...node, id: 'wrong' } }]
      })
    ).rejects.toThrow('match its record identifier')
    expect((await store.get(node.id))?.properties.title).toBe('After')
  })
  it('checks authorization dependencies and every record atomically at the last write boundary', async () => {
    class RacingStorage extends MemoryNodeStorageAdapter {
      race = false
      override async applyNodeBatch(input: ApplyNodeBatchInput) {
        if (input.conditions && this.race) {
          const existing = await this.getNode('policy')
          await this.setNode({ ...existing!, properties: { active: false } })
        }
        return super.applyNodeBatch(input)
      }
    }
    const storage = new RacingStorage(),
      { store, node } = await setup(storage)
    const policy = await store.create({
      id: 'policy',
      schemaId: 'xnet://xnet.fyi/Policy',
      properties: { active: true }
    })
    storage.race = true
    await expect(
      store.transaction(
        [
          { type: 'update', nodeId: node.id, options: { properties: { title: 'Unauthorized' } } },
          {
            type: 'create',
            options: { id: 'new', schemaId: node.schemaId, properties: { title: 'New' } }
          }
        ],
        {
          nodes: [
            { id: node.id, expected: node },
            { id: policy.id, expected: policy },
            { id: 'new', expected: null }
          ],
          deadline: Date.now() + 5000
        }
      )
    ).rejects.toThrow('changed')
    expect((await store.get(node.id))?.properties.title).toBe('Before')
    expect(await store.get('new')).toBeNull()
  })
  it('refuses temporary IDs before they can escape snapshot coverage', async () => {
    const { store, node } = await setup()
    await expect(
      store.transaction(
        [
          {
            type: 'create',
            options: {
              id: '~new',
              schemaId: node.schemaId,
              properties: { title: 'No' }
            }
          }
        ],
        { nodes: [{ id: '~new', expected: null }], deadline: Date.now() + 5000 }
      )
    ).rejects.toThrow('Temporary identifiers')
    expect(await store.get('~new')).toBeNull()
  })
  it('refuses document-byte guards rather than silently checking only structured state', async () => {
    const { store, node } = await setup()
    await expect(
      store.transaction([{ type: 'delete', nodeId: node.id }], {
        nodes: [{ id: node.id, expected: { ...node, documentContent: new Uint8Array([1]) } }],
        deadline: Date.now() + 5000
      })
    ).rejects.toThrow('separate document revision guard')
    expect((await store.get(node.id))?.deleted).toBe(false)
  })
  it('never ignores guards on an adapter that has not opted into conditional batches', async () => {
    const storage = new MemoryNodeStorageAdapter()
    Object.defineProperty(storage, 'supportsConditionalBatches', { value: false })
    const { store, node } = await setup(storage)
    await expect(
      store.transaction([{ type: 'delete', nodeId: node.id }], {
        nodes: [{ id: node.id, expected: node }],
        deadline: Date.now() + 5000
      })
    ).rejects.toThrow('cannot commit')
    expect((await store.get(node.id))?.deleted).toBe(false)
  })
})

describe('device-local authority and receipts', () => {
  it('atomically persists policy and receipts, rejects revocation races, and survives a new store', async () => {
    const { store, storage, node } = await setup()
    const deadline = Date.now() + 5000
    await store.transaction([], {
      nodes: [],
      deadline,
      localState: [{ key: 'grant', expected: null, value: 'epoch-1' }]
    })
    const write = [
      { type: 'update' as const, nodeId: node.id, options: { properties: { title: 'After' } } }
    ]
    const conditions = {
      nodes: [{ id: node.id, expected: node }],
      deadline,
      localState: [{ key: 'grant', expected: 'epoch-1' }],
      receipt: { key: 'request-1', context: 'host attribution' }
    }
    const result = await store.transaction(write, conditions)
    const receipt = JSON.parse((await store.getLocalState('request-1'))!)
    expect(receipt.results).toEqual(result.results)
    expect(receipt.heads).toEqual(result.heads)
    expect(receipt.context).toBe('host attribution')
    await store.transaction([], {
      nodes: [],
      deadline,
      localState: [{ key: 'grant', expected: 'epoch-1', value: 'revoked' }]
    })
    const current = await store.get(node.id)
    await expect(
      store.transaction(write, {
        ...conditions,
        nodes: [{ id: node.id, expected: current }],
        receipt: { key: 'request-2', context: '' }
      })
    ).rejects.toThrow('policy')
    expect(await store.getLocalState('request-2')).toBeNull()
    await expect(
      store.transaction([], {
        nodes: [],
        deadline,
        localState: [{ key: 'grant', expected: null, value: 'resurrected' }]
      })
    ).rejects.toThrow('policy')
    expect(await storage.getAppState('grant')).toBe('revoked')
  })
  it('rolls local state back with a failing outer memory transaction', async () => {
    const { store, storage } = await setup()
    await expect(
      storage.withTransaction(async () => {
        await store.transaction([], {
          nodes: [],
          deadline: Date.now() + 5000,
          localState: [{ key: 'grant', expected: null, value: 'approved' }]
        })
        throw new Error('rollback')
      })
    ).rejects.toThrow('rollback')
    expect(await store.getLocalState('grant')).toBeNull()
  })
})
