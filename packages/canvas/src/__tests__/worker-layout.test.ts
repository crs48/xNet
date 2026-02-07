/**
 * Worker Layout Tests
 *
 * Tests for layout manager functionality.
 * Note: Uses sync fallback since Web Workers aren't available in Vitest.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  LayoutManager,
  createLayoutManager,
  type LayoutNode,
  type LayoutEdge,
  type LayoutAlgorithm
} from '../workers/index'

// ─── Test Helpers ──────────────────────────────────────────────────────────────

function createNode(id: string, x = 0, y = 0, width = 100, height = 50): LayoutNode {
  return { id, position: { x, y, width, height } }
}

function createEdge(id: string, sourceId: string, targetId: string): LayoutEdge {
  return { id, sourceId, targetId }
}

// ─── LayoutManager Tests ───────────────────────────────────────────────────────

describe('LayoutManager', () => {
  let manager: LayoutManager

  beforeEach(() => {
    // Use sync fallback (no Worker in test environment)
    manager = new LayoutManager({ useWorker: false })
  })

  afterEach(() => {
    manager.terminate()
  })

  describe('constructor', () => {
    it('creates manager without worker in test environment', () => {
      const m = new LayoutManager()
      // Workers aren't available in Vitest, so hasWorker should be false
      expect(m.hasWorker()).toBe(false)
      m.terminate()
    })

    it('creates manager with useWorker=false explicitly', () => {
      expect(manager.hasWorker()).toBe(false)
    })
  })

  describe('layout', () => {
    it('computes layout for simple graph', async () => {
      const nodes = [createNode('a'), createNode('b'), createNode('c')]
      const edges = [createEdge('e1', 'a', 'b'), createEdge('e2', 'b', 'c')]

      const positions = await manager.layout({
        nodes,
        edges,
        algorithm: 'layered'
      })

      expect(positions.size).toBe(3)
      expect(positions.get('a')).toBeDefined()
      expect(positions.get('b')).toBeDefined()
      expect(positions.get('c')).toBeDefined()
    })

    it('returns empty map for empty graph', async () => {
      const positions = await manager.layout({
        nodes: [],
        edges: [],
        algorithm: 'layered'
      })

      expect(positions.size).toBe(0)
    })

    it('assigns different positions to nodes', async () => {
      const nodes = [createNode('a'), createNode('b')]
      const edges = [createEdge('e1', 'a', 'b')]

      const positions = await manager.layout({
        nodes,
        edges,
        algorithm: 'layered'
      })

      const posA = positions.get('a')!
      const posB = positions.get('b')!

      // Nodes should have different positions (not stacked)
      expect(posA.x !== posB.x || posA.y !== posB.y).toBe(true)
    })

    it('handles disconnected nodes', async () => {
      const nodes = [createNode('a'), createNode('b'), createNode('c')]
      // No edges - all nodes are disconnected

      const positions = await manager.layout({
        nodes,
        edges: [],
        algorithm: 'layered'
      })

      expect(positions.size).toBe(3)
    })

    it('handles complex graph', async () => {
      const nodes = Array.from({ length: 10 }, (_, i) => createNode(`n${i}`))
      const edges = [
        createEdge('e1', 'n0', 'n1'),
        createEdge('e2', 'n0', 'n2'),
        createEdge('e3', 'n1', 'n3'),
        createEdge('e4', 'n2', 'n4'),
        createEdge('e5', 'n3', 'n5'),
        createEdge('e6', 'n4', 'n5'),
        createEdge('e7', 'n5', 'n6'),
        createEdge('e8', 'n6', 'n7'),
        createEdge('e9', 'n7', 'n8'),
        createEdge('e10', 'n8', 'n9')
      ]

      const positions = await manager.layout({
        nodes,
        edges,
        algorithm: 'layered'
      })

      expect(positions.size).toBe(10)
    })
  })

  describe('algorithms', () => {
    const nodes = [createNode('a'), createNode('b')]
    const edges = [createEdge('e1', 'a', 'b')]

    it.each<LayoutAlgorithm>(['layered', 'tree', 'force', 'stress'])(
      'computes layout with %s algorithm',
      async (algorithm) => {
        const positions = await manager.layout({
          nodes,
          edges,
          algorithm
        })

        expect(positions.size).toBe(2)
      }
    )
  })

  describe('cancel', () => {
    it('cancel is safe to call when no layout is pending', () => {
      // Should not throw
      expect(() => manager.cancel()).not.toThrow()
    })
  })

  describe('terminate', () => {
    it('terminates cleanly', () => {
      const m = new LayoutManager({ useWorker: false })
      // Should not throw
      expect(() => m.terminate()).not.toThrow()
    })

    it('can be called multiple times', () => {
      const m = new LayoutManager({ useWorker: false })
      m.terminate()
      m.terminate()
      // Should not throw
    })
  })

  describe('options', () => {
    it('accepts custom layout options', async () => {
      const nodes = [createNode('a'), createNode('b')]
      const edges = [createEdge('e1', 'a', 'b')]

      const positions = await manager.layout({
        nodes,
        edges,
        algorithm: 'layered',
        options: {
          'elk.direction': 'DOWN',
          'elk.spacing.nodeNode': '100'
        }
      })

      expect(positions.size).toBe(2)
    })
  })
})

describe('createLayoutManager', () => {
  it('creates manager with factory function', () => {
    const manager = createLayoutManager({ useWorker: false })
    expect(manager).toBeInstanceOf(LayoutManager)
    manager.terminate()
  })
})
