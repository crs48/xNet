import type { SchemaIRI } from '../schema/node'
import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { createDID } from '@xnetjs/identity'
import { expect, it, vi } from 'vitest'
import { MemoryNodeStorageAdapter } from './memory-adapter'
import { NodeStore } from './store'

const schemaId = 'xnet://fixture/Page' as SchemaIRI
async function paired(legacy = false) {
  const key = generateSigningKeyPair()
  const storage = new MemoryNodeStorageAdapter()
  if (legacy) Object.defineProperty(storage, 'applyNodeBatch', { value: undefined })
  const options = {
    storage,
    authorDID: createDID(key.publicKey) as DID,
    signingKey: key.privateKey
  }
  const renderer = new NodeStore(options),
    native = new NodeStore(options)
  await renderer.initialize()
  await native.initialize()
  for (let index = 0; index < 10; index++)
    await native.create({ schemaId, properties: { title: `Earlier ${index}` } })
  return { renderer, native, storage }
}

it.each([false, true])(
  'orders later local edits after a native import (legacy=%s)',
  async (legacy) => {
    const { renderer, native, storage } = await paired(legacy)
    const page = await native.create({ schemaId, properties: { title: 'Captured title' } })
    const importedClock = await storage.getLastLamportTime()
    const result = await renderer.update(page.id, { properties: { title: 'My edited title' } })
    expect(result.properties.title).toBe('My edited title')
    expect(result.timestamps.title.lamport).toBeGreaterThan(importedClock)
    expect(await storage.getLastLamportTime()).toBeGreaterThan(importedClock)
  }
)

it('refreshes query and node subscribers without reapplying signed changes', async () => {
  const { renderer, native, storage } = await paired()
  const page = await native.create({ schemaId, properties: { title: 'Imported note' } })
  const all = vi.fn(),
    one = vi.fn()
  renderer.subscribe(all)
  renderer.subscribeToNode(page.id, one)
  const changes = await storage.getAllChanges()
  await renderer.refreshPersistedNodes([page.id, page.id])
  expect(all).toHaveBeenCalledOnce()
  expect(one).toHaveBeenCalledOnce()
  expect(one.mock.calls[0][0]).toMatchObject({ node: { id: page.id }, isRemote: true })
  expect(await storage.getAllChanges()).toEqual(changes)
  await expect(renderer.refreshPersistedNodes(['missing'])).rejects.toThrow('missing or unreadable')
  expect(all).toHaveBeenCalledOnce()
})

it('uses the persisted clock for a batch from a still-open store', async () => {
  const { renderer, native } = await paired()
  const page = await native.create({ schemaId, properties: { title: 'Import' } })
  await renderer.transaction([
    { type: 'update', nodeId: page.id, options: { properties: { title: 'Batch edit' } } }
  ])
  expect((await renderer.get(page.id))?.properties.title).toBe('Batch edit')
  await native.importDeterministicNodes([
    { id: page.id, schemaId, properties: { title: 'Later import' } }
  ])
  expect((await renderer.get(page.id))?.properties.title).toBe('Later import')
})
