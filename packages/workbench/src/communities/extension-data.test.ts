import type { ExtensionDataset, ExtensionGrant } from './extension-data'
import type { NodeState } from '@xnetjs/data'
import {
  ChannelSchema,
  ChatMessageSchema,
  PageSchema,
  TaskSchema,
  ProfileSchema
} from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import { createExtensionDataBridge, readExtensionGrant } from './extension-data'

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
})
