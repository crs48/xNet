/**
 * @xnetjs/canvas - CSS Grid Fallback
 *
 * Pure CSS grid fallback for browsers without WebGL support.
 * Less performant than WebGL but provides acceptable visuals.
 */

import type { GridLayer, ViewportState, WebGLGridConfig } from './webgl-grid'

// ─── CSS Grid Fallback ──────────────────────────────────────────────────────

export function getViewportOriginOffset(
  viewport: ViewportState,
  size: { width: number; height: number }
): { x: number; y: number } {
  return {
    x: size.width * 0.5 - viewport.x * viewport.zoom,
    y: size.height * 0.5 - viewport.y * viewport.zoom
  }
}

export function normalizeGridOffset(value: number, spacing: number): number {
  if (!Number.isFinite(spacing) || spacing <= 0) {
    return 0
  }

  const normalized = ((value % spacing) + spacing) % spacing
  return Math.round(normalized * 1000) / 1000
}

export class CSSGridFallback implements GridLayer {
  private element: HTMLDivElement
  private config: WebGLGridConfig

  constructor(container: HTMLElement, config: WebGLGridConfig) {
    this.config = config
    this.element = document.createElement('div')
    this.element.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    `
    this.applyGridStyle()
    container.appendChild(this.element)
  }

  private applyGridStyle(): void {
    const { gridSpacing, majorEvery, gridColor, majorGridColor, type } = this.config

    if (type === 'dots') {
      // Dot grid using radial gradients
      const minorColor = `rgba(${Math.round(gridColor[0] * 255)}, ${Math.round(gridColor[1] * 255)}, ${Math.round(gridColor[2] * 255)}, ${gridColor[3]})`
      const majorColor = `rgba(${Math.round(majorGridColor[0] * 255)}, ${Math.round(majorGridColor[1] * 255)}, ${Math.round(majorGridColor[2] * 255)}, ${majorGridColor[3]})`
      const majorSpacing = gridSpacing * majorEvery

      this.element.style.backgroundImage = `
        radial-gradient(circle, ${minorColor} 1px, transparent 1px),
        radial-gradient(circle, ${majorColor} 2px, transparent 2px)
      `
      this.element.style.backgroundSize = `
        ${gridSpacing}px ${gridSpacing}px,
        ${majorSpacing}px ${majorSpacing}px
      `
    } else {
      // Line grid using linear gradients
      const minorColor = `rgba(${Math.round(gridColor[0] * 255)}, ${Math.round(gridColor[1] * 255)}, ${Math.round(gridColor[2] * 255)}, ${gridColor[3] * 0.5})`
      const majorColor = `rgba(${Math.round(majorGridColor[0] * 255)}, ${Math.round(majorGridColor[1] * 255)}, ${Math.round(majorGridColor[2] * 255)}, ${majorGridColor[3]})`
      const majorSpacing = gridSpacing * majorEvery

      this.element.style.backgroundImage = `
        linear-gradient(${minorColor} 1px, transparent 1px),
        linear-gradient(90deg, ${minorColor} 1px, transparent 1px),
        linear-gradient(${majorColor} 1px, transparent 1px),
        linear-gradient(90deg, ${majorColor} 1px, transparent 1px)
      `
      this.element.style.backgroundSize = `
        ${gridSpacing}px ${gridSpacing}px,
        ${gridSpacing}px ${gridSpacing}px,
        ${majorSpacing}px ${majorSpacing}px,
        ${majorSpacing}px ${majorSpacing}px
      `
    }
  }

  setConfig(config: Partial<WebGLGridConfig>): void {
    this.config = { ...this.config, ...config }
    this.applyGridStyle()
  }

  resize(): void {
    // CSS handles resizing automatically
  }

  private getViewportOriginOffset(viewport: ViewportState): { x: number; y: number } {
    const rect = this.element.getBoundingClientRect()

    return getViewportOriginOffset(viewport, {
      width: rect.width,
      height: rect.height
    })
  }

  private normalizeOffset(value: number, spacing: number): number {
    return normalizeGridOffset(value, spacing)
  }

  render(viewport: ViewportState): void {
    const { gridSpacing, majorEvery, type } = this.config
    const majorSpacing = gridSpacing * majorEvery

    // Scale grid with zoom
    const scaledMinor = gridSpacing * viewport.zoom
    const scaledMajor = majorSpacing * viewport.zoom
    const originOffset = this.getViewportOriginOffset(viewport)
    const minorPosition = `${this.normalizeOffset(originOffset.x, scaledMinor)}px ${this.normalizeOffset(originOffset.y, scaledMinor)}px`
    const majorPosition = `${this.normalizeOffset(originOffset.x, scaledMajor)}px ${this.normalizeOffset(originOffset.y, scaledMajor)}px`

    // Hide minor grid at low zoom to reduce visual noise
    const showMinor = viewport.zoom >= 0.5

    if (type === 'dots') {
      if (showMinor) {
        this.element.style.backgroundSize = `${scaledMinor}px ${scaledMinor}px, ${scaledMajor}px ${scaledMajor}px`
        this.element.style.backgroundPosition = `${minorPosition}, ${majorPosition}`
      } else {
        // Only show major dots
        this.element.style.backgroundSize = `0px 0px, ${scaledMajor}px ${scaledMajor}px`
        this.element.style.backgroundPosition = `0px 0px, ${majorPosition}`
      }
    } else {
      if (showMinor) {
        this.element.style.backgroundSize = `${scaledMinor}px ${scaledMinor}px, ${scaledMinor}px ${scaledMinor}px, ${scaledMajor}px ${scaledMajor}px, ${scaledMajor}px ${scaledMajor}px`
        this.element.style.backgroundPosition = `${minorPosition}, ${minorPosition}, ${majorPosition}, ${majorPosition}`
      } else {
        // Only show major lines
        this.element.style.backgroundSize = `0px 0px, 0px 0px, ${scaledMajor}px ${scaledMajor}px, ${scaledMajor}px ${scaledMajor}px`
        this.element.style.backgroundPosition = `0px 0px, 0px 0px, ${majorPosition}, ${majorPosition}`
      }
    }
  }

  destroy(): void {
    this.element.remove()
  }
}
