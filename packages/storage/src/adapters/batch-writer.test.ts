/**
 * Tests for BatchWriter
 */

import type { StorageAdapter, DocumentData } from '../types'
import type { SignedUpdate, Snapshot, ContentId } from '@xnet/core'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BatchWriter, createBatchWriter } from './batch-writer'

// Mock storage adapter
function createMockAdapter(): StorageAdapter & {
  documents: Map<string, DocumentData>
  updates: Map<string, SignedUpdate[]>
  snapshots: Map<string, Snapshot>
  blobs: Map<string, Uint8Array>
  setCalls: number
} {
  const documents = new Map<string, DocumentData>()
  const updates = new Map<string, SignedUpdate[]>()
  const snapshots = new Map<string, Snapshot>()
  const blobs = new Map<string, Uint8Array>()
  let setCalls = 0

  return {
    documents,
    updates,
    snapshots,
    blobs,
    get setCalls() {
      return setCalls
    },
    async open() {},
    async close() {},
    async clear() {
      documents.clear()
      updates.clear()
      snapshots.clear()
      blobs.clear()
    },
    async getDocument(id) {
      return documents.get(id) ?? null
    },
    async setDocument(id, data) {
      setCalls++
      documents.set(id, data)
    },
    async deleteDocument(id) {
      setCalls++
      documents.delete(id)
    },
    async listDocuments(prefix) {
      const keys = Array.from(documents.keys())
      return prefix ? keys.filter((k) => k.startsWith(prefix)) : keys
    },
    async appendUpdate(docId, update) {
      setCalls++
      const existing = updates.get(docId) ?? []
      existing.push(update)
      updates.set(docId, existing)
    },
    async getUpdates(docId) {
      return updates.get(docId) ?? []
    },
    async getUpdateCount(docId) {
      return updates.get(docId)?.length ?? 0
    },
    async getSnapshot(docId) {
      return snapshots.get(docId) ?? null
    },
    async setSnapshot(docId, snapshot) {
      setCalls++
      snapshots.set(docId, snapshot)
    },
    async getBlob(cid) {
      return blobs.get(cid) ?? null
    },
    async setBlob(cid, data) {
      setCalls++
      blobs.set(cid, data)
    },
    async hasBlob(cid) {
      return blobs.has(cid)
    }
  }
}

function createDocumentData(id: string): DocumentData {
  return {
    id,
    content: new Uint8Array([1, 2, 3]),
    metadata: { created: Date.now(), updated: Date.now(), type: 'test' },
    version: 1
  }
}

function createSignedUpdate(hash: string): SignedUpdate {
  return {
    update: new Uint8Array([1, 2, 3]),
    parentHash: 'parent',
    updateHash: hash,
    authorDID: 'did:key:test',
    signature: new Uint8Array([4, 5, 6]),
    timestamp: Date.now(),
    vectorClock: { peer1: 1 }
  }
}

describe('BatchWriter', () => {
  let adapter: ReturnType<typeof createMockAdapter>
  let batcher: BatchWriter

  beforeEach(() => {
    vi.useFakeTimers()
    adapter = createMockAdapter()
    batcher = createBatchWriter(adapter, { maxBatchSize: 5, maxWaitMs: 100 })
  })

  describe('document operations', () => {
    it('should batch setDocument calls', async () => {
      const doc1 = createDocumentData('doc1')
      const doc2 = createDocumentData('doc2')
      const doc3 = createDocumentData('doc3')

      // Queue writes (no flush yet)
      await batcher.setDocument('doc1', doc1)
      await batcher.setDocument('doc2', doc2)
      await batcher.setDocument('doc3', doc3)

      // Should be able to read from pending cache
      expect(await batcher.getDocument('doc1')).toEqual(doc1)
      expect(await batcher.getDocument('doc2')).toEqual(doc2)

      // Underlying adapter shouldn't have them yet
      expect(adapter.setCalls).toBe(0)

      // Flush
      await batcher.flush()

      // Now adapter should have all documents
      expect(adapter.setCalls).toBe(3)
      expect(adapter.documents.get('doc1')).toEqual(doc1)
    })

    it('should auto-flush when maxBatchSize reached', async () => {
      // Max batch size is 5
      for (let i = 0; i < 5; i++) {
        await batcher.setDocument(`doc${i}`, createDocumentData(`doc${i}`))
      }

      // Let microtasks run
      await vi.runAllTimersAsync()

      // Should have auto-flushed
      expect(adapter.setCalls).toBe(5)
    })

    it('should auto-flush after maxWaitMs', async () => {
      await batcher.setDocument('doc1', createDocumentData('doc1'))

      // Not flushed yet
      expect(adapter.setCalls).toBe(0)

      // Advance timer past maxWaitMs
      await vi.advanceTimersByTimeAsync(150)

      // Should have auto-flushed
      expect(adapter.setCalls).toBe(1)
    })

    it('should handle delete after set correctly', async () => {
      const doc = createDocumentData('doc1')

      await batcher.setDocument('doc1', doc)
      await batcher.deleteDocument('doc1')

      // Pending cache should show deleted
      expect(await batcher.getDocument('doc1')).toBeNull()

      await batcher.flush()

      // Adapter should have delete (and the set is removed from pending)
      expect(adapter.documents.has('doc1')).toBe(false)
    })

    it('should merge multiple sets for same document', async () => {
      const doc1 = createDocumentData('doc1')
      const doc1v2 = { ...doc1, version: 2 }

      await batcher.setDocument('doc1', doc1)
      await batcher.setDocument('doc1', doc1v2)

      expect(batcher.pendingCount).toBe(1) // Should have merged

      await batcher.flush()

      expect(adapter.documents.get('doc1')?.version).toBe(2)
    })
  })

  describe('update operations', () => {
    it('should batch appendUpdate calls', async () => {
      const update1 = createSignedUpdate('hash1')
      const update2 = createSignedUpdate('hash2')

      await batcher.appendUpdate('doc1', update1)
      await batcher.appendUpdate('doc1', update2)

      // Should be readable from pending
      const updates = await batcher.getUpdates('doc1')
      expect(updates).toHaveLength(2)

      expect(adapter.setCalls).toBe(0)

      await batcher.flush()

      expect(adapter.setCalls).toBe(2)
    })

    it('should dedupe updates with same hash', async () => {
      const update = createSignedUpdate('hash1')

      await batcher.appendUpdate('doc1', update)
      await batcher.appendUpdate('doc1', update) // Duplicate

      expect(batcher.pendingCount).toBe(1) // Should not add duplicate

      await batcher.flush()

      expect(adapter.updates.get('doc1')).toHaveLength(1)
    })
  })

  describe('snapshot operations', () => {
    it('should batch setSnapshot calls', async () => {
      const snapshot: Snapshot = {
        id: 'snap1',
        documentId: 'doc1',
        stateVector: new Uint8Array([1, 2]),
        compressedState: new Uint8Array([3, 4]),
        timestamp: Date.now(),
        creatorDID: 'did:key:test',
        signature: new Uint8Array([5, 6]),
        contentId: 'cid:blake3:abc123' as ContentId
      }

      await batcher.setSnapshot('doc1', snapshot)

      // Should be readable from pending
      expect(await batcher.getSnapshot('doc1')).toEqual(snapshot)

      expect(adapter.setCalls).toBe(0)

      await batcher.flush()

      expect(adapter.setCalls).toBe(1)
    })

    it('should replace pending snapshot for same doc', async () => {
      const snap1: Snapshot = {
        id: 'snap1',
        documentId: 'doc1',
        stateVector: new Uint8Array([1]),
        compressedState: new Uint8Array([1]),
        timestamp: 1,
        creatorDID: 'did:key:test',
        signature: new Uint8Array([1]),
        contentId: 'cid:blake3:abc1' as ContentId
      }
      const snap2: Snapshot = {
        id: 'snap2',
        documentId: 'doc1',
        stateVector: new Uint8Array([2]),
        compressedState: new Uint8Array([2]),
        timestamp: 2,
        creatorDID: 'did:key:test',
        signature: new Uint8Array([2]),
        contentId: 'cid:blake3:abc2' as ContentId
      }

      await batcher.setSnapshot('doc1', snap1)
      await batcher.setSnapshot('doc1', snap2)

      expect(batcher.pendingCount).toBe(1)

      expect(await batcher.getSnapshot('doc1')).toEqual(snap2)
    })
  })

  describe('blob operations', () => {
    it('should batch setBlob calls', async () => {
      const cid1 = 'cid:blake3:abc123' as ContentId
      const cid2 = 'cid:blake3:def456' as ContentId
      const data1 = new Uint8Array([1, 2, 3])
      const data2 = new Uint8Array([4, 5, 6])

      await batcher.setBlob(cid1, data1)
      await batcher.setBlob(cid2, data2)

      // Should be readable from pending
      expect(await batcher.getBlob(cid1)).toEqual(data1)
      expect(await batcher.hasBlob(cid2)).toBe(true)

      expect(adapter.setCalls).toBe(0)

      await batcher.flush()

      expect(adapter.setCalls).toBe(2)
    })

    it('should dedupe blobs with same cid', async () => {
      const cid = 'cid:blake3:abc123' as ContentId
      const data = new Uint8Array([1, 2, 3])

      await batcher.setBlob(cid, data)
      await batcher.setBlob(cid, data) // Duplicate

      expect(batcher.pendingCount).toBe(1)
    })
  })

  describe('flush behavior', () => {
    it('should handle concurrent flushes', async () => {
      const doc = createDocumentData('doc1')
      await batcher.setDocument('doc1', doc)

      // Start multiple flushes
      const flush1 = batcher.flush()
      const flush2 = batcher.flush()
      const flush3 = batcher.flush()

      await Promise.all([flush1, flush2, flush3])

      // Should only have flushed once
      expect(adapter.setCalls).toBe(1)
    })

    it('should flush on close', async () => {
      const doc = createDocumentData('doc1')
      await batcher.setDocument('doc1', doc)

      expect(adapter.setCalls).toBe(0)

      await batcher.close()

      expect(adapter.setCalls).toBe(1)
    })
  })
})
