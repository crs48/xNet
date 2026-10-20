// @vitest-environment node
import type { ExtensionGrant } from './extension-data'
import type { ExtensionQueryRequest } from './extension-protocol'
import type { NodeState } from '@xnetjs/data'
import type { DataBridge, QueryOptions } from '@xnetjs/data-bridge'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { ChatMessageSchema, MemoryNodeStorageAdapter, NodeStore, TaskSchema } from '@xnetjs/data'
import { applyQueryDescriptor, createQueryDescriptor } from '@xnetjs/data-bridge'
import { createDID } from '@xnetjs/identity'
import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import { openExtensionAuthority } from './extension-authority'
import { createExtensionDataBridge } from './extension-data'
import { decodeExtensionRequest } from './extension-protocol'
import { createExtensionQueryBroker } from './extension-queries'

const message = (
  id: number,
  channel = 'approved',
  extra: Record<string, unknown> = {}
): NodeState => ({
  id: `message-${id}`,
  schemaId: ChatMessageSchema._schemaId,
  properties: { channel, content: `Message ${id}`, ...extra },
  createdAt: id,
  updatedAt: id,
  createdBy: 'did:key:author',
  updatedBy: 'did:key:author',
  deleted: false,
  timestamps: {}
})
async function setup(rows = Array.from({ length: 250 }, (_, id) => message(id))) {
  const pair = generateSigningKeyPair(),
    owner = createDID(pair.publicKey)
  const store = new NodeStore({
    storage: new MemoryNodeStorageAdapter(),
    authorDID: owner,
    signingKey: pair.privateKey
  })
  await store.initialize()
  const grant: ExtensionGrant = {
    version: 1,
    owner,
    hash: 'queries',
    channelIds: ['approved'],
    records: []
  }
  const query = vi.fn((schema: { _schemaId: string }, options: QueryOptions = {}) => ({
    getSnapshot: () => applyQueryDescriptor(rows, createQueryDescriptor(schema._schemaId, options)),
    subscribe: () => () => {}
  }))
  const bridge: DataBridge = {
    ...createExtensionDataBridge({ grant, nodes: [] }),
    get: async (id) => rows.find((row) => row.id === id) ?? (await store.get(id)),
    getLocalState: (key) => store.getLocalState(key),
    transaction: (ops, conditions) => store.transaction(ops, conditions),
    query
  }
  const opened = (await openExtensionAuthority(bridge, owner, 'chat', grant.hash, grant))!
  let readable = true
  const broker = createExtensionQueryBroker(bridge, grant, opened.authority, () => readable)
  const read = async (options: QueryOptions = {}, schemaId: string = ChatMessageSchema._schemaId) =>
    broker.query(
      decodeExtensionRequest({
        version: 1,
        id: crypto.randomUUID(),
        operation: 'data.query',
        schemaId,
        options
      }) as ExtensionQueryRequest,
      new AbortController().signal
    )
  return {
    read,
    broker,
    query,
    grant,
    bridge,
    authority: opened.authority,
    revokeMembership: () => {
      readable = false
    }
  }
}

describe('scoped host query pages', () => {
  it('reads bounded pages inside the conversation predicate and never reports a truncated total', async () => {
    const { read, query } = await setup([
      ...Array.from({ length: 250 }, (_, id) => message(id)),
      message(999, 'secret')
    ])
    const first = await read({ page: { first: 25 } })
    expect(first.nodes).toHaveLength(25)
    expect(first.nodes[0].id).toBe('message-249')
    expect(first.metadata.pageInfo).toMatchObject({
      totalCount: null,
      countMode: 'none',
      hasMore: true
    })
    expect(query).toHaveBeenCalledExactlyOnceWith(
      ChatMessageSchema,
      expect.objectContaining({ where: { channel: 'approved' }, limit: 26, source: 'local' })
    )
    const next = await read({ page: { first: 25, after: first.metadata.pageInfo.endCursor } })
    expect(next.nodes[0].id).toBe('message-224')
    expect(new Set([...first.nodes, ...next.nodes].map((n) => n.id)).size).toBe(50)
    expect(JSON.stringify(next)).not.toContain('secret')
  })
  it('partitions cursors by query, session and grant epoch', async () => {
    const env = await setup()
    const first = await env.read({ page: { first: 2 } })
    const after = first.metadata.pageInfo.endCursor
    await expect(
      env.read({ where: { content: 'other' }, page: { first: 2, after } })
    ).rejects.toThrow('another query')
    const second = createExtensionQueryBroker(env.bridge, env.grant, env.authority, () => true)
    await expect(
      second.query(
        {
          version: 1,
          id: 'other-session',
          operation: 'data.query',
          schemaId: ChatMessageSchema._schemaId,
          options: { page: { first: 2, after } }
        },
        new AbortController().signal
      )
    ).rejects.toThrow('another query')
    await env.authority.revoke()
    await expect(env.read({ page: { first: 2, after } })).rejects.toMatchObject({ code: 'revoked' })
  })
  it('rejects forbidden fields, guessed records, channels and malformed cursor inputs before storage', async () => {
    const { read, query } = await setup()
    for (const options of [
      { where: { redacted: false } },
      { orderBy: { secret: 'asc' } },
      { where: { channel: 'secret' } },
      { page: { first: 1000 } },
      { page: { first: 1, after: 'raw-storage-cursor' } },
      { offset: 50 },
      { source: 'hub' },
      { where: { content: { deep: true } } }
    ]) {
      await expect(read(options as QueryOptions)).rejects.toThrow()
    }
    await expect(read({ nodeId: 'unapproved' }, TaskSchema._schemaId)).rejects.toThrow('outside')
    expect(query).not.toHaveBeenCalled()
  })
  it('suppresses redacted content and filters before applying page limits', async () => {
    const { read } = await setup([
      message(9, 'approved', { redacted: true, content: 'Hidden' }),
      message(8),
      message(7),
      message(6)
    ])
    const first = await read({ page: { first: 2 } })
    expect(first.nodes.map((n) => n.id)).toEqual(['message-8', 'message-7'])
    expect(first.metadata.pageInfo.hasMore).toBe(true)
    expect(JSON.stringify(first)).not.toContain('Hidden')
    const next = await read({ page: { first: 2, after: first.metadata.pageInfo.endCursor } })
    expect(next.nodes.map((n) => n.id)).toEqual(['message-6'])
    expect(next.metadata.pageInfo.hasMore).toBe(false)
  })
  it('fails closed when authority changes during host query execution', async () => {
    const env = await setup()
    const original = env.query.getMockImplementation()!
    env.query.mockImplementation((schema, options) => {
      env.revokeMembership()
      return original(schema, options)
    })
    await expect(env.read()).rejects.toMatchObject({ code: 'revoked' })
  })
  it('rejects cross-scope store responses and bounds content bytes', async () => {
    const env = await setup()
    env.query.mockReturnValue({
      getSnapshot: () => [message(1, 'secret')],
      subscribe: () => () => {}
    })
    await expect(env.read()).rejects.toMatchObject({ code: 'denied' })
    const large = await setup([message(1, 'approved', { content: '界'.repeat(90_000) })])
    await expect(large.read()).rejects.toMatchObject({ code: 'quota' })
  })
})

it('refuses stale cached content after redaction and releases a cancelled loading subscription', async () => {
  const env = await setup([message(1)])
  const get = env.bridge.get!
  env.bridge.get = async (id) => {
    const node = await get(id)
    return node ? { ...node, properties: { ...node.properties, redacted: true } } : null
  }
  await expect(env.read()).rejects.toMatchObject({ code: 'conflict' })
  const cleanup = vi.fn(),
    controller = new AbortController()
  env.query.mockReturnValue({
    getSnapshot: () => null,
    subscribe: () => cleanup
  })
  const read = env.broker.query(
    {
      version: 1,
      id: 'loading',
      operation: 'data.query',
      schemaId: ChatMessageSchema._schemaId,
      options: {}
    },
    controller.signal
  )
  await vi.waitFor(() => expect(env.query).toHaveBeenCalledTimes(2))
  controller.abort()
  await expect(read).rejects.toMatchObject({ code: 'cancelled' })
  expect(cleanup).toHaveBeenCalledOnce()
})

it('never expands observed data when approved conversations are reduced', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.integer({ min: 0, max: 2 }), { minLength: 1, maxLength: 40 }),
      fc.subarray(['approved', 'second', 'third']),
      async (assignments, subset) => {
        const channels = ['approved', 'second', 'third']
        const rows = assignments.map((channel, index) => message(index, channels[channel]))
        const env = await setup(rows)
        const read = async (allowed: string[]) => {
          const grant = { ...env.grant, channelIds: allowed }
          const saved = (await openExtensionAuthority(
            env.bridge,
            grant.owner,
            'property',
            grant.hash,
            grant
          ))!
          const broker = createExtensionQueryBroker(env.bridge, grant, saved.authority, () => true)
          return broker.query(
            {
              version: 1,
              id: 'property-query',
              operation: 'data.query',
              schemaId: ChatMessageSchema._schemaId,
              options: { limit: 100 }
            },
            new AbortController().signal
          )
        }
        const full = await read(channels)
        if (!subset.length) {
          await expect(read(subset)).rejects.toMatchObject({ code: 'denied' })
        } else {
          const reduced = await read(subset)
          expect(
            reduced.nodes.every((node) => subset.includes(String(node.properties.channel)))
          ).toBe(true)
          const ids = new Set(full.nodes.map((node) => node.id))
          expect(reduced.nodes.every((node) => ids.has(node.id))).toBe(true)
        }
      }
    ),
    { numRuns: 30, seed: 481 }
  )
})

it('projects exact own records and refuses records that no longer belong to the approving owner', async () => {
  const env = await setup([])
  const grant = {
    ...env.grant,
    channelIds: [],
    records: [{ id: 'task', schemaId: TaskSchema._schemaId }]
  }
  const saved = (await openExtensionAuthority(
    env.bridge,
    grant.owner,
    'own-records',
    grant.hash,
    grant
  ))!
  let owner = grant.owner
  env.bridge.get = async (id) => ({
    ...message(1),
    id,
    schemaId: TaskSchema._schemaId,
    createdBy: owner,
    properties: { title: 'Allowed', privateField: 'Secret' }
  })
  const broker = createExtensionQueryBroker(env.bridge, grant, saved.authority, () => true)
  const read = () =>
    broker.query(
      {
        version: 1,
        id: 'own-query',
        operation: 'data.query',
        schemaId: TaskSchema._schemaId,
        options: {}
      },
      new AbortController().signal
    )
  expect((await read()).nodes[0].properties).toEqual({ title: 'Allowed' })
  owner = 'did:key:someone-else'
  await expect(read()).rejects.toMatchObject({ code: 'denied' })
})
