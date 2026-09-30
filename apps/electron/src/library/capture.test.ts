import type { DataService } from '../data-process/data-service'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import {
  captureDocument,
  readPageText,
  saveCapture,
  validateCapture,
  type CaptureInput
} from './capture'
import { LibraryStore } from './store'

let root: string
let store: LibraryStore
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'xnet-capture-'))
  store = new LibraryStore(join(root, 'library.db'))
})
afterEach(async () => {
  store.close()
  await rm(root, { recursive: true, force: true })
})
const input = (): CaptureInput => ({
  requestId: randomUUID(),
  url: 'https://youtu.be/abcdefghijk?t=20',
  title: 'My source note',
  note: 'Why this matters to me.',
  excerpt: 'A cited passage.'
})
const identity = { authorDID: 'did:key:fixture', signingKey: Array(32).fill(1) as number[] }
function memoryData() {
  const nodes = new Map<string, NonNullable<Awaited<ReturnType<DataService['getNode']>>>>()
  const documents = new Map<string, number[]>()
  let rejectDocument = false
  const data: Pick<
    DataService,
    'getNode' | 'getDocumentContent' | 'setDocumentContent' | 'importDeterministicNodes'
  > = {
    getNode: async (id) => nodes.get(id) ?? null,
    getDocumentContent: async (id) => documents.get(id) ?? null,
    setDocumentContent: async (id, bytes) => {
      if (rejectDocument) throw new Error('Disk unavailable')
      documents.set(id, bytes)
    },
    importDeterministicNodes: async (options) => {
      for (const draft of options.drafts)
        nodes.set(draft.id, {
          id: draft.id,
          schemaId: draft.schemaId,
          properties: draft.properties,
          timestamps: {},
          createdAt: 1,
          updatedAt: 1,
          createdBy: identity.authorDID,
          updatedBy: identity.authorDID,
          deleted: false
        })
      return {
        batchId: 'fixture',
        created: options.drafts.length,
        updated: 0,
        timings: {} as never
      }
    }
  }
  return {
    data,
    nodes,
    documents,
    failDocument: () => {
      rejectDocument = true
    },
    allowDocument: () => {
      rejectDocument = false
    }
  }
}
it('saves an editable Page and independent citation with idempotent request retries', async () => {
  const state = memoryData(),
    request = input()
  const first = await saveCapture({ input: request, store, data: state.data, identity })
  expect(await saveCapture({ input: request, store, data: state.data, identity })).toEqual(first)
  expect(state.nodes.size).toBe(2)
  expect(state.nodes.get(first.pageId)?.properties.sourceResources).toEqual([first.resourceId])
  expect(store.pendingCaptures()).toEqual([])
  expect(store.search({ text: 'matters' })[0].id).toBe(first.resourceId)
  const doc = new Y.Doc()
  Y.applyUpdate(doc, new Uint8Array(state.documents.get(first.pageId)!))
  expect(doc.getXmlFragment('content-v4').toString()).toContain('Why this matters to me.')
  doc.destroy()
})
it('retains the complete intent after a failed body write and resumes after reopening storage', async () => {
  const state = memoryData(),
    request = input()
  state.failDocument()
  await expect(saveCapture({ input: request, store, data: state.data, identity })).rejects.toThrow(
    'Disk unavailable'
  )
  store.close()
  store = new LibraryStore(join(root, 'library.db'))
  expect(store.pendingCaptures()[0].input.note).toBe(request.note)
  expect(store.pendingCaptures()[0].completed).toBe(false)
  state.allowDocument()
  const result = await saveCapture({
    input: store.pendingCaptures()[0].input,
    store,
    data: state.data,
    identity
  })
  expect(state.nodes.size).toBe(2)
  expect(state.documents.has(result.pageId)).toBe(true)
  expect(store.pendingCaptures()).toEqual([])
})
it('reuses a source while preserving separately requested notes and later edits', async () => {
  const state = memoryData(),
    request = input()
  const first = await saveCapture({ input: request, store, data: state.data, identity })
  const edited = captureDocument({ ...request, note: 'My later edit.' })
  state.documents.set(first.pageId, edited)
  const second = await saveCapture({
    input: { ...request, requestId: randomUUID(), note: 'Another independent note.' },
    store,
    data: state.data,
    identity
  })
  expect(second.resourceId).toBe(first.resourceId)
  expect(second.pageId).not.toBe(first.pageId)
  expect(second.reusedResource).toBe(true)
  expect(state.nodes.size).toBe(3)
  await saveCapture({ input: request, store, data: state.data, identity })
  expect(state.documents.get(first.pageId)).toEqual(edited)
})
it('refuses a different payload or identity under an existing retry key', async () => {
  const state = memoryData(),
    request = input()
  await saveCapture({ input: request, store, data: state.data, identity })
  await expect(
    saveCapture({ input: { ...request, note: 'Different' }, store, data: state.data, identity })
  ).rejects.toThrow('different capture')
  await expect(
    saveCapture({
      input: request,
      store,
      data: state.data,
      identity: { ...identity, authorDID: 'did:key:other' }
    })
  ).rejects.toThrow('different capture')
  expect(() => validateCapture({ ...request, url: 'file:///private/data' })).toThrow()
  expect(() => validateCapture({ ...request, note: 'a'.repeat(100001) })).toThrow(
    'not been discarded'
  )
})

it('keeps imported source properties and earlier personal notes when adding a capture', async () => {
  const state = memoryData()
  const first = await saveCapture({ input: input(), store, data: state.data, identity })
  const source = state.nodes.get(first.resourceId)!
  const imported = {
    ...source,
    properties: { ...source.properties, title: 'Original export title', rawData: 'source-evidence' }
  }
  state.nodes.set(source.id, imported)
  const next = await saveCapture({
    input: { ...input(), url: 'https://www.youtube.com/watch?v=abcdefghijk' },
    store,
    data: state.data,
    identity
  })
  expect(next.resourceId).toBe(source.id)
  expect(next.reusedResource).toBe(true)
  expect(state.nodes.get(source.id)).toEqual(imported)
  expect(store.get(source.id)?.notes?.map((note) => note.pageId)).toEqual([
    first.pageId,
    next.pageId
  ])
})

it('replays an interrupted completion without overwriting a subsequently edited body', async () => {
  const state = memoryData(),
    request = input()
  const write = store.saveCaptureIntent.bind(store)
  const failure = vi.spyOn(store, 'saveCaptureIntent').mockImplementation((intent) => {
    if (intent.completed) throw new Error('Completion write interrupted')
    write(intent)
  })
  await expect(saveCapture({ input: request, store, data: state.data, identity })).rejects.toThrow(
    'interrupted'
  )
  const pending = store.pendingCaptures()[0]
  const edited = captureDocument({ ...request, note: 'Later edit survives the recovery retry.' })
  state.documents.set(pending.result.pageId, edited)
  failure.mockRestore()
  await saveCapture({ input: request, store, data: state.data, identity })
  expect(readPageText(state.documents.get(pending.result.pageId)!)).toContain('Later edit survives')
  expect(store.pendingCaptures()).toEqual([])
  expect(store.search({ text: 'survives' })[0].id).toBe(pending.result.resourceId)
})

it('does not index an unsupported document format as an empty note', () => {
  const doc = new Y.Doc()
  doc.getText('legacy-body').insert(0, 'Text that must not disappear from the index silently.')
  expect(() => readPageText(Array.from(Y.encodeStateAsUpdate(doc)))).toThrow(
    'unsupported document format'
  )
  doc.destroy()
})
