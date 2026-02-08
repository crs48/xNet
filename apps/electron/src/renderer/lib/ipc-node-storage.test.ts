/**
 * Tests for IPCNodeStorageAdapter
 *
 * These tests mock the window.xnetNodes API to verify the adapter
 * correctly routes operations via IPC.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IPCNodeStorageAdapter } from './ipc-node-storage'

// Mock the window.xnetNodes API
const mockXnetNodes = {
  appendChange: vi.fn(),
  getChanges: vi.fn(),
  getAllChanges: vi.fn(),
  getChangesSince: vi.fn(),
  getChangeByHash: vi.fn(),
  getLastChange: vi.fn(),
  getNode: vi.fn(),
  setNode: vi.fn(),
  deleteNode: vi.fn(),
  listNodes: vi.fn(),
  countNodes: vi.fn(),
  getLastLamportTime: vi.fn(),
  setLastLamportTime: vi.fn(),
  getDocumentContent: vi.fn(),
  setDocumentContent: vi.fn(),
  onChange: vi.fn()
}

// Set up global window mock
beforeEach(() => {
  vi.clearAllMocks()
  ;(global as unknown as { window: { xnetNodes: typeof mockXnetNodes } }).window = {
    xnetNodes: mockXnetNodes
  }
})

describe('IPCNodeStorageAdapter', () => {
  describe('lifecycle', () => {
    it('should open without error', async () => {
      const adapter = new IPCNodeStorageAdapter()
      await expect(adapter.open()).resolves.toBeUndefined()
    })

    it('should close without error', async () => {
      const adapter = new IPCNodeStorageAdapter()
      await expect(adapter.close()).resolves.toBeUndefined()
    })
  })

  describe('change log operations', () => {
    it('should append a change via IPC', async () => {
      const adapter = new IPCNodeStorageAdapter()
      mockXnetNodes.appendChange.mockResolvedValue(undefined)

      const change = {
        protocolVersion: 3,
        id: 'change-1',
        type: 'node-change',
        hash: 'cid:blake3:abc123' as const,
        payload: {
          nodeId: 'node-1',
          schemaId: 'xnet://test/Task' as const,
          properties: { title: 'Test' }
        },
        lamport: { time: 1, author: 'did:key:test' as const },
        wallTime: Date.now(),
        authorDID: 'did:key:test' as const,
        parentHash: null,
        signature: new Uint8Array([1, 2, 3])
      }

      await adapter.appendChange(change)

      expect(mockXnetNodes.appendChange).toHaveBeenCalledTimes(1)
      const calledWith = mockXnetNodes.appendChange.mock.calls[0][0]
      expect(calledWith.hash).toBe(change.hash)
      expect(calledWith.payload.nodeId).toBe('node-1')
      expect(calledWith.signature).toEqual([1, 2, 3])
    })

    it('should get changes for a node via IPC', async () => {
      const adapter = new IPCNodeStorageAdapter()
      const mockChanges = [
        {
          id: 'change-1',
          type: 'node-change',
          hash: 'cid:blake3:abc123',
          payload: { nodeId: 'node-1', properties: {} },
          lamport: { time: 1, author: 'did:key:test' },
          wallTime: Date.now(),
          authorDID: 'did:key:test',
          parentHash: null,
          signature: [1, 2, 3]
        }
      ]
      mockXnetNodes.getChanges.mockResolvedValue(mockChanges)

      const changes = await adapter.getChanges('node-1')

      expect(mockXnetNodes.getChanges).toHaveBeenCalledWith('node-1')
      expect(changes).toHaveLength(1)
      expect(changes[0].hash).toBe('cid:blake3:abc123')
      expect(changes[0].signature).toBeInstanceOf(Uint8Array)
    })

    it('should get all changes via IPC', async () => {
      const adapter = new IPCNodeStorageAdapter()
      mockXnetNodes.getAllChanges.mockResolvedValue([])

      const changes = await adapter.getAllChanges()

      expect(mockXnetNodes.getAllChanges).toHaveBeenCalled()
      expect(changes).toEqual([])
    })

    it('should get changes since a Lamport time via IPC', async () => {
      const adapter = new IPCNodeStorageAdapter()
      mockXnetNodes.getChangesSince.mockResolvedValue([])

      const changes = await adapter.getChangesSince(100)

      expect(mockXnetNodes.getChangesSince).toHaveBeenCalledWith(100)
      expect(changes).toEqual([])
    })

    it('should get a change by hash via IPC', async () => {
      const adapter = new IPCNodeStorageAdapter()
      mockXnetNodes.getChangeByHash.mockResolvedValue(null)

      const change = await adapter.getChangeByHash('cid:blake3:abc123')

      expect(mockXnetNodes.getChangeByHash).toHaveBeenCalledWith('cid:blake3:abc123')
      expect(change).toBeNull()
    })

    it('should get the last change for a node via IPC', async () => {
      const adapter = new IPCNodeStorageAdapter()
      mockXnetNodes.getLastChange.mockResolvedValue(null)

      const change = await adapter.getLastChange('node-1')

      expect(mockXnetNodes.getLastChange).toHaveBeenCalledWith('node-1')
      expect(change).toBeNull()
    })
  })

  describe('materialized state operations', () => {
    it('should get a node via IPC', async () => {
      const adapter = new IPCNodeStorageAdapter()
      const mockNode = {
        id: 'node-1',
        schemaId: 'xnet://test/Task',
        properties: { title: 'Test' },
        timestamps: {},
        deleted: false,
        createdAt: Date.now(),
        createdBy: 'did:key:test',
        updatedAt: Date.now(),
        updatedBy: 'did:key:test'
      }
      mockXnetNodes.getNode.mockResolvedValue(mockNode)

      const node = await adapter.getNode('node-1')

      expect(mockXnetNodes.getNode).toHaveBeenCalledWith('node-1')
      expect(node).not.toBeNull()
      expect(node!.id).toBe('node-1')
      expect(node!.schemaId).toBe('xnet://test/Task')
    })

    it('should return null for non-existent node', async () => {
      const adapter = new IPCNodeStorageAdapter()
      mockXnetNodes.getNode.mockResolvedValue(null)

      const node = await adapter.getNode('non-existent')

      expect(node).toBeNull()
    })

    it('should set a node via IPC', async () => {
      const adapter = new IPCNodeStorageAdapter()
      mockXnetNodes.setNode.mockResolvedValue(undefined)

      const node = {
        id: 'node-1',
        schemaId: 'xnet://test/Task' as const,
        properties: { title: 'Test' },
        timestamps: {},
        deleted: false,
        createdAt: Date.now(),
        createdBy: 'did:key:test' as const,
        updatedAt: Date.now(),
        updatedBy: 'did:key:test' as const
      }

      await adapter.setNode(node)

      expect(mockXnetNodes.setNode).toHaveBeenCalledTimes(1)
      const calledWith = mockXnetNodes.setNode.mock.calls[0][0]
      expect(calledWith.id).toBe('node-1')
    })

    it('should delete a node via IPC', async () => {
      const adapter = new IPCNodeStorageAdapter()
      mockXnetNodes.deleteNode.mockResolvedValue(undefined)

      await adapter.deleteNode('node-1')

      expect(mockXnetNodes.deleteNode).toHaveBeenCalledWith('node-1')
    })

    it('should list nodes via IPC', async () => {
      const adapter = new IPCNodeStorageAdapter()
      mockXnetNodes.listNodes.mockResolvedValue([])

      const nodes = await adapter.listNodes({ schemaId: 'xnet://test/Task' })

      expect(mockXnetNodes.listNodes).toHaveBeenCalledWith({ schemaId: 'xnet://test/Task' })
      expect(nodes).toEqual([])
    })

    it('should count nodes via IPC', async () => {
      const adapter = new IPCNodeStorageAdapter()
      mockXnetNodes.countNodes.mockResolvedValue(5)

      const count = await adapter.countNodes({ schemaId: 'xnet://test/Task' })

      expect(mockXnetNodes.countNodes).toHaveBeenCalledWith({ schemaId: 'xnet://test/Task' })
      expect(count).toBe(5)
    })
  })

  describe('sync state operations', () => {
    it('should get last Lamport time via IPC', async () => {
      const adapter = new IPCNodeStorageAdapter()
      mockXnetNodes.getLastLamportTime.mockResolvedValue(100)

      const time = await adapter.getLastLamportTime()

      expect(mockXnetNodes.getLastLamportTime).toHaveBeenCalled()
      expect(time).toBe(100)
    })

    it('should set last Lamport time via IPC', async () => {
      const adapter = new IPCNodeStorageAdapter()
      mockXnetNodes.setLastLamportTime.mockResolvedValue(undefined)

      await adapter.setLastLamportTime(200)

      expect(mockXnetNodes.setLastLamportTime).toHaveBeenCalledWith(200)
    })
  })

  describe('document content operations', () => {
    it('should get document content via IPC', async () => {
      const adapter = new IPCNodeStorageAdapter()
      mockXnetNodes.getDocumentContent.mockResolvedValue([1, 2, 3, 4])

      const content = await adapter.getDocumentContent('node-1')

      expect(mockXnetNodes.getDocumentContent).toHaveBeenCalledWith('node-1')
      expect(content).toBeInstanceOf(Uint8Array)
      expect(Array.from(content!)).toEqual([1, 2, 3, 4])
    })

    it('should return null for non-existent document content', async () => {
      const adapter = new IPCNodeStorageAdapter()
      mockXnetNodes.getDocumentContent.mockResolvedValue(null)

      const content = await adapter.getDocumentContent('node-1')

      expect(content).toBeNull()
    })

    it('should set document content via IPC', async () => {
      const adapter = new IPCNodeStorageAdapter()
      mockXnetNodes.setDocumentContent.mockResolvedValue(undefined)

      const content = new Uint8Array([1, 2, 3, 4])
      await adapter.setDocumentContent('node-1', content)

      expect(mockXnetNodes.setDocumentContent).toHaveBeenCalledWith('node-1', [1, 2, 3, 4])
    })
  })
})
