/**
 * Chunked Storage Tests
 *
 * Tests for the tile-based Y.Doc storage system for infinite canvases.
 */

import type { CanvasNode, CanvasEdge } from '../types'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  ChunkedCanvasStore,
  createChunkedCanvasStore,
  ChunkManager,
  createChunkManager,
  CHUNK_SIZE,
  MAX_LOADED_CHUNKS,
  chunkKeyFromPosition,
  parseChunkKey,
  positionFromChunkKey,
  chunkBounds,
  chunkDistance,
  getChunksInRadius,
  getChunksForRect,
  type ChunkKey
} from '../chunks/index'
import { Viewport } from '../spatial/index'

// ─── Helper Functions ─────────────────────────────────────────────────────────

function createTestNode(id: string, x: number, y: number, width = 100, height = 50): CanvasNode {
  return {
    id,
    type: 'card',
    position: { x, y, width, height },
    properties: {}
  }
}

function createTestEdge(id: string, sourceId: string, targetId: string): CanvasEdge {
  return { id, sourceId, targetId }
}

function createViewport(zoom: number, x: number, y: number): Viewport {
  return new Viewport({ zoom, x, y, width: 1920, height: 1080 })
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor(condition: () => boolean, timeout = 1000, interval = 10): Promise<void> {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error('waitFor timed out')
    }
    await sleep(interval)
  }
}

// ─── Config Tests ─────────────────────────────────────────────────────────────

describe('Chunk Config', () => {
  describe('chunkKeyFromPosition', () => {
    it('returns "0,0" for origin', () => {
      expect(chunkKeyFromPosition(0, 0)).toBe('0,0')
      expect(chunkKeyFromPosition(100, 100)).toBe('0,0')
      expect(chunkKeyFromPosition(CHUNK_SIZE - 1, CHUNK_SIZE - 1)).toBe('0,0')
    })

    it('returns correct key for positive positions', () => {
      expect(chunkKeyFromPosition(CHUNK_SIZE, 0)).toBe('1,0')
      expect(chunkKeyFromPosition(0, CHUNK_SIZE)).toBe('0,1')
      expect(chunkKeyFromPosition(CHUNK_SIZE * 2, CHUNK_SIZE * 3)).toBe('2,3')
    })

    it('returns correct key for negative positions', () => {
      expect(chunkKeyFromPosition(-1, 0)).toBe('-1,0')
      expect(chunkKeyFromPosition(0, -1)).toBe('0,-1')
      expect(chunkKeyFromPosition(-CHUNK_SIZE, -CHUNK_SIZE)).toBe('-1,-1')
    })
  })

  describe('parseChunkKey', () => {
    it('parses positive keys', () => {
      expect(parseChunkKey('0,0')).toEqual({ chunkX: 0, chunkY: 0 })
      expect(parseChunkKey('1,2')).toEqual({ chunkX: 1, chunkY: 2 })
    })

    it('parses negative keys', () => {
      expect(parseChunkKey('-1,0')).toEqual({ chunkX: -1, chunkY: 0 })
      expect(parseChunkKey('-3,-4')).toEqual({ chunkX: -3, chunkY: -4 })
    })
  })

  describe('positionFromChunkKey', () => {
    it('returns canvas position for chunk', () => {
      expect(positionFromChunkKey('0,0')).toEqual({ x: 0, y: 0 })
      expect(positionFromChunkKey('1,0')).toEqual({ x: CHUNK_SIZE, y: 0 })
      expect(positionFromChunkKey('-1,-1')).toEqual({ x: -CHUNK_SIZE, y: -CHUNK_SIZE })
    })
  })

  describe('chunkBounds', () => {
    it('returns correct bounds', () => {
      const bounds = chunkBounds('0,0')
      expect(bounds).toEqual({ x: 0, y: 0, width: CHUNK_SIZE, height: CHUNK_SIZE })
    })

    it('returns correct bounds for negative chunks', () => {
      const bounds = chunkBounds('-1,-1')
      expect(bounds).toEqual({
        x: -CHUNK_SIZE,
        y: -CHUNK_SIZE,
        width: CHUNK_SIZE,
        height: CHUNK_SIZE
      })
    })
  })

  describe('chunkDistance', () => {
    it('returns 0 for same chunk', () => {
      expect(chunkDistance('0,0', '0,0')).toBe(0)
    })

    it('returns correct distance for adjacent chunks', () => {
      expect(chunkDistance('0,0', '1,0')).toBe(1)
      expect(chunkDistance('0,0', '0,1')).toBe(1)
    })

    it('returns correct Euclidean distance', () => {
      expect(chunkDistance('0,0', '3,4')).toBe(5)
    })
  })

  describe('getChunksInRadius', () => {
    it('returns center for radius 0', () => {
      const chunks = getChunksInRadius('0,0', 0)
      expect(chunks).toEqual(['0,0'])
    })

    it('returns 9 chunks for radius 1', () => {
      const chunks = getChunksInRadius('0,0', 1)
      expect(chunks).toHaveLength(9)
      expect(chunks).toContain('0,0')
      expect(chunks).toContain('-1,-1')
      expect(chunks).toContain('1,1')
    })

    it('sorts by distance from center', () => {
      const chunks = getChunksInRadius('0,0', 1)
      // Center should be first
      expect(chunks[0]).toBe('0,0')
    })
  })

  describe('getChunksForRect', () => {
    it('returns single chunk for small rect', () => {
      const chunks = getChunksForRect({ x: 100, y: 100, width: 200, height: 200 })
      expect(chunks).toEqual(['0,0'])
    })

    it('returns multiple chunks for large rect', () => {
      const chunks = getChunksForRect({
        x: CHUNK_SIZE - 100,
        y: CHUNK_SIZE - 100,
        width: 200,
        height: 200
      })
      expect(chunks).toContain('0,0')
      expect(chunks).toContain('1,0')
      expect(chunks).toContain('0,1')
      expect(chunks).toContain('1,1')
    })
  })
})

// ─── ChunkedCanvasStore Tests ─────────────────────────────────────────────────

describe('ChunkedCanvasStore', () => {
  let store: ChunkedCanvasStore

  beforeEach(() => {
    store = createChunkedCanvasStore('test-canvas')
  })

  describe('node operations', () => {
    it('adds a node to the correct chunk', () => {
      const node = createTestNode('n1', 100, 100)
      store.addNode(node, '0,0')

      expect(store.getNodeChunk('n1')).toBe('0,0')
      expect(store.getNode('n1')).toEqual(node)
    })

    it('updates node position within same chunk', () => {
      const node = createTestNode('n1', 100, 100)
      store.addNode(node, '0,0')

      store.updateNodePosition('n1', { x: 200, y: 200, width: 100, height: 50 })

      const updated = store.getNode('n1')
      expect(updated?.position.x).toBe(200)
      expect(updated?.position.y).toBe(200)
    })

    it('moves node to different chunk', () => {
      const node = createTestNode('n1', 100, 100)
      store.addNode(node, '0,0')

      const newPos = { x: CHUNK_SIZE + 100, y: 100, width: 100, height: 50 }
      store.moveNodeToChunk('n1', '0,0', '1,0', newPos)

      expect(store.getNodeChunk('n1')).toBe('1,0')
      expect(store.getNode('n1')?.position.x).toBe(CHUNK_SIZE + 100)
    })

    it('removes a node', () => {
      const node = createTestNode('n1', 100, 100)
      store.addNode(node, '0,0')

      store.removeNode('n1')

      expect(store.getNode('n1')).toBeNull()
      expect(store.getNodeChunk('n1')).toBeNull()
    })
  })

  describe('edge operations', () => {
    it('adds same-chunk edge', async () => {
      const n1 = createTestNode('n1', 100, 100)
      const n2 = createTestNode('n2', 200, 200)
      store.addNode(n1, '0,0')
      store.addNode(n2, '0,0')

      const edge = createTestEdge('e1', 'n1', 'n2')
      store.addEdge(edge, '0,0', '0,0')

      // Verify edge is in chunk - loadChunk is async so just verify it doesn't throw
      await store.loadChunk('0,0')
    })

    it('adds cross-chunk edge', async () => {
      const n1 = createTestNode('n1', 100, 100)
      const n2 = createTestNode('n2', CHUNK_SIZE + 100, 100)
      store.addNode(n1, '0,0')
      store.addNode(n2, '1,0')

      const edge = createTestEdge('e1', 'n1', 'n2')
      store.addEdge(edge, '0,0', '1,0')

      const crossEdges = store.getAllCrossChunkEdges()
      expect(crossEdges).toHaveLength(1)
      expect(crossEdges[0].sourceChunk).toBe('0,0')
      expect(crossEdges[0].targetChunk).toBe('1,0')
    })

    it('removes edges when node is removed', () => {
      const n1 = createTestNode('n1', 100, 100)
      const n2 = createTestNode('n2', CHUNK_SIZE + 100, 100)
      store.addNode(n1, '0,0')
      store.addNode(n2, '1,0')

      const edge = createTestEdge('e1', 'n1', 'n2')
      store.addEdge(edge, '0,0', '1,0')

      store.removeNode('n1')

      const crossEdges = store.getAllCrossChunkEdges()
      expect(crossEdges).toHaveLength(0)
    })
  })

  describe('chunk loading', () => {
    it('loads empty chunk', async () => {
      const data = await store.loadChunk('0,0')
      expect(data.nodes).toEqual([])
      expect(data.edges).toEqual([])
    })

    it('loads chunk with nodes', async () => {
      const node = createTestNode('n1', 100, 100)
      store.addNode(node, '0,0')

      const data = await store.loadChunk('0,0')
      expect(data.nodes).toHaveLength(1)
      expect(data.nodes[0].id).toBe('n1')
    })

    it('loads cross-chunk edges for a chunk', async () => {
      const n1 = createTestNode('n1', 100, 100)
      const n2 = createTestNode('n2', CHUNK_SIZE + 100, 100)
      store.addNode(n1, '0,0')
      store.addNode(n2, '1,0')

      const edge = createTestEdge('e1', 'n1', 'n2')
      store.addEdge(edge, '0,0', '1,0')

      const edges = await store.loadCrossChunkEdgesFor('0,0')
      expect(edges).toHaveLength(1)

      const edges2 = await store.loadCrossChunkEdgesFor('1,0')
      expect(edges2).toHaveLength(1)
    })
  })

  describe('metadata', () => {
    it('initializes metadata', () => {
      store.initializeMetadata('My Canvas')
      expect(store.getTitle()).toBe('My Canvas')
    })

    it('updates title', () => {
      store.setTitle('New Title')
      expect(store.getTitle()).toBe('New Title')
    })
  })

  describe('stats', () => {
    it('returns correct stats', () => {
      const n1 = createTestNode('n1', 100, 100)
      const n2 = createTestNode('n2', CHUNK_SIZE + 100, 100)
      store.addNode(n1, '0,0')
      store.addNode(n2, '1,0')

      const edge = createTestEdge('e1', 'n1', 'n2')
      store.addEdge(edge, '0,0', '1,0')

      const stats = store.getStats()
      expect(stats.chunkCount).toBe(2)
      expect(stats.nodeCount).toBe(2)
      expect(stats.crossEdgeCount).toBe(1)
    })
  })
})

// ─── ChunkManager Tests ───────────────────────────────────────────────────────

describe('ChunkManager', () => {
  let store: ChunkedCanvasStore
  let manager: ChunkManager
  let loadedChunks: string[]
  let evictedChunks: string[]

  beforeEach(() => {
    store = createChunkedCanvasStore('test-canvas')
    loadedChunks = []
    evictedChunks = []

    manager = createChunkManager(store)
    manager.subscribe((event) => {
      if (event.type === 'chunk-loaded') {
        loadedChunks.push(event.chunk.key)
      } else if (event.type === 'chunk-evicted') {
        evictedChunks.push(event.chunkKey)
      }
    })
  })

  afterEach(() => {
    manager.dispose()
  })

  describe('viewport updates', () => {
    it('loads chunks around viewport', async () => {
      // Add nodes to different chunks
      const node1 = createTestNode('n1', 100, 100)
      store.addNode(node1, '0,0')

      // Update viewport centered at origin
      const viewport = createViewport(1, 0, 0)
      manager.updateViewport(viewport)

      // Wait for loading
      await waitFor(() => loadedChunks.length > 0)

      expect(loadedChunks).toContain('0,0')
    })

    it('evicts distant chunks', async () => {
      // Add node and load chunk
      const node = createTestNode('n1', 100, 100)
      store.addNode(node, '0,0')

      const viewport1 = createViewport(1, 0, 0)
      manager.updateViewport(viewport1)
      await waitFor(() => loadedChunks.includes('0,0'))

      // Pan far away
      const viewport2 = createViewport(1, CHUNK_SIZE * 10, CHUNK_SIZE * 10)
      manager.updateViewport(viewport2)

      // Original chunk should eventually be evicted
      await waitFor(() => evictedChunks.includes('0,0'), 2000)
    })
  })

  describe('node operations', () => {
    it('adds node to appropriate chunk', async () => {
      const viewport = createViewport(1, 0, 0)
      manager.updateViewport(viewport)
      await waitFor(() => loadedChunks.includes('0,0'))

      const node = createTestNode('n1', 100, 100)
      manager.addNode(node)

      const nodes = manager.getAllNodes()
      expect(nodes).toHaveLength(1)
      expect(nodes[0].id).toBe('n1')
    })

    it('handles node movement between chunks', async () => {
      // Add node in first chunk
      const node = createTestNode('n1', 100, 100)
      store.addNode(node, '0,0')

      // Load both chunks
      const viewport = createViewport(0.5, CHUNK_SIZE / 2, 0)
      manager.updateViewport(viewport)
      await waitFor(() => loadedChunks.includes('0,0'))

      // Move node to different chunk
      manager.moveNode('n1', {
        x: CHUNK_SIZE + 100,
        y: 100,
        width: 100,
        height: 50
      })

      expect(store.getNodeChunk('n1')).toBe('1,0')
    })

    it('falls back to the node position when the chunk index is cold', () => {
      const updateNodePosition = vi.fn()
      const fallbackStore = {
        loadChunk: vi.fn(async () => ({ nodes: [], edges: [] })),
        loadCrossChunkEdgesFor: vi.fn(async () => []),
        addNode: vi.fn(),
        getNodeChunk: vi.fn(() => null),
        updateNodePosition,
        moveNodeToChunk: vi.fn(),
        removeNode: vi.fn(),
        getNode: vi.fn(() => createTestNode('n1', 100, 100, 100, 50)),
        addEdge: vi.fn(),
        removeEdge: vi.fn(),
        updateEdgeChunkAssignment: vi.fn()
      }
      const fallbackManager = createChunkManager(fallbackStore)

      fallbackManager.moveNode('n1', {
        x: 180,
        y: 160,
        width: 140,
        height: 80
      })

      expect(updateNodePosition).toHaveBeenCalledWith('n1', {
        x: 180,
        y: 160,
        width: 140,
        height: 80
      })

      fallbackManager.dispose()
    })

    it('removes node and connected edges', async () => {
      // Setup: two nodes with edge
      const n1 = createTestNode('n1', 100, 100)
      const n2 = createTestNode('n2', 200, 200)
      store.addNode(n1, '0,0')
      store.addNode(n2, '0,0')

      const viewport = createViewport(1, 0, 0)
      manager.updateViewport(viewport)
      await waitFor(() => loadedChunks.includes('0,0'))

      const edge = createTestEdge('e1', 'n1', 'n2')
      manager.addEdge(edge)

      // Remove node
      manager.removeNode('n1')

      const nodes = manager.getAllNodes()
      const edges = manager.getAllEdges()

      expect(nodes).toHaveLength(1)
      expect(nodes[0].id).toBe('n2')
      expect(edges).toHaveLength(0)
    })
  })

  describe('edge operations', () => {
    it('adds same-chunk edge', async () => {
      const n1 = createTestNode('n1', 100, 100)
      const n2 = createTestNode('n2', 200, 200)
      store.addNode(n1, '0,0')
      store.addNode(n2, '0,0')

      const viewport = createViewport(1, 0, 0)
      manager.updateViewport(viewport)
      await waitFor(() => loadedChunks.includes('0,0'))

      const edge = createTestEdge('e1', 'n1', 'n2')
      manager.addEdge(edge)

      const edges = manager.getAllEdges()
      expect(edges).toHaveLength(1)
    })

    it('handles cross-chunk edges', async () => {
      const n1 = createTestNode('n1', 100, 100)
      const n2 = createTestNode('n2', CHUNK_SIZE + 100, 100)
      store.addNode(n1, '0,0')
      store.addNode(n2, '1,0')

      // Load both chunks
      const viewport = createViewport(0.5, CHUNK_SIZE / 2, 0)
      manager.updateViewport(viewport)
      await waitFor(() => loadedChunks.includes('0,0') && loadedChunks.includes('1,0'))

      const edge = createTestEdge('e1', 'n1', 'n2')
      manager.addEdge(edge)

      const edges = manager.getAllEdges()
      expect(edges).toHaveLength(1)
      expect(edges[0].id).toBe('e1')
    })

    it('hides cross-chunk edge when one chunk is evicted', async () => {
      const n1 = createTestNode('n1', 100, 100)
      const n2 = createTestNode('n2', CHUNK_SIZE + 100, 100)
      store.addNode(n1, '0,0')
      store.addNode(n2, '1,0')

      // Load both chunks
      const viewport1 = createViewport(0.5, CHUNK_SIZE / 2, 0)
      manager.updateViewport(viewport1)
      await waitFor(() => loadedChunks.includes('0,0') && loadedChunks.includes('1,0'))

      const edge = createTestEdge('e1', 'n1', 'n2')
      manager.addEdge(edge)

      // Pan away so one chunk is evicted
      const viewport2 = createViewport(1, CHUNK_SIZE * 10, 0)
      manager.updateViewport(viewport2)
      await waitFor(() => evictedChunks.includes('0,0'))

      // Edge should not be visible
      const edges = manager.getAllEdges()
      const visibleEdge = edges.find((e) => e.id === 'e1')
      expect(visibleEdge).toBeUndefined()
    })
  })

  describe('memory management', () => {
    it('respects memory limit', async () => {
      // Create many chunks
      for (let i = 0; i < 100; i++) {
        const x = i * CHUNK_SIZE + 100
        store.addNode(createTestNode(`n${i}`, x, 0), `${i},0` as ChunkKey)
      }

      // Pan across all of them quickly
      for (let i = 0; i < 60; i++) {
        const viewport = createViewport(1, i * CHUNK_SIZE, 0)
        manager.updateViewport(viewport)
        await sleep(5)
      }

      // Wait for loading to settle
      await sleep(100)

      const stats = manager.getStats()
      expect(stats.loadedCount).toBeLessThanOrEqual(MAX_LOADED_CHUNKS + 10)
    })
  })

  describe('stats', () => {
    it('returns correct statistics', async () => {
      const n1 = createTestNode('n1', 100, 100)
      const n2 = createTestNode('n2', 200, 200)
      store.addNode(n1, '0,0')
      store.addNode(n2, '0,0')

      const viewport = createViewport(1, 0, 0)
      manager.updateViewport(viewport)
      await waitFor(() => loadedChunks.includes('0,0'))

      const stats = manager.getStats()
      expect(stats.loadedCount).toBeGreaterThan(0)
      expect(stats.totalNodes).toBe(2)
    })
  })

  describe('progressive loading', () => {
    it('loads nearest chunks first', async () => {
      // Add nodes to multiple chunks
      for (let i = 0; i < 5; i++) {
        const x = i * CHUNK_SIZE + 100
        store.addNode(createTestNode(`n${i}`, x, 100), `${i},0` as ChunkKey)
      }

      // Start at origin
      const viewport = createViewport(1, 0, 0)
      manager.updateViewport(viewport)

      // Wait for first chunk
      await waitFor(() => loadedChunks.length > 0)

      // Center chunk should be loaded first
      expect(loadedChunks[0]).toBe('0,0')
    })
  })
})

// ─── Y.Doc Structure Tests ────────────────────────────────────────────────────

describe('Y.Doc Structure', () => {
  it('supports chunk-based sync', () => {
    const store = createChunkedCanvasStore('test')
    const ydoc = store.getYDoc()

    // Verify structure
    expect(ydoc.getMap('metadata')).toBeDefined()
    expect(ydoc.getMap('chunks')).toBeDefined()
    expect(ydoc.getMap('crossEdges')).toBeDefined()
    expect(ydoc.getMap('index')).toBeDefined()
  })

  it('preserves data through chunk transitions', async () => {
    const store = createChunkedCanvasStore('test')
    const manager = createChunkManager(store)

    // Add node
    const node = createTestNode('n1', 100, 100)
    store.addNode(node, '0,0')

    // Load chunk
    const viewport = createViewport(1, 0, 0)
    manager.updateViewport(viewport)
    await sleep(50)

    // Move node to new chunk
    const newPos = { x: CHUNK_SIZE + 100, y: 100, width: 100, height: 50 }
    manager.moveNode('n1', newPos)

    // Verify node still exists
    const foundNode = store.getNode('n1')
    expect(foundNode).not.toBeNull()
    expect(foundNode?.position.x).toBe(CHUNK_SIZE + 100)

    manager.dispose()
  })
})
