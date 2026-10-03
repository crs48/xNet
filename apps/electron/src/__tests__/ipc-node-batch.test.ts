import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NodeStore, PageSchema, SQLiteNodeStorageAdapter } from '@xnetjs/data'
import { identityFromPrivateKey } from '@xnetjs/identity'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDataService, type DataService } from '../data-process/data-service'
import { IPCNodeStorageAdapter } from '../renderer/lib/ipc-node-storage'

const { sendEvent } = vi.hoisted(() => ({ sendEvent: vi.fn() }))
vi.mock('../data-process/events', () => ({ sendEvent }))

let root: string
let service: DataService
let database: Database.Database
let store: NodeStore
const signingKey = new Uint8Array(32).fill(73)
const authorDID = identityFromPrivateKey(signingKey).did

async function open(): Promise<void> {
  service = createDataService({ dbPath: join(root, 'data.db') })
  await service.initialize()
  const api = {
    applyNodeBatch: vi.fn(service.applyNodeBatch.bind(service)),
    getNode: service.getNode.bind(service),
    getLastChange: service.getLastChange.bind(service),
    getChanges: service.getChanges.bind(service),
    getLastLamportTime: service.getLastLamportTime.bind(service)
  }
  vi.stubGlobal('window', { xnetNodes: api })
  store = new NodeStore({ storage: new IPCNodeStorageAdapter(), authorDID, signingKey })
  await store.initialize()
  database = new Database(join(root, 'data.db'))
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'xnet-ipc-batch-'))
  await open()
  sendEvent.mockClear()
})
afterEach(async () => {
  database?.close()
  await service?.shutdown()
  vi.unstubAllGlobals()
  await rm(root, { recursive: true, force: true })
})

it('commits desktop edits atomically and reads their signed history after reopening', async () => {
  const node = await store.create({
    id: 'daily-note',
    schemaId: PageSchema._schemaId,
    properties: { title: 'Before' }
  })
  await service.setDocumentContent(node.id, [0, 127, 255])
  await store.update(node.id, { properties: { title: 'After' } })
  const changes = await service.getChanges(node.id)
  expect(changes).toHaveLength(2)
  expect(changes[1].parentHash).toBe(changes[0].hash)
  expect(changes[1].id).not.toBe(changes[1].hash)
  expect(changes[1].payload.properties.title).toBe('After')
  expect(await service.getChangeByHash(changes[1].hash)).toEqual(changes[1])
  expect(await service.getChangesSince(changes[0].lamport)).toEqual([changes[1]])
  expect(window.xnetNodes.applyNodeBatch).toHaveBeenCalledTimes(2)
  expect(sendEvent).toHaveBeenCalledTimes(2)
  expect(await service.getLastLamportTime()).toBe(changes[1].lamport)

  database.close()
  await service.shutdown()
  await open()
  expect((await store.get(node.id))?.properties.title).toBe('After')
  expect(await service.getChanges(node.id)).toEqual(changes)
  expect(await service.getAllChanges()).toEqual(changes)
  expect(await service.getDocumentContent(node.id)).toEqual([0, 127, 255])
})

it('rolls back nodes, history, indexes, and clock when a later write fails; then retries', async () => {
  await store.create({
    id: 'existing',
    schemaId: PageSchema._schemaId,
    properties: { title: 'Keep' }
  })
  const clock = await service.getLastLamportTime()
  const changes = await service.getAllChanges()
  database.exec(`CREATE TRIGGER reject_batch BEFORE INSERT ON changes
    WHEN NEW.node_id = 'rejected'
    BEGIN SELECT RAISE(ABORT, 'Injected disk failure'); END`)
  sendEvent.mockClear()
  const operations = [
    { type: 'update' as const, nodeId: 'existing', options: { properties: { title: 'Replace' } } },
    {
      type: 'create' as const,
      options: { id: 'rejected', schemaId: PageSchema._schemaId, properties: { title: 'New' } }
    }
  ]
  await expect(store.transaction(operations)).rejects.toThrow('Injected disk failure')
  expect((await service.getNode('existing'))?.properties.title).toBe('Keep')
  expect(await service.getNode('rejected')).toBeNull()
  expect(await service.getAllChanges()).toEqual(changes)
  expect(await service.getLastLamportTime()).toBe(clock)
  expect(
    database
      .prepare('SELECT COUNT(*) AS count FROM node_property_scalars WHERE node_id = ?')
      .get('rejected')
  ).toEqual({ count: 0 })
  expect(sendEvent).not.toHaveBeenCalled()

  database.exec('DROP TRIGGER reject_batch')
  const result = await store.transaction(operations)
  expect((await service.getNode('existing'))?.properties.title).toBe('Replace')
  expect((await service.getNode('rejected'))?.properties.title).toBe('New')
  const saved = (await service.getAllChanges()).filter(
    (change) => change.batchId === result.batchId
  )
  expect(saved.map((change) => [change.batchIndex, change.batchSize])).toEqual([
    [0, 2],
    [1, 2]
  ])
  expect(saved.map((change) => change.id)).toEqual(result.changes.map((change) => change.id))
  expect(sendEvent).toHaveBeenCalledTimes(1)
})

it('preserves a deleted record and restores it after restart', async () => {
  await store.create({
    id: 'deleted',
    schemaId: PageSchema._schemaId,
    properties: { title: 'Return' }
  })
  await store.delete('deleted')
  const deleted = await service.getNode('deleted')
  expect(deleted?.deleted).toBe(true)
  expect((await service.getLastChange('deleted'))?.authorDID).toBe(authorDID)
  database.close()
  await service.shutdown()
  await open()
  await store.restore('deleted')
  expect((await store.get('deleted'))?.properties.title).toBe('Return')
})

it('rejects access after shutdown instead of acknowledging an empty workspace', async () => {
  await service.shutdown()
  await expect(service.getNode('missing')).rejects.toThrow('Database not initialized')
  await expect(service.getAllChanges()).rejects.toThrow('Database not initialized')
})

it('edits an imported record without losing its original signed change identity', async () => {
  await service.importDeterministicNodes({
    drafts: [
      { id: 'imported', schemaId: PageSchema._schemaId, properties: { title: 'Source title' } }
    ],
    authorDID,
    signingKey: Array.from(signingKey)
  })
  const original = await service.getLastChange('imported')
  expect(original?.payload.nodeId).toBe('imported')
  expect(original?.payload.properties.title).toBe('Source title')
  await store.update('imported', { properties: { title: 'My title' } })
  const changes = await service.getChanges('imported')
  expect(changes).toHaveLength(2)
  expect(changes[0]).toEqual(original)
  expect(changes[1].parentHash).toBe(original?.hash)
  expect(changes[1].lamport).toBeGreaterThan(original!.lamport)
  expect((await service.getNode('imported'))?.properties.title).toBe('My title')
})

it('hydrates a query page in one batch while preserving order and document bytes', async () => {
  for (const id of ['old', 'middle', 'new'])
    await store.create({ id, schemaId: PageSchema._schemaId, properties: { title: id } })
  const time = database.prepare('UPDATE nodes SET created_at=? WHERE id=?')
  time.run(1, 'old')
  time.run(2, 'middle')
  time.run(3, 'new')
  await service.setDocumentContent('middle', [0, 127, 255])
  const expected = [await service.getNode('middle'), await service.getNode('old')]
  const single = vi.spyOn(service, 'getNode')
  const batch = vi.spyOn(SQLiteNodeStorageAdapter.prototype, 'getNodes')
  try {
    const rows = await service.listNodes({
      schemaId: PageSchema._schemaId,
      orderBy: { createdAt: 'desc' },
      offset: 1,
      limit: 2
    })
    expect(rows).toEqual(expected)
    expect(single).not.toHaveBeenCalled()
    expect(batch).toHaveBeenCalledExactlyOnceWith(['middle', 'old'])
  } finally {
    single.mockRestore()
    batch.mockRestore()
  }
})
