import type { ExtensionDataset, ExtensionGrant } from './extension-data'
import type { NodeState } from '@xnetjs/data'
import type { DataBridge, QueryOptions } from '@xnetjs/data-bridge'
import {
  ChannelSchema,
  ChatMessageSchema,
  PageSchema,
  TaskSchema,
  ProfileSchema
} from '@xnetjs/data'
import { applyQueryDescriptor, createQueryDescriptor } from '@xnetjs/data-bridge'
import { describe, expect, it, vi } from 'vitest'
import {
  createExtensionDataBridge,
  readExtensionGrant,
  subscribeExtensionData
} from './extension-data'

const owner = 'did:key:owner'
const grant: ExtensionGrant = {
  version: 1,
  owner,
  hash: 'build-a',
  channelIds: ['chat-a'],
  records: [{ id: 'task-a', schemaId: TaskSchema._schemaId }]
}
function node(
  id: string,
  schemaId: NodeState['schemaId'],
  properties: NodeState['properties']
): NodeState {
  return {
    id,
    schemaId,
    properties,
    createdAt: 1,
    updatedAt: 2,
    createdBy: owner,
    updatedBy: owner,
    deleted: false,
    timestamps: {}
  }
}
const channel = node('chat-a', ChannelSchema._schemaId, { name: 'Friends' })
const message = node('message-a', ChatMessageSchema._schemaId, {
  content: 'Watch: Arrival',
  channel: 'chat-a'
})
const task = node('task-a', TaskSchema._schemaId, { title: 'Choose a film', status: 'todo' })
const dataset: ExtensionDataset = { grant, nodes: [channel, message, task] }

function host(initial = dataset.nodes) {
  let rows = initial
  const listeners = new Set<() => void>()
  const query = vi.fn((schema: { _schemaId: string }, options: QueryOptions = {}) => {
    const descriptor = createQueryDescriptor(schema._schemaId, options)
    return {
      getSnapshot: () => applyQueryDescriptor(rows, descriptor),
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }
    }
  })
  return {
    bridge: { ...createExtensionDataBridge(dataset), query } as DataBridge,
    update(next: NodeState[]) {
      rows = next
      ;[...listeners].forEach((listener) => listener())
    },
    listeners,
    query
  }
}

describe('extension data grants', () => {
  it('binds persisted access to the user, source/runtime hash, and supported record types', () => {
    expect(readExtensionGrant(JSON.stringify(grant), owner, 'build-a')).toEqual(grant)
    expect(() => readExtensionGrant(JSON.stringify(grant), 'another-user', 'build-a')).toThrow()
    expect(() => readExtensionGrant(JSON.stringify(grant), owner, 'build-b')).toThrow()
    expect(() => readExtensionGrant('{', owner, 'build-a')).toThrow()
    expect(() =>
      readExtensionGrant(
        JSON.stringify({
          ...grant,
          records: [{ id: 'identity', schemaId: ProfileSchema._schemaId }]
        }),
        owner,
        'build-a'
      )
    ).toThrow()
  })
  it('limits real queries by schema, record, relation scope, filters, and ordering', () => {
    const bridge = createExtensionDataBridge(dataset)
    expect(bridge.query(ChatMessageSchema).getSnapshot()).toEqual([message])
    expect(bridge.query(TaskSchema, { where: { status: 'done' } }).getSnapshot()).toEqual([])
    expect(bridge.query(TaskSchema, { nodeId: task.id }).getSnapshot()).toEqual([task])
    expect(() => bridge.query(PageSchema)).toThrow('denied')
    expect(() => bridge.query(ProfileSchema)).toThrow('denied')
    expect(() => bridge.query(ChatMessageSchema, { where: { channel: 'chat-b' } })).toThrow(
      'denied'
    )
    expect(() => bridge.query(TaskSchema, { nodeId: 'task-b' })).toThrow('denied')
    expect(() => bridge.query(TaskSchema, { source: 'hub' })).toThrow('denied')
    expect(() => bridge.query(TaskSchema, { includeDeleted: true })).toThrow('denied')
    expect(() => bridge.update(task.id, { title: 'Changed' })).toThrow('read-only')
    expect(() =>
      createExtensionDataBridge({ grant, nodes: [node('secret', TaskSchema._schemaId, {})] })
    ).toThrow('outside')
  })
  it('allows an empty task view for creation without exposing existing unselected tasks', () => {
    const creation = {
      ...grant,
      channelIds: [],
      records: [],
      taskWrites: { ids: [], create: true, remove: false }
    }
    const bridge = createExtensionDataBridge({ grant: creation, nodes: [] })
    expect(bridge.query(TaskSchema).getSnapshot()).toEqual([])
    expect(() => bridge.query(TaskSchema, { nodeId: 'task-a' })).toThrow('denied')
    expect(() => createExtensionDataBridge({ grant: creation, nodes: [task] })).toThrow('outside')
  })
  it('rejects hidden-field queries and reports counts only within the approved subset', () => {
    const bridge = createExtensionDataBridge(dataset)
    expect(() => bridge.query(TaskSchema, { where: { visibility: 'private' } })).toThrow()
    expect(() => bridge.query(TaskSchema, { orderBy: { space: 'asc' } })).toThrow()
    expect(() => bridge.query(TaskSchema, { limit: -1 })).toThrow()
    expect(() => bridge.query(TaskSchema, { offset: 1.5 })).toThrow()
    const query = bridge.query(TaskSchema, { limit: 0 })
    expect(query.getSnapshot()).toEqual([])
    expect(query.getMetadata?.()?.pageInfo?.totalCount).toBe(1)
  })
  it('subscribes only to approved selections, forwards updates, and stops on revocation', () => {
    const store = host([
      ...dataset.nodes,
      node('secret', ChatMessageSchema._schemaId, { content: 'private', channel: 'chat-b' })
    ])
    const receive = vi.fn()
    const stop = subscribeExtensionData(store.bridge, grant, () => true, receive)
    expect(store.query).toHaveBeenCalledTimes(3)
    expect(receive.mock.lastCall?.[0].data.nodes).toEqual(dataset.nodes)
    store.update([
      channel,
      { ...message, properties: { ...message.properties, content: 'Watch: Moon' } },
      task
    ])
    expect(receive.mock.lastCall?.[0].data.nodes[1].properties.content).toBe('Watch: Moon')
    stop()
    expect(store.listeners.size).toBe(0)
    const count = receive.mock.calls.length
    store.update([])
    expect(receive).toHaveBeenCalledTimes(count)
  })
  it('drops redacted/deleted content and never passes document bytes', () => {
    const store = host([
      channel,
      { ...message, documentContent: new Uint8Array([1, 2]) },
      { ...task, deleted: true }
    ])
    const receive = vi.fn()
    subscribeExtensionData(store.bridge, grant, () => true, receive)
    expect(receive.mock.lastCall?.[0].data.nodes).toEqual([channel, message])
    store.update([channel, { ...message, properties: { ...message.properties, redacted: true } }])
    expect(receive.mock.lastCall?.[0].data.nodes).toEqual([channel])
  })
  it('fails closed on channel revocation, cross-scope store responses, and limits', () => {
    const receive = vi.fn()
    const store = host()
    let readable = true
    subscribeExtensionData(store.bridge, grant, () => readable, receive)
    readable = false
    store.update(dataset.nodes)
    expect(receive.mock.lastCall?.[0].data).toBeNull()
    expect(receive.mock.lastCall?.[0].error.message).toContain('revoked')
    expect(store.listeners.size).toBe(0)
    const overflowing = host([
      channel,
      ...Array.from({ length: 201 }, (_, i) => ({ ...message, id: `m${i}` }))
    ])
    subscribeExtensionData(overflowing.bridge, grant, () => true, receive)
    expect(receive.mock.lastCall?.[0].error.message).toContain('200 records')
    const wrong = {
      ...store.bridge,
      query: () => ({ getSnapshot: () => [task], subscribe: () => () => {} })
    } as DataBridge
    subscribeExtensionData(wrong, grant, () => true, receive)
    expect(receive.mock.lastCall?.[0].error.message).toContain('outside')
  })
  it('denies newly inaccessible personal records and propagates store failures', () => {
    const receive = vi.fn()
    const store = host([channel, message, { ...task, createdBy: 'did:key:someone-else' }])
    subscribeExtensionData(store.bridge, grant, () => true, receive)
    expect(receive.mock.lastCall?.[0].error.message).toContain('no longer available')
    const unavailable = {
      ...store.bridge,
      query: () => {
        throw new Error('Storage unavailable')
      }
    } as DataBridge
    subscribeExtensionData(unavailable, grant, () => true, receive)
    expect(receive.mock.lastCall?.[0].error.message).toBe('Storage unavailable')
  })
})
