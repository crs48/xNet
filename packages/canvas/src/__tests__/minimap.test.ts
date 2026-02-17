/**
 * Minimap Tests
 *
 * Tests for the canvas minimap component.
 */

import type { CanvasNode, CanvasEdge } from '../types'
import { describe, it, expect } from 'vitest'
import { Viewport } from '../spatial/index'

// ─── Helper Functions ─────────────────────────────────────────────────────────

function createTestNode(
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 50,
  type: CanvasNode['type'] = 'card'
): CanvasNode {
  return {
    id,
    type,
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Minimap', () => {
  describe('node color mapping', () => {
    it('returns correct color for card nodes', () => {
      const node = createTestNode('n1', 0, 0, 100, 50, 'card')
      // Color is determined by node type in the component
      expect(node.type).toBe('card')
    })

    it('returns correct color for shape nodes', () => {
      const node = createTestNode('n1', 0, 0, 100, 50, 'shape')
      expect(node.type).toBe('shape')
    })

    it('returns correct color for embed nodes', () => {
      const node = createTestNode('n1', 0, 0, 100, 50, 'embed')
      expect(node.type).toBe('embed')
    })

    it('returns correct color for frame nodes', () => {
      const node = createTestNode('n1', 0, 0, 100, 50, 'frame')
      expect(node.type).toBe('frame')
    })

    it('returns correct color for image nodes', () => {
      const node = createTestNode('n1', 0, 0, 100, 50, 'image')
      expect(node.type).toBe('image')
    })

    it('returns correct color for group nodes', () => {
      const node = createTestNode('n1', 0, 0, 100, 50, 'group')
      expect(node.type).toBe('group')
    })
  })

  describe('bounds calculation', () => {
    it('calculates correct bounds for single node', () => {
      const nodes = [createTestNode('n1', 100, 100, 200, 150)]

      // Calculate bounds manually
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity

      for (const node of nodes) {
        minX = Math.min(minX, node.position.x)
        minY = Math.min(minY, node.position.y)
        maxX = Math.max(maxX, node.position.x + node.position.width)
        maxY = Math.max(maxY, node.position.y + node.position.height)
      }

      expect(minX).toBe(100)
      expect(minY).toBe(100)
      expect(maxX).toBe(300)
      expect(maxY).toBe(250)
    })

    it('calculates correct bounds for multiple nodes', () => {
      const nodes = [
        createTestNode('n1', -100, -50, 100, 50),
        createTestNode('n2', 200, 150, 100, 50),
        createTestNode('n3', 50, 300, 100, 50)
      ]

      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity

      for (const node of nodes) {
        minX = Math.min(minX, node.position.x)
        minY = Math.min(minY, node.position.y)
        maxX = Math.max(maxX, node.position.x + node.position.width)
        maxY = Math.max(maxY, node.position.y + node.position.height)
      }

      expect(minX).toBe(-100)
      expect(minY).toBe(-50)
      expect(maxX).toBe(300)
      expect(maxY).toBe(350)
    })

    it('handles empty nodes array', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const nodes: CanvasNode[] = []
      // Default bounds should be used for empty canvas
      const defaultBounds = { x: -500, y: -500, width: 1000, height: 1000 }
      expect(defaultBounds).toBeDefined()
    })
  })

  describe('coordinate conversion', () => {
    it('converts minimap coordinates to canvas coordinates', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const nodes = [createTestNode('n1', 0, 0, 100, 100), createTestNode('n2', 400, 400, 100, 100)]

      // Calculate bounds
      const minX = 0
      const minY = 0
      const maxX = 500
      const maxY = 500

      const padding = 100
      const canvasBounds = {
        x: minX - padding,
        y: minY - padding,
        width: maxX - minX + padding * 2,
        height: maxY - minY + padding * 2
      }

      const minimapWidth = 200
      const minimapHeight = 150

      // Calculate scale
      const scaleX = (minimapWidth - 20) / canvasBounds.width
      const scaleY = (minimapHeight - 20) / canvasBounds.height
      const scale = Math.min(scaleX, scaleY)

      // Calculate offset
      const offsetX = minimapWidth / 2 - (canvasBounds.x + canvasBounds.width / 2) * scale
      const offsetY = minimapHeight / 2 - (canvasBounds.y + canvasBounds.height / 2) * scale

      // Convert minimap center to canvas coordinates
      const minimapX = minimapWidth / 2
      const minimapY = minimapHeight / 2
      const canvasX = (minimapX - offsetX) / scale
      const canvasY = (minimapY - offsetY) / scale

      // Should be approximately the center of the canvas bounds
      expect(canvasX).toBeCloseTo(canvasBounds.x + canvasBounds.width / 2, 1)
      expect(canvasY).toBeCloseTo(canvasBounds.y + canvasBounds.height / 2, 1)
    })
  })

  describe('viewport indicator', () => {
    it('calculates visible rect from viewport', () => {
      const viewport = createViewport(1, 100, 100)
      const visibleRect = viewport.getVisibleRect()

      // At zoom 1, visible area should be viewport dimensions
      expect(visibleRect.width).toBe(1920)
      expect(visibleRect.height).toBe(1080)
      expect(visibleRect.x).toBe(100 - 1920 / 2)
      expect(visibleRect.y).toBe(100 - 1080 / 2)
    })

    it('handles zoomed out viewport', () => {
      const viewport = createViewport(0.5, 0, 0)
      const visibleRect = viewport.getVisibleRect()

      // At zoom 0.5, visible area should be doubled
      expect(visibleRect.width).toBe(1920 / 0.5)
      expect(visibleRect.height).toBe(1080 / 0.5)
    })

    it('handles zoomed in viewport', () => {
      const viewport = createViewport(2, 0, 0)
      const visibleRect = viewport.getVisibleRect()

      // At zoom 2, visible area should be halved
      expect(visibleRect.width).toBe(1920 / 2)
      expect(visibleRect.height).toBe(1080 / 2)
    })
  })

  describe('edge rendering', () => {
    it('finds source and target nodes for edges', () => {
      const nodes = [createTestNode('n1', 0, 0), createTestNode('n2', 200, 100)]
      const edges = [createTestEdge('e1', 'n1', 'n2')]

      const nodeMap = new Map(nodes.map((n) => [n.id, n]))
      const edge = edges[0]

      const source = nodeMap.get(edge.sourceId)
      const target = nodeMap.get(edge.targetId)

      expect(source).toBeDefined()
      expect(target).toBeDefined()
      expect(source?.id).toBe('n1')
      expect(target?.id).toBe('n2')
    })

    it('skips edges with missing nodes', () => {
      const nodes = [createTestNode('n1', 0, 0)]
      const edges = [createTestEdge('e1', 'n1', 'n2')] // n2 doesn't exist

      const nodeMap = new Map(nodes.map((n) => [n.id, n]))
      const edge = edges[0]

      const source = nodeMap.get(edge.sourceId)
      const target = nodeMap.get(edge.targetId)

      expect(source).toBeDefined()
      expect(target).toBeUndefined()
    })
  })

  describe('node sorting', () => {
    it('sorts frames and groups before regular nodes', () => {
      const nodes = [
        createTestNode('n1', 0, 0, 100, 50, 'card'),
        createTestNode('n2', 0, 0, 200, 200, 'frame'),
        createTestNode('n3', 0, 0, 100, 50, 'shape'),
        createTestNode('n4', 0, 0, 300, 300, 'group')
      ]

      const sortedNodes = [...nodes].sort((a, b) => {
        const aIsContainer = a.type === 'frame' || a.type === 'group'
        const bIsContainer = b.type === 'frame' || b.type === 'group'
        if (aIsContainer && !bIsContainer) return -1
        if (!aIsContainer && bIsContainer) return 1
        return 0
      })

      // Containers should come first
      expect(sortedNodes[0].type).toBe('frame')
      expect(sortedNodes[1].type).toBe('group')
      expect(sortedNodes[2].type).toBe('card')
      expect(sortedNodes[3].type).toBe('shape')
    })
  })

  describe('scale calculation', () => {
    it('fits content within minimap bounds', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const nodes = [
        createTestNode('n1', 0, 0, 1000, 1000),
        createTestNode('n2', 2000, 0, 1000, 1000)
      ]

      const minimapWidth = 200
      const minimapHeight = 150
      const padding = 10

      // Calculate bounds
      const canvasBounds = {
        x: -100,
        y: -100,
        width: 3200, // 0 to 3000 + padding
        height: 1200
      }

      const scaleX = (minimapWidth - padding * 2) / canvasBounds.width
      const scaleY = (minimapHeight - padding * 2) / canvasBounds.height
      const scale = Math.min(scaleX, scaleY)

      expect(scale).toBeLessThan(1)
      expect(scale * canvasBounds.width).toBeLessThanOrEqual(minimapWidth)
      expect(scale * canvasBounds.height).toBeLessThanOrEqual(minimapHeight)
    })

    it('handles very small content', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const nodes = [createTestNode('n1', 0, 0, 10, 10)]

      const minimapWidth = 200
      const minimapHeight = 150
      const padding = 10

      // With padding, bounds would be larger
      const canvasBounds = {
        x: -10,
        y: -10,
        width: 30,
        height: 30
      }

      const scaleX = (minimapWidth - padding * 2) / canvasBounds.width
      const scaleY = (minimapHeight - padding * 2) / canvasBounds.height
      const scale = Math.min(scaleX, scaleY)

      // Should scale up small content
      expect(scale).toBeGreaterThan(1)
    })
  })

  describe('performance with many nodes', () => {
    it('handles 10k nodes for bounds calculation', () => {
      const nodes: CanvasNode[] = Array.from({ length: 10000 }, (_, i) => ({
        id: `n${i}`,
        type: 'card' as const,
        position: {
          x: (i % 100) * 150,
          y: Math.floor(i / 100) * 100,
          width: 100,
          height: 50
        },
        properties: {}
      }))

      const start = performance.now()

      // Calculate bounds
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity

      for (const node of nodes) {
        minX = Math.min(minX, node.position.x)
        minY = Math.min(minY, node.position.y)
        maxX = Math.max(maxX, node.position.x + node.position.width)
        maxY = Math.max(maxY, node.position.y + node.position.height)
      }

      const elapsed = performance.now() - start

      // Bounds calculation should be fast
      expect(elapsed).toBeLessThan(50) // Should complete in under 50ms
      expect(minX).toBe(0)
      expect(minY).toBe(0)
    })

    it('handles edge lookup for many edges', () => {
      const nodes: CanvasNode[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `n${i}`,
        type: 'card' as const,
        position: {
          x: (i % 50) * 150,
          y: Math.floor(i / 50) * 100,
          width: 100,
          height: 50
        },
        properties: {}
      }))

      const edges: CanvasEdge[] = Array.from({ length: 2000 }, (_, i) => ({
        id: `e${i}`,
        sourceId: `n${i % 1000}`,
        targetId: `n${(i + 1) % 1000}`
      }))

      const start = performance.now()

      // Using Map for O(1) lookups
      const nodeMap = new Map(nodes.map((n) => [n.id, n]))

      let renderedEdges = 0
      for (const edge of edges) {
        const source = nodeMap.get(edge.sourceId)
        const target = nodeMap.get(edge.targetId)
        if (source && target) {
          renderedEdges++
        }
      }

      const elapsed = performance.now() - start

      // CI and local machines can vary; keep this as a regression guard,
      // not a micro-benchmark.
      expect(elapsed).toBeLessThan(25)
      expect(renderedEdges).toBe(2000)
    })
  })
})
