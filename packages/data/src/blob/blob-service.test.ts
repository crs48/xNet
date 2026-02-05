import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { BlobService } from './blob-service'
import { ChunkManager, BlobStore, MemoryAdapter } from '@xnet/storage'

describe('BlobService', () => {
  let blobService: BlobService
  let chunkManager: ChunkManager

  beforeEach(async () => {
    const adapter = new MemoryAdapter()
    await adapter.open()
    const blobStore = new BlobStore(adapter)
    chunkManager = new ChunkManager(blobStore)
    blobService = new BlobService(chunkManager)
  })

  afterEach(() => {
    blobService.revokeAllUrls()
  })

  describe('upload', () => {
    it('uploads a file and returns FileRef', async () => {
      const file = new File(['hello world'], 'test.txt', { type: 'text/plain' })

      const ref = await blobService.upload(file)

      expect(ref.cid).toMatch(/^cid:blake3:/)
      expect(ref.name).toBe('test.txt')
      expect(ref.mimeType).toBe('text/plain')
      expect(ref.size).toBe(11)
    })

    it('uses application/octet-stream as default MIME type', async () => {
      const file = new File(['data'], 'unknown.bin', { type: '' })

      const ref = await blobService.upload(file)

      expect(ref.mimeType).toBe('application/octet-stream')
    })

    it('rejects files that are too large', async () => {
      const service = new BlobService(chunkManager, { maxSize: 100 })
      const content = new Uint8Array(1000)
      const file = new File([content], 'large.bin', { type: 'application/octet-stream' })

      await expect(service.upload(file)).rejects.toThrow('File too large')
    })

    it('deduplicates identical files', async () => {
      const file1 = new File(['same content'], 'file1.txt', { type: 'text/plain' })
      const file2 = new File(['same content'], 'file2.txt', { type: 'text/plain' })

      const ref1 = await blobService.upload(file1)
      const ref2 = await blobService.upload(file2)

      expect(ref1.cid).toBe(ref2.cid)
    })
  })

  describe('uploadData', () => {
    it('uploads raw bytes', async () => {
      const data = new TextEncoder().encode('binary data')

      const ref = await blobService.uploadData(data, {
        filename: 'data.bin',
        mimeType: 'application/octet-stream'
      })

      expect(ref.cid).toMatch(/^cid:blake3:/)
      expect(ref.name).toBe('data.bin')
      expect(ref.size).toBe(data.byteLength)
    })
  })

  describe('getUrl', () => {
    it('returns a blob URL for a file', async () => {
      const file = new File(['hello world'], 'test.txt', { type: 'text/plain' })
      const ref = await blobService.upload(file)

      const url = await blobService.getUrl(ref)

      expect(url).toMatch(/^blob:/)
    })

    it('caches URLs for the same ref', async () => {
      const file = new File(['hello world'], 'test.txt', { type: 'text/plain' })
      const ref = await blobService.upload(file)

      const url1 = await blobService.getUrl(ref)
      const url2 = await blobService.getUrl(ref)

      expect(url1).toBe(url2)
    })

    it('throws for missing blobs', async () => {
      const ref = {
        cid: 'cid:blake3:0000000000000000000000000000000000000000000000000000000000000000',
        name: 'missing.txt',
        mimeType: 'text/plain',
        size: 100
      }

      await expect(blobService.getUrl(ref)).rejects.toThrow('Blob not found')
    })
  })

  describe('getData', () => {
    it('retrieves raw data', async () => {
      const content = new TextEncoder().encode('test data')
      const ref = await blobService.uploadData(content, {
        filename: 'test.bin',
        mimeType: 'application/octet-stream'
      })

      const data = await blobService.getData(ref)
      expect(data).toEqual(content)
    })

    it('returns null for missing data', async () => {
      const ref = {
        cid: 'cid:blake3:0000000000000000000000000000000000000000000000000000000000000000',
        name: 'missing.txt',
        mimeType: 'text/plain',
        size: 100
      }

      const data = await blobService.getData(ref)
      expect(data).toBeNull()
    })
  })

  describe('has', () => {
    it('returns true for uploaded files', async () => {
      const file = new File(['test'], 'test.txt', { type: 'text/plain' })
      const ref = await blobService.upload(file)

      expect(await blobService.has(ref)).toBe(true)
    })

    it('returns false for missing files', async () => {
      const ref = {
        cid: 'cid:blake3:0000000000000000000000000000000000000000000000000000000000000000',
        name: 'missing.txt',
        mimeType: 'text/plain',
        size: 100
      }

      expect(await blobService.has(ref)).toBe(false)
    })
  })

  describe('revokeUrl', () => {
    it('revokes a previously created URL', async () => {
      const file = new File(['test'], 'test.txt', { type: 'text/plain' })
      const ref = await blobService.upload(file)
      await blobService.getUrl(ref)

      blobService.revokeUrl(ref)

      // Getting URL again should create a new one (not cached)
      const newUrl = await blobService.getUrl(ref)
      expect(newUrl).toMatch(/^blob:/)
    })

    it('is safe to call for non-cached ref', () => {
      const ref = {
        cid: 'cid:blake3:some-hash',
        name: 'test.txt',
        mimeType: 'text/plain',
        size: 0
      }

      expect(() => blobService.revokeUrl(ref)).not.toThrow()
    })
  })

  describe('revokeAllUrls', () => {
    it('revokes all cached URLs', async () => {
      const file1 = new File(['a'], 'a.txt', { type: 'text/plain' })
      const file2 = new File(['b'], 'b.txt', { type: 'text/plain' })
      const ref1 = await blobService.upload(file1)
      const ref2 = await blobService.upload(file2)

      await blobService.getUrl(ref1)
      await blobService.getUrl(ref2)

      blobService.revokeAllUrls()

      // Both should create new URLs (not cached)
      const newUrl1 = await blobService.getUrl(ref1)
      const newUrl2 = await blobService.getUrl(ref2)
      expect(newUrl1).toMatch(/^blob:/)
      expect(newUrl2).toMatch(/^blob:/)
    })
  })

  describe('getMissingChunks', () => {
    it('returns empty for existing small files', async () => {
      const file = new File(['test'], 'test.txt', { type: 'text/plain' })
      const ref = await blobService.upload(file)

      const missing = await blobService.getMissingChunks(ref)
      expect(missing).toEqual([])
    })
  })
})
