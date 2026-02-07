/**
 * @xnet/canvas - CSS Grid Fallback
 *
 * Pure CSS grid fallback for browsers without WebGL support.
 * Less performant than WebGL but provides acceptable visuals.
 */

import type { GridLayer, ViewportState, WebGLGridConfig } from './webgl-grid'

// ─── CSS Grid Fallback ──────────────────────────────────────────────────────

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
    const { gridSpacing, majorEvery, gridColor, type } = this.config

    if (type === 'dots') {
      // Dot grid using radial gradients
      const minorColor = `rgba(${Math.round(gridColor[0] * 255)}, ${Math.round(gridColor[1] * 255)}, ${Math.round(gridColor[2] * 255)}, ${gridColor[3]})`
      const majorSpacing = gridSpacing * majorEvery

      this.element.style.backgroundImage = `
        radial-gradient(circle, ${minorColor} 1px, transparent 1px),
        radial-gradient(circle, ${minorColor} 2px, transparent 2px)
      `
      this.element.style.backgroundSize = `
        ${gridSpacing}px ${gridSpacing}px,
        ${majorSpacing}px ${majorSpacing}px
      `
    } else {
      // Line grid using linear gradients
      const minorColor = `rgba(${Math.round(gridColor[0] * 255)}, ${Math.round(gridColor[1] * 255)}, ${Math.round(gridColor[2] * 255)}, ${gridColor[3] * 0.5})`
      const majorColor = `rgba(${Math.round(gridColor[0] * 255)}, ${Math.round(gridColor[1] * 255)}, ${Math.round(gridColor[2] * 255)}, ${gridColor[3]})`
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

  render(viewport: ViewportState): void {
    const { gridSpacing, majorEvery, type } = this.config
    const majorSpacing = gridSpacing * majorEvery

    // Calculate offset based on viewport pan
    const offsetX = -viewport.x * viewport.zoom
    const offsetY = -viewport.y * viewport.zoom

    // Scale grid with zoom
    const scaledMinor = gridSpacing * viewport.zoom
    const scaledMajor = majorSpacing * viewport.zoom

    // Hide minor grid at low zoom to reduce visual noise
    const showMinor = viewport.zoom >= 0.5
    const pos = `${offsetX}px ${offsetY}px`

    if (type === 'dots') {
      if (showMinor) {
        this.element.style.backgroundSize = `${scaledMinor}px ${scaledMinor}px, ${scaledMajor}px ${scaledMajor}px`
        this.element.style.backgroundPosition = `${pos}, ${pos}`
      } else {
        // Only show major dots
        this.element.style.backgroundSize = `0px 0px, ${scaledMajor}px ${scaledMajor}px`
        this.element.style.backgroundPosition = `0px 0px, ${pos}`
      }
    } else {
      if (showMinor) {
        this.element.style.backgroundSize = `${scaledMinor}px ${scaledMinor}px, ${scaledMinor}px ${scaledMinor}px, ${scaledMajor}px ${scaledMajor}px, ${scaledMajor}px ${scaledMajor}px`
        this.element.style.backgroundPosition = `${pos}, ${pos}, ${pos}, ${pos}`
      } else {
        // Only show major lines
        this.element.style.backgroundSize = `0px 0px, 0px 0px, ${scaledMajor}px ${scaledMajor}px, ${scaledMajor}px ${scaledMajor}px`
        this.element.style.backgroundPosition = `0px 0px, 0px 0px, ${pos}, ${pos}`
      }
    }
  }

  destroy(): void {
    this.element.remove()
  }
}
