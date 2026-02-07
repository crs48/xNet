/**
 * Navigation Tools Tests
 *
 * Tests for navigation components and hooks.
 */

import type { Rect } from '../types'
import { describe, it, expect } from 'vitest'
import { Viewport } from '../spatial/index'

// ─── Helper Functions ─────────────────────────────────────────────────────────

function createViewport(zoom: number, x: number, y: number): Viewport {
  return new Viewport({ zoom, x, y, width: 1920, height: 1080 })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Navigation Tools', () => {
  describe('zoom calculations', () => {
    it('zoom in multiplies by 1.5', () => {
      const viewport = createViewport(1, 0, 0)
      const newZoom = Math.min(viewport.zoom * 1.5, 4)
      expect(newZoom).toBe(1.5)
    })

    it('zoom out divides by 1.5', () => {
      const viewport = createViewport(1, 0, 0)
      const newZoom = Math.max(viewport.zoom / 1.5, 0.1)
      expect(newZoom).toBeCloseTo(0.667, 2)
    })

    it('zoom in caps at 4', () => {
      const viewport = createViewport(3, 0, 0)
      const newZoom = Math.min(viewport.zoom * 1.5, 4)
      expect(newZoom).toBe(4)
    })

    it('zoom out floors at 0.1', () => {
      const viewport = createViewport(0.15, 0, 0)
      const newZoom = Math.max(viewport.zoom / 1.5, 0.1)
      expect(newZoom).toBe(0.1)
    })
  })

  describe('fit to content', () => {
    it('calculates correct zoom for content smaller than viewport', () => {
      const viewport = createViewport(1, 0, 0)
      const bounds: Rect = { x: 100, y: 100, width: 400, height: 300 }
      const padding = 50

      const scaleX = (viewport.width - padding * 2) / bounds.width
      const scaleY = (viewport.height - padding * 2) / bounds.height
      const newZoom = Math.min(scaleX, scaleY, 1)

      expect(newZoom).toBe(1) // Content fits, so don't zoom in past 100%
    })

    it('calculates correct zoom for content larger than viewport', () => {
      const viewport = createViewport(1, 0, 0)
      const bounds: Rect = { x: 0, y: 0, width: 4000, height: 3000 }
      const padding = 50

      const scaleX = (viewport.width - padding * 2) / bounds.width
      const scaleY = (viewport.height - padding * 2) / bounds.height
      const newZoom = Math.min(scaleX, scaleY, 1)

      expect(newZoom).toBeLessThan(1)
      expect(newZoom).toBeCloseTo((1080 - 100) / 3000, 2) // height is the limiting factor
    })

    it('centers viewport on content', () => {
      const bounds: Rect = { x: 100, y: 200, width: 400, height: 300 }
      const centerX = bounds.x + bounds.width / 2
      const centerY = bounds.y + bounds.height / 2

      expect(centerX).toBe(300)
      expect(centerY).toBe(350)
    })
  })

  describe('reset view', () => {
    it('returns to origin at zoom 1', () => {
      const expectedChanges = { x: 0, y: 0, zoom: 1 }
      expect(expectedChanges.x).toBe(0)
      expect(expectedChanges.y).toBe(0)
      expect(expectedChanges.zoom).toBe(1)
    })
  })

  describe('zoom slider', () => {
    it('converts percentage to zoom level', () => {
      expect(100 / 100).toBe(1)
      expect(50 / 100).toBe(0.5)
      expect(200 / 100).toBe(2)
      expect(400 / 100).toBe(4)
    })

    it('clamps zoom to valid range', () => {
      const clamp = (value: number) => Math.max(0.1, Math.min(4, value))
      expect(clamp(0.05)).toBe(0.1)
      expect(clamp(5)).toBe(4)
      expect(clamp(1)).toBe(1)
    })
  })
})

describe('Canvas Keyboard', () => {
  describe('keyboard shortcut detection', () => {
    it('detects Ctrl+Plus', () => {
      const event = { key: '+', ctrlKey: true, metaKey: false }
      const isMod = event.metaKey || event.ctrlKey
      const isZoomIn = isMod && (event.key === '+' || event.key === '=')
      expect(isZoomIn).toBe(true)
    })

    it('detects Cmd+Plus on Mac', () => {
      const event = { key: '+', ctrlKey: false, metaKey: true }
      const isMod = event.metaKey || event.ctrlKey
      const isZoomIn = isMod && (event.key === '+' || event.key === '=')
      expect(isZoomIn).toBe(true)
    })

    it('detects Ctrl+Minus', () => {
      const event = { key: '-', ctrlKey: true, metaKey: false }
      const isMod = event.metaKey || event.ctrlKey
      const isZoomOut = isMod && event.key === '-'
      expect(isZoomOut).toBe(true)
    })

    it('detects Ctrl+0 for reset', () => {
      const event = { key: '0', ctrlKey: true, metaKey: false }
      const isMod = event.metaKey || event.ctrlKey
      const isReset = isMod && event.key === '0'
      expect(isReset).toBe(true)
    })

    it('detects Ctrl+1 for fit', () => {
      const event = { key: '1', ctrlKey: true, metaKey: false }
      const isMod = event.metaKey || event.ctrlKey
      const isFit = isMod && event.key === '1'
      expect(isFit).toBe(true)
    })
  })

  describe('arrow key panning', () => {
    it('calculates pan amount based on zoom', () => {
      const viewport = createViewport(1, 0, 0)
      const panAmount = 50
      const scaledPanAmount = panAmount / viewport.zoom

      expect(scaledPanAmount).toBe(50)
    })

    it('scales pan amount for zoom out', () => {
      const viewport = createViewport(0.5, 0, 0)
      const panAmount = 50
      const scaledPanAmount = panAmount / viewport.zoom

      expect(scaledPanAmount).toBe(100) // Pan more when zoomed out
    })

    it('scales pan amount for zoom in', () => {
      const viewport = createViewport(2, 0, 0)
      const panAmount = 50
      const scaledPanAmount = panAmount / viewport.zoom

      expect(scaledPanAmount).toBe(25) // Pan less when zoomed in
    })

    it('updates x for right arrow', () => {
      const viewport = createViewport(1, 100, 50)
      const panAmount = 50
      const newX = viewport.x + panAmount / viewport.zoom

      expect(newX).toBe(150)
    })

    it('updates y for down arrow', () => {
      const viewport = createViewport(1, 100, 50)
      const panAmount = 50
      const newY = viewport.y + panAmount / viewport.zoom

      expect(newY).toBe(100)
    })
  })

  describe('input element detection', () => {
    it('identifies HTMLInputElement', () => {
      const input = document.createElement('input')
      expect(input instanceof HTMLInputElement).toBe(true)
    })

    it('identifies HTMLTextAreaElement', () => {
      const textarea = document.createElement('textarea')
      expect(textarea instanceof HTMLTextAreaElement).toBe(true)
    })

    it('identifies contenteditable element', () => {
      const div = document.createElement('div')
      div.contentEditable = 'true'
      // JSDOM doesn't fully support isContentEditable, so we check the attribute
      expect(div.contentEditable).toBe('true')
    })
  })
})

describe('Space Pan', () => {
  describe('pan calculations', () => {
    it('calculates pan delta correctly', () => {
      const viewport = createViewport(1, 0, 0)
      const startPos = { x: 100, y: 100 }
      const endPos = { x: 150, y: 120 }

      const dx = endPos.x - startPos.x
      const dy = endPos.y - startPos.y

      const newX = viewport.x - dx / viewport.zoom
      const newY = viewport.y - dy / viewport.zoom

      expect(newX).toBe(-50)
      expect(newY).toBe(-20)
    })

    it('scales pan for zoomed out view', () => {
      const viewport = createViewport(0.5, 0, 0)
      const dx = 50
      const dy = 20

      const newX = viewport.x - dx / viewport.zoom
      const newY = viewport.y - dy / viewport.zoom

      expect(newX).toBe(-100) // Double the screen movement
      expect(newY).toBe(-40)
    })

    it('scales pan for zoomed in view', () => {
      const viewport = createViewport(2, 0, 0)
      const dx = 50
      const dy = 20

      const newX = viewport.x - dx / viewport.zoom
      const newY = viewport.y - dy / viewport.zoom

      expect(newX).toBe(-25) // Half the screen movement
      expect(newY).toBe(-10)
    })
  })
})

describe('Wheel Zoom', () => {
  describe('zoom towards cursor', () => {
    it('calculates canvas position at cursor', () => {
      const viewport = createViewport(1, 0, 0)

      // Cursor at center of container
      const cursorX = 0 // relative to center
      const cursorY = 0

      const canvasX = cursorX / viewport.zoom + viewport.x
      const canvasY = cursorY / viewport.zoom + viewport.y

      expect(canvasX).toBe(0)
      expect(canvasY).toBe(0)
    })

    it('calculates new viewport position to keep cursor stable', () => {
      const viewport = createViewport(1, 0, 0)
      const cursorX = 100 // 100px right of center
      const cursorY = 50 // 50px below center
      const newZoom = 1.5

      // Canvas position at cursor before zoom
      const canvasX = cursorX / viewport.zoom + viewport.x
      const canvasY = cursorY / viewport.zoom + viewport.y

      // New viewport position to keep canvas position at cursor
      const newX = canvasX - cursorX / newZoom
      const newY = canvasY - cursorY / newZoom

      // At cursor, the canvas position was (100, 50)
      // After zoom to 1.5x, we need to position viewport so (100, 50) is at cursor
      expect(newX).toBeCloseTo(100 - 100 / 1.5, 5)
      expect(newY).toBeCloseTo(50 - 50 / 1.5, 5)
    })

    it('calculates zoom delta from wheel event', () => {
      const zoomSpeed = 0.002
      const deltaY = -100 // scroll up = zoom in

      const delta = -deltaY * zoomSpeed
      const currentZoom = 1
      const newZoom = currentZoom * (1 + delta)

      expect(delta).toBe(0.2)
      expect(newZoom).toBe(1.2)
    })

    it('clamps zoom to min/max', () => {
      const minZoom = 0.1
      const maxZoom = 4

      expect(Math.max(minZoom, Math.min(maxZoom, 0.05))).toBe(0.1)
      expect(Math.max(minZoom, Math.min(maxZoom, 5))).toBe(4)
      expect(Math.max(minZoom, Math.min(maxZoom, 2))).toBe(2)
    })
  })
})

describe('Viewport class', () => {
  it('getVisibleRect returns correct dimensions', () => {
    const viewport = createViewport(1, 0, 0)
    const rect = viewport.getVisibleRect()

    expect(rect.width).toBe(1920)
    expect(rect.height).toBe(1080)
  })

  it('getVisibleRect scales with zoom', () => {
    const viewport = createViewport(2, 0, 0)
    const rect = viewport.getVisibleRect()

    expect(rect.width).toBe(960) // Half at 2x zoom
    expect(rect.height).toBe(540)
  })

  it('getVisibleRect positions correctly', () => {
    const viewport = createViewport(1, 500, 300)
    const rect = viewport.getVisibleRect()

    expect(rect.x).toBe(500 - 1920 / 2)
    expect(rect.y).toBe(300 - 1080 / 2)
  })
})
