/**
 * Tests for SQLiteStorageAdapter
 */

import type { ContentId } from '@xnetjs/core'
import type { SQLiteAdapter } from '@xnetjs/sqlite'
import { createMemorySQLiteAdapter } from '@xnetjs/sqlite/memory'
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

      await expect(closedStorage.getBlob('cid:blake3:test' as ContentId)).rejects.toThrow(
        'StorageAdapter not open'
      )

      await closedDb.close()
    })

    it('clears all data', async () => {
      await storage.setBlob('cid:blake3:blob1' as ContentId, new Uint8Array([4, 5, 6]))

      // Clear
      await storage.clear()

      // Verify empty
      const blob = await storage.getBlob('cid:blake3:blob1' as ContentId)
      expect(blob).toBeNull()
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
      const blob = await storage.getBlob('cid:blake3:nonexistent' as ContentId)
      expect(blob).toBeNull()
    })

    it('checks blob existence', async () => {
      await storage.setBlob(testCid, new Uint8Array([1, 2, 3]))

      expect(await storage.hasBlob(testCid)).toBe(true)
      expect(await storage.hasBlob('cid:blake3:other' as ContentId)).toBe(false)
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
      await storage.setBlob('cid:blake3:blob1' as ContentId, new Uint8Array([1, 2, 3, 4, 5]))

      const stats = await storage.getStats()

      expect(stats.blobCount).toBe(1)
      expect(stats.blobTotalSize).toBe(5)
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
