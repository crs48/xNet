/**
 * @xnetjs/canvas - Rendering Layers
 *
 * Canvas rendering is composed of multiple layers:
 * 1. Grid layer (WebGL or CSS fallback) - background grid
 * 2. Edge layer (Canvas 2D) - connections between nodes
 * 3. Node layer (DOM) - interactive node elements
 * 4. Overlay layer (DOM) - selection, presence, tools
 */

export {
  WebGLGridLayer,
  DEFAULT_GRID_CONFIG,
  type GridLayer,
  type GridType,
  type ViewportState,
  type WebGLGridConfig
} from './webgl-grid'

export { CSSGridFallback } from './css-grid-fallback'

export { EdgeRenderer, createEdgeRenderer, type EdgeRendererViewport } from './edge-renderer'

// ─── Grid Layer Factory ─────────────────────────────────────────────────────

import { CSSGridFallback } from './css-grid-fallback'
import {
  WebGLGridLayer,
  DEFAULT_GRID_CONFIG,
  type GridLayer,
  type WebGLGridConfig
} from './webgl-grid'

/**
 * Creates a grid layer with automatic WebGL-to-CSS fallback.
 *
 * Attempts to create a WebGL grid layer for best performance.
 * Falls back to CSS gradients if WebGL is unavailable.
 *
 * @example
 * const gridLayer = createGridLayer(containerElement, { type: 'dots' })
 * gridLayer.render({ x: 0, y: 0, zoom: 1 })
 */
export function createGridLayer(
  container: HTMLElement,
  config: Partial<WebGLGridConfig> = {}
): GridLayer {
  const fullConfig = { ...DEFAULT_GRID_CONFIG, ...config }

  try {
    return new WebGLGridLayer(container, fullConfig)
  } catch (error) {
    if (typeof console !== 'undefined') {
      console.warn(
        'WebGL not available for grid rendering, falling back to CSS grid:',
        error instanceof Error ? error.message : String(error)
      )
    }
    return new CSSGridFallback(container, fullConfig)
  }
}

/**
 * Checks if WebGL is available in the current environment.
 */
export function isWebGLAvailable(): boolean {
  if (typeof document === 'undefined') {
    return false
  }

  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    return gl !== null
  } catch {
    return false
  }
}
