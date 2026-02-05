/**
 * Tests for spatial indexing
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SpatialIndex, Viewport, createSpatialIndex, createViewport } from '../spatial/index'
import type { CanvasNode } from '../types'

describe('SpatialIndex', () => {
  let index: SpatialIndex

  beforeEach(() => {
    index = createSpatialIndex()
  })

  describe('upsert', () => {
    it('should add a new item', () => {
      index.upsert('node1', { x: 0, y: 0, width: 100, height: 50 })
      expect(index.size()).toBe(1)
    })

    it('should update existing item', () => {
      index.upsert('node1', { x: 0, y: 0, width: 100, height: 50 })
      index.upsert('node1', { x: 100, y: 100, width: 100, height: 50 })
      expect(index.size()).toBe(1)
    })

    it('should add multiple items', () => {
      index.upsert('node1', { x: 0, y: 0, width: 100, height: 50 })
      index.upsert('node2', { x: 200, y: 0, width: 100, height: 50 })
      index.upsert('node3', { x: 0, y: 200, width: 100, height: 50 })
      expect(index.size()).toBe(3)
    })
  })

  describe('remove', () => {
    it('should remove an item', () => {
      index.upsert('node1', { x: 0, y: 0, width: 100, height: 50 })
      expect(index.remove('node1')).toBe(true)
      expect(index.size()).toBe(0)
    })

    it('should return false for non-existent item', () => {
      expect(index.remove('nonexistent')).toBe(false)
    })
  })

  describe('search', () => {
    beforeEach(() => {
      index.upsert('node1', { x: 0, y: 0, width: 100, height: 50 })
      index.upsert('node2', { x: 200, y: 0, width: 100, height: 50 })
      index.upsert('node3', { x: 0, y: 200, width: 100, height: 50 })
    })

    it('should find items in viewport', () => {
      const results = index.search({ x: -50, y: -50, width: 200, height: 100 })
      expect(results).toContain('node1')
      expect(results).not.toContain('node2')
      expect(results).not.toContain('node3')
    })

    it('should find multiple items', () => {
      const results = index.search({ x: -50, y: -50, width: 400, height: 100 })
      expect(results).toContain('node1')
      expect(results).toContain('node2')
    })

    it('should return empty for non-overlapping viewport', () => {
      const results = index.search({ x: 1000, y: 1000, width: 100, height: 100 })
      expect(results).toEqual([])
    })
  })

  describe('queryPoint', () => {
    beforeEach(() => {
      index.upsert('node1', { x: 0, y: 0, width: 100, height: 50 })
      index.upsert('node2', { x: 50, y: 25, width: 100, height: 50 })
    })

    it('should find items at point', () => {
      const results = index.queryPoint({ x: 75, y: 30 })
      expect(results).toContain('node1')
      expect(results).toContain('node2')
    })

    it('should return empty for point outside all items', () => {
      const results = index.queryPoint({ x: 500, y: 500 })
      expect(results).toEqual([])
    })
  })

  describe('findNodeAt', () => {
    it('should return topmost node by z-index', () => {
      index.upsert('node1', { x: 0, y: 0, width: 100, height: 50, zIndex: 1 })
      index.upsert('node2', { x: 50, y: 25, width: 100, height: 50, zIndex: 2 })

      const nodes = new Map<string, CanvasNode>([
        [
          'node1',
          {
            id: 'node1',
            type: 'card',
            position: { x: 0, y: 0, width: 100, height: 50, zIndex: 1 },
            properties: {}
          }
        ],
        [
          'node2',
          {
            id: 'node2',
            type: 'card',
            position: { x: 50, y: 25, width: 100, height: 50, zIndex: 2 },
            properties: {}
          }
        ]
      ])

      const result = index.findNodeAt({ x: 75, y: 30 }, nodes)
      expect(result).toBe('node2') // Higher z-index
    })
  })

  describe('getBounds', () => {
    it('should return null for empty index', () => {
      expect(index.getBounds()).toBeNull()
    })

    it('should return bounding box of all items', () => {
      index.upsert('node1', { x: 0, y: 0, width: 100, height: 50 })
      index.upsert('node2', { x: 200, y: 100, width: 50, height: 50 })

      const bounds = index.getBounds()
      expect(bounds).toEqual({
        x: 0,
        y: 0,
        width: 250,
        height: 150
      })
    })
  })

  describe('load', () => {
    it('should bulk load items', () => {
      index.load([
        { id: 'node1', position: { x: 0, y: 0, width: 100, height: 50 } },
        { id: 'node2', position: { x: 200, y: 0, width: 100, height: 50 } },
        { id: 'node3', position: { x: 0, y: 200, width: 100, height: 50 } }
      ])
      expect(index.size()).toBe(3)
    })

    it('should clear existing items', () => {
      index.upsert('old', { x: 0, y: 0, width: 10, height: 10 })
      index.load([{ id: 'new', position: { x: 0, y: 0, width: 100, height: 50 } }])
      expect(index.size()).toBe(1)
      expect(index.getIds()).toEqual(['new'])
    })
  })
})

describe('Viewport', () => {
  let viewport: Viewport

  beforeEach(() => {
    viewport = createViewport({ width: 800, height: 600 })
  })

  describe('screenToCanvas', () => {
    it('should convert screen center to canvas origin', () => {
      const point = viewport.screenToCanvas(400, 300)
      expect(point.x).toBeCloseTo(0)
      expect(point.y).toBeCloseTo(0)
    })

    it('should account for viewport offset', () => {
      viewport.x = 100
      viewport.y = 50
      const point = viewport.screenToCanvas(400, 300)
      expect(point.x).toBeCloseTo(100)
      expect(point.y).toBeCloseTo(50)
    })

    it('should account for zoom', () => {
      viewport.zoom = 2
      const point = viewport.screenToCanvas(500, 400)
      expect(point.x).toBeCloseTo(50)
      expect(point.y).toBeCloseTo(50)
    })
  })

  describe('canvasToScreen', () => {
    it('should convert canvas origin to screen center', () => {
      const point = viewport.canvasToScreen(0, 0)
      expect(point.x).toBeCloseTo(400)
      expect(point.y).toBeCloseTo(300)
    })

    it('should be inverse of screenToCanvas', () => {
      const screenPoint = { x: 123, y: 456 }
      const canvasPoint = viewport.screenToCanvas(screenPoint.x, screenPoint.y)
      const backToScreen = viewport.canvasToScreen(canvasPoint.x, canvasPoint.y)
      expect(backToScreen.x).toBeCloseTo(screenPoint.x)
      expect(backToScreen.y).toBeCloseTo(screenPoint.y)
    })
  })

  describe('getVisibleRect', () => {
    it('should return visible canvas area', () => {
      const rect = viewport.getVisibleRect()
      expect(rect.x).toBeCloseTo(-400)
      expect(rect.y).toBeCloseTo(-300)
      expect(rect.width).toBeCloseTo(800)
      expect(rect.height).toBeCloseTo(600)
    })

    it('should shrink visible area when zoomed in', () => {
      viewport.zoom = 2
      const rect = viewport.getVisibleRect()
      expect(rect.width).toBeCloseTo(400)
      expect(rect.height).toBeCloseTo(300)
    })
  })

  describe('pan', () => {
    it('should move viewport center', () => {
      viewport.pan(100, 50)
      expect(viewport.x).toBeCloseTo(-100)
      expect(viewport.y).toBeCloseTo(-50)
    })

    it('should account for zoom when panning', () => {
      viewport.zoom = 2
      viewport.pan(100, 50)
      expect(viewport.x).toBeCloseTo(-50)
      expect(viewport.y).toBeCloseTo(-25)
    })
  })

  describe('zoomAt', () => {
    it('should change zoom level', () => {
      viewport.zoomAt(400, 300, 2)
      expect(viewport.zoom).toBeCloseTo(2)
    })

    it('should respect min/max zoom', () => {
      viewport.zoomAt(400, 300, 0.01, 0.5, 3)
      expect(viewport.zoom).toBe(0.5)

      viewport.zoom = 1
      viewport.zoomAt(400, 300, 10, 0.5, 3)
      expect(viewport.zoom).toBe(3)
    })
  })

  describe('fitToRect', () => {
    it('should center on rect', () => {
      viewport.fitToRect({ x: 100, y: 100, width: 200, height: 150 })
      expect(viewport.x).toBeCloseTo(200)
      expect(viewport.y).toBeCloseTo(175)
    })
  })

  describe('reset', () => {
    it('should reset to default values', () => {
      viewport.x = 100
      viewport.y = 50
      viewport.zoom = 2
      viewport.reset()
      expect(viewport.x).toBe(0)
      expect(viewport.y).toBe(0)
      expect(viewport.zoom).toBe(1)
    })
  })

  describe('getTransform', () => {
    it('should return valid CSS transform', () => {
      const transform = viewport.getTransform()
      expect(transform).toMatch(/translate\(.+px, .+px\) scale\(.+\)/)
    })
  })
})
