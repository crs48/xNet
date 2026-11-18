// @vitest-environment node
import type { ExtensionGrant } from './extension-data'
import type { NodeState } from '@xnetjs/data'
import type { DataBridge, QueryOptions } from '@xnetjs/data-bridge'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import {
  FolderSchema,
  SpaceSchema,
  SpaceMembershipSchema,
  spaceMembershipId,
  MemoryNodeStorageAdapter,
  NodeStore,
  PageSchema,
  TaskSchema,
  ChannelSchema
} from '@xnetjs/data'
import { documentOverlayKey } from '@xnetjs/data/store'
import { applyQueryDescriptor, createQueryDescriptor } from '@xnetjs/data-bridge'
import { createDID } from '@xnetjs/identity'
import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { extendExtensionAuthority, openExtensionAuthority } from './extension-authority'
import { createExtensionBroker } from './extension-broker'
import { createExtensionDataBridge, readExtensionGrant } from './extension-data'
import { editableDocumentText, saveExtensionDocument } from './extension-document-editing'
import { createExtensionQueryBroker } from './extension-queries'

async function setup() {
  const pair = generateSigningKeyPair(),
    owner = createDID(pair.publicKey)
  const storage = new MemoryNodeStorageAdapter()
  const store = new NodeStore({ storage, authorDID: owner, signingKey: pair.privateKey })
  await store.initialize()
  const rows = new Map<string, NodeState>()
  const put = async (
    id: string,
    schemaId: NodeState['schemaId'],
    properties: Record<string, unknown>,
    createdBy = owner
  ) => {
    const node: NodeState = {
      id,
      schemaId,
      properties,
      createdBy,
      updatedBy: createdBy,
      createdAt: rows.size,
      updatedAt: rows.size,
      deleted: false,
      timestamps: {}
    }
    await storage.setNode(node)
    rows.set(id, node)
    return node
  }
  const grant: ExtensionGrant = {
    version: 1,
    owner,
    hash: 'permission-test',
    channelIds: [],
    records: []
  }
  const bridge: DataBridge = {
    ...createExtensionDataBridge({ grant, nodes: [] }),
    get: (id) => storage.getNode(id),
    getLocalState: (key) => store.getLocalState(key),
    transaction: vi.fn((ops, conditions) => store.transaction(ops, conditions)),
    query: vi.fn((schema, options = {}) => ({
      getSnapshot: () =>
        applyQueryDescriptor([...rows.values()], createQueryDescriptor(schema._schemaId, options)),
      subscribe: () => () => {}
    }))
  }
  const approve = async () =>
    (await openExtensionAuthority(bridge, owner, 'permissions', grant.hash, grant))!.authority
  const reader = async () => {
    const authority = await approve()
    const broker = createExtensionQueryBroker(bridge, grant, authority, () => true)
    return {
      broker,
      read: (options: QueryOptions = {}, schemaId: string = TaskSchema._schemaId) =>
        broker.query(
          {
            version: 1,
            id: crypto.randomUUID(),
            operation: 'data.query',
            schemaId,
            options
          },
          new AbortController().signal
        )
    }
  }
  return { put, rows, storage, store, bridge, grant, approve, reader }
}

describe('container authority', () => {
  it('includes future records in nested private folders, filters fields and partitions ancestry cursors', async () => {
    const env = await setup()
    await env.put('root', FolderSchema._schemaId, { name: 'Root' })
    await env.put('nested', FolderSchema._schemaId, { name: 'Nested', parent: 'root' })
    await env.put('a', TaskSchema._schemaId, { title: 'A', folder: 'nested', secret: 'hidden' })
    await env.put('outside', TaskSchema._schemaId, { title: 'Outside' })
    env.grant.containers = [{ kind: 'folder', id: 'root', descendants: true }]
    const { read, broker } = await env.reader()
    expect((await read()).nodes.map((n) => n.id)).toEqual(['a'])
    await env.put('b', TaskSchema._schemaId, { title: 'B', folder: 'nested' })
    const page = await read({ page: { first: 1 } })
    expect(page.nodes.map((n) => n.id)).toEqual(['b'])
    expect(page.metadata.pageInfo.hasMore).toBe(true)
    expect(JSON.stringify(page)).not.toContain('hidden')
    expect(page.nodes[0].properties).toEqual({ title: 'B' })
    expect(broker.affects(env.rows.get('nested')!)).toBe(true)
    await env.put('root', FolderSchema._schemaId, { name: 'Renamed' })
    await expect(
      read({ page: { first: 1, after: page.metadata.pageInfo.endCursor } })
    ).rejects.toMatchObject({ code: 'invalid' })
    await expect(read({ nodeId: 'outside' })).resolves.toMatchObject({ nodes: [] })
    env.grant.channelIds.push('allowed-channel')
    await expect(read({ nodeId: 'guessed' }, ChannelSchema._schemaId)).rejects.toThrow()
  })
  it('rejects cyclic, missing, foreign and shared folder ancestry', async () => {
    for (const parent of ['root', 'missing', 'foreign', 'shared']) {
      const env = await setup()
      await env.put('root', FolderSchema._schemaId, { name: 'Root', parent })
      if (parent === 'foreign')
        await env.put(parent, FolderSchema._schemaId, { name: 'Foreign' }, 'did:key:other')
      if (parent === 'shared')
        await env.put(parent, FolderSchema._schemaId, { name: 'Shared', space: 'org' })
      env.grant.containers = [{ kind: 'folder', id: 'root', descendants: true }]
      const { read } = await env.reader()
      await expect(read()).rejects.toMatchObject({ code: 'denied' })
    }
  })
  it('rejects cached descendants that have moved outside the selected root', async () => {
    const env = await setup()
    await env.put('root', FolderSchema._schemaId, { name: 'Root' })
    await env.put('other', FolderSchema._schemaId, { name: 'Other' })
    const child = await env.put('child', FolderSchema._schemaId, { name: 'Child', parent: 'root' })
    await env.storage.setNode({ ...child, properties: { name: 'Child', parent: 'other' } })
    env.grant.containers = [{ kind: 'folder', id: 'root', descendants: true }]
    const { read } = await env.reader()
    await expect(read()).rejects.toMatchObject({ code: 'conflict' })
  })
  it('inherits valid owner-issued space membership, excludes private records, and expires open access', async () => {
    const env = await setup()
    await env.put('org', SpaceSchema._schemaId, { name: 'Org' }, 'did:key:admin')
    await env.put('team', SpaceSchema._schemaId, { name: 'Team', parent: 'org' }, 'did:key:admin')
    const expiry = Date.now() + 60000
    await env.put(
      spaceMembershipId('org', env.grant.owner),
      SpaceMembershipSchema._schemaId,
      { space: 'org', member: env.grant.owner, role: 'viewer', expiresAt: expiry },
      'did:key:admin'
    )
    await env.put(
      'visible',
      TaskSchema._schemaId,
      { title: 'Team task', space: 'team', visibility: 'inherit' },
      'did:key:other'
    )
    await env.put(
      'private',
      TaskSchema._schemaId,
      { title: 'Secret', space: 'team', visibility: 'private' },
      'did:key:other'
    )
    env.grant.containers = [{ kind: 'space', id: 'team', descendants: true }]
    const { read, broker } = await env.reader()
    expect((await read()).nodes.map((n) => n.id)).toEqual(['visible'])
    expect(broker.affects(env.rows.get(spaceMembershipId('org', env.grant.owner))!)).toBe(true)
    const clock = vi.spyOn(Date, 'now').mockReturnValue(expiry + 1)
    try {
      expect(() => broker.checkExpiry()).toThrow('expired')
      await expect(read()).rejects.toMatchObject({ code: 'denied' })
    } finally {
      clock.mockRestore()
    }
  })
  it('does not trust self-issued memberships and rechecks evidence after a query', async () => {
    const env = await setup()
    await env.put('org', SpaceSchema._schemaId, { name: 'Org' }, 'did:key:admin')
    const edge = spaceMembershipId('org', env.grant.owner)
    await env.put(edge, SpaceMembershipSchema._schemaId, {
      space: 'org',
      member: env.grant.owner,
      role: 'owner'
    })
    env.grant.containers = [{ kind: 'space', id: 'org', descendants: false }]
    const { read } = await env.reader()
    await expect(read()).rejects.toMatchObject({ code: 'denied' })
    await env.put(
      edge,
      SpaceMembershipSchema._schemaId,
      { space: 'org', member: env.grant.owner, role: 'viewer' },
      'did:key:admin'
    )
    const original = env.bridge.query
    env.bridge.query = (schema, options) => {
      const result = original(schema, options)
      void env.storage.setNode({ ...env.rows.get(edge)!, deleted: true })
      return result
    }
    await expect(read()).rejects.toMatchObject({ code: 'conflict' })
  })
})

async function editorSetup() {
  const env = await setup()
  await env.put('folder', FolderSchema._schemaId, { name: 'Private' })
  await env.put('page', PageSchema._schemaId, { title: 'Notes', folder: 'folder' })
  env.grant.containers = [{ kind: 'folder', id: 'folder', descendants: true }]
  env.grant.records = [{ id: 'page', schemaId: PageSchema._schemaId }]
  env.grant.documents = { read: ['page'], write: ['page'] }
  const authority = await env.approve()
  const doc = new Y.Doc({ gc: false }),
    paragraph = new Y.XmlElement('paragraph'),
    text = new Y.XmlText()
  text.insert(0, 'Before')
  paragraph.insert(0, [text])
  doc.getXmlFragment('content-v4').insert(0, [paragraph])
  const entry = { nodeId: 'page', doc, revision: 1 }
  doc.on('update', () => entry.revision++)
  const save = (next = 'After', revision = entry.revision) =>
    saveExtensionDocument(
      env.bridge,
      env.grant,
      authority,
      entry,
      revision,
      next,
      new AbortController().signal,
      () => true
    )
  return { ...env, authority, entry, doc, save }
}

describe('host document edits', () => {
  it('keeps an approved document editor working after an unrelated permission upgrade', async () => {
    const env = await editorSetup()
    await extendExtensionAuthority(env.bridge, env.authority, {
      ...env.grant,
      taskWrites: { ids: [], create: true, remove: false }
    })
    await env.save('After task access was added')
    expect(editableDocumentText(env.doc)?.text).toBe('After task access was added')
    expect((await env.authority.read()).approval.commands).toBe(1)
    await env.authority.revoke()
    await expect(env.save('Not allowed')).rejects.toMatchObject({ code: 'revoked' })
    env.doc.destroy()
  })
  it('commits attributed text and authority together, preserves CRDT history, and survives reopening', async () => {
    const env = await editorSetup()
    const initial = Y.encodeStateAsUpdate(env.doc)
    await env.storage.setDocumentContent('page', initial)
    await env.save('After\nSecond line')
    expect(editableDocumentText(env.doc)?.text).toBe('After\nSecond line')
    expect((await env.authority.read()).approval.commands).toBe(1)
    const conditions = vi
      .mocked(env.bridge.transaction!)
      .mock.calls.find(([, condition]) =>
        condition?.receipt?.context.includes('document.edit')
      )![1]!
    expect(JSON.parse(conditions.receipt!.context)).toMatchObject({
      kind: 'document.edit',
      nodeId: 'page',
      owner: env.grant.owner
    })
    expect(conditions.nodes.map((n) => n.id)).toEqual(['page', 'folder'])
    expect(await env.bridge.getLocalState!(conditions.receipt!.key)).not.toBeNull()
    await env.storage.setDocumentContent('page', initial)
    const reopened = new Y.Doc()
    Y.applyUpdate(reopened, (await env.storage.getDocumentContent('page'))!)
    expect(editableDocumentText(reopened)?.text).toBe('After\nSecond line')
    env.doc.destroy()
    reopened.destroy()
  })
  it('rejects revocation and reparenting between validation and commit without touching live content', async () => {
    for (const race of ['revocation', 'reparent']) {
      const env = await editorSetup()
      const transaction = env.bridge.transaction!
      env.bridge.transaction = async (ops, conditions) => {
        if (conditions?.receipt?.context.includes('document.edit')) {
          if (race === 'revocation') await env.authority.revoke()
          else
            await env.storage.setNode({
              ...env.rows.get('folder')!,
              properties: { name: 'Moved', parent: 'shared' }
            })
        }
        return transaction(ops, conditions)
      }
      await expect(env.save()).rejects.toThrow('changed')
      expect(editableDocumentText(env.doc)?.text).toBe('Before')
      expect(await env.bridge.getLocalState!(documentOverlayKey('page'))).toBeNull()
      env.doc.destroy()
    }
  })
  it('includes document acquisition and validation in the commit deadline', async () => {
    const env = await editorSetup()
    const get = env.bridge.get!,
      now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    env.bridge.get = async (id) => {
      const result = await get(id)
      clock.mockReturnValue(now + 6000)
      return result
    }
    try {
      await expect(env.save()).rejects.toMatchObject({ code: 'timeout' })
      expect(editableDocumentText(env.doc)?.text).toBe('Before')
      expect(await env.bridge.getLocalState!(documentOverlayKey('page'))).toBeNull()
    } finally {
      clock.mockRestore()
      env.doc.destroy()
    }
  })
  it('rejects stale drafts, read-only grants, rich text, shared destinations, and excess bytes', async () => {
    const env = await editorSetup()
    await expect(env.save('After', 0)).rejects.toMatchObject({ code: 'conflict' })
    await expect(env.save('界'.repeat(22000))).rejects.toMatchObject({ code: 'quota' })
    env.grant.documents!.write = []
    await expect(env.save()).rejects.toMatchObject({ code: 'denied' })
    env.grant.documents!.write = ['page']
    const p = env.doc.getXmlFragment('content-v4').get(0) as Y.XmlElement
    ;(p.get(0) as Y.XmlText).format(0, 2, { bold: true })
    await expect(env.save()).rejects.toMatchObject({ code: 'unsupported' })
    await env.storage.setNode({
      ...env.rows.get('page')!,
      properties: { title: 'Notes', space: 'shared' }
    })
    await expect(env.save()).rejects.toMatchObject({ code: 'denied' })
    expect(env.bridge.transaction).toHaveBeenCalledTimes(1) // approval only
    env.doc.destroy()
  })
  it('permits selected private-folder task edits and rejects a concurrent folder move', async () => {
    const env = await setup()
    await env.put('folder', FolderSchema._schemaId, { name: 'Private' })
    await env.put('task', TaskSchema._schemaId, { title: 'Task', folder: 'folder' })
    env.grant.containers = [{ kind: 'folder', id: 'folder', descendants: true }]
    env.grant.records = [{ id: 'task', schemaId: TaskSchema._schemaId }]
    env.grant.taskWrites = { ids: ['task'], create: false, remove: false }
    const authority = await env.approve()
    const broker = createExtensionBroker(env.bridge, env.grant, () => true, authority)
    const command = () => ({
      version: 1,
      id: crypto.randomUUID(),
      operation: 'data.mutate',
      operations: [{ type: 'update', nodeId: 'task', properties: { status: 'done' } }]
    })
    await broker.request(command())
    expect((await env.storage.getNode('task'))?.properties.status).toBe('done')
    const cancelled = new AbortController(),
      get = env.bridge.get!
    env.bridge.get = async (id) => {
      const node = await get(id)
      if (id === 'folder') cancelled.abort()
      return node
    }
    await expect(broker.request(command(), cancelled.signal)).rejects.toMatchObject({
      code: 'cancelled'
    })
    env.bridge.get = get
    const transaction = env.bridge.transaction!
    env.bridge.transaction = async (ops, conditions) => {
      await env.storage.setNode({ ...env.rows.get('folder')!, properties: { parent: 'other' } })
      return transaction(ops, conditions)
    }
    await expect(broker.request(command())).rejects.toThrow('changed')
  })
  it('rejects malformed container and write grants without enlarging a document read grant', async () => {
    const env = await setup()
    for (const extra of [
      { containers: [null] },
      { containers: [{ kind: 'folder', id: 'x', descendants: true, all: true }] },
      { documents: { read: [], write: ['secret'] } }
    ])
      expect(() =>
        readExtensionGrant(
          JSON.stringify({ ...env.grant, ...extra }),
          env.grant.owner,
          env.grant.hash
        )
      ).toThrow()
  })
})
