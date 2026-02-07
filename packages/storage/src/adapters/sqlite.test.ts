/**
 * Tests for SQLiteStorageAdapter
 */

import type { DocumentData } from '../types'
import type { SignedUpdate, Snapshot, ContentId } from '@xnet/core'
import type { SQLiteAdapter } from '@xnet/sqlite'
import { createMemorySQLiteAdapter } from '@xnet/sqlite/memory'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SQLiteStorageAdapter } from './sqlite'

describe('SQLiteStorageAdapter', () => {
  let db: SQLiteAdapter
  let storage: SQLiteStorageAdapter

  beforeEach(async () => {
    db = await createMemorySQLiteAdapter()
    storage = new SQLiteStorageAdapter(db)
    await storage.open()
  })

  afterEach(async () => {
    await storage.close()
    await db.close()
  })

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  describe('Lifecycle', () => {
    it('opens and closes', async () => {
      // Already opened in beforeEach
      await storage.close()
      // Should be able to reopen
      await storage.open()
    })

    it('throws if not opened', async () => {
      const closedDb = await createMemorySQLiteAdapter()
      const closedStorage = new SQLiteStorageAdapter(closedDb)

      await expect(closedStorage.getDocument('test')).rejects.toThrow('StorageAdapter not open')

      await closedDb.close()
    })

    it('clears all data', async () => {
      // Add some data
      await storage.setDocument('doc-1', createTestDoc('doc-1'))
      await storage.setBlob('cid:test:blob-1' as ContentId, new Uint8Array([4, 5, 6]))

      // Clear
      await storage.clear()

      // Verify empty
      const doc = await storage.getDocument('doc-1')
      const blob = await storage.getBlob('cid:test:blob-1' as ContentId)
      expect(doc).toBeNull()
      expect(blob).toBeNull()
    })
  })

  // ─── Documents ────────────────────────────────────────────────────────────

  describe('Documents', () => {
    it('stores and retrieves documents', async () => {
      const testDoc = createTestDoc('doc-1')
      await storage.setDocument(testDoc.id, testDoc)
      const retrieved = await storage.getDocument(testDoc.id)

      expect(retrieved).not.toBeNull()
      expect(retrieved!.id).toBe(testDoc.id)
      expect(retrieved!.content).toEqual(testDoc.content)
      expect(retrieved!.metadata.type).toBe('page')
    })

    it('returns null for non-existent document', async () => {
      const doc = await storage.getDocument('nonexistent')
      expect(doc).toBeNull()
    })

    it('updates existing documents', async () => {
      const testDoc = createTestDoc('doc-1')
      await storage.setDocument(testDoc.id, testDoc)

      const updated = { ...testDoc, version: 2 }
      await storage.setDocument(testDoc.id, updated)

      const retrieved = await storage.getDocument(testDoc.id)
      expect(retrieved!.version).toBe(2)
    })

    it('deletes documents', async () => {
      const testDoc = createTestDoc('doc-1')
      await storage.setDocument(testDoc.id, testDoc)
      await storage.deleteDocument(testDoc.id)

      const retrieved = await storage.getDocument(testDoc.id)
      expect(retrieved).toBeNull()
    })

    it('lists documents by prefix', async () => {
      await storage.setDocument('pages/1', createTestDoc('pages/1'))
      await storage.setDocument('pages/2', createTestDoc('pages/2'))
      await storage.setDocument('blobs/1', createTestDoc('blobs/1'))

      const pages = await storage.listDocuments('pages/')
      expect(pages).toHaveLength(2)
      expect(pages.every((id) => id.startsWith('pages/'))).toBe(true)
    })

    it('lists all documents without prefix', async () => {
      await storage.setDocument('doc-1', createTestDoc('doc-1'))
      await storage.setDocument('doc-2', createTestDoc('doc-2'))

      const all = await storage.listDocuments()
      expect(all).toHaveLength(2)
    })
  })

  // ─── Updates ──────────────────────────────────────────────────────────────

  describe('Updates', () => {
    it('appends and retrieves updates', async () => {
      const update1 = createTestUpdate('hash-1', new Uint8Array([1, 2, 3]))
      const update2 = createTestUpdate('hash-2', new Uint8Array([4, 5, 6]))

      await storage.appendUpdate('doc-1', update1)
      await storage.appendUpdate('doc-1', update2)

      const updates = await storage.getUpdates('doc-1')
      expect(updates).toHaveLength(2)
    })

    it('counts updates', async () => {
      await storage.appendUpdate('doc-1', createTestUpdate('hash-1', new Uint8Array([1])))
      await storage.appendUpdate('doc-1', createTestUpdate('hash-2', new Uint8Array([2])))
      await storage.appendUpdate('doc-1', createTestUpdate('hash-3', new Uint8Array([3])))

      const count = await storage.getUpdateCount('doc-1')
      expect(count).toBe(3)
    })

    it('deduplicates identical updates by hash', async () => {
      const update = createTestUpdate('same-hash', new Uint8Array([1, 2, 3]))

      await storage.appendUpdate('doc-1', update)
      await storage.appendUpdate('doc-1', update) // Same hash

      const count = await storage.getUpdateCount('doc-1')
      expect(count).toBe(1)
    })

    it('returns empty array for document with no updates', async () => {
      const updates = await storage.getUpdates('nonexistent')
      expect(updates).toHaveLength(0)
    })
  })

  // ─── Snapshots ────────────────────────────────────────────────────────────

  describe('Snapshots', () => {
    it('stores and retrieves snapshots', async () => {
      const snapshot = createTestSnapshot('doc-1')

      await storage.setSnapshot('doc-1', snapshot)
      const retrieved = await storage.getSnapshot('doc-1')

      expect(retrieved).not.toBeNull()
      expect(retrieved!.id).toBe(snapshot.id)
      expect(retrieved!.documentId).toBe('doc-1')
    })

    it('returns null for non-existent snapshot', async () => {
      const snapshot = await storage.getSnapshot('nonexistent')
      expect(snapshot).toBeNull()
    })

    it('overwrites existing snapshots', async () => {
      const snapshot1 = createTestSnapshot('doc-1')
      const snapshot2 = { ...createTestSnapshot('doc-1'), id: 'snapshot-2' }

      await storage.setSnapshot('doc-1', snapshot1)
      await storage.setSnapshot('doc-1', snapshot2)

      const retrieved = await storage.getSnapshot('doc-1')
      expect(retrieved!.id).toBe('snapshot-2')
    })
  })

  // ─── Blobs ────────────────────────────────────────────────────────────────

  describe('Blobs', () => {
    const testCid = 'cid:blake3:abc123' as ContentId

    it('stores and retrieves blobs', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5])

      await storage.setBlob(testCid, data)
      const retrieved = await storage.getBlob(testCid)

      expect(retrieved).toEqual(data)
    })

    it('returns null for non-existent blob', async () => {
      const blob = await storage.getBlob('cid:test:nonexistent' as ContentId)
      expect(blob).toBeNull()
    })

    it('checks blob existence', async () => {
      await storage.setBlob(testCid, new Uint8Array([1, 2, 3]))

      expect(await storage.hasBlob(testCid)).toBe(true)
      expect(await storage.hasBlob('cid:test:other' as ContentId)).toBe(false)
    })

    it('does not overwrite existing blobs', async () => {
      const original = new Uint8Array([1, 2, 3])
      const duplicate = new Uint8Array([4, 5, 6])

      await storage.setBlob(testCid, original)
      await storage.setBlob(testCid, duplicate) // Should be ignored

      const retrieved = await storage.getBlob(testCid)
      expect(retrieved).toEqual(original)
    })

    it('deletes blobs', async () => {
      await storage.setBlob(testCid, new Uint8Array([1, 2, 3]))
      await storage.deleteBlob(testCid)

      expect(await storage.hasBlob(testCid)).toBe(false)
    })
  })

  // ─── Extended Methods ─────────────────────────────────────────────────────

  describe('Extended Methods', () => {
    it('returns storage stats', async () => {
      await storage.setDocument('doc-1', createTestDoc('doc-1'))
      await storage.setBlob('cid:test:blob-1' as ContentId, new Uint8Array([1, 2, 3, 4, 5]))
      await storage.appendUpdate('doc-1', createTestUpdate('hash-1', new Uint8Array([1, 2])))
      await storage.setSnapshot('doc-1', createTestSnapshot('doc-1'))

      const stats = await storage.getStats()

      expect(stats.documentCount).toBe(1)
      expect(stats.blobCount).toBe(1)
      expect(stats.blobTotalSize).toBe(5)
      expect(stats.updateCount).toBe(1)
      expect(stats.snapshotCount).toBe(1)
    })

    it('compacts updates into snapshot', async () => {
      await storage.appendUpdate('doc-1', createTestUpdate('hash-1', new Uint8Array([1])))
      await storage.appendUpdate('doc-1', createTestUpdate('hash-2', new Uint8Array([2])))
      await storage.appendUpdate('doc-1', createTestUpdate('hash-3', new Uint8Array([3])))

      const mergedSnapshot = createTestSnapshot('doc-1')
      const deletedCount = await storage.compactUpdates('doc-1', mergedSnapshot)

      expect(deletedCount).toBe(3)
      expect(await storage.getUpdateCount('doc-1')).toBe(0)
      expect((await storage.getSnapshot('doc-1'))?.id).toBe(mergedSnapshot.id)
    })
  })
})

// ─── Integration Tests ───────────────────────────────────────────────────────

describe('SQLiteStorageAdapter Integration', () => {
  let db: SQLiteAdapter
  let storage: SQLiteStorageAdapter

  beforeEach(async () => {
    db = await createMemorySQLiteAdapter()
    storage = new SQLiteStorageAdapter(db)
    await storage.open()
  })

  afterEach(async () => {
    await storage.close()
    await db.close()
  })

  describe('with BlobStore', () => {
    it('stores and retrieves data through BlobStore', async () => {
      // Import dynamically to avoid circular deps
      const { BlobStore } = await import('../blob-store')
      const blobStore = new BlobStore(storage)

      const data = new Uint8Array([1, 2, 3, 4, 5])
      const cid = await blobStore.put(data)

      expect(cid).toMatch(/^cid:blake3:/)
      expect(await blobStore.has(cid)).toBe(true)

      const retrieved = await blobStore.get(cid)
      expect(retrieved).toEqual(data)
    })

    it('deduplicates identical data', async () => {
      const { BlobStore } = await import('../blob-store')
      const blobStore = new BlobStore(storage)

      const data = new Uint8Array([1, 2, 3, 4, 5])
      const cid1 = await blobStore.put(data)
      const cid2 = await blobStore.put(data)

      expect(cid1).toBe(cid2)

      const stats = await storage.getStats()
      expect(stats.blobCount).toBe(1)
    })

    it('verifies content integrity', async () => {
      const { BlobStore } = await import('../blob-store')
      const blobStore = new BlobStore(storage)

      const data = new Uint8Array([1, 2, 3, 4, 5])
      const cid = await blobStore.put(data)

      expect(blobStore.verify(cid, data)).toBe(true)
      expect(blobStore.verify(cid, new Uint8Array([9, 9, 9]))).toBe(false)
    })

    it('deletes blobs through BlobStore', async () => {
      const { BlobStore } = await import('../blob-store')
      const blobStore = new BlobStore(storage)

      const data = new Uint8Array([1, 2, 3, 4, 5])
      const cid = await blobStore.put(data)

      await blobStore.delete(cid)
      expect(await blobStore.has(cid)).toBe(false)
    })
  })

  describe('with ChunkManager', () => {
    it('stores small files directly', async () => {
      const { BlobStore } = await import('../blob-store')
      const { ChunkManager } = await import('../chunk-manager')

      const blobStore = new BlobStore(storage)
      const chunkManager = new ChunkManager(blobStore, {
        chunkThreshold: 1024 // 1KB threshold for testing
      })

      const smallData = new Uint8Array(100).fill(42)
      const result = await chunkManager.store(smallData, {
        filename: 'small.txt',
        mimeType: 'text/plain'
      })

      expect(result.isChunked).toBe(false)
      expect(result.cid).toMatch(/^cid:blake3:/)

      const retrieved = await chunkManager.retrieve(result.cid)
      expect(retrieved).toEqual(smallData)
    })

    it('chunks and reassembles large files', async () => {
      const { BlobStore } = await import('../blob-store')
      const { ChunkManager } = await import('../chunk-manager')

      const blobStore = new BlobStore(storage)
      const chunkManager = new ChunkManager(blobStore, {
        chunkSize: 100, // 100 bytes per chunk
        chunkThreshold: 200 // Chunk files > 200 bytes
      })

      // Create a file larger than threshold
      const largeData = new Uint8Array(500)
      for (let i = 0; i < 500; i++) {
        largeData[i] = i % 256
      }

      const result = await chunkManager.store(largeData, {
        filename: 'large.bin',
        mimeType: 'application/octet-stream'
      })

      expect(result.isChunked).toBe(true)

      const retrieved = await chunkManager.retrieve(result.cid)
      expect(retrieved).toEqual(largeData)
    })

    it('reports missing chunks', async () => {
      const { BlobStore } = await import('../blob-store')
      const { ChunkManager } = await import('../chunk-manager')

      const blobStore = new BlobStore(storage)
      const chunkManager = new ChunkManager(blobStore, {
        chunkSize: 100,
        chunkThreshold: 200
      })

      const largeData = new Uint8Array(500).fill(1)
      const result = await chunkManager.store(largeData, {
        filename: 'test.bin',
        mimeType: 'application/octet-stream'
      })

      // All chunks should be present
      const missing = await chunkManager.getMissingChunks(result.cid)
      expect(missing).toHaveLength(0)
      expect(await chunkManager.has(result.cid)).toBe(true)
    })
  })
})

// ─── Test Helpers ───────────────────────────────────────────────────────────

function createTestDoc(id: string): DocumentData {
  const now = Date.now()
  return {
    id,
    content: new Uint8Array([1, 2, 3]),
    metadata: { created: now, updated: now, type: 'page' },
    version: 1
  }
}

function createTestUpdate(hash: string, update: Uint8Array): SignedUpdate {
  return {
    update,
    parentHash: 'parent-hash',
    updateHash: hash,
    authorDID: 'did:key:z6MkhaXgBZDvotDkL5LZnkwPDYr4E4Nfy5sQk5YJqRhEjLRs',
    signature: new Uint8Array([1, 2, 3]),
    timestamp: Date.now(),
    vectorClock: { 'peer-1': 1 }
  }
}

function createTestSnapshot(docId: string): Snapshot {
  return {
    id: 'snapshot-1',
    documentId: docId,
    stateVector: new Uint8Array([1, 2]),
    compressedState: new Uint8Array([3, 4, 5]),
    timestamp: Date.now(),
    creatorDID: 'did:key:z6MkhaXgBZDvotDkL5LZnkwPDYr4E4Nfy5sQk5YJqRhEjLRs',
    signature: new Uint8Array([6, 7, 8]),
    contentId: 'cid:blake3:snapshot123' as ContentId
  }
}
