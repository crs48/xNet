import { describe, it, expect, beforeEach } from 'vitest'
import { createLocalQueryEngine, type LocalQueryEngine } from './engine'
import { MemoryAdapter } from '@xnet/storage'
import { createDocument, type XDocument } from '@xnet/data'
import { generateIdentity } from '@xnet/identity'

describe('LocalQueryEngine', () => {
  let storage: MemoryAdapter
  let documents: Map<string, XDocument>
  let engine: LocalQueryEngine

  beforeEach(async () => {
    storage = new MemoryAdapter()
    await storage.open()
    documents = new Map()

    const { identity, privateKey } = generateIdentity()

    // Create test documents
    for (let i = 0; i < 5; i++) {
      const doc = createDocument({
        id: `doc-${i}`,
        workspace: 'ws-1',
        type: i < 3 ? 'page' : 'task',
        title: `Document ${i}`,
        createdBy: identity.did,
        signingKey: privateKey
      })
      documents.set(doc.id, doc)
      await storage.setDocument(doc.id, {
        id: doc.id,
        content: new Uint8Array(),
        metadata: { created: Date.now(), updated: Date.now(), type: doc.type },
        version: 1
      })
    }

    engine = createLocalQueryEngine(storage, async (id) => documents.get(id) ?? null)
  })

  describe('query', () => {
    it('should query all documents', async () => {
      const result = await engine.query({ type: 'any', filters: [] })
      expect(result.items).toHaveLength(5)
      expect(result.total).toBe(5)
    })

    it('should filter by type', async () => {
      const result = await engine.query({ type: 'page', filters: [] })
      expect(result.items).toHaveLength(3)
    })

    it('should filter by task type', async () => {
      const result = await engine.query({ type: 'task', filters: [] })
      expect(result.items).toHaveLength(2)
    })

    it('should filter by field with contains operator', async () => {
      const result = await engine.query({
        type: 'any',
        filters: [{ field: 'title', operator: 'contains', value: '0' }]
      })
      expect(result.items).toHaveLength(1)
    })

    it('should filter by field with eq operator', async () => {
      const result = await engine.query({
        type: 'any',
        filters: [{ field: 'title', operator: 'eq', value: 'Document 2' }]
      })
      expect(result.items).toHaveLength(1)
    })

    it('should filter by field with ne operator', async () => {
      const result = await engine.query({
        type: 'any',
        filters: [{ field: 'title', operator: 'ne', value: 'Document 0' }]
      })
      expect(result.items).toHaveLength(4)
    })

    it('should filter by field with startsWith operator', async () => {
      const result = await engine.query({
        type: 'any',
        filters: [{ field: 'title', operator: 'startsWith', value: 'Doc' }]
      })
      expect(result.items).toHaveLength(5)
    })

    it('should filter by field with in operator', async () => {
      const result = await engine.query({
        type: 'any',
        filters: [{ field: 'title', operator: 'in', value: ['Document 0', 'Document 1'] }]
      })
      expect(result.items).toHaveLength(2)
    })
  })

  describe('pagination', () => {
    it('should paginate results', async () => {
      const result = await engine.query({ type: 'any', filters: [], limit: 2, offset: 0 })
      expect(result.items).toHaveLength(2)
      expect(result.hasMore).toBe(true)
      expect(result.cursor).toBe('2')
    })

    it('should get second page', async () => {
      const result = await engine.query({ type: 'any', filters: [], limit: 2, offset: 2 })
      expect(result.items).toHaveLength(2)
      expect(result.hasMore).toBe(true)
      expect(result.cursor).toBe('4')
    })

    it('should get last page', async () => {
      const result = await engine.query({ type: 'any', filters: [], limit: 2, offset: 4 })
      expect(result.items).toHaveLength(1)
      expect(result.hasMore).toBe(false)
      expect(result.cursor).toBeUndefined()
    })
  })

  describe('sorting', () => {
    it('should sort ascending', async () => {
      const result = await engine.query<{ title: string }>({
        type: 'any',
        filters: [],
        sort: [{ field: 'title', direction: 'asc' }]
      })
      expect(result.items[0].title).toBe('Document 0')
      expect(result.items[4].title).toBe('Document 4')
    })

    it('should sort descending', async () => {
      const result = await engine.query<{ title: string }>({
        type: 'any',
        filters: [],
        sort: [{ field: 'title', direction: 'desc' }]
      })
      expect(result.items[0].title).toBe('Document 4')
      expect(result.items[4].title).toBe('Document 0')
    })
  })

  describe('count', () => {
    it('should count all documents', async () => {
      const count = await engine.count({ type: 'any', filters: [] })
      expect(count).toBe(5)
    })

    it('should count filtered documents', async () => {
      const count = await engine.count({ type: 'page', filters: [] })
      expect(count).toBe(3)
    })
  })
})
