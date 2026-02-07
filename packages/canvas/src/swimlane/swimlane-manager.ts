/**
 * Swimlane Manager
 *
 * Manages swimlane node operations including containment, membership,
 * and auto-resizing.
 */

import type { Point, CanvasNodePosition } from '../types'
import {
  type SwimlaneNode,
  type GenericCanvasNode,
  type SwimlaneConfig,
  type ContentBounds,
  DEFAULT_SWIMLANE_CONFIG,
  getContentBounds
} from './types'

// ─── Swimlane Manager ──────────────────────────────────────────────────────────

export class SwimlaneManager {
  private config: SwimlaneConfig

  constructor(config: Partial<SwimlaneConfig> = {}) {
    this.config = { ...DEFAULT_SWIMLANE_CONFIG, ...config }
  }

  /**
   * Get current configuration.
   */
  getConfig(): SwimlaneConfig {
    return { ...this.config }
  }

  /**
   * Update configuration.
   */
  setConfig(config: Partial<SwimlaneConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Check if a position is inside a swimlane's content area.
   */
  isInsideSwimlane(position: Point, lane: SwimlaneNode): boolean {
    const bounds = getContentBounds(lane)

    if (bounds.width === 0 || bounds.height === 0) {
      return false // Collapsed
    }

    return (
      position.x >= bounds.x &&
      position.x <= bounds.x + bounds.width &&
      position.y >= bounds.y &&
      position.y <= bounds.y + bounds.height
    )
  }

  /**
   * Get the swimlane containing a given position.
   * Returns null if position is not inside any swimlane.
   */
  getSwimlaneAtPosition(position: Point, swimlanes: SwimlaneNode[]): SwimlaneNode | null {
    // Check in reverse order (top-most first, assuming later = higher z-index)
    for (let i = swimlanes.length - 1; i >= 0; i--) {
      const lane = swimlanes[i]
      if (this.isInsideSwimlane(position, lane)) {
        return lane
      }
    }
    return null
  }

  /**
   * Get the swimlane containing a node based on its center point.
   */
  getSwimlaneForNode(node: GenericCanvasNode, swimlanes: SwimlaneNode[]): SwimlaneNode | null {
    const center: Point = {
      x: node.position.x + node.position.width / 2,
      y: node.position.y + node.position.height / 2
    }
    return this.getSwimlaneAtPosition(center, swimlanes)
  }

  /**
   * Add a node to a swimlane.
   * Automatically removes it from any other swimlane first.
   */
  addNodeToSwimlane(
    nodeId: string,
    swimlaneId: string,
    swimlanes: Map<string, SwimlaneNode>
  ): Map<string, SwimlaneNode> {
    const updated = new Map(swimlanes)

    // Remove from any existing swimlane
    for (const [id, lane] of updated) {
      if (lane.properties.childNodeIds.includes(nodeId)) {
        updated.set(id, {
          ...lane,
          properties: {
            ...lane.properties,
            childNodeIds: lane.properties.childNodeIds.filter((n) => n !== nodeId)
          }
        })
      }
    }

    // Add to new swimlane
    const targetLane = updated.get(swimlaneId)
    if (targetLane && !targetLane.properties.childNodeIds.includes(nodeId)) {
      updated.set(swimlaneId, {
        ...targetLane,
        properties: {
          ...targetLane.properties,
          childNodeIds: [...targetLane.properties.childNodeIds, nodeId]
        }
      })
    }

    return updated
  }

  /**
   * Remove a node from its current swimlane.
   */
  removeNodeFromSwimlane(
    nodeId: string,
    swimlanes: Map<string, SwimlaneNode>
  ): Map<string, SwimlaneNode> {
    const updated = new Map(swimlanes)

    for (const [id, lane] of updated) {
      if (lane.properties.childNodeIds.includes(nodeId)) {
        updated.set(id, {
          ...lane,
          properties: {
            ...lane.properties,
            childNodeIds: lane.properties.childNodeIds.filter((n) => n !== nodeId)
          }
        })
        break
      }
    }

    return updated
  }

  /**
   * Find which swimlane contains a given node ID.
   */
  findSwimlaneContaining(nodeId: string, swimlanes: SwimlaneNode[]): SwimlaneNode | null {
    for (const lane of swimlanes) {
      if (lane.properties.childNodeIds.includes(nodeId)) {
        return lane
      }
    }
    return null
  }

  /**
   * Calculate new position for a swimlane to fit its children.
   */
  resizeToFitChildren(
    lane: SwimlaneNode,
    childNodes: GenericCanvasNode[],
    padding?: number
  ): Partial<CanvasNodePosition> {
    const p = padding ?? this.config.autoResizePadding

    if (childNodes.length === 0) {
      return {}
    }

    const { orientation, headerSize } = lane.properties

    // Calculate bounding box of children
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const child of childNodes) {
      minX = Math.min(minX, child.position.x)
      minY = Math.min(minY, child.position.y)
      maxX = Math.max(maxX, child.position.x + child.position.width)
      maxY = Math.max(maxY, child.position.y + child.position.height)
    }

    const result: Partial<CanvasNodePosition> = {}

    if (orientation === 'horizontal') {
      // Expand horizontally and vertically
      const newX = Math.min(lane.position.x, minX - p)
      const newWidth = Math.max(lane.position.width, maxX - minX + p * 2, this.config.minWidth)
      const newHeight = Math.max(
        lane.position.height,
        maxY - minY + headerSize + p * 2,
        this.config.minHeight
      )

      if (newX !== lane.position.x) result.x = newX
      if (newWidth !== lane.position.width) result.width = newWidth
      if (newHeight !== lane.position.height) result.height = newHeight
    } else {
      // Vertical orientation
      const newY = Math.min(lane.position.y, minY - p)
      const newWidth = Math.max(
        lane.position.width,
        maxX - minX + headerSize + p * 2,
        this.config.minWidth
      )
      const newHeight = Math.max(lane.position.height, maxY - minY + p * 2, this.config.minHeight)

      if (newY !== lane.position.y) result.y = newY
      if (newWidth !== lane.position.width) result.width = newWidth
      if (newHeight !== lane.position.height) result.height = newHeight
    }

    return result
  }

  /**
   * Get the effective height of a swimlane (respects collapsed state).
   */
  getEffectiveHeight(lane: SwimlaneNode): number {
    if (lane.properties.collapsed && lane.properties.orientation === 'horizontal') {
      return lane.properties.headerSize
    }
    return lane.position.height
  }

  /**
   * Get the effective width of a swimlane (respects collapsed state).
   */
  getEffectiveWidth(lane: SwimlaneNode): number {
    if (lane.properties.collapsed && lane.properties.orientation === 'vertical') {
      return lane.properties.headerSize
    }
    return lane.position.width
  }

  /**
   * Get content bounds for a swimlane.
   */
  getContentBounds(lane: SwimlaneNode): ContentBounds {
    return getContentBounds(lane)
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a swimlane manager with optional config.
 */
export function createSwimlaneManager(config?: Partial<SwimlaneConfig>): SwimlaneManager {
  return new SwimlaneManager(config)
}
