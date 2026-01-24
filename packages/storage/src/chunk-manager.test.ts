import { describe, it, expect, beforeEach } from 'vitest'
import { ChunkManager, CHUNK_THRESHOLD, CHUNK_SIZE } from './chunk-manager'
import { BlobStore } from './blob-store'
import { MemoryAdapter } from './adapters/memory'

describe('ChunkManager', () => {
  let chunkManager: ChunkManager
  let blobStore: BlobStore

  beforeEach(async () => {
    const adapter = new MemoryAdapter()
    await adapter.open()
    blobStore = new BlobStore(adapter)
    chunkManager = new ChunkManager(blobStore)
  })

  describe('store', () => {
    it('stores small files without chunking', async () => {
      const data = new Uint8Array(1000) // 1KB, well under threshold
      const { cid, isChunked } = await chunkManager.store(data, {
        filename: 'small.bin',
        mimeType: 'application/octet-stream'
      })

      expect(isChunked).toBe(false)
      expect(cid).toMatch(/^cid:blake3:/)
    })

    it('chunks large files', async () => {
      const data = new Uint8Array(CHUNK_THRESHOLD + 1) // Just over threshold
      const { cid, isChunked } = await chunkManager.store(data, {
        filename: 'large.bin',
        mimeType: 'application/octet-stream'
      })

      expect(isChunked).toBe(true)
      expect(cid).toMatch(/^cid:blake3:/)
    })

    it('stores files exactly at threshold without chunking', async () => {
      const data = new Uint8Array(CHUNK_THRESHOLD - 1)
      const { isChunked } = await chunkManager.store(data, {
        filename: 'exact.bin',
        mimeType: 'application/octet-stream'
      })

      expect(isChunked).toBe(false)
    })

    it('preserves filename and mimeType in manifest', async () => {
      const data = new Uint8Array(CHUNK_THRESHOLD + 100)
      const { cid } = await chunkManager.store(data, {
        filename: 'photo.jpg',
        mimeType: 'image/jpeg'
      })

      // Retrieve the manifest
      const manifestData = await blobStore.get(cid)
      expect(manifestData).not.toBeNull()
      const manifest = JSON.parse(new TextDecoder().decode(manifestData!))
      expect(manifest.filename).toBe('photo.jpg')
      expect(manifest.mimeType).toBe('image/jpeg')
      expect(manifest.totalSize).toBe(CHUNK_THRESHOLD + 100)
      expect(manifest.version).toBe(1)
    })

    it('creates correct number of chunks', async () => {
      // Need size > CHUNK_THRESHOLD to trigger chunking
      const size = CHUNK_THRESHOLD + CHUNK_SIZE * 2 + 100 // 1MB + 512KB + 100 = ~1.5MB
      const data = new Uint8Array(size)
      for (let i = 0; i < data.length; i++) data[i] = i % 256 // Unique data per chunk
      const { cid, isChunked } = await chunkManager.store(data, {
        filename: 'multi.bin',
        mimeType: 'application/octet-stream'
      })

      expect(isChunked).toBe(true)
      const manifestData = await blobStore.get(cid)
      const manifest = JSON.parse(new TextDecoder().decode(manifestData!))
      const expectedChunks = Math.ceil(size / CHUNK_SIZE)
      expect(manifest.chunks.length).toBe(expectedChunks)
    })
  })

  describe('retrieve', () => {
    it('retrieves small files directly', async () => {
      const data = new TextEncoder().encode('hello world')
      const { cid } = await chunkManager.store(data, {
        filename: 'test.txt',
        mimeType: 'text/plain'
      })

      const retrieved = await chunkManager.retrieve(cid)
      expect(retrieved).toEqual(data)
    })

    it('reassembles chunked files', async () => {
      // Create data larger than chunk threshold with known pattern
      const data = new Uint8Array(CHUNK_THRESHOLD + 500)
      for (let i = 0; i < data.length; i++) {
        data[i] = i % 256
      }

      const { cid } = await chunkManager.store(data, {
        filename: 'large.bin',
        mimeType: 'application/octet-stream'
      })

      const retrieved = await chunkManager.retrieve(cid)
      expect(retrieved).toEqual(data)
    })

    it('returns null for missing CID', async () => {
      const result = await chunkManager.retrieve(
        'cid:blake3:0000000000000000000000000000000000000000000000000000000000000000' as any
      )
      expect(result).toBeNull()
    })

    it('throws when chunks are missing', async () => {
      const data = new Uint8Array(CHUNK_THRESHOLD + 100)
      for (let i = 0; i < data.length; i++) data[i] = ((i >> 16) ^ (i >> 8) ^ i) & 0xff
      const { cid } = await chunkManager.store(data, {
        filename: 'test.bin',
        mimeType: 'application/octet-stream'
      })

      // Get the manifest to find chunk CIDs
      const manifestData = await blobStore.get(cid)
      const manifest = JSON.parse(new TextDecoder().decode(manifestData!))

      // Delete one chunk from the underlying store
      const adapter = (blobStore as any).adapter
      adapter.blobs.delete(manifest.chunks[0])

      await expect(chunkManager.retrieve(cid)).rejects.toThrow('Missing chunk')
    })
  })

  describe('has', () => {
    it('returns true when small file exists', async () => {
      const data = new TextEncoder().encode('test')
      const { cid } = await chunkManager.store(data, {
        filename: 'test.txt',
        mimeType: 'text/plain'
      })

      expect(await chunkManager.has(cid)).toBe(true)
    })

    it('returns true when all chunks exist', async () => {
      const data = new Uint8Array(CHUNK_THRESHOLD + 100)
      const { cid } = await chunkManager.store(data, {
        filename: 'test.bin',
        mimeType: 'application/octet-stream'
      })

      expect(await chunkManager.has(cid)).toBe(true)
    })

    it('returns false when a chunk is missing', async () => {
      const data = new Uint8Array(CHUNK_THRESHOLD + 100)
      for (let i = 0; i < data.length; i++) data[i] = ((i >> 16) ^ (i >> 8) ^ i) & 0xff
      const { cid } = await chunkManager.store(data, {
        filename: 'test.bin',
        mimeType: 'application/octet-stream'
      })

      // Delete one chunk
      const manifestData = await blobStore.get(cid)
      const manifest = JSON.parse(new TextDecoder().decode(manifestData!))
      const adapter = (blobStore as any).adapter
      adapter.blobs.delete(manifest.chunks[0])

      expect(await chunkManager.has(cid)).toBe(false)
    })

    it('returns false for missing CID', async () => {
      const result = await chunkManager.has(
        'cid:blake3:0000000000000000000000000000000000000000000000000000000000000000' as any
      )
      expect(result).toBe(false)
    })
  })

  describe('getMissingChunks', () => {
    it('returns empty array when all chunks exist', async () => {
      const data = new Uint8Array(CHUNK_THRESHOLD + 100)
      const { cid } = await chunkManager.store(data, {
        filename: 'test.bin',
        mimeType: 'application/octet-stream'
      })

      const missing = await chunkManager.getMissingChunks(cid)
      expect(missing).toEqual([])
    })

    it('returns missing chunk CIDs', async () => {
      const data = new Uint8Array(CHUNK_THRESHOLD + 100)
      // Each byte encodes its position including high bits so chunks are unique
      for (let i = 0; i < data.length; i++) data[i] = ((i >> 16) ^ (i >> 8) ^ i) & 0xff
      const { cid } = await chunkManager.store(data, {
        filename: 'test.bin',
        mimeType: 'application/octet-stream'
      })

      // Delete one chunk
      const manifestData = await blobStore.get(cid)
      const manifest = JSON.parse(new TextDecoder().decode(manifestData!))
      const adapter = (blobStore as any).adapter
      adapter.blobs.delete(manifest.chunks[0])

      const missing = await chunkManager.getMissingChunks(cid)
      expect(missing).toContain(manifest.chunks[0])
      expect(missing.length).toBe(1)
    })

    it('returns the CID itself if manifest is missing', async () => {
      const cid =
        'cid:blake3:0000000000000000000000000000000000000000000000000000000000000000' as any
      const missing = await chunkManager.getMissingChunks(cid)
      expect(missing).toEqual([cid])
    })

    it('returns empty for non-chunked file', async () => {
      const data = new TextEncoder().encode('small file')
      const { cid } = await chunkManager.store(data, {
        filename: 'small.txt',
        mimeType: 'text/plain'
      })

      const missing = await chunkManager.getMissingChunks(cid)
      expect(missing).toEqual([])
    })
  })
})
