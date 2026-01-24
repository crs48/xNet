import { describe, it, expect, beforeEach } from 'vitest'
import { BlobStore } from './blob-store'
import { MemoryAdapter } from './adapters/memory'

describe('BlobStore', () => {
  let blobStore: BlobStore
  let adapter: MemoryAdapter

  beforeEach(async () => {
    adapter = new MemoryAdapter()
    await adapter.open()
    blobStore = new BlobStore(adapter)
  })

  describe('put', () => {
    it('stores data and returns a CID', async () => {
      const data = new TextEncoder().encode('hello world')
      const cid = await blobStore.put(data)

      expect(cid).toMatch(/^cid:blake3:/)
    })

    it('deduplicates identical data', async () => {
      const data = new TextEncoder().encode('hello world')
      const cid1 = await blobStore.put(data)
      const cid2 = await blobStore.put(data)

      expect(cid1).toBe(cid2)
    })

    it('produces different CIDs for different data', async () => {
      const data1 = new TextEncoder().encode('hello')
      const data2 = new TextEncoder().encode('world')
      const cid1 = await blobStore.put(data1)
      const cid2 = await blobStore.put(data2)

      expect(cid1).not.toBe(cid2)
    })

    it('handles empty data', async () => {
      const data = new Uint8Array(0)
      const cid = await blobStore.put(data)

      expect(cid).toMatch(/^cid:blake3:/)
    })

    it('handles binary data', async () => {
      const data = new Uint8Array([0, 1, 2, 255, 128, 64])
      const cid = await blobStore.put(data)

      expect(cid).toMatch(/^cid:blake3:/)
      const retrieved = await blobStore.get(cid)
      expect(retrieved).toEqual(data)
    })
  })

  describe('get', () => {
    it('retrieves stored data', async () => {
      const data = new TextEncoder().encode('hello world')
      const cid = await blobStore.put(data)

      const retrieved = await blobStore.get(cid)
      expect(retrieved).toEqual(data)
    })

    it('returns null for missing CID', async () => {
      const result = await blobStore.get(
        'cid:blake3:0000000000000000000000000000000000000000000000000000000000000000' as any
      )
      expect(result).toBeNull()
    })
  })

  describe('has', () => {
    it('returns true for stored data', async () => {
      const data = new TextEncoder().encode('test')
      const cid = await blobStore.put(data)

      expect(await blobStore.has(cid)).toBe(true)
    })

    it('returns false for missing CID', async () => {
      const result = await blobStore.has(
        'cid:blake3:0000000000000000000000000000000000000000000000000000000000000000' as any
      )
      expect(result).toBe(false)
    })
  })

  describe('verify', () => {
    it('verifies correct data', async () => {
      const data = new TextEncoder().encode('hello world')
      const cid = await blobStore.put(data)

      expect(blobStore.verify(cid, data)).toBe(true)
    })

    it('rejects tampered data', async () => {
      const data = new TextEncoder().encode('hello world')
      const cid = await blobStore.put(data)

      const tampered = new TextEncoder().encode('hello world!')
      expect(blobStore.verify(cid, tampered)).toBe(false)
    })

    it('rejects completely different data', async () => {
      const data = new TextEncoder().encode('original')
      const cid = await blobStore.put(data)

      const different = new TextEncoder().encode('different')
      expect(blobStore.verify(cid, different)).toBe(false)
    })
  })

  describe('buildTree', () => {
    it('builds a Merkle tree from chunks', async () => {
      const chunk1 = { data: new Uint8Array([1, 2, 3]), hash: 'aaa', size: 3 }
      const chunk2 = { data: new Uint8Array([4, 5, 6]), hash: 'bbb', size: 3 }

      const tree = blobStore.buildTree([chunk1, chunk2])

      expect(tree.rootHash).toBeDefined()
      expect(tree.nodes.size).toBeGreaterThan(0)
    })

    it('handles empty chunk list', () => {
      const tree = blobStore.buildTree([])
      expect(tree.rootHash).toBeDefined()
    })
  })

  describe('delete', () => {
    it('does not throw when deleteBlob is not available', async () => {
      const data = new TextEncoder().encode('test')
      const cid = await blobStore.put(data)

      // MemoryAdapter doesn't have deleteBlob, so this should be a no-op
      await expect(blobStore.delete(cid)).resolves.not.toThrow()
    })
  })
})
