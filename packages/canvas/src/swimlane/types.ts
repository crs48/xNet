/**
 * Swimlane Types
 *
 * Type definitions for swimlane container nodes.
 */

import type { CanvasNodePosition } from '../types'

// ─── Swimlane Node ─────────────────────────────────────────────────────────────

/**
 * Swimlane orientation
 */
export type SwimlaneOrientation = 'horizontal' | 'vertical'

/**
 * Swimlane node properties
 */
export interface SwimlaneProperties {
  /** Display title */
  title: string
  /** Lane orientation */
  orientation: SwimlaneOrientation
  /** Header background color */
  color: string
  /** Header size (height for horizontal, width for vertical) */
  headerSize: number
  /** IDs of nodes contained in this lane */
  childNodeIds: string[]
  /** Whether the lane is collapsed */
  collapsed?: boolean
}

/**
 * Swimlane node type
 */
export interface SwimlaneNode {
  id: string
  type: 'swimlane'
  position: CanvasNodePosition
  properties: SwimlaneProperties
}

/**
 * Generic canvas node for type compatibility
 */
export interface GenericCanvasNode {
  id: string
  type: string
  position: CanvasNodePosition
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties?: any
}

// ─── Swimlane Manager Config ───────────────────────────────────────────────────

/**
 * Configuration for swimlane manager
 */
export interface SwimlaneConfig {
  /** Padding around children when auto-resizing */
  autoResizePadding: number
  /** Minimum swimlane width */
  minWidth: number
  /** Minimum swimlane height */
  minHeight: number
  /** Default header size */
  defaultHeaderSize: number
}

/**
 * Default swimlane configuration
 */
export const DEFAULT_SWIMLANE_CONFIG: SwimlaneConfig = {
  autoResizePadding: 20,
  minWidth: 200,
  minHeight: 150,
  defaultHeaderSize: 40
}

// ─── Content Bounds ────────────────────────────────────────────────────────────

/**
 * Rectangle bounds for content area
 */
export interface ContentBounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Calculate the content area bounds for a swimlane.
 */
export function getContentBounds(lane: SwimlaneNode): ContentBounds {
  const { x, y, width, height } = lane.position
  const { orientation, headerSize, collapsed } = lane.properties

  if (collapsed) {
    return { x, y, width: 0, height: 0 }
  }

  if (orientation === 'horizontal') {
    return {
      x,
      y: y + headerSize,
      width,
      height: height - headerSize
    }
  } else {
    return {
      x: x + headerSize,
      y,
      width: width - headerSize,
      height
    }
  }
}
