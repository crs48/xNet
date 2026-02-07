/**
 * Orthogonal Router
 *
 * A* pathfinding for orthogonal (right-angle) edge routing around obstacles.
 */

import type { Point, Rect, EdgeAnchor, Direction, RouterConfig, PathNode } from './types'
import { MinHeap } from './min-heap'
import { DEFAULT_ROUTER_CONFIG } from './types'

// ─── Orthogonal Router ────────────────────────────────────────────────────────

export class OrthogonalRouter {
  private config: RouterConfig
  private obstacles: Rect[] = []
  private existingEdges: Point[][] = []

  constructor(config: Partial<RouterConfig> = {}) {
    this.config = { ...DEFAULT_ROUTER_CONFIG, ...config }
  }

  /**
   * Set node obstacles to route around.
   * Nodes are expanded by nodeMargin to create a buffer zone.
   */
  setObstacles(nodes: Array<{ position: Rect }>): void {
    this.obstacles = nodes.map((node) => ({
      x: node.position.x - this.config.nodeMargin,
      y: node.position.y - this.config.nodeMargin,
      width: node.position.width + this.config.nodeMargin * 2,
      height: node.position.height + this.config.nodeMargin * 2
    }))
  }

  /**
   * Set existing edge paths to avoid crossing.
   */
  setExistingEdges(edges: Point[][]): void {
    this.existingEdges = edges
  }

  /**
   * Get current configuration.
   */
  getConfig(): RouterConfig {
    return { ...this.config }
  }

  /**
   * Update configuration.
   */
  setConfig(config: Partial<RouterConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Route an edge between source and target rectangles.
   * Returns an array of points forming an orthogonal path.
   */
  route(source: Rect, sourceAnchor: EdgeAnchor, target: Rect, targetAnchor: EdgeAnchor): Point[] {
    const start = this.getAnchorPoint(source, sourceAnchor, target)
    const end = this.getAnchorPoint(target, targetAnchor, source)

    // Get initial direction from anchor
    const startDir = this.getAnchorDirection(sourceAnchor, source, target)
    const endDir = this.getAnchorDirection(targetAnchor, target, source)

    // Run A* pathfinding
    const path = this.astar(start, end, startDir, endDir)

    // Simplify path (remove redundant points on same line)
    return this.simplifyPath(path)
  }

  /**
   * A* pathfinding algorithm.
   */
  private astar(
    start: Point,
    end: Point,
    startDir: Direction | null,
    _endDir: Direction | null
  ): Point[] {
    const { gridSize, bendPenalty, maxIterations } = this.config

    const openSet = new MinHeap<PathNode>((a, b) => a.g + a.h - (b.g + b.h))
    const closedSet = new Set<string>()

    const startNode: PathNode = {
      x: this.snapToGrid(start.x),
      y: this.snapToGrid(start.y),
      g: 0,
      h: this.heuristic(start, end),
      parent: null,
      direction: startDir
    }

    openSet.push(startNode)

    let iterations = 0

    while (!openSet.isEmpty() && iterations < maxIterations) {
      iterations++

      const current = openSet.pop()!
      const key = `${current.x},${current.y}`

      if (closedSet.has(key)) continue
      closedSet.add(key)

      // Check if reached end
      if (this.isNearEnd(current, end, gridSize)) {
        return this.reconstructPath(current, end)
      }

      // Explore orthogonal neighbors
      const directions: Array<{ dx: number; dy: number; dir: Direction }> = [
        { dx: 0, dy: -gridSize, dir: 'up' },
        { dx: gridSize, dy: 0, dir: 'right' },
        { dx: 0, dy: gridSize, dir: 'down' },
        { dx: -gridSize, dy: 0, dir: 'left' }
      ]

      for (const { dx, dy, dir } of directions) {
        const nx = current.x + dx
        const ny = current.y + dy
        const nkey = `${nx},${ny}`

        if (closedSet.has(nkey)) continue

        // Check collision with obstacles
        if (this.collidesWithObstacle(nx, ny)) continue

        // Calculate cost
        const moveCost = gridSize
        const bendCost = current.direction && current.direction !== dir ? bendPenalty : 0
        const crossingCost =
          this.countCrossings(current.x, current.y, nx, ny) * this.config.crossingPenalty

        const g = current.g + moveCost + bendCost + crossingCost
        const h = this.heuristic({ x: nx, y: ny }, end)

        openSet.push({
          x: nx,
          y: ny,
          g,
          h,
          parent: current,
          direction: dir
        })
      }
    }

    // No path found - return straight line
    return [start, end]
  }

  /**
   * Manhattan distance heuristic.
   */
  private heuristic(a: Point, b: Point): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
  }

  /**
   * Check if node is close enough to the end point.
   */
  private isNearEnd(node: PathNode, end: Point, threshold: number): boolean {
    return Math.abs(node.x - end.x) <= threshold && Math.abs(node.y - end.y) <= threshold
  }

  /**
   * Check if a point collides with any obstacle.
   */
  private collidesWithObstacle(x: number, y: number): boolean {
    for (const obstacle of this.obstacles) {
      if (
        x >= obstacle.x &&
        x <= obstacle.x + obstacle.width &&
        y >= obstacle.y &&
        y <= obstacle.y + obstacle.height
      ) {
        return true
      }
    }
    return false
  }

  /**
   * Count edge crossings for a segment.
   */
  private countCrossings(x1: number, y1: number, x2: number, y2: number): number {
    let count = 0
    for (const edge of this.existingEdges) {
      for (let i = 0; i < edge.length - 1; i++) {
        if (this.segmentsIntersect(x1, y1, x2, y2, edge[i], edge[i + 1])) {
          count++
        }
      }
    }
    return count
  }

  /**
   * Check if two line segments intersect.
   */
  private segmentsIntersect(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    p1: Point,
    p2: Point
  ): boolean {
    const d1 = this.crossProduct(p1, p2, { x: x1, y: y1 })
    const d2 = this.crossProduct(p1, p2, { x: x2, y: y2 })
    const d3 = this.crossProduct({ x: x1, y: y1 }, { x: x2, y: y2 }, p1)
    const d4 = this.crossProduct({ x: x1, y: y1 }, { x: x2, y: y2 }, p2)

    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
      return true
    }
    return false
  }

  /**
   * Cross product for segment intersection test.
   */
  private crossProduct(a: Point, b: Point, c: Point): number {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  }

  /**
   * Reconstruct path from A* result.
   */
  private reconstructPath(node: PathNode, end: Point): Point[] {
    const path: Point[] = [end]
    let current: PathNode | null = node

    while (current) {
      path.unshift({ x: current.x, y: current.y })
      current = current.parent
    }

    return path
  }

  /**
   * Simplify path by removing collinear points.
   */
  private simplifyPath(path: Point[]): Point[] {
    if (path.length < 3) return path

    const simplified: Point[] = [path[0]]

    for (let i = 1; i < path.length - 1; i++) {
      const prev = path[i - 1]
      const curr = path[i]
      const next = path[i + 1]

      // Keep point if direction changes
      const sameHorizontal = prev.y === curr.y && curr.y === next.y
      const sameVertical = prev.x === curr.x && curr.x === next.x

      if (!sameHorizontal && !sameVertical) {
        simplified.push(curr)
      }
    }

    simplified.push(path[path.length - 1])
    return simplified
  }

  /**
   * Snap value to grid.
   */
  private snapToGrid(value: number): number {
    return Math.round(value / this.config.gridSize) * this.config.gridSize
  }

  /**
   * Get anchor point on a rectangle.
   */
  private getAnchorPoint(rect: Rect, anchor: EdgeAnchor, other: Rect): Point {
    const cx = rect.x + rect.width / 2
    const cy = rect.y + rect.height / 2
    const ox = other.x + other.width / 2
    const oy = other.y + other.height / 2

    if (anchor === 'auto') {
      const dx = ox - cx
      const dy = oy - cy

      if (Math.abs(dx) > Math.abs(dy)) {
        return dx > 0 ? { x: rect.x + rect.width, y: cy } : { x: rect.x, y: cy }
      } else {
        return dy > 0 ? { x: cx, y: rect.y + rect.height } : { x: cx, y: rect.y }
      }
    }

    switch (anchor) {
      case 'top':
        return { x: cx, y: rect.y }
      case 'bottom':
        return { x: cx, y: rect.y + rect.height }
      case 'left':
        return { x: rect.x, y: cy }
      case 'right':
        return { x: rect.x + rect.width, y: cy }
      case 'center':
      default:
        return { x: cx, y: cy }
    }
  }

  /**
   * Get initial direction from an anchor.
   */
  private getAnchorDirection(anchor: EdgeAnchor, rect: Rect, other: Rect): Direction | null {
    if (anchor === 'auto') {
      const cx = rect.x + rect.width / 2
      const cy = rect.y + rect.height / 2
      const ox = other.x + other.width / 2
      const oy = other.y + other.height / 2

      if (Math.abs(ox - cx) > Math.abs(oy - cy)) {
        return ox > cx ? 'right' : 'left'
      } else {
        return oy > cy ? 'down' : 'up'
      }
    }

    switch (anchor) {
      case 'top':
        return 'up'
      case 'bottom':
        return 'down'
      case 'left':
        return 'left'
      case 'right':
        return 'right'
      default:
        return null
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create an orthogonal router with optional config.
 */
export function createOrthogonalRouter(config?: Partial<RouterConfig>): OrthogonalRouter {
  return new OrthogonalRouter(config)
}
