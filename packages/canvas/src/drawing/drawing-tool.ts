/**
 * Drawing Tool Controller
 *
 * Handles freehand drawing with pressure sensitivity and Catmull-Rom smoothing.
 */

import type { Point, PressurePoint, DrawingPath, DrawingTool } from './types'
import { DEFAULT_DRAWING_TOOL } from './types'

// ─── ID Generator ─────────────────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).substring(2, 12)
}

// ─── Drawing Tool Controller ──────────────────────────────────────────────────

export class DrawingToolController {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private isDrawing = false
  private currentPath: DrawingPath | null = null
  private tool: DrawingTool = DEFAULT_DRAWING_TOOL
  private onPathComplete: (path: DrawingPath) => void

  constructor(canvas: HTMLCanvasElement, onPathComplete: (path: DrawingPath) => void) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to get 2D context from canvas')
    }
    this.ctx = ctx
    this.onPathComplete = onPathComplete
  }

  /**
   * Set the current drawing tool configuration
   */
  setTool(tool: Partial<DrawingTool>): void {
    this.tool = { ...this.tool, ...tool }
  }

  /**
   * Get the current tool configuration
   */
  getTool(): DrawingTool {
    return { ...this.tool }
  }

  /**
   * Check if currently drawing
   */
  getIsDrawing(): boolean {
    return this.isDrawing
  }

  /**
   * Handle pointer down - start drawing
   */
  onPointerDown(e: PointerEvent, canvasPoint: Point): void {
    if (e.button !== 0) return // Left button only

    this.isDrawing = true
    this.canvas.setPointerCapture(e.pointerId)

    const pressure = e.pressure || 0.5

    this.currentPath = {
      id: generateId(),
      points: [{ ...canvasPoint, pressure }],
      strokeWidth: this.tool.strokeWidth,
      strokeColor: this.tool.strokeColor,
      opacity: this.tool.opacity,
      timestamp: Date.now()
    }

    // Start drawing
    this.ctx.beginPath()
    this.ctx.strokeStyle = this.tool.strokeColor
    this.ctx.lineWidth = this.tool.strokeWidth * pressure
    this.ctx.lineCap = 'round'
    this.ctx.lineJoin = 'round'
    this.ctx.globalAlpha = this.tool.opacity
    this.ctx.moveTo(canvasPoint.x, canvasPoint.y)
  }

  /**
   * Handle pointer move - continue drawing
   */
  onPointerMove(e: PointerEvent, canvasPoint: Point): void {
    if (!this.isDrawing || !this.currentPath) return

    const pressure = e.pressure || 0.5

    // Add point
    this.currentPath.points.push({ ...canvasPoint, pressure })

    // Draw segment
    const lastPoint = this.currentPath.points[this.currentPath.points.length - 2]
    this.drawSegment(lastPoint, { ...canvasPoint, pressure })
  }

  /**
   * Handle pointer up - complete drawing
   */
  onPointerUp(e: PointerEvent): DrawingPath | null {
    if (!this.isDrawing || !this.currentPath) return null

    this.isDrawing = false
    this.canvas.releasePointerCapture(e.pointerId)

    // Smooth the path
    this.currentPath.smoothed = this.smoothPath(this.currentPath.points)

    const completedPath = this.currentPath
    this.currentPath = null

    // Notify completion
    this.onPathComplete(completedPath)

    return completedPath
  }

  /**
   * Cancel current drawing
   */
  cancel(): void {
    this.isDrawing = false
    this.currentPath = null
  }

  /**
   * Draw a segment between two points with variable width
   */
  private drawSegment(from: PressurePoint, to: PressurePoint): void {
    const ctx = this.ctx

    // Variable width based on pressure
    const avgPressure = (from.pressure + to.pressure) / 2
    ctx.lineWidth = this.tool.strokeWidth * avgPressure * 2

    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(to.x, to.y)
  }

  /**
   * Smooth path using Catmull-Rom spline interpolation.
   */
  private smoothPath(points: PressurePoint[]): Point[] {
    if (points.length < 3) return points

    const smoothed: Point[] = []
    const tension = 0.5

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)]
      const p1 = points[i]
      const p2 = points[Math.min(points.length - 1, i + 1)]
      const p3 = points[Math.min(points.length - 1, i + 2)]

      // Add interpolated points
      for (let t = 0; t < 1; t += 0.25) {
        smoothed.push(this.catmullRom(p0, p1, p2, p3, t, tension))
      }
    }

    // Add final point
    smoothed.push(points[points.length - 1])

    return smoothed
  }

  /**
   * Catmull-Rom spline interpolation
   */
  private catmullRom(
    p0: Point,
    p1: Point,
    p2: Point,
    p3: Point,
    t: number,
    tension: number
  ): Point {
    const t2 = t * t
    const t3 = t2 * t

    const s = (1 - tension) / 2

    const b1 = s * (-t3 + 2 * t2 - t)
    const b2 = s * (-t3 + t2) + (2 * t3 - 3 * t2 + 1)
    const b3 = s * (t3 - 2 * t2 + t) + (-2 * t3 + 3 * t2)
    const b4 = s * (t3 - t2)

    return {
      x: p0.x * b1 + p1.x * b2 + p2.x * b3 + p3.x * b4,
      y: p0.y * b1 + p1.y * b2 + p2.y * b3 + p3.y * b4
    }
  }
}

// ─── Path Rendering ───────────────────────────────────────────────────────────

/**
 * Draw a completed path to a canvas context
 */
export function drawPath(ctx: CanvasRenderingContext2D, path: DrawingPath): void {
  const points = path.smoothed ?? path.points

  if (points.length < 2) return

  ctx.save()
  ctx.strokeStyle = path.strokeColor
  ctx.lineWidth = path.strokeWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalAlpha = path.opacity

  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)

  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y)
  }

  ctx.stroke()
  ctx.restore()
}

/**
 * Draw multiple paths to a canvas context
 */
export function drawPaths(ctx: CanvasRenderingContext2D, paths: DrawingPath[]): void {
  for (const path of paths) {
    drawPath(ctx, path)
  }
}
