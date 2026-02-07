/**
 * Keyboard Navigation
 *
 * Keyboard navigation for canvas accessibility.
 */

import type { Point } from '../types'

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * Canvas node for navigation (minimal interface)
 */
export interface NavigableNode {
  id: string
  position: {
    x: number
    y: number
    width: number
    height: number
  }
}

/**
 * Spatial index for node lookup
 */
export interface NavigationSpatialIndex {
  search(bounds: { minX: number; minY: number; maxX: number; maxY: number }): string[]
}

/**
 * Keyboard navigation options
 */
export interface KeyboardNavigationOptions {
  nodes: NavigableNode[]
  selectedIds: Set<string>
  focusedId: string | null
  spatialIndex: NavigationSpatialIndex
  onFocusChange: (nodeId: string | null) => void
  onSelectionChange: (nodeIds: string[]) => void
  onNodeActivate: (nodeId: string) => void
}

// ─── Keyboard Navigator ────────────────────────────────────────────────────────

export class KeyboardNavigator {
  private options: KeyboardNavigationOptions

  constructor(options: KeyboardNavigationOptions) {
    this.options = options
  }

  /**
   * Update options.
   */
  updateOptions(options: Partial<KeyboardNavigationOptions>): void {
    this.options = { ...this.options, ...options }
  }

  /**
   * Handle keyboard event. Returns true if event was handled.
   */
  handleKeyDown(e: KeyboardEvent): boolean {
    const { focusedId, nodes } = this.options

    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
        e.preventDefault()
        this.moveFocus(e.key)
        return true

      case 'Enter':
      case ' ':
        e.preventDefault()
        if (focusedId) {
          this.options.onNodeActivate(focusedId)
        }
        return true

      case 'Escape':
        e.preventDefault()
        this.options.onFocusChange(null)
        this.options.onSelectionChange([])
        return true

      case 'Tab':
        // Allow Tab to exit canvas when at last node
        if (!e.shiftKey && focusedId) {
          const next = this.getNextNode(focusedId, 1)
          if (next) {
            e.preventDefault()
            this.options.onFocusChange(next.id)
            this.options.onSelectionChange([next.id])
            return true
          }
        } else if (e.shiftKey && focusedId) {
          const prev = this.getNextNode(focusedId, -1)
          if (prev) {
            e.preventDefault()
            this.options.onFocusChange(prev.id)
            this.options.onSelectionChange([prev.id])
            return true
          }
        }
        return false

      case 'a':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault()
          this.options.onSelectionChange(nodes.map((n) => n.id))
          return true
        }
        return false

      case 'Home':
        e.preventDefault()
        if (nodes.length > 0) {
          this.options.onFocusChange(nodes[0].id)
          this.options.onSelectionChange([nodes[0].id])
        }
        return true

      case 'End':
        e.preventDefault()
        if (nodes.length > 0) {
          const lastNode = nodes[nodes.length - 1]
          this.options.onFocusChange(lastNode.id)
          this.options.onSelectionChange([lastNode.id])
        }
        return true

      default:
        return false
    }
  }

  /**
   * Move focus in the specified direction.
   */
  private moveFocus(direction: string): void {
    const { focusedId, nodes, spatialIndex } = this.options

    if (!focusedId) {
      // Focus first node
      if (nodes.length > 0) {
        this.options.onFocusChange(nodes[0].id)
        this.options.onSelectionChange([nodes[0].id])
      }
      return
    }

    const current = nodes.find((n) => n.id === focusedId)
    if (!current) return

    const center: Point = {
      x: current.position.x + current.position.width / 2,
      y: current.position.y + current.position.height / 2
    }

    // Search in direction
    const searchRect = this.getSearchRect(center, direction, 2000)
    const candidateIds = spatialIndex.search(searchRect)
    const candidates = candidateIds
      .filter((id) => id !== focusedId)
      .map((id) => nodes.find((n) => n.id === id))
      .filter((n): n is NavigableNode => n !== undefined)

    if (candidates.length === 0) return

    // Find closest in direction
    const closest = this.findClosestInDirection(current, candidates, direction)
    if (closest) {
      this.options.onFocusChange(closest.id)
      this.options.onSelectionChange([closest.id])
    }
  }

  /**
   * Get search rectangle in direction.
   */
  private getSearchRect(
    center: Point,
    direction: string,
    distance: number
  ): { minX: number; minY: number; maxX: number; maxY: number } {
    switch (direction) {
      case 'ArrowUp':
        return {
          minX: center.x - distance,
          minY: center.y - distance,
          maxX: center.x + distance,
          maxY: center.y
        }
      case 'ArrowDown':
        return {
          minX: center.x - distance,
          minY: center.y,
          maxX: center.x + distance,
          maxY: center.y + distance
        }
      case 'ArrowLeft':
        return {
          minX: center.x - distance,
          minY: center.y - distance,
          maxX: center.x,
          maxY: center.y + distance
        }
      case 'ArrowRight':
        return {
          minX: center.x,
          minY: center.y - distance,
          maxX: center.x + distance,
          maxY: center.y + distance
        }
      default:
        return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
    }
  }

  /**
   * Find closest node in the specified direction.
   */
  private findClosestInDirection(
    current: NavigableNode,
    candidates: NavigableNode[],
    direction: string
  ): NavigableNode | null {
    const currentCenter: Point = {
      x: current.position.x + current.position.width / 2,
      y: current.position.y + current.position.height / 2
    }

    let closest: NavigableNode | null = null
    let closestDist = Infinity

    for (const candidate of candidates) {
      const candidateCenter: Point = {
        x: candidate.position.x + candidate.position.width / 2,
        y: candidate.position.y + candidate.position.height / 2
      }

      // Check if candidate is in the right direction
      if (!this.isInDirection(currentCenter, candidateCenter, direction)) {
        continue
      }

      const dist = this.distance(currentCenter, candidateCenter)
      if (dist < closestDist) {
        closestDist = dist
        closest = candidate
      }
    }

    return closest
  }

  /**
   * Check if target is in the specified direction from source.
   */
  private isInDirection(from: Point, to: Point, direction: string): boolean {
    const dx = to.x - from.x
    const dy = to.y - from.y

    switch (direction) {
      case 'ArrowUp':
        return dy < 0 && Math.abs(dy) > Math.abs(dx) * 0.5
      case 'ArrowDown':
        return dy > 0 && Math.abs(dy) > Math.abs(dx) * 0.5
      case 'ArrowLeft':
        return dx < 0 && Math.abs(dx) > Math.abs(dy) * 0.5
      case 'ArrowRight':
        return dx > 0 && Math.abs(dx) > Math.abs(dy) * 0.5
      default:
        return false
    }
  }

  /**
   * Calculate distance between two points.
   */
  private distance(a: Point, b: Point): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
  }

  /**
   * Get next/previous node in order.
   */
  private getNextNode(currentId: string, direction: 1 | -1): NavigableNode | null {
    const { nodes } = this.options
    const currentIndex = nodes.findIndex((n) => n.id === currentId)
    if (currentIndex < 0) return null

    const nextIndex = currentIndex + direction
    if (nextIndex < 0 || nextIndex >= nodes.length) return null

    return nodes[nextIndex]
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a keyboard navigator.
 */
export function createKeyboardNavigator(options: KeyboardNavigationOptions): KeyboardNavigator {
  return new KeyboardNavigator(options)
}
