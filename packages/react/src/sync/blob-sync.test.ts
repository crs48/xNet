import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createBlobSyncProvider, BLOB_SYNC_ROOM, type BlobStoreForSync } from './blob-sync'
import type { ConnectionManager } from './connection-manager'
import type { ContentId } from '@xnet/core'

function createMockBlobStore(blobs: Map<string, Uint8Array> = new Map()): BlobStoreForSync {
  return {
    async get(cid) {
      return blobs.get(cid) ?? null
    },
    async put(data) {
      // Simple mock CID
      const cid = `cid:blake3:mock-${data.length}-${Date.now()}` as ContentId
      blobs.set(cid, data)
      return cid
    },
    async has(cid) {
      return blobs.has(cid)
    }
  }
}

function createMockConnectionManager() {
  const rooms = new Map<string, Set<(data: Record<string, unknown>) => void>>()
  const published: Array<{ room: string; data: object }> = []

  const manager: ConnectionManager & {
    _emit: (room: string, data: object) => void
    _published: typeof published
  } = {
    status: 'connected' as const,
    roomCount: 0,
    connect: vi.fn(),
    disconnect: vi.fn(),
    joinRoom(room, handler) {
      if (!rooms.has(room)) rooms.set(room, new Set())
      rooms.get(room)!.add(handler)
      return () => {
        rooms.get(room)?.delete(handler)
      }
    },
    leaveRoom(room) {
      rooms.delete(room)
    },
    publish(room, data) {
      published.push({ room, data })
    },
    sendRaw: vi.fn(),
    onMessage: vi.fn().mockReturnValue(() => {}),
    onStatus() {
      return () => {}
    },
    _emit(room, data) {
      rooms.get(room)?.forEach((handler) => handler(data as Record<string, unknown>))
    },
    _published: published
  }

  return manager
}

describe('BlobSyncProvider', () => {
  let blobStore: BlobStoreForSync
  let connection: ReturnType<typeof createMockConnectionManager>
  let blobs: Map<string, Uint8Array>

  beforeEach(() => {
    blobs = new Map()
    blobStore = createMockBlobStore(blobs)
    connection = createMockConnectionManager()
  })

  describe('start/stop', () => {
    it('joins the blob sync room on start', () => {
      const provider = createBlobSyncProvider({ blobStore, connection })
      provider.start()
      // Room should be joined (we can verify by emitting)
      expect(() => connection._emit(BLOB_SYNC_ROOM, { type: 'blob-have', cids: [] })).not.toThrow()
      provider.stop()
    })

    it('leaves the room on stop', () => {
      const provider = createBlobSyncProvider({ blobStore, connection })
      provider.start()
      provider.stop()
      // After stop, emitting should not trigger handlers
      connection._published.length = 0
      connection._emit(BLOB_SYNC_ROOM, { type: 'blob-have', cids: ['cid:blake3:abc'] })
      // No want messages should be published since handler is removed
      expect(connection._published.length).toBe(0)
    })

    it('is idempotent on start', () => {
      const provider = createBlobSyncProvider({ blobStore, connection })
      provider.start()
      expect(() => provider.start()).not.toThrow()
      provider.stop()
    })
  })

  describe('requestBlobs', () => {
    it('sends blob-want for missing CIDs', async () => {
      const provider = createBlobSyncProvider({ blobStore, connection })
      provider.start()

      await provider.requestBlobs([
        'cid:blake3:missing1' as ContentId,
        'cid:blake3:missing2' as ContentId
      ])

      const wantMsg = connection._published.find((p) => (p.data as any).type === 'blob-want')
      expect(wantMsg).toBeDefined()
      expect((wantMsg!.data as any).cids).toContain('cid:blake3:missing1')
      expect((wantMsg!.data as any).cids).toContain('cid:blake3:missing2')
      expect(provider.pendingCount).toBe(2)

      provider.stop()
    })

    it('does not request blobs we already have', async () => {
      blobs.set('cid:blake3:existing', new Uint8Array([1, 2, 3]))
      const provider = createBlobSyncProvider({ blobStore, connection })
      provider.start()

      await provider.requestBlobs(['cid:blake3:existing' as ContentId])

      const wantMsg = connection._published.find((p) => (p.data as any).type === 'blob-want')
      expect(wantMsg).toBeUndefined()
      expect(provider.pendingCount).toBe(0)

      provider.stop()
    })
  })

  describe('announceHave', () => {
    it('sends blob-have message', () => {
      const provider = createBlobSyncProvider({ blobStore, connection })
      provider.start()

      provider.announceHave(['cid:blake3:abc' as ContentId, 'cid:blake3:def' as ContentId])

      const haveMsg = connection._published.find((p) => (p.data as any).type === 'blob-have')
      expect(haveMsg).toBeDefined()
      expect((haveMsg!.data as any).cids).toEqual(['cid:blake3:abc', 'cid:blake3:def'])

      provider.stop()
    })

    it('does nothing for empty array', () => {
      const provider = createBlobSyncProvider({ blobStore, connection })
      provider.start()

      provider.announceHave([])

      expect(connection._published.length).toBe(0)
      provider.stop()
    })
  })

  describe('message handling', () => {
    it('responds to blob-want with blob-data', async () => {
      const data = new TextEncoder().encode('hello blob')
      blobs.set('cid:blake3:test1', data)

      const provider = createBlobSyncProvider({ blobStore, connection })
      provider.start()

      connection._emit(BLOB_SYNC_ROOM, {
        type: 'blob-want',
        cids: ['cid:blake3:test1']
      })

      // Wait for async handling
      await new Promise((resolve) => setTimeout(resolve, 10))

      const dataMsg = connection._published.find((p) => (p.data as any).type === 'blob-data')
      expect(dataMsg).toBeDefined()
      expect((dataMsg!.data as any).cid).toBe('cid:blake3:test1')

      provider.stop()
    })

    it('responds with blob-not-found for missing blobs', async () => {
      const provider = createBlobSyncProvider({ blobStore, connection })
      provider.start()

      connection._emit(BLOB_SYNC_ROOM, {
        type: 'blob-want',
        cids: ['cid:blake3:nonexistent']
      })

      await new Promise((resolve) => setTimeout(resolve, 10))

      const notFoundMsg = connection._published.find(
        (p) => (p.data as any).type === 'blob-not-found'
      )
      expect(notFoundMsg).toBeDefined()
      expect((notFoundMsg!.data as any).cid).toBe('cid:blake3:nonexistent')

      provider.stop()
    })

    it('stores received blob-data', async () => {
      const onBlobReceived = vi.fn()
      const provider = createBlobSyncProvider({ blobStore, connection, onBlobReceived })
      provider.start()

      // Simulate receiving blob data (base64 of "test")
      const testData = btoa('test')
      connection._emit(BLOB_SYNC_ROOM, {
        type: 'blob-data',
        cid: 'cid:blake3:received',
        data: testData
      })

      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(onBlobReceived).toHaveBeenCalled()
      provider.stop()
    })

    it('requests missing blobs on blob-have', async () => {
      const provider = createBlobSyncProvider({ blobStore, connection })
      provider.start()

      connection._emit(BLOB_SYNC_ROOM, {
        type: 'blob-have',
        cids: ['cid:blake3:needed1', 'cid:blake3:needed2']
      })

      await new Promise((resolve) => setTimeout(resolve, 10))

      const wantMsg = connection._published.find((p) => (p.data as any).type === 'blob-want')
      expect(wantMsg).toBeDefined()
      expect((wantMsg!.data as any).cids).toContain('cid:blake3:needed1')

      provider.stop()
    })

    it('does not request blobs we already have on blob-have', async () => {
      blobs.set('cid:blake3:already-have', new Uint8Array([1]))
      const provider = createBlobSyncProvider({ blobStore, connection })
      provider.start()

      connection._emit(BLOB_SYNC_ROOM, {
        type: 'blob-have',
        cids: ['cid:blake3:already-have']
      })

      await new Promise((resolve) => setTimeout(resolve, 10))

      const wantMsg = connection._published.find((p) => (p.data as any).type === 'blob-want')
      expect(wantMsg).toBeUndefined()

      provider.stop()
    })

    it('removes pending on blob-not-found', async () => {
      const provider = createBlobSyncProvider({ blobStore, connection })
      provider.start()

      await provider.requestBlobs(['cid:blake3:will-fail' as ContentId])
      expect(provider.pendingCount).toBe(1)

      connection._emit(BLOB_SYNC_ROOM, {
        type: 'blob-not-found',
        cid: 'cid:blake3:will-fail'
      })

      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(provider.pendingCount).toBe(0)

      provider.stop()
    })
  })
})
