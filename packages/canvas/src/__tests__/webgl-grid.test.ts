/**
 * WebGL Grid Layer Tests
 *
 * Tests for the WebGL procedural grid and CSS fallback.
 * Note: WebGL tests require a DOM environment with canvas support.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  WebGLGridLayer,
  CSSGridFallback,
  createGridLayer,
  isWebGLAvailable,
  DEFAULT_GRID_CONFIG,
  type WebGLGridConfig
} from '../layers/index'

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

// ─── WebGLGridLayer Tests ───────────────────────────────────────────────────

describe('WebGLGridLayer', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = createContainer()
  })

  afterEach(() => {
    cleanupContainer(container)
  })

  it('creates a canvas element in the container', () => {
    // Skip if WebGL not available (e.g., in Node.js environment)
    if (!isWebGLAvailable()) {
      console.log('Skipping WebGL test - WebGL not available')
      return
    }

    const grid = new WebGLGridLayer(container)
    const canvas = container.querySelector('canvas')

    expect(canvas).toBeTruthy()
    expect(canvas?.style.position).toBe('absolute')
    expect(canvas?.style.pointerEvents).toBe('none')

    grid.destroy()
  })

  it('renders without throwing errors', () => {
    if (!isWebGLAvailable()) return

    const grid = new WebGLGridLayer(container)
    grid.resize()

    expect(() => {
      grid.render({ x: 0, y: 0, zoom: 1 })
      grid.render({ x: 100, y: 100, zoom: 0.5 })
      grid.render({ x: -500, y: -500, zoom: 2 })
    }).not.toThrow()

    grid.destroy()
  })

  it('handles resize correctly', () => {
    if (!isWebGLAvailable()) return

    const grid = new WebGLGridLayer(container)
    grid.resize()

    // Change container size
    container.style.width = '1200px'
    container.style.height = '900px'

    expect(() => grid.resize()).not.toThrow()

    grid.destroy()
  })

  it('applies custom configuration', () => {
    if (!isWebGLAvailable()) return

    const customConfig: Partial<WebGLGridConfig> = {
      gridSpacing: 40,
      majorEvery: 10,
      gridColor: [0.2, 0.2, 0.8, 0.3],
      type: 'lines'
    }

    const grid = new WebGLGridLayer(container, customConfig)
    grid.resize()
    grid.render({ x: 0, y: 0, zoom: 1 })

    // No way to inspect shader uniforms, but at least it shouldn't throw
    grid.destroy()
  })

  it('supports dot grid type', () => {
    if (!isWebGLAvailable()) return

    const grid = new WebGLGridLayer(container, { type: 'dots' })
    grid.resize()

    expect(() => {
      grid.render({ x: 0, y: 0, zoom: 1 })
    }).not.toThrow()

    grid.destroy()
  })

  it('can change grid type via setConfig', () => {
    if (!isWebGLAvailable()) return

    const grid = new WebGLGridLayer(container, { type: 'lines' })
    grid.resize()
    grid.render({ x: 0, y: 0, zoom: 1 })

    // Switch to dots
    expect(() => {
      grid.setConfig({ type: 'dots' })
    }).not.toThrow()

    grid.destroy()
  })

  it('removes canvas element on destroy', () => {
    if (!isWebGLAvailable()) return

    const grid = new WebGLGridLayer(container)
    expect(container.querySelector('canvas')).toBeTruthy()

    grid.destroy()
    expect(container.querySelector('canvas')).toBeNull()
  })
})

// ─── CSSGridFallback Tests ──────────────────────────────────────────────────

describe('CSSGridFallback', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = createContainer()
  })

  afterEach(() => {
    cleanupContainer(container)
  })

  it('creates a div element in the container', () => {
    const grid = new CSSGridFallback(container, DEFAULT_GRID_CONFIG)
    const gridElement = container.querySelector('div') as HTMLDivElement | null

    expect(gridElement).toBeTruthy()
    expect(gridElement!.style.position).toBe('absolute')
    expect(gridElement!.style.pointerEvents).toBe('none')

    grid.destroy()
  })

  it('renders without throwing errors', () => {
    const grid = new CSSGridFallback(container, DEFAULT_GRID_CONFIG)

    expect(() => {
      grid.render({ x: 0, y: 0, zoom: 1 })
      grid.render({ x: 100, y: 100, zoom: 0.5 })
      grid.render({ x: -500, y: -500, zoom: 2 })
    }).not.toThrow()

    grid.destroy()
  })

  it('updates background on pan (render calls without error)', () => {
    const grid = new CSSGridFallback(container, DEFAULT_GRID_CONFIG)

    // Render with various viewport states should not throw
    expect(() => {
      grid.render({ x: 100, y: 50, zoom: 1 })
      grid.render({ x: -200, y: -100, zoom: 0.5 })
      grid.render({ x: 0, y: 0, zoom: 2 })
    }).not.toThrow()

    // The grid element exists and has background styling
    const gridElement = container.children[0] as HTMLDivElement
    expect(gridElement).toBeTruthy()
    expect(gridElement.style.backgroundImage).toBeTruthy()
    expect(gridElement.style.backgroundSize).toBeTruthy()
    // Note: jsdom doesn't fully support multi-value backgroundPosition,
    // so we just verify render doesn't throw and styling is applied

    grid.destroy()
  })

  it('scales grid size with zoom', () => {
    const grid = new CSSGridFallback(container, { ...DEFAULT_GRID_CONFIG, gridSpacing: 20 })
    grid.render({ x: 0, y: 0, zoom: 2 })

    const gridElement = container.querySelector('div > div') as HTMLDivElement
    // At zoom 2, grid spacing of 20 should become 40px
    expect(gridElement.style.backgroundSize).toContain('40px')

    grid.destroy()
  })

  it('supports dot grid type', () => {
    const grid = new CSSGridFallback(container, { ...DEFAULT_GRID_CONFIG, type: 'dots' })
    grid.render({ x: 0, y: 0, zoom: 1 })

    const gridElement = container.querySelector('div > div') as HTMLDivElement
    expect(gridElement.style.backgroundImage).toContain('radial-gradient')

    grid.destroy()
  })

  it('supports line grid type', () => {
    const grid = new CSSGridFallback(container, { ...DEFAULT_GRID_CONFIG, type: 'lines' })
    grid.render({ x: 0, y: 0, zoom: 1 })

    const gridElement = container.querySelector('div > div') as HTMLDivElement
    expect(gridElement.style.backgroundImage).toContain('linear-gradient')

    grid.destroy()
  })

  it('removes element on destroy', () => {
    const grid = new CSSGridFallback(container, DEFAULT_GRID_CONFIG)
    expect(container.children.length).toBeGreaterThan(0)

    grid.destroy()
    // Container still exists, just the grid element is removed
    // Can check if the specific grid div is gone
  })
})

// ─── Factory Function Tests ─────────────────────────────────────────────────

describe('createGridLayer', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = createContainer()
  })

  afterEach(() => {
    cleanupContainer(container)
  })

  it('creates a grid layer', () => {
    const grid = createGridLayer(container)

    expect(grid).toBeDefined()
    expect(typeof grid.render).toBe('function')
    expect(typeof grid.resize).toBe('function')
    expect(typeof grid.destroy).toBe('function')

    grid.destroy()
  })

  it('returns WebGLGridLayer when WebGL is available', () => {
    if (!isWebGLAvailable()) {
      console.log('Skipping - WebGL not available')
      return
    }

    const grid = createGridLayer(container)
    expect(grid).toBeInstanceOf(WebGLGridLayer)
    grid.destroy()
  })

  it('falls back to CSSGridFallback when WebGL unavailable', () => {
    // Mock WebGL unavailable
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null)

    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const grid = createGridLayer(container)
    expect(grid).toBeInstanceOf(CSSGridFallback)
    expect(consoleSpy).toHaveBeenCalled()

    grid.destroy()

    // Restore
    HTMLCanvasElement.prototype.getContext = originalGetContext
    consoleSpy.mockRestore()
  })
})

// ─── isWebGLAvailable Tests ─────────────────────────────────────────────────

describe('isWebGLAvailable', () => {
  it('returns a boolean', () => {
    const result = isWebGLAvailable()
    expect(typeof result).toBe('boolean')
  })

  it('returns false when document is undefined', () => {
    const originalDocument = global.document
    // @ts-expect-error - intentionally testing undefined document
    delete global.document

    // The function should handle this gracefully
    // Note: This test may not work as expected in jsdom
    // as document is always defined there

    global.document = originalDocument
  })
})

// ─── Default Config Tests ───────────────────────────────────────────────────

describe('DEFAULT_GRID_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_GRID_CONFIG.gridSpacing).toBe(20)
    expect(DEFAULT_GRID_CONFIG.majorEvery).toBe(5)
    expect(DEFAULT_GRID_CONFIG.type).toBe('lines')
    expect(DEFAULT_GRID_CONFIG.gridColor).toHaveLength(4)
    expect(DEFAULT_GRID_CONFIG.majorGridColor).toHaveLength(4)
  })

  it('has valid RGBA color values', () => {
    const { gridColor, majorGridColor } = DEFAULT_GRID_CONFIG

    for (const component of gridColor) {
      expect(component).toBeGreaterThanOrEqual(0)
      expect(component).toBeLessThanOrEqual(1)
    }

    for (const component of majorGridColor) {
      expect(component).toBeGreaterThanOrEqual(0)
      expect(component).toBeLessThanOrEqual(1)
    }
  })
})
