import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createXNetClient, type XNetClient } from './client'
import { MemoryAdapter } from '@xnet/storage'

describe('XNetClient', () => {
  let client: XNetClient

  beforeEach(async () => {
    client = await createXNetClient({
      storage: new MemoryAdapter(),
      enableNetwork: false
    })
  })

  afterEach(async () => {
    await client.stop()
  })

  describe('initialization', () => {
    it('should create client with identity', () => {
      expect(client.identity).toBeDefined()
      expect(client.identity.did).toMatch(/^did:key:z/)
    })

    it('should be ready after creation', () => {
      expect(client.isReady).toBe(true)
    })

    it('should be offline when network is disabled', () => {
      expect(client.syncStatus).toBe('offline')
    })
  })

  describe('document operations', () => {
    it('should create a document', async () => {
      const doc = await client.createDocument({
        workspace: 'test-ws',
        type: 'page',
        title: 'Test Page'
      })

      expect(doc.id).toContain('test-ws/')
      expect(doc.metadata.title).toBe('Test Page')
    })

    it('should get a document', async () => {
      const doc = await client.createDocument({
        workspace: 'test-ws',
        type: 'page',
        title: 'Test Page'
      })

      const retrieved = await client.getDocument(doc.id)
      expect(retrieved?.id).toBe(doc.id)
    })

    it('should return null for non-existent document', async () => {
      const retrieved = await client.getDocument('non-existent')
      expect(retrieved).toBeNull()
    })

    it('should delete a document', async () => {
      const doc = await client.createDocument({
        workspace: 'test',
        type: 'page',
        title: 'To Delete'
      })

      await client.deleteDocument(doc.id)
      const retrieved = await client.getDocument(doc.id)
      expect(retrieved).toBeNull()
    })

    it('should list documents', async () => {
      await client.createDocument({ workspace: 'ws1', type: 'page', title: 'Doc 1' })
      await client.createDocument({ workspace: 'ws1', type: 'page', title: 'Doc 2' })
      await client.createDocument({ workspace: 'ws2', type: 'page', title: 'Doc 3' })

      const allDocs = await client.listDocuments()
      expect(allDocs).toHaveLength(3)
    })

    it('should list documents with prefix filter', async () => {
      await client.createDocument({ workspace: 'ws1', type: 'page', title: 'Doc 1' })
      await client.createDocument({ workspace: 'ws1', type: 'page', title: 'Doc 2' })
      await client.createDocument({ workspace: 'ws2', type: 'page', title: 'Doc 3' })

      const ws1Docs = await client.listDocuments('ws1/')
      expect(ws1Docs).toHaveLength(2)
    })
  })

  describe('search', () => {
    it('should search documents', async () => {
      await client.createDocument({ workspace: 'test', type: 'page', title: 'Meeting Notes' })
      await client.createDocument({ workspace: 'test', type: 'page', title: 'Project Plan' })

      const results = await client.search('meeting')
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].title).toBe('Meeting Notes')
    })

    it('should return empty results for no match', async () => {
      await client.createDocument({ workspace: 'test', type: 'page', title: 'Meeting Notes' })

      const results = await client.search('nonexistent')
      expect(results).toHaveLength(0)
    })
  })

  describe('events', () => {
    it('should subscribe and unsubscribe to events', () => {
      const handler = () => {}
      const unsubscribe = client.on('document:update', handler)

      expect(typeof unsubscribe).toBe('function')
      unsubscribe()
    })
  })

  describe('lifecycle', () => {
    it('should stop client', async () => {
      await client.stop()
      expect(client.isReady).toBe(false)
    })
  })
})
