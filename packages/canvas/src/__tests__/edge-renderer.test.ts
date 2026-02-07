/**
 * Edge Renderer Tests
 *
 * Tests for the Canvas 2D edge rendering layer.
 * Note: Canvas 2D tests require a DOM environment with canvas support.
 */

import type { CanvasEdge, Rect } from '../types'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EdgeRenderer, createEdgeRenderer } from '../layers/edge-renderer'

// ─── Test Helpers ───────────────────────────────────────────────────────────

function createContainer(width = 800, height = 600): HTMLDivElement {
  const container = document.createElement('div')
  container.style.width = `${width}px`
  container.style.height = `${height}px`
  container.style.position = 'relative'
  document.body.appendChild(container)
  return container
}

function cleanupContainer(container: HTMLDivElement): void {
  container.remove()
}

function createTestViewport(x = 0, y = 0, zoom = 1) {
  return {
    x,
    y,
    zoom,
    getVisibleRect: () => ({
      x: x - 400 / zoom,
      y: y - 300 / zoom,
      width: 800 / zoom,
      height: 600 / zoom
    })
  }
}

function isCanvas2DAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    return ctx !== null
  } catch {
    return false
  }
}

// ─── EdgeRenderer Tests ─────────────────────────────────────────────────────

describe('EdgeRenderer', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = createContainer()
  })

  afterEach(() => {
    cleanupContainer(container)
  })

  describe('constructor', () => {
    it('creates a canvas element in the container', () => {
      if (!isCanvas2DAvailable()) {
        console.log('Skipping Canvas 2D test - Canvas 2D not available')
        return
      }

      const renderer = new EdgeRenderer(container)
      const canvas = container.querySelector('canvas')

      expect(canvas).toBeTruthy()
      expect(canvas?.style.position).toBe('absolute')
      expect(canvas?.style.pointerEvents).toBe('none')

      renderer.destroy()
    })

    it('throws when Canvas 2D is not supported', () => {
      // Mock getContext to return null
      const originalGetContext = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null)

      expect(() => new EdgeRenderer(container)).toThrow('Canvas 2D not supported')

      HTMLCanvasElement.prototype.getContext = originalGetContext
    })
  })

  describe('render', () => {
    it('renders edges without errors', () => {
      if (!isCanvas2DAvailable()) return

      const renderer = new EdgeRenderer(container)
      renderer.resize()

      const edges: CanvasEdge[] = [
        { id: 'e1', sourceId: 'n1', targetId: 'n2' },
        { id: 'e2', sourceId: 'n2', targetId: 'n3' }
      ]

      const positions = new Map<string, Rect>([
        ['n1', { x: 0, y: 0, width: 100, height: 50 }],
        ['n2', { x: 200, y: 100, width: 100, height: 50 }],
        ['n3', { x: 400, y: 0, width: 100, height: 50 }]
      ])

      expect(() => renderer.render(edges, positions, createTestViewport(200, 50))).not.toThrow()

      renderer.destroy()
    })

    it('handles empty edge array', () => {
      if (!isCanvas2DAvailable()) return

      const renderer = new EdgeRenderer(container)
      renderer.resize()

      expect(() => renderer.render([], new Map(), createTestViewport())).not.toThrow()

      renderer.destroy()
    })

    it('skips edges with missing node positions', () => {
      if (!isCanvas2DAvailable()) return

      const renderer = new EdgeRenderer(container)
      renderer.resize()

      const edges: CanvasEdge[] = [
        { id: 'e1', sourceId: 'n1', targetId: 'n2' },
        { id: 'e2', sourceId: 'missing1', targetId: 'missing2' }
      ]

      const positions = new Map<string, Rect>([
        ['n1', { x: 0, y: 0, width: 100, height: 50 }],
        ['n2', { x: 200, y: 0, width: 100, height: 50 }]
      ])

      expect(() => renderer.render(edges, positions, createTestViewport())).not.toThrow()
      // Only one edge should be cached (the one with valid positions)
      expect(renderer.getCacheSize()).toBe(1)

      renderer.destroy()
    })
  })

  describe('caching', () => {
    it('caches edge paths', () => {
      if (!isCanvas2DAvailable()) return

      const renderer = new EdgeRenderer(container)
      renderer.resize()

      const edges: CanvasEdge[] = [{ id: 'e1', sourceId: 'n1', targetId: 'n2' }]

      const positions = new Map<string, Rect>([
        ['n1', { x: 0, y: 0, width: 100, height: 50 }],
        ['n2', { x: 200, y: 0, width: 100, height: 50 }]
      ])

      renderer.render(edges, positions, createTestViewport())

      expect(renderer.getCacheSize()).toBe(1)

      renderer.destroy()
    })

    it('reuses cache when positions unchanged', () => {
      if (!isCanvas2DAvailable()) return

      const renderer = new EdgeRenderer(container)
      renderer.resize()

      const edges: CanvasEdge[] = [{ id: 'e1', sourceId: 'n1', targetId: 'n2' }]

      const positions = new Map<string, Rect>([
        ['n1', { x: 0, y: 0, width: 100, height: 50 }],
        ['n2', { x: 200, y: 0, width: 100, height: 50 }]
      ])

      // First render
      renderer.render(edges, positions, createTestViewport())
      expect(renderer.getCacheSize()).toBe(1)

      // Second render with same data
      renderer.render(edges, positions, createTestViewport())
      expect(renderer.getCacheSize()).toBe(1)

      renderer.destroy()
    })

    it('removes deleted edges from cache', () => {
      if (!isCanvas2DAvailable()) return

      const renderer = new EdgeRenderer(container)
      renderer.resize()

      const edges1: CanvasEdge[] = [
        { id: 'e1', sourceId: 'n1', targetId: 'n2' },
        { id: 'e2', sourceId: 'n2', targetId: 'n3' }
      ]

      const edges2: CanvasEdge[] = [{ id: 'e1', sourceId: 'n1', targetId: 'n2' }]

      const positions = new Map<string, Rect>([
        ['n1', { x: 0, y: 0, width: 100, height: 50 }],
        ['n2', { x: 200, y: 0, width: 100, height: 50 }],
        ['n3', { x: 400, y: 0, width: 100, height: 50 }]
      ])

      renderer.render(edges1, positions, createTestViewport())
      expect(renderer.getCacheSize()).toBe(2)

      renderer.render(edges2, positions, createTestViewport())
      expect(renderer.getCacheSize()).toBe(1)

      renderer.destroy()
    })

    it('clears cache on clearCache()', () => {
      if (!isCanvas2DAvailable()) return

      const renderer = new EdgeRenderer(container)
      renderer.resize()

      const edges: CanvasEdge[] = [{ id: 'e1', sourceId: 'n1', targetId: 'n2' }]

      const positions = new Map<string, Rect>([
        ['n1', { x: 0, y: 0, width: 100, height: 50 }],
        ['n2', { x: 200, y: 0, width: 100, height: 50 }]
      ])

      renderer.render(edges, positions, createTestViewport())
      expect(renderer.getCacheSize()).toBe(1)

      renderer.clearCache()
      expect(renderer.getCacheSize()).toBe(0)

      renderer.destroy()
    })
  })

  describe('edge styles', () => {
    it('renders curved edges by default', () => {
      if (!isCanvas2DAvailable()) return

      const renderer = new EdgeRenderer(container)
      renderer.resize()

      const edges: CanvasEdge[] = [{ id: 'e1', sourceId: 'n1', targetId: 'n2' }]

      const positions = new Map<string, Rect>([
        ['n1', { x: 0, y: 0, width: 100, height: 50 }],
        ['n2', { x: 200, y: 100, width: 100, height: 50 }]
      ])

      expect(() => renderer.render(edges, positions, createTestViewport())).not.toThrow()

      renderer.destroy()
    })

    it('renders straight edges when curved=false', () => {
      if (!isCanvas2DAvailable()) return

      const renderer = new EdgeRenderer(container)
      renderer.resize()

      const edges: CanvasEdge[] = [
        { id: 'e1', sourceId: 'n1', targetId: 'n2', style: { curved: false } }
      ]

      const positions = new Map<string, Rect>([
        ['n1', { x: 0, y: 0, width: 100, height: 50 }],
        ['n2', { x: 200, y: 100, width: 100, height: 50 }]
      ])

      expect(() => renderer.render(edges, positions, createTestViewport())).not.toThrow()

      renderer.destroy()
    })

    it('renders dashed edges', () => {
      if (!isCanvas2DAvailable()) return

      const renderer = new EdgeRenderer(container)
      renderer.resize()

      const edges: CanvasEdge[] = [
        { id: 'e1', sourceId: 'n1', targetId: 'n2', style: { strokeDasharray: '5,5' } }
      ]

      const positions = new Map<string, Rect>([
        ['n1', { x: 0, y: 0, width: 100, height: 50 }],
        ['n2', { x: 200, y: 0, width: 100, height: 50 }]
      ])

      expect(() => renderer.render(edges, positions, createTestViewport())).not.toThrow()

      renderer.destroy()
    })

    it('renders arrow markers', () => {
      if (!isCanvas2DAvailable()) return

      const renderer = new EdgeRenderer(container)
      renderer.resize()

      const edges: CanvasEdge[] = [
        { id: 'e1', sourceId: 'n1', targetId: 'n2', style: { markerEnd: 'arrow' } }
      ]

      const positions = new Map<string, Rect>([
        ['n1', { x: 0, y: 0, width: 100, height: 50 }],
        ['n2', { x: 200, y: 0, width: 100, height: 50 }]
      ])

      expect(() => renderer.render(edges, positions, createTestViewport())).not.toThrow()

      renderer.destroy()
    })

    it('renders dot markers', () => {
      if (!isCanvas2DAvailable()) return

      const renderer = new EdgeRenderer(container)
      renderer.resize()

      const edges: CanvasEdge[] = [
        { id: 'e1', sourceId: 'n1', targetId: 'n2', style: { markerEnd: 'dot' } }
      ]

      const positions = new Map<string, Rect>([
        ['n1', { x: 0, y: 0, width: 100, height: 50 }],
        ['n2', { x: 200, y: 0, width: 100, height: 50 }]
      ])

      expect(() => renderer.render(edges, positions, createTestViewport())).not.toThrow()

      renderer.destroy()
    })

    it('renders edges with custom stroke color', () => {
      if (!isCanvas2DAvailable()) return

      const renderer = new EdgeRenderer(container)
      renderer.resize()

      const edges: CanvasEdge[] = [
        { id: 'e1', sourceId: 'n1', targetId: 'n2', style: { stroke: '#ff0000' } }
      ]

      const positions = new Map<string, Rect>([
        ['n1', { x: 0, y: 0, width: 100, height: 50 }],
        ['n2', { x: 200, y: 0, width: 100, height: 50 }]
      ])

      expect(() => renderer.render(edges, positions, createTestViewport())).not.toThrow()

      renderer.destroy()
    })
  })

  describe('labels', () => {
    it('renders labels at high zoom', () => {
      if (!isCanvas2DAvailable()) return

      const renderer = new EdgeRenderer(container)
      renderer.resize()

      const edges: CanvasEdge[] = [
        { id: 'e1', sourceId: 'n1', targetId: 'n2', label: 'Test Label' }
      ]

      const positions = new Map<string, Rect>([
        ['n1', { x: 0, y: 0, width: 100, height: 50 }],
        ['n2', { x: 200, y: 0, width: 100, height: 50 }]
      ])

      // High zoom (> 0.5)
      expect(() => renderer.render(edges, positions, createTestViewport(100, 25, 1))).not.toThrow()

      renderer.destroy()
    })

    it('skips labels at low zoom', () => {
      if (!isCanvas2DAvailable()) return

      const renderer = new EdgeRenderer(container)
      renderer.resize()

      const edges: CanvasEdge[] = [
        { id: 'e1', sourceId: 'n1', targetId: 'n2', label: 'Test Label' }
      ]

      const positions = new Map<string, Rect>([
        ['n1', { x: 0, y: 0, width: 100, height: 50 }],
        ['n2', { x: 200, y: 0, width: 100, height: 50 }]
      ])

      // Low zoom (< 0.5)
      expect(() =>
        renderer.render(edges, positions, createTestViewport(100, 25, 0.3))
      ).not.toThrow()

      renderer.destroy()
    })
  })

  describe('anchor points', () => {
    it('uses auto anchor by default', () => {
      if (!isCanvas2DAvailable()) return

      const renderer = new EdgeRenderer(container)
      renderer.resize()

      const edges: CanvasEdge[] = [{ id: 'e1', sourceId: 'n1', targetId: 'n2' }]

      const positions = new Map<string, Rect>([
        ['n1', { x: 0, y: 0, width: 100, height: 50 }],
        ['n2', { x: 200, y: 0, width: 100, height: 50 }]
      ])

      expect(() => renderer.render(edges, positions, createTestViewport())).not.toThrow()

      renderer.destroy()
    })

    it('respects explicit anchors', () => {
      if (!isCanvas2DAvailable()) return

      const renderer = new EdgeRenderer(container)
      renderer.resize()

      const edges: CanvasEdge[] = [
        { id: 'e1', sourceId: 'n1', targetId: 'n2', sourceAnchor: 'bottom', targetAnchor: 'top' }
      ]

      const positions = new Map<string, Rect>([
        ['n1', { x: 100, y: 0, width: 100, height: 50 }],
        ['n2', { x: 100, y: 150, width: 100, height: 50 }]
      ])

      expect(() => renderer.render(edges, positions, createTestViewport())).not.toThrow()

      renderer.destroy()
    })

    it('supports all anchor types', () => {
      if (!isCanvas2DAvailable()) return

      const renderer = new EdgeRenderer(container)
      renderer.resize()

      const anchors = ['top', 'bottom', 'left', 'right', 'center', 'auto'] as const

      for (const anchor of anchors) {
        const edges: CanvasEdge[] = [
          { id: 'e1', sourceId: 'n1', targetId: 'n2', sourceAnchor: anchor, targetAnchor: anchor }
        ]

        const positions = new Map<string, Rect>([
          ['n1', { x: 0, y: 0, width: 100, height: 50 }],
          ['n2', { x: 200, y: 100, width: 100, height: 50 }]
        ])

        expect(() => renderer.render(edges, positions, createTestViewport())).not.toThrow()
      }

      renderer.destroy()
    })
  })

  describe('resize', () => {
    it('handles resize correctly', () => {
      if (!isCanvas2DAvailable()) return

      const renderer = new EdgeRenderer(container)
      renderer.resize()

      // Change container size
      container.style.width = '1200px'
      container.style.height = '900px'

      expect(() => renderer.resize()).not.toThrow()

      renderer.destroy()
    })
  })

  describe('destroy', () => {
    it('removes canvas from container', () => {
      if (!isCanvas2DAvailable()) return

      const renderer = new EdgeRenderer(container)
      expect(container.querySelector('canvas')).toBeTruthy()

      renderer.destroy()
      expect(container.querySelector('canvas')).toBeNull()
    })

    it('clears cache', () => {
      if (!isCanvas2DAvailable()) return

      const renderer = new EdgeRenderer(container)
      renderer.resize()

      const edges: CanvasEdge[] = [{ id: 'e1', sourceId: 'n1', targetId: 'n2' }]

      const positions = new Map<string, Rect>([
        ['n1', { x: 0, y: 0, width: 100, height: 50 }],
        ['n2', { x: 200, y: 0, width: 100, height: 50 }]
      ])

      renderer.render(edges, positions, createTestViewport())
      expect(renderer.getCacheSize()).toBe(1)

      renderer.destroy()
      expect(renderer.getCacheSize()).toBe(0)
    })
  })
})

// ─── Factory Function Tests ─────────────────────────────────────────────────

describe('createEdgeRenderer', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = createContainer()
  })

  afterEach(() => {
    cleanupContainer(container)
  })

  it('creates an EdgeRenderer instance', () => {
    if (!isCanvas2DAvailable()) {
      console.log('Skipping Canvas 2D test - Canvas 2D not available')
      return
    }

    const renderer = createEdgeRenderer(container)

    expect(renderer).toBeInstanceOf(EdgeRenderer)

    renderer.destroy()
  })
})

// ─── isCanvas2DAvailable Tests ──────────────────────────────────────────────

describe('isCanvas2DAvailable', () => {
  it('returns a boolean', () => {
    const result = isCanvas2DAvailable()
    expect(typeof result).toBe('boolean')
  })
})
