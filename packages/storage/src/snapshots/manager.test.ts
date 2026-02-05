import type { SignedUpdate } from '@xnet/core'
import { generateSigningKeyPair } from '@xnet/crypto'
import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryAdapter } from '../adapters/memory'
import { SnapshotManager } from './manager'

describe('SnapshotManager', () => {
  let manager: SnapshotManager
  let adapter: MemoryAdapter
  let signingKey: Uint8Array

  beforeEach(async () => {
    adapter = new MemoryAdapter()
    await adapter.open()
    const keyPair = generateSigningKeyPair()
    signingKey = keyPair.privateKey

    manager = new SnapshotManager({
      adapter,
      triggers: {
        updateCount: 100,
        timeInterval: Infinity, // Disable time-based triggering in tests
        storagePressure: 0.8
      },
      signingKey,
      creatorDID: 'did:key:test'
    })
  })

  describe('createSnapshot', () => {
    it('should create compressed snapshot', async () => {
      const state = new TextEncoder().encode('Hello, World! '.repeat(100))
      const snapshot = await manager.createSnapshot('doc-1', state)

      expect(snapshot.documentId).toBe('doc-1')
      expect(snapshot.creatorDID).toBe('did:key:test')
      expect(snapshot.compressedState.length).toBeLessThan(state.length)
      expect(snapshot.signature.length).toBeGreaterThan(0)
    })

    it('should decompress to original state', async () => {
      const originalState = new TextEncoder().encode('Test document state content')
      const snapshot = await manager.createSnapshot('doc-2', originalState)
      const decompressed = manager.decompressState(snapshot)

      expect(decompressed).toEqual(originalState)
    })

    it('should store snapshot in adapter', async () => {
      const state = new Uint8Array([1, 2, 3, 4, 5])
      await manager.createSnapshot('doc-3', state)

      const stored = await adapter.getSnapshot('doc-3')
      expect(stored).not.toBeNull()
      expect(stored?.documentId).toBe('doc-3')
    })

    it('should include content ID', async () => {
      const state = new Uint8Array([1, 2, 3])
      const snapshot = await manager.createSnapshot('doc-4', state)

      expect(snapshot.contentId).toMatch(/^cid:blake3:/)
    })
  })

  describe('loadDocument', () => {
    it('should load snapshot and updates', async () => {
      const state = new Uint8Array([1, 2, 3])
      await manager.createSnapshot('doc-5', state)

      const update: SignedUpdate = {
        update: new Uint8Array([4, 5, 6]),
        parentHash: 'parent',
        updateHash: 'update-1',
        authorDID: 'did:key:test',
        signature: new Uint8Array([7, 8, 9]),
        timestamp: Date.now(),
        vectorClock: { peer1: 1 }
      }
      await adapter.appendUpdate('doc-5', update)

      const { snapshot, updates } = await manager.loadDocument('doc-5')

      expect(snapshot).not.toBeNull()
      expect(updates).toHaveLength(1)
    })

    it('should return null snapshot for new document', async () => {
      const { snapshot, updates } = await manager.loadDocument('new-doc')

      expect(snapshot).toBeNull()
      expect(updates).toHaveLength(0)
    })
  })

  describe('shouldSnapshot', () => {
    it('should trigger snapshot after update threshold', async () => {
      // Add many updates
      for (let i = 0; i < 101; i++) {
        await adapter.appendUpdate('doc-6', {
          update: new Uint8Array([i]),
          parentHash: 'parent',
          updateHash: `update-${i}`,
          authorDID: 'did:key:test',
          signature: new Uint8Array([i]),
          timestamp: Date.now(),
          vectorClock: { peer1: i }
        })
      }

      const should = await manager.shouldSnapshot('doc-6')
      expect(should).toBe(true)
    })

    it('should not trigger snapshot below threshold', async () => {
      for (let i = 0; i < 10; i++) {
        await adapter.appendUpdate('doc-7', {
          update: new Uint8Array([i]),
          parentHash: 'parent',
          updateHash: `update-${i}`,
          authorDID: 'did:key:test',
          signature: new Uint8Array([i]),
          timestamp: Date.now(),
          vectorClock: { peer1: i }
        })
      }

      const should = await manager.shouldSnapshot('doc-7')
      expect(should).toBe(false)
    })
  })
})
