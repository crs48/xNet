import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { IndexedDBAdapter } from './indexeddb'
import type { ContentId, SignedUpdate } from '@xnet/core'

describe('IndexedDBAdapter', () => {
  let adapter: IndexedDBAdapter

  beforeEach(async () => {
    adapter = new IndexedDBAdapter()
    await adapter.open()
  })

  afterEach(async () => {
    await adapter.clear()
    await adapter.close()
  })

  describe('document operations', () => {
    it('should store and retrieve document', async () => {
      const doc = {
        id: 'doc-1',
        content: new Uint8Array([1, 2, 3]),
        metadata: { created: Date.now(), updated: Date.now(), type: 'page' },
        version: 1
      }
      await adapter.setDocument('doc-1', doc)
      const retrieved = await adapter.getDocument('doc-1')
      expect(retrieved?.id).toBe('doc-1')
      expect(retrieved?.version).toBe(1)
    })

    it('should return null for non-existent document', async () => {
      const retrieved = await adapter.getDocument('non-existent')
      expect(retrieved).toBeNull()
    })

    it('should delete document', async () => {
      const doc = {
        id: 'doc-to-delete',
        content: new Uint8Array([1, 2, 3]),
        metadata: { created: Date.now(), updated: Date.now(), type: 'page' },
        version: 1
      }
      await adapter.setDocument('doc-to-delete', doc)
      await adapter.deleteDocument('doc-to-delete')
      const retrieved = await adapter.getDocument('doc-to-delete')
      expect(retrieved).toBeNull()
    })

    it('should list documents with prefix', async () => {
      await adapter.setDocument('workspace/doc-1', {
        id: 'workspace/doc-1',
        content: new Uint8Array(),
        metadata: { created: Date.now(), updated: Date.now(), type: 'page' },
        version: 1
      })
      await adapter.setDocument('workspace/doc-2', {
        id: 'workspace/doc-2',
        content: new Uint8Array(),
        metadata: { created: Date.now(), updated: Date.now(), type: 'page' },
        version: 1
      })
      await adapter.setDocument('other/doc-3', {
        id: 'other/doc-3',
        content: new Uint8Array(),
        metadata: { created: Date.now(), updated: Date.now(), type: 'page' },
        version: 1
      })

      const docs = await adapter.listDocuments('workspace/')
      expect(docs).toHaveLength(2)
      expect(docs).toContain('workspace/doc-1')
      expect(docs).toContain('workspace/doc-2')
    })

    it('should list all documents without prefix', async () => {
      await adapter.setDocument('doc-1', {
        id: 'doc-1',
        content: new Uint8Array(),
        metadata: { created: Date.now(), updated: Date.now(), type: 'page' },
        version: 1
      })
      await adapter.setDocument('doc-2', {
        id: 'doc-2',
        content: new Uint8Array(),
        metadata: { created: Date.now(), updated: Date.now(), type: 'page' },
        version: 1
      })

      const docs = await adapter.listDocuments()
      expect(docs).toHaveLength(2)
    })
  })

  describe('blob operations', () => {
    it('should store and retrieve blob by CID', async () => {
      const cid = 'cid:blake3:abc123' as ContentId
      const data = new Uint8Array([1, 2, 3, 4, 5])
      await adapter.setBlob(cid, data)
      const retrieved = await adapter.getBlob(cid)
      expect(retrieved).toEqual(data)
    })

    it('should check blob existence', async () => {
      const cid = 'cid:blake3:xyz789' as ContentId
      expect(await adapter.hasBlob(cid)).toBe(false)
      await adapter.setBlob(cid, new Uint8Array([1, 2, 3]))
      expect(await adapter.hasBlob(cid)).toBe(true)
    })

    it('should return null for non-existent blob', async () => {
      const cid = 'cid:blake3:nonexistent' as ContentId
      const retrieved = await adapter.getBlob(cid)
      expect(retrieved).toBeNull()
    })
  })

  describe('update operations', () => {
    const mockUpdate: SignedUpdate = {
      update: new Uint8Array([1, 2, 3]),
      parentHash: 'parent-hash',
      updateHash: 'update-hash-1',
      authorDID: 'did:key:test',
      signature: new Uint8Array([4, 5, 6]),
      timestamp: Date.now(),
      vectorClock: { peer1: 1 }
    }

    it('should append and retrieve updates', async () => {
      await adapter.appendUpdate('doc-1', mockUpdate)
      const updates = await adapter.getUpdates('doc-1')
      expect(updates).toHaveLength(1)
      expect(updates[0].updateHash).toBe('update-hash-1')
    })

    it('should count updates', async () => {
      await adapter.appendUpdate('doc-1', mockUpdate)
      await adapter.appendUpdate('doc-1', { ...mockUpdate, updateHash: 'update-hash-2' })
      const count = await adapter.getUpdateCount('doc-1')
      expect(count).toBe(2)
    })
  })

  describe('snapshot operations', () => {
    it('should store and retrieve snapshot', async () => {
      const snapshot = {
        id: 'snapshot-1',
        documentId: 'doc-1',
        stateVector: new Uint8Array([1, 2]),
        compressedState: new Uint8Array([3, 4]),
        timestamp: Date.now(),
        creatorDID: 'did:key:test',
        signature: new Uint8Array([5, 6]),
        contentId: 'cid:blake3:snap123' as ContentId
      }
      await adapter.setSnapshot('doc-1', snapshot)
      const retrieved = await adapter.getSnapshot('doc-1')
      expect(retrieved?.id).toBe('snapshot-1')
    })

    it('should return null for non-existent snapshot', async () => {
      const retrieved = await adapter.getSnapshot('non-existent')
      expect(retrieved).toBeNull()
    })
  })

  describe('lifecycle', () => {
    it('should throw when database not open', async () => {
      const closedAdapter = new IndexedDBAdapter()
      await expect(closedAdapter.getDocument('test')).rejects.toThrow('Database not open')
    })

    it('should clear all data', async () => {
      await adapter.setDocument('doc-1', {
        id: 'doc-1',
        content: new Uint8Array(),
        metadata: { created: Date.now(), updated: Date.now(), type: 'page' },
        version: 1
      })
      await adapter.clear()
      const docs = await adapter.listDocuments()
      expect(docs).toHaveLength(0)
    })
  })
})
