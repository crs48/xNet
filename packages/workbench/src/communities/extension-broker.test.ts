// @vitest-environment node
import type { ExtensionGrant } from './extension-data'
import type { DataBridge } from '@xnetjs/data-bridge'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { MemoryNodeStorageAdapter, NodeStore, TaskSchema } from '@xnetjs/data'
import { createDID } from '@xnetjs/identity'
import { describe, expect, it, vi } from 'vitest'
import { openExtensionAuthority } from './extension-authority'
import { createExtensionBroker } from './extension-broker'
async function approvedBroker(bridge: DataBridge, grant: ExtensionGrant, current: () => boolean) {
  const saved = await openExtensionAuthority(bridge, grant.owner, 'test-channel', grant.hash, grant)
  return createExtensionBroker(bridge, grant, current, saved!.authority, saved!.approval.created)
}
import { createExtensionDataBridge } from './extension-data'
import { decodeExtensionRequest, ExtensionAccessError } from './extension-protocol'
async function setup() {
  const pair = generateSigningKeyPair(),
    owner = createDID(pair.publicKey)
  const store = new NodeStore({
    storage: new MemoryNodeStorageAdapter(),
    authorDID: owner,
    signingKey: pair.privateKey
  })
  await store.initialize()
  await store.create({
    id: 'allowed',
    schemaId: TaskSchema._schemaId,
    properties: { title: 'Allowed', status: 'todo', visibility: 'private' }
  })
  await store.create({
    id: 'other',
    schemaId: TaskSchema._schemaId,
    properties: { title: 'Private other' }
  })
  const grant: ExtensionGrant = {
    version: 1,
    owner,
    hash: 'artifact-a',
    channelIds: [],
    records: [{ id: 'allowed', schemaId: TaskSchema._schemaId }],
    taskWrites: { ids: ['allowed'], create: true, remove: true }
  }
  const bridge: DataBridge = {
    ...createExtensionDataBridge({ grant, nodes: [] }),
    get: (id) => store.get(id),
    getLocalState: (key) => store.getLocalState(key),
    transaction: (ops, conditions) => store.transaction(ops, conditions)
  }
  return { store, bridge, grant, broker: await approvedBroker(bridge, grant, () => true) }
}
const command = (operations: unknown[], id = crypto.randomUUID()) => ({
  version: 1,
  id,
  operation: 'data.mutate',
  operations
})
describe('host extension command broker', () => {
  it('uses real conditional writes, replay receipts, and conflict-safe undo', async () => {
    const { store, broker } = await setup()
    const request = command([{ type: 'update', nodeId: 'allowed', properties: { status: 'done' } }])
    const result = await broker.request(request)
    expect(await broker.request(request)).toEqual(result)
    expect((await store.get('allowed'))?.properties.status).toBe('done')
    await broker.request({
      version: 1,
      id: 'undo-1',
      operation: 'data.undo',
      receipt: result.receipt
    })
    expect((await store.get('allowed'))?.properties.status).toBe('todo')
    const next = await broker.request(
      command([{ type: 'update', nodeId: 'allowed', properties: { title: 'Extension' } }])
    )
    await store.update('allowed', { properties: { title: 'Human edit' } })
    await expect(
      broker.request({ version: 1, id: 'undo-2', operation: 'data.undo', receipt: next.receipt })
    ).rejects.toThrow('changed')
    expect((await store.get('allowed'))?.properties.title).toBe('Human edit')
  })
  it('denies out-of-scope and mixed writes without partially editing anything', async () => {
    const { store, broker } = await setup()
    await expect(
      broker.request(
        command([
          { type: 'update', nodeId: 'allowed', properties: { title: 'No' } },
          { type: 'delete', nodeId: 'other' }
        ])
      )
    ).rejects.toThrow('approved')
    expect((await store.get('allowed'))?.properties.title).toBe('Allowed')
    expect((await store.get('other'))?.deleted).toBe(false)
  })
  it('rejects reparenting, shared destinations, malformed properties, and permission expansion', async () => {
    const { store, broker } = await setup()
    for (const properties of [
      { space: 'shared' },
      { visibility: 'public' },
      { title: 7 },
      { dueDate: 'tomorrow' },
      { completed: {} }
    ])
      await expect(
        broker.request(command([{ type: 'update', nodeId: 'allowed', properties }]))
      ).rejects.toThrow()
    await store.update('allowed', { properties: { space: 'shared' } })
    await expect(
      broker.request(command([{ type: 'update', nodeId: 'allowed', properties: { title: 'No' } }]))
    ).rejects.toThrow('shared')
  })
  it('creates only private tasks, supports explicit delete/restore, and refuses writes after revocation', async () => {
    const { store, broker } = await setup()
    const result = await broker.request(
      command([{ type: 'create', schemaId: TaskSchema._schemaId, properties: { title: 'New' } }])
    )
    const id = result.results[0]!.id
    expect(result.results[0]?.properties.visibility).toBe('private')
    await broker.request(command([{ type: 'delete', nodeId: id }]))
    expect((await store.get(id))?.deleted).toBe(true)
    await broker.request(command([{ type: 'restore', nodeId: id }]))
    expect((await store.get(id))?.deleted).toBe(false)
    await broker.revoke()
    await expect(broker.request(command([{ type: 'delete', nodeId: id }]))).rejects.toThrow(
      'stopped'
    )
  })
  it('revokes while validation is in flight and drains an already accepted commit', async () => {
    const { store, bridge, grant } = await setup()
    let release!: () => void
    let entered!: () => void
    const ready = new Promise<void>((resolve) => {
      entered = resolve
    })
    const wait = new Promise<void>((resolve) => {
      release = resolve
    })
    const broker = await approvedBroker(
      {
        ...bridge,
        get: async (id) => {
          entered()
          await wait
          return store.get(id)
        }
      },
      grant,
      () => true
    )
    const edit = broker.request(command([{ type: 'delete', nodeId: 'allowed' }]))
    await ready
    const rejected = expect(edit).rejects.toThrow('stopped')
    const draining = broker.revoke()
    release()
    await draining
    await rejected
    expect((await store.get('allowed'))?.deleted).toBe(false)

    let releaseCommit!: () => void
    let commitEntered!: () => void
    const committing = new Promise<void>((resolve) => {
      commitEntered = resolve
    })
    const held = new Promise<void>((resolve) => {
      releaseCommit = resolve
    })
    const next = await approvedBroker(
      {
        ...bridge,
        transaction: async (ops, conditions) => {
          if (!ops.length) return store.transaction(ops, conditions)
          commitEntered()
          await held
          return store.transaction(ops, conditions)
        }
      },
      grant,
      () => true
    )
    const accepted = next.request(command([{ type: 'delete', nodeId: 'allowed' }]))
    await committing
    let completed = false
    const revoke = next.revoke().then(() => {
      completed = true
    })
    await Promise.resolve()
    expect(completed).toBe(false)
    releaseCommit()
    await expect(accepted).rejects.toThrow('stopped')
    await revoke
    expect((await store.get('allowed'))?.deleted).toBe(true)
    await expect(next.request(command([{ type: 'restore', nodeId: 'allowed' }]))).rejects.toThrow(
      'stopped'
    )
  })
  it('does not turn creation permission into deletion permission through undo', async () => {
    const { store, bridge, grant } = await setup()
    const broker = await approvedBroker(
      bridge,
      { ...grant, taskWrites: { ids: ['allowed'], create: true, remove: false } },
      () => true
    )
    const created = await broker.request(
      command([{ type: 'create', schemaId: TaskSchema._schemaId, properties: { title: 'New' } }])
    )
    const id = created.results[0]!.id
    await expect(
      broker.request({
        version: 1,
        id: 'undo-create',
        operation: 'data.undo',
        receipt: created.receipt
      })
    ).rejects.toThrow('delete/restore permission')
    expect((await store.get(id))?.deleted).toBe(false)
  })
  it('rejects guessed record IDs and chosen creation IDs before reading host data', async () => {
    const { bridge, grant } = await setup()
    const get = vi.fn(bridge.get!)
    const broker = await approvedBroker({ ...bridge, get }, grant, () => true)
    await expect(broker.request(command([{ type: 'delete', nodeId: 'other' }]))).rejects.toThrow(
      'approved'
    )
    await expect(
      broker.request(
        command([
          {
            type: 'create',
            id: 'other',
            schemaId: TaskSchema._schemaId,
            properties: { title: 'Probe' }
          }
        ])
      )
    ).rejects.toThrow('assigned by the host')
    expect(get).not.toHaveBeenCalled()
  })
  it('reducing write authority cannot enable an effect', async () => {
    const { bridge, grant } = await setup()
    for (const taskWrites of [undefined, { ids: [], create: false, remove: false }]) {
      const broker = await approvedBroker(bridge, { ...grant, taskWrites }, () => true)
      await expect(
        broker.request(
          command([{ type: 'update', nodeId: 'allowed', properties: { status: 'done' } }])
        )
      ).rejects.toThrow()
    }
  })
  it('rejects forged caller fields, unknown operations, nested objects, and oversized input', () => {
    for (const value of [
      null,
      [],
      {},
      { ...command([]), owner: 'forged' },
      { version: 1, id: 'a', operation: 'keys.export' },
      command([{ type: 'update', nodeId: 'allowed', properties: {}, store: true }]),
      command([
        { type: 'create', schemaId: TaskSchema._schemaId, properties: { title: 'x'.repeat(20000) } }
      ])
    ])
      expect(() => decodeExtensionRequest(value)).toThrow()
  })
})

it('recovers a lost committed response and preserves created scope and undo across sessions', async () => {
  const { store, bridge, grant } = await setup()
  const opened = (await openExtensionAuthority(bridge, grant.owner, 'durable', grant.hash, grant))!
  const unreliable = {
    ...bridge,
    transaction: async (...args: Parameters<NonNullable<DataBridge['transaction']>>) => {
      const result = await bridge.transaction!(...args)
      if (args[0].length) throw new Error('Response lost after commit')
      return result
    }
  }
  const first = createExtensionBroker(unreliable, grant, () => true, opened.authority)
  const request = command(
    [{ type: 'create', schemaId: TaskSchema._schemaId, properties: { title: 'Once' } }],
    'durable-create'
  )
  const result = await first.request(request)
  const reopened = (await openExtensionAuthority(bridge, grant.owner, 'durable', grant.hash))!
  expect(reopened.approval.created).toEqual([result.results[0]!.id])
  expect(reopened.approval.lastReceipt).toBe(request.id)
  const next = createExtensionBroker(
    bridge,
    grant,
    () => true,
    reopened.authority,
    reopened.approval.created
  )
  expect(await next.request(request)).toEqual(result)
  expect(
    (await store.list({ schemaId: TaskSchema._schemaId })).filter(
      (node) => node.properties.title === 'Once'
    )
  ).toHaveLength(1)
  await next.request({
    version: 1,
    id: 'durable-undo',
    operation: 'data.undo',
    receipt: result.receipt
  })
  expect((await store.get(result.results[0]!.id))?.deleted).toBe(true)
  await expect(
    next.request({ version: 1, id: 'second-undo', operation: 'data.undo', receipt: result.receipt })
  ).rejects.toThrow('cannot be undone')
  await expect(
    next.request(command([{ type: 'delete', nodeId: 'allowed' }], request.id))
  ).rejects.toThrow('different commands')
})

it('checks the durable epoch at commit, rejects old sessions after restart and fails closed on unreadable policy', async () => {
  const { store, bridge, grant } = await setup()
  const opened = (await openExtensionAuthority(bridge, grant.owner, 'race', grant.hash, grant))!
  const racing: DataBridge = {
    ...bridge,
    transaction: async (ops, conditions) => {
      if (ops.length) await opened.authority.revoke()
      return bridge.transaction!(ops, conditions)
    }
  }
  const broker = createExtensionBroker(racing, grant, () => true, opened.authority)
  await expect(broker.request(command([{ type: 'delete', nodeId: 'allowed' }]))).rejects.toThrow()
  expect((await store.get('allowed'))?.deleted).toBe(false)
  expect(await openExtensionAuthority(bridge, grant.owner, 'race', grant.hash)).toBeNull()
  await openExtensionAuthority(bridge, grant.owner, 'race', grant.hash, grant)
  await expect(opened.authority.read()).rejects.toThrow('replaced')
  await expect(
    openExtensionAuthority(
      {
        ...bridge,
        getLocalState: async () => {
          throw new Error('storage failed')
        }
      },
      grant.owner,
      'race',
      grant.hash
    )
  ).rejects.toThrow('storage failed')
})

it('rejects cyclic, deep, non-JSON and oversized requests with a bounded protocol failure', () => {
  const cyclic: Record<string, unknown> = {}
  cyclic.title = cyclic
  let deep: unknown = 'text'
  for (let i = 0; i < 10000; i++) deep = { nested: deep }
  for (const properties of [
    cyclic,
    { title: deep },
    { title: BigInt(1) },
    { title: NaN },
    { title: '界'.repeat(6000) }
  ]) {
    expect(() =>
      decodeExtensionRequest(command([{ type: 'update', nodeId: 'allowed', properties }]))
    ).toThrow(ExtensionAccessError)
  }
})
