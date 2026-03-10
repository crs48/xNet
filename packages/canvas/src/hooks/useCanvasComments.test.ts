/**
 * Tests for useCanvasComments hook utilities.
 */
import { encodeAnchor, type CanvasPositionAnchor, type CanvasObjectAnchor } from '@xnetjs/data'
import { describe, it, expect } from 'vitest'
import {
  viewportToCanvas,
  canvasToViewport,
  findObjectAtPoint,
  isCanvasAnchorOrphaned,
  type CanvasTransform,
  type CanvasObject
} from './useCanvasComments'

describe('useCanvasComments utilities', () => {
  describe('viewportToCanvas', () => {
    it('converts viewport coords to canvas coords with no transform', () => {
      const transform: CanvasTransform = { panX: 0, panY: 0, zoom: 1 }
      const result = viewportToCanvas(100, 200, transform)
      expect(result).toEqual({ x: 100, y: 200 })
    })

    it('applies pan offset', () => {
      const transform: CanvasTransform = { panX: 50, panY: 100, zoom: 1 }
      const result = viewportToCanvas(100, 200, transform)
      expect(result).toEqual({ x: 150, y: 300 })
    })

    it('applies zoom factor', () => {
      const transform: CanvasTransform = { panX: 0, panY: 0, zoom: 2 }
      const result = viewportToCanvas(100, 200, transform)
      expect(result).toEqual({ x: 50, y: 100 })
    })

    it('combines pan and zoom', () => {
      const transform: CanvasTransform = { panX: 50, panY: 50, zoom: 2 }
      const result = viewportToCanvas(200, 200, transform)
      // viewport / zoom + pan = 200/2 + 50 = 150
      expect(result).toEqual({ x: 150, y: 150 })
    })
  })

  describe('canvasToViewport', () => {
    it('converts canvas coords to viewport coords with no transform', () => {
      const transform: CanvasTransform = { panX: 0, panY: 0, zoom: 1 }
      const result = canvasToViewport(100, 200, transform)
      expect(result).toEqual({ x: 100, y: 200 })
    })

    it('applies pan offset', () => {
      const transform: CanvasTransform = { panX: 50, panY: 100, zoom: 1 }
      const result = canvasToViewport(150, 300, transform)
      // (canvas - pan) * zoom = (150 - 50) * 1 = 100
      expect(result).toEqual({ x: 100, y: 200 })
    })

    it('applies zoom factor', () => {
      const transform: CanvasTransform = { panX: 0, panY: 0, zoom: 2 }
      const result = canvasToViewport(50, 100, transform)
      expect(result).toEqual({ x: 100, y: 200 })
    })

    it('is inverse of viewportToCanvas', () => {
      const transform: CanvasTransform = { panX: 50, panY: 75, zoom: 1.5 }
      const viewportX = 300
      const viewportY = 450

      const canvas = viewportToCanvas(viewportX, viewportY, transform)
      const viewport = canvasToViewport(canvas.x, canvas.y, transform)

      expect(viewport.x).toBeCloseTo(viewportX)
      expect(viewport.y).toBeCloseTo(viewportY)
    })
  })

  describe('findObjectAtPoint', () => {
    const objects = new Map<string, CanvasObject>([
      ['obj-1', { id: 'obj-1', x: 0, y: 0, width: 100, height: 100 }],
      ['obj-2', { id: 'obj-2', x: 50, y: 50, width: 100, height: 100 }],
      ['obj-3', { id: 'obj-3', x: 200, y: 200, width: 50, height: 50 }]
    ])

    it('returns null when point is outside all objects', () => {
      const result = findObjectAtPoint(500, 500, objects)
      expect(result).toBeNull()
    })

    it('finds object when point is inside', () => {
      const result = findObjectAtPoint(10, 10, objects)
      expect(result?.id).toBe('obj-1')
    })

    it('returns topmost object when objects overlap', () => {
      // Point (75, 75) is inside both obj-1 and obj-2
      // obj-2 was added later, so it should be on top
      const result = findObjectAtPoint(75, 75, objects)
      expect(result?.id).toBe('obj-2')
    })

    it('includes boundary points', () => {
      // Test exact boundary
      const result = findObjectAtPoint(100, 100, objects)
      expect(result).not.toBeNull()
    })

    it('returns empty map case', () => {
      const empty = new Map<string, CanvasObject>()
      const result = findObjectAtPoint(50, 50, empty)
      expect(result).toBeNull()
    })
  })

  describe('isCanvasAnchorOrphaned', () => {
    const existingObjectIds = new Set(['obj-1', 'obj-2', 'obj-3'])

    describe('position anchors', () => {
      it('returns false for position anchors (never orphaned)', () => {
        const anchor: CanvasPositionAnchor = { x: 100, y: 200 }
        expect(
          isCanvasAnchorOrphaned('canvas-position', encodeAnchor(anchor), existingObjectIds)
        ).toBe(false)
      })

      it('returns false even with empty object set', () => {
        const anchor: CanvasPositionAnchor = { x: 100, y: 200 }
        expect(isCanvasAnchorOrphaned('canvas-position', encodeAnchor(anchor), new Set())).toBe(
          false
        )
      })
    })

    describe('object anchors', () => {
      it('returns false when object exists', () => {
        const anchor: CanvasObjectAnchor = {
          objectId: 'obj-1',
          anchorId: 'obj-1#placement:right',
          placement: 'right'
        }
        expect(
          isCanvasAnchorOrphaned('canvas-object', encodeAnchor(anchor), existingObjectIds)
        ).toBe(false)
      })

      it('returns true when object does not exist', () => {
        const anchor: CanvasObjectAnchor = { objectId: 'deleted-obj' }
        expect(
          isCanvasAnchorOrphaned('canvas-object', encodeAnchor(anchor), existingObjectIds)
        ).toBe(true)
      })

      it('returns true for invalid JSON', () => {
        expect(isCanvasAnchorOrphaned('canvas-object', 'not-valid-json', existingObjectIds)).toBe(
          true
        )
      })

      it('returns true for empty string', () => {
        expect(isCanvasAnchorOrphaned('canvas-object', '', existingObjectIds)).toBe(true)
      })
    })
  })
})
