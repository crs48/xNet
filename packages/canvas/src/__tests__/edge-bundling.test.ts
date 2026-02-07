/**
 * Edge Bundling Tests
 *
 * Tests for edge bundling functionality.
 */

import type { Rect } from '../routing/types'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  EdgeBundler,
  createEdgeBundler,
  DEFAULT_BUNDLE_CONFIG,
  type CanvasEdge
} from '../routing/edge-bundler'

describe('EdgeBundler', () => {
  let bundler: EdgeBundler

  beforeEach(() => {
    bundler = new EdgeBundler({ bundleThreshold: 50, minBundleSize: 2 })
  })

  describe('constructor', () => {
    it('creates bundler with default config', () => {
      const b = new EdgeBundler()
      const config = b.getConfig()
      expect(config.bundleThreshold).toBe(DEFAULT_BUNDLE_CONFIG.bundleThreshold)
      expect(config.minBundleSize).toBe(DEFAULT_BUNDLE_CONFIG.minBundleSize)
      expect(config.fanOutDistance).toBe(DEFAULT_BUNDLE_CONFIG.fanOutDistance)
      expect(config.maxBundleWidth).toBe(DEFAULT_BUNDLE_CONFIG.maxBundleWidth)
      expect(config.angleTolerance).toBe(DEFAULT_BUNDLE_CONFIG.angleTolerance)
    })

    it('creates bundler with custom config', () => {
      const b = new EdgeBundler({ bundleThreshold: 100, minBundleSize: 3 })
      const config = b.getConfig()
      expect(config.bundleThreshold).toBe(100)
      expect(config.minBundleSize).toBe(3)
    })
  })

  describe('getConfig', () => {
    it('returns a copy of the config', () => {
      const config1 = bundler.getConfig()
      const config2 = bundler.getConfig()
      expect(config1).toEqual(config2)
      expect(config1).not.toBe(config2)
    })
  })

  describe('setConfig', () => {
    it('updates configuration', () => {
      bundler.setConfig({ bundleThreshold: 200 })
      expect(bundler.getConfig().bundleThreshold).toBe(200)
      expect(bundler.getConfig().minBundleSize).toBe(2) // Unchanged
    })
  })

  describe('bundle', () => {
    it('bundles parallel edges', () => {
      const edges: CanvasEdge[] = [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'a', targetId: 'c' },
        { id: 'e3', sourceId: 'a', targetId: 'd' }
      ]

      const positions = new Map<string, Rect>([
        ['a', { x: 0, y: 100, width: 50, height: 50 }],
        ['b', { x: 200, y: 80, width: 50, height: 50 }],
        ['c', { x: 200, y: 100, width: 50, height: 50 }],
        ['d', { x: 200, y: 120, width: 50, height: 50 }]
      ])

      const bundles = bundler.bundle(edges, positions)

      // Should create one bundle with all 3 edges
      expect(bundles.length).toBe(1)
      expect(bundles[0].originalEdges.length).toBe(3)
    })

    it('keeps separate edges unbundled', () => {
      const edges: CanvasEdge[] = [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'c', targetId: 'd' }
      ]

      const positions = new Map<string, Rect>([
        ['a', { x: 0, y: 0, width: 50, height: 50 }],
        ['b', { x: 200, y: 0, width: 50, height: 50 }],
        ['c', { x: 0, y: 500, width: 50, height: 50 }],
        ['d', { x: 200, y: 500, width: 50, height: 50 }]
      ])

      const bundles = bundler.bundle(edges, positions)

      // Should keep edges separate
      expect(bundles.length).toBe(2)
      expect(bundles[0].originalEdges.length).toBe(1)
      expect(bundles[1].originalEdges.length).toBe(1)
    })

    it('calculates bundle width proportionally', () => {
      const edges: CanvasEdge[] = Array.from({ length: 10 }, (_, i) => ({
        id: `e${i}`,
        sourceId: 'a',
        targetId: `b${i}`
      }))

      const positions = new Map<string, Rect>([['a', { x: 0, y: 100, width: 50, height: 50 }]])

      // Add target nodes in a tight vertical line
      for (let i = 0; i < 10; i++) {
        positions.set(`b${i}`, { x: 200, y: 90 + i * 5, width: 50, height: 50 })
      }

      const bundles = bundler.bundle(edges, positions)

      // Bundle width should be proportional to edge count
      const bundle = bundles.find((b) => b.originalEdges.length > 1)
      expect(bundle).toBeDefined()
      expect(bundle!.width).toBeGreaterThan(2)
    })

    it('caps bundle width at maximum', () => {
      const b = new EdgeBundler({ bundleThreshold: 100, minBundleSize: 2, maxBundleWidth: 6 })

      const edges: CanvasEdge[] = Array.from({ length: 20 }, (_, i) => ({
        id: `e${i}`,
        sourceId: 'a',
        targetId: `b${i}`
      }))

      const positions = new Map<string, Rect>([['a', { x: 0, y: 100, width: 50, height: 50 }]])

      for (let i = 0; i < 20; i++) {
        positions.set(`b${i}`, { x: 200, y: 95 + i * 2, width: 50, height: 50 })
      }

      const bundles = b.bundle(edges, positions)
      const bundle = bundles.find((b) => b.originalEdges.length > 1)

      expect(bundle).toBeDefined()
      expect(bundle!.width).toBeLessThanOrEqual(6)
    })

    it('uses dominant color for bundle', () => {
      const edges: CanvasEdge[] = [
        { id: 'e1', sourceId: 'a', targetId: 'b', style: { stroke: '#ff0000' } },
        { id: 'e2', sourceId: 'a', targetId: 'c', style: { stroke: '#ff0000' } },
        { id: 'e3', sourceId: 'a', targetId: 'd', style: { stroke: '#00ff00' } }
      ]

      const positions = new Map<string, Rect>([
        ['a', { x: 0, y: 100, width: 50, height: 50 }],
        ['b', { x: 200, y: 80, width: 50, height: 50 }],
        ['c', { x: 200, y: 100, width: 50, height: 50 }],
        ['d', { x: 200, y: 120, width: 50, height: 50 }]
      ])

      const bundles = bundler.bundle(edges, positions)

      expect(bundles.length).toBe(1)
      expect(bundles[0].color).toBe('#ff0000') // Most common color
    })

    it('uses default color when no style provided', () => {
      const edges: CanvasEdge[] = [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'a', targetId: 'c' }
      ]

      const positions = new Map<string, Rect>([
        ['a', { x: 0, y: 100, width: 50, height: 50 }],
        ['b', { x: 200, y: 95, width: 50, height: 50 }],
        ['c', { x: 200, y: 105, width: 50, height: 50 }]
      ])

      const bundles = bundler.bundle(edges, positions)

      expect(bundles[0].color).toBe('#64748b')
    })

    it('skips edges with missing node positions', () => {
      const edges: CanvasEdge[] = [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'missing', targetId: 'b' }
      ]

      const positions = new Map<string, Rect>([
        ['a', { x: 0, y: 0, width: 50, height: 50 }],
        ['b', { x: 200, y: 0, width: 50, height: 50 }]
      ])

      const bundles = bundler.bundle(edges, positions)

      expect(bundles.length).toBe(1)
      expect(bundles[0].originalEdges[0].id).toBe('e1')
    })

    it('returns empty array for empty edges', () => {
      const bundles = bundler.bundle([], new Map())
      expect(bundles).toEqual([])
    })

    it('does not bundle edges with different angles', () => {
      // Create edges pointing in very different directions
      const edges: CanvasEdge[] = [
        { id: 'e1', sourceId: 'a', targetId: 'b' }, // Points right
        { id: 'e2', sourceId: 'a', targetId: 'c' } // Points down
      ]

      const positions = new Map<string, Rect>([
        ['a', { x: 100, y: 100, width: 50, height: 50 }],
        ['b', { x: 300, y: 100, width: 50, height: 50 }], // Right
        ['c', { x: 100, y: 400, width: 50, height: 50 }] // Down
      ])

      const bundles = bundler.bundle(edges, positions)

      // Should remain separate due to different angles
      expect(bundles.length).toBe(2)
    })

    it('bundles edges with similar angles', () => {
      // Create edges pointing in similar directions (within 30 degrees)
      const edges: CanvasEdge[] = [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'a', targetId: 'c' }
      ]

      const positions = new Map<string, Rect>([
        ['a', { x: 0, y: 100, width: 50, height: 50 }],
        ['b', { x: 200, y: 90, width: 50, height: 50 }], // Slightly up-right
        ['c', { x: 200, y: 110, width: 50, height: 50 }] // Slightly down-right
      ])

      const bundles = bundler.bundle(edges, positions)

      // Should bundle together (similar angles)
      expect(bundles.length).toBe(1)
      expect(bundles[0].originalEdges.length).toBe(2)
    })

    it('creates path through midpoint for bundles', () => {
      const edges: CanvasEdge[] = [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'a', targetId: 'c' }
      ]

      const positions = new Map<string, Rect>([
        ['a', { x: 0, y: 100, width: 50, height: 50 }],
        ['b', { x: 200, y: 95, width: 50, height: 50 }],
        ['c', { x: 200, y: 105, width: 50, height: 50 }]
      ])

      const bundles = bundler.bundle(edges, positions)

      expect(bundles[0].path.length).toBe(3) // source, midpoint, target
    })

    it('creates direct path for single edges', () => {
      const edges: CanvasEdge[] = [{ id: 'e1', sourceId: 'a', targetId: 'b' }]

      const positions = new Map<string, Rect>([
        ['a', { x: 0, y: 0, width: 50, height: 50 }],
        ['b', { x: 200, y: 0, width: 50, height: 50 }]
      ])

      const bundles = bundler.bundle(edges, positions)

      expect(bundles[0].path.length).toBe(2) // source, target only
    })

    it('generates unique bundle IDs', () => {
      const edges: CanvasEdge[] = [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'a', targetId: 'c' }
      ]

      const positions = new Map<string, Rect>([
        ['a', { x: 0, y: 100, width: 50, height: 50 }],
        ['b', { x: 200, y: 95, width: 50, height: 50 }],
        ['c', { x: 200, y: 105, width: 50, height: 50 }]
      ])

      const bundles = bundler.bundle(edges, positions)

      expect(bundles[0].id).toContain('bundle-')
      expect(bundles[0].id).toContain('e1')
      expect(bundles[0].id).toContain('e2')
    })
  })

  describe('performance', () => {
    it('bundles 1000 edges in under 10ms', () => {
      const b = new EdgeBundler({ bundleThreshold: 100, minBundleSize: 2 })

      // Create 1000 edges
      const edges: CanvasEdge[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `e${i}`,
        sourceId: `s${i % 100}`,
        targetId: `t${i % 100}`
      }))

      // Create node positions
      const positions = new Map<string, Rect>()
      for (let i = 0; i < 100; i++) {
        positions.set(`s${i}`, { x: i * 20, y: 0, width: 50, height: 50 })
        positions.set(`t${i}`, { x: i * 20, y: 200, width: 50, height: 50 })
      }

      const start = performance.now()
      b.bundle(edges, positions)
      const elapsed = performance.now() - start

      expect(elapsed).toBeLessThan(10)
    })
  })
})

describe('createEdgeBundler', () => {
  it('creates bundler with factory function', () => {
    const bundler = createEdgeBundler()
    expect(bundler).toBeInstanceOf(EdgeBundler)
  })

  it('passes config to bundler', () => {
    const bundler = createEdgeBundler({ bundleThreshold: 150 })
    expect(bundler.getConfig().bundleThreshold).toBe(150)
  })
})

describe('DEFAULT_BUNDLE_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_BUNDLE_CONFIG.bundleThreshold).toBe(80)
    expect(DEFAULT_BUNDLE_CONFIG.minBundleSize).toBe(2)
    expect(DEFAULT_BUNDLE_CONFIG.fanOutDistance).toBe(30)
    expect(DEFAULT_BUNDLE_CONFIG.maxBundleWidth).toBe(8)
    expect(DEFAULT_BUNDLE_CONFIG.angleTolerance).toBe(Math.PI / 6)
  })
})
