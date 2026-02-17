import type { BlobMeta, DocMeta, HubStorage } from '../src/storage/interface'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryStorage } from '../src/storage/memory'
import { createSQLiteStorage } from '../src/storage/sqlite'

// Detect whether SQLite native bindings are available (may fail on mismatched Node.js versions)
let sqliteAvailable = false
try {
  const tmpDir = mkdtempSync(join(tmpdir(), 'hub-probe-'))
  createSQLiteStorage(tmpDir).close()
  rmSync(tmpDir, { recursive: true, force: true })
  sqliteAvailable = true
} catch {
  sqliteAvailable = false
}

type StorageFactory = {
  name: string
  create: () => { storage: HubStorage; cleanup: () => void }
}

const storageFactories: StorageFactory[] = [
  ...(sqliteAvailable
    ? [
        {
          name: 'SQLite',
          create: () => {
            const dir = mkdtempSync(join(tmpdir(), 'hub-test-'))
            return {
              storage: createSQLiteStorage(dir),
              cleanup: () => rmSync(dir, { recursive: true, force: true })
            }
          }
        }
      ]
    : []),
  {
    name: 'Memory',
    create: () => ({ storage: createMemoryStorage(), cleanup: () => {} })
  }
]

describe.each(storageFactories)('HubStorage ($name)', ({ create }: StorageFactory) => {
  let storage: HubStorage
  let cleanup: () => void

  beforeEach(() => {
    const result = create()
    storage = result.storage
    cleanup = result.cleanup
  })

  afterEach(async () => {
    await storage.close()
    cleanup()
  })

  describe('doc state', () => {
    it('returns null for unknown doc', async () => {
      expect(await storage.getDocState('missing')).toBeNull()
    })

    it('stores and retrieves doc state', async () => {
      const state = new Uint8Array([1, 2, 3, 4, 5])
      await storage.setDocState('doc-1', state)

      const result = await storage.getDocState('doc-1')
      expect(result).toEqual(state)
    })

    it('overwrites existing state', async () => {
      await storage.setDocState('doc-1', new Uint8Array([1, 2, 3]))
      await storage.setDocState('doc-1', new Uint8Array([4, 5, 6]))

      const result = await storage.getDocState('doc-1')
      expect(result).toEqual(new Uint8Array([4, 5, 6]))
    })
  })

  describe('doc meta', () => {
    const meta: DocMeta = {
      docId: 'doc-1',
      ownerDid: 'did:key:z6Mk...',
      schemaIri: 'xnet://xnet.dev/Page',
      title: 'Test Page',
      properties: { status: 'draft' },
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    it('returns null for unknown doc', async () => {
      expect(await storage.getDocMeta('missing')).toBeNull()
    })

    it('stores and retrieves metadata', async () => {
      await storage.setDocMeta('doc-1', meta)
      const result = await storage.getDocMeta('doc-1')
      expect(result).toMatchObject({
        docId: 'doc-1',
        ownerDid: 'did:key:z6Mk...',
        schemaIri: 'xnet://xnet.dev/Page',
        title: 'Test Page'
      })
    })

    it('updates existing metadata', async () => {
      await storage.setDocMeta('doc-1', meta)
      await storage.setDocMeta('doc-1', { ...meta, title: 'Updated' })

      const result = await storage.getDocMeta('doc-1')
      expect(result?.title).toBe('Updated')
    })
  })

  describe('blobs', () => {
    const blobMeta: BlobMeta = {
      key: 'blake3-hash-abc',
      docId: 'doc-1',
      ownerDid: 'did:key:z6Mk...',
      sizeBytes: 5,
      contentType: 'application/octet-stream',
      createdAt: Date.now()
    }

    it('stores and retrieves blob', async () => {
      const data = new Uint8Array([10, 20, 30, 40, 50])
      await storage.putBlob('blake3-hash-abc', data, blobMeta)

      const result = await storage.getBlob('blake3-hash-abc')
      expect(result).toEqual(data)
    })

    it('returns null for unknown blob', async () => {
      expect(await storage.getBlob('missing')).toBeNull()
    })

    it('lists blobs by owner', async () => {
      await storage.putBlob('hash-1', new Uint8Array([1]), {
        ...blobMeta,
        key: 'hash-1',
        docId: 'doc-1'
      })
      await storage.putBlob('hash-2', new Uint8Array([2]), {
        ...blobMeta,
        key: 'hash-2',
        docId: 'doc-2'
      })
      await storage.putBlob('hash-3', new Uint8Array([3]), {
        ...blobMeta,
        key: 'hash-3',
        ownerDid: 'did:key:other',
        docId: 'doc-3'
      })

      const results = await storage.listBlobs('did:key:z6Mk...')
      expect(results).toHaveLength(2)
    })

    it('deletes blob', async () => {
      await storage.putBlob('hash-del', new Uint8Array([1, 2]), {
        ...blobMeta,
        key: 'hash-del'
      })
      await storage.deleteBlob('hash-del')

      expect(await storage.getBlob('hash-del')).toBeNull()
    })
  })

  describe('search', () => {
    beforeEach(async () => {
      await storage.setDocMeta('doc-1', {
        docId: 'doc-1',
        ownerDid: 'did:key:alice',
        schemaIri: 'xnet://xnet.dev/Page',
        title: 'Meeting Notes Q4',
        createdAt: Date.now(),
        updatedAt: Date.now()
      })
      await storage.setDocMeta('doc-2', {
        docId: 'doc-2',
        ownerDid: 'did:key:alice',
        schemaIri: 'xnet://xnet.dev/Task',
        title: 'Review Q4 Budget',
        createdAt: Date.now(),
        updatedAt: Date.now()
      })
      await storage.setDocMeta('doc-3', {
        docId: 'doc-3',
        ownerDid: 'did:key:bob',
        schemaIri: 'xnet://xnet.dev/Page',
        title: 'Personal Diary',
        createdAt: Date.now(),
        updatedAt: Date.now()
      })
    })

    it('finds documents by title keyword', async () => {
      const results = await storage.search('Q4')
      expect(results.length).toBeGreaterThanOrEqual(2)
    })

    it('filters by schema', async () => {
      const results = await storage.search('Q4', { schemaIri: 'xnet://xnet.dev/Task' })
      expect(results).toHaveLength(1)
      expect(results[0].docId).toBe('doc-2')
    })

    it('respects limit and offset', async () => {
      const results = await storage.search('Q4', { limit: 1, offset: 0 })
      expect(results).toHaveLength(1)
    })
  })
})
