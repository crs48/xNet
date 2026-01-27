/**
 * Spatial Indexing with R-tree (rbush)
 *
 * Provides efficient spatial queries for canvas nodes:
 * - Viewport culling (only render visible nodes)
 * - Point queries (find node at position)
 * - Range queries (find nodes in selection box)
 */

import RBush from 'rbush'
import type { Rect, Point, CanvasNode, CanvasNodePosition } from '../types'

/**
 * R-tree item format required by rbush
 */
export interface SpatialItem {
  minX: number
  minY: number
  maxX: number
  maxY: number
  id: string
}

/**
 * Convert canvas node position to rbush item
 */
function positionToItem(id: string, pos: CanvasNodePosition): SpatialItem {
  return {
    minX: pos.x,
    minY: pos.y,
    maxX: pos.x + pos.width,
    maxY: pos.y + pos.height,
    id
  }
}

/**
 * Convert rect to rbush search box
 */
function rectToSearchBox(rect: Rect): { minX: number; minY: number; maxX: number; maxY: number } {
  return {
    minX: rect.x,
    minY: rect.y,
    maxX: rect.x + rect.width,
    maxY: rect.y + rect.height
  }
}

/**
 * Spatial index for canvas nodes
 */
export class SpatialIndex {
  private tree: RBush<SpatialItem>
  private items: Map<string, SpatialItem>

  constructor() {
    this.tree = new RBush()
    this.items = new Map()
  }

  /**
   * Insert or update a node in the index
   */
  upsert(id: string, position: CanvasNodePosition): void {
    // Remove existing item if present
    const existing = this.items.get(id)
    if (existing) {
      this.tree.remove(existing, (a, b) => a.id === b.id)
    }

    // Insert new item
    const item = positionToItem(id, position)
    this.tree.insert(item)
    this.items.set(id, item)
  }

  /**
   * Remove a node from the index
   */
  remove(id: string): boolean {
    const item = this.items.get(id)
    if (!item) return false

    this.tree.remove(item, (a, b) => a.id === b.id)
    this.items.delete(id)
    return true
  }

  /**
   * Find all nodes within a rectangle (e.g., viewport or selection box)
   */
  search(rect: Rect): string[] {
    const results = this.tree.search(rectToSearchBox(rect))
    return results.map((item) => item.id)
  }

  /**
   * Find all nodes that contain a point
   */
  queryPoint(point: Point): string[] {
    // Search with a tiny rect around the point
    const results = this.tree.search({
      minX: point.x,
      minY: point.y,
      maxX: point.x,
      maxY: point.y
    })
    return results.map((item) => item.id)
  }

  /**
   * Find the topmost node at a point (considering z-index)
   * Returns node ID and the nodes map for z-ordering
   */
  findNodeAt(point: Point, nodes: Map<string, CanvasNode>): string | null {
    const candidates = this.queryPoint(point)
    if (candidates.length === 0) return null

    // Sort by z-index (higher = on top) and return topmost
    return candidates.sort((a, b) => {
      const nodeA = nodes.get(a)
      const nodeB = nodes.get(b)
      const zA = nodeA?.position.zIndex ?? 0
      const zB = nodeB?.position.zIndex ?? 0
      return zB - zA // Higher z-index first
    })[0]
  }

  /**
   * Find all nodes intersecting with another node's bounds
   */
  findIntersecting(id: string): string[] {
    const item = this.items.get(id)
    if (!item) return []

    const results = this.tree.search(item)
    return results.filter((r) => r.id !== id).map((r) => r.id)
  }

  /**
   * Check if two nodes overlap
   */
  overlaps(id1: string, id2: string): boolean {
    const item1 = this.items.get(id1)
    const item2 = this.items.get(id2)
    if (!item1 || !item2) return false

    return !(
      item1.maxX < item2.minX ||
      item1.minX > item2.maxX ||
      item1.maxY < item2.minY ||
      item1.minY > item2.maxY
    )
  }

  /**
   * Get bounding box of all nodes
   */
  getBounds(): Rect | null {
    if (this.items.size === 0) return null

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const item of this.items.values()) {
      minX = Math.min(minX, item.minX)
      minY = Math.min(minY, item.minY)
      maxX = Math.max(maxX, item.maxX)
      maxY = Math.max(maxY, item.maxY)
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    }
  }

  /**
   * Get all indexed node IDs
   */
  getIds(): string[] {
    return Array.from(this.items.keys())
  }

  /**
   * Get count of indexed nodes
   */
  size(): number {
    return this.items.size
  }

  /**
   * Clear all nodes from the index
   */
  clear(): void {
    this.tree.clear()
    this.items.clear()
  }

  /**
   * Bulk load nodes (more efficient than individual inserts)
   */
  load(nodes: Array<{ id: string; position: CanvasNodePosition }>): void {
    this.clear()
    const items = nodes.map((n) => positionToItem(n.id, n.position))
    this.tree.load(items)
    for (const item of items) {
      this.items.set(item.id, item)
    }
  }
}

/**
 * Viewport helper for canvas coordinate transformations
 */
export class Viewport {
  /** Canvas center X */
  x: number = 0
  /** Canvas center Y */
  y: number = 0
  /** Zoom level (1 = 100%) */
  zoom: number = 1
  /** Screen/container width */
  width: number = 800
  /** Screen/container height */
  height: number = 600

  constructor(config?: { x?: number; y?: number; zoom?: number; width?: number; height?: number }) {
    if (config) {
      this.x = config.x ?? 0
      this.y = config.y ?? 0
      this.zoom = config.zoom ?? 1
      this.width = config.width ?? 800
      this.height = config.height ?? 600
    }
  }

  /**
   * Convert screen coordinates to canvas coordinates
   */
  screenToCanvas(screenX: number, screenY: number): Point {
    return {
      x: (screenX - this.width / 2) / this.zoom + this.x,
      y: (screenY - this.height / 2) / this.zoom + this.y
    }
  }

  /**
   * Convert canvas coordinates to screen coordinates
   */
  canvasToScreen(canvasX: number, canvasY: number): Point {
    return {
      x: (canvasX - this.x) * this.zoom + this.width / 2,
      y: (canvasY - this.y) * this.zoom + this.height / 2
    }
  }

  /**
   * Get the visible canvas area as a Rect
   */
  getVisibleRect(): Rect {
    const halfWidth = this.width / 2 / this.zoom
    const halfHeight = this.height / 2 / this.zoom

    return {
      x: this.x - halfWidth,
      y: this.y - halfHeight,
      width: this.width / this.zoom,
      height: this.height / this.zoom
    }
  }

  /**
   * Pan the viewport by screen delta
   */
  pan(deltaX: number, deltaY: number): void {
    this.x -= deltaX / this.zoom
    this.y -= deltaY / this.zoom
  }

  /**
   * Zoom at a specific screen point, keeping the canvas point under the cursor stationary
   */
  zoomAt(screenX: number, screenY: number, factor: number, minZoom = 0.1, maxZoom = 4): void {
    const newZoom = Math.max(minZoom, Math.min(maxZoom, this.zoom * factor))
    if (newZoom === this.zoom) return

    // Get canvas point under cursor before zoom
    const canvasPoint = this.screenToCanvas(screenX, screenY)

    // Apply new zoom
    this.zoom = newZoom

    // Calculate new viewport center so canvasPoint stays at (screenX, screenY)
    // From screenToCanvas: canvasX = (screenX - width/2) / zoom + centerX
    // Solving for centerX: centerX = canvasX - (screenX - width/2) / zoom
    this.x = canvasPoint.x - (screenX - this.width / 2) / this.zoom
    this.y = canvasPoint.y - (screenY - this.height / 2) / this.zoom
  }

  /**
   * Fit viewport to contain a rect with padding
   */
  fitToRect(rect: Rect, padding = 50): void {
    // Calculate required zoom to fit rect
    const zoomX = (this.width - padding * 2) / rect.width
    const zoomY = (this.height - padding * 2) / rect.height
    this.zoom = Math.min(zoomX, zoomY, 1) // Don't zoom in beyond 100%

    // Center on rect
    this.x = rect.x + rect.width / 2
    this.y = rect.y + rect.height / 2
  }

  /**
   * Reset to default view
   */
  reset(): void {
    this.x = 0
    this.y = 0
    this.zoom = 1
  }

  /**
   * Clone the viewport state
   */
  clone(): Viewport {
    return new Viewport({
      x: this.x,
      y: this.y,
      zoom: this.zoom,
      width: this.width,
      height: this.height
    })
  }

  /**
   * Get CSS transform string for the canvas container
   */
  getTransform(): string {
    const screenCenter = this.canvasToScreen(0, 0)
    return `translate(${screenCenter.x}px, ${screenCenter.y}px) scale(${this.zoom})`
  }
}

/**
 * Create a new spatial index
 */
export function createSpatialIndex(): SpatialIndex {
  return new SpatialIndex()
}

/**
 * Create a new viewport
 */
export function createViewport(config?: {
  x?: number
  y?: number
  zoom?: number
  width?: number
  height?: number
}): Viewport {
  return new Viewport(config)
}
