/**
 * Drawing Types
 *
 * Type definitions for freehand drawing on canvas.
 */

/**
 * 2D point
 */
export interface Point {
  x: number
  y: number
}

/**
 * Point with pressure data (for stylus/pressure-sensitive input)
 */
export interface PressurePoint extends Point {
  pressure: number
}

/**
 * A completed drawing path
 */
export interface DrawingPath {
  /** Unique identifier */
  id: string
  /** Raw captured points with pressure */
  points: PressurePoint[]
  /** Smoothed points for rendering (optional) */
  smoothed?: Point[]
  /** Stroke width in pixels */
  strokeWidth: number
  /** Stroke color (CSS color string) */
  strokeColor: string
  /** Opacity (0-1) */
  opacity: number
  /** When the path was created */
  timestamp: number
}

/**
 * Drawing tool configuration
 */
export interface DrawingTool {
  /** Tool type */
  type: 'pen' | 'highlighter' | 'eraser'
  /** Stroke width in pixels */
  strokeWidth: number
  /** Stroke color (CSS color string) */
  strokeColor: string
  /** Opacity (0-1) */
  opacity: number
}

/**
 * Default drawing tool settings
 */
export const DEFAULT_DRAWING_TOOL: DrawingTool = {
  type: 'pen',
  strokeWidth: 2,
  strokeColor: '#000000',
  opacity: 1
}

/**
 * Available stroke colors
 */
export const STROKE_COLORS = [
  '#000000', // Black
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#ec4899' // Pink
] as const

/**
 * Available stroke sizes
 */
export const STROKE_SIZES = [1, 2, 4, 8, 16] as const
