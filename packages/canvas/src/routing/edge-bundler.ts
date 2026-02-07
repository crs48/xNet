/**
 * Edge Bundler
 *
 * Groups parallel edges to reduce visual clutter in dense graphs.
 */

import type { Point, Rect } from './types'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Edge style configuration
 */
export interface EdgeStyle {
  stroke?: string
  strokeWidth?: number
}

/**
 * Canvas edge
 */
export interface CanvasEdge {
  id: string
  sourceId: string
  targetId: string
  label?: string
  style?: EdgeStyle
}

/**
 * A bundled group of edges
 */
export interface BundledEdge {
  /** Unique bundle ID */
  id: string
  /** Original edges in the bundle */
  originalEdges: CanvasEdge[]
  /** Path points for rendering */
  path: Point[]
  /** Bundle width (proportional to edge count) */
  width: number
  /** Bundle color (dominant color from edges) */
  color: string
}

/**
 * Bundle configuration
 */
export interface BundleConfig {
  /** Max distance between midpoints to bundle (px) */
  bundleThreshold: number
  /** Minimum edges to form a bundle */
  minBundleSize: number
  /** Distance to fan out at endpoints */
  fanOutDistance: number
  /** Maximum bundle width */
  maxBundleWidth: number
  /** Angle tolerance for bundling (radians) */
  angleTolerance: number
}

/**
 * Default bundle configuration
 */
export const DEFAULT_BUNDLE_CONFIG: BundleConfig = {
  bundleThreshold: 80,
  minBundleSize: 2,
  fanOutDistance: 30,
  maxBundleWidth: 8,
  angleTolerance: Math.PI / 6 // 30 degrees
}

// ─── Internal Types ───────────────────────────────────────────────────────────

interface EdgeData {
  edge: CanvasEdge
  sourceCenter: Point
  targetCenter: Point
  midpoint: Point
  angle: number
}

// ─── Edge Bundler ─────────────────────────────────────────────────────────────

export class EdgeBundler {
  private config: BundleConfig

  constructor(config: Partial<BundleConfig> = {}) {
    this.config = { ...DEFAULT_BUNDLE_CONFIG, ...config }
  }

  /**
   * Get current configuration.
   */
  getConfig(): BundleConfig {
    return { ...this.config }
  }

  /**
   * Update configuration.
   */
  setConfig(config: Partial<BundleConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Bundle edges based on proximity and angle similarity.
   */
  bundle(edges: CanvasEdge[], nodePositions: Map<string, Rect>): BundledEdge[] {
    // Calculate midpoint for each edge
    const edgeData = this.computeEdgeData(edges, nodePositions)

    // Cluster edges by midpoint proximity and similar angle
    const clusters = this.clusterEdges(edgeData)

    // Create bundled edges
    const bundledEdges: BundledEdge[] = []

    for (const cluster of clusters) {
      if (cluster.length < this.config.minBundleSize) {
        // Single edges - no bundling
        for (const item of cluster) {
          bundledEdges.push(this.createSingleEdge(item))
        }
      } else {
        // Bundle multiple edges
        bundledEdges.push(this.createBundle(cluster))
      }
    }

    return bundledEdges
  }

  /**
   * Compute edge data including midpoints and angles.
   */
  private computeEdgeData(edges: CanvasEdge[], nodePositions: Map<string, Rect>): EdgeData[] {
    const result: EdgeData[] = []

    for (const edge of edges) {
      const source = nodePositions.get(edge.sourceId)
      const target = nodePositions.get(edge.targetId)
      if (!source || !target) continue

      const sourceCenter: Point = {
        x: source.x + source.width / 2,
        y: source.y + source.height / 2
      }
      const targetCenter: Point = {
        x: target.x + target.width / 2,
        y: target.y + target.height / 2
      }
      const midpoint: Point = {
        x: (sourceCenter.x + targetCenter.x) / 2,
        y: (sourceCenter.y + targetCenter.y) / 2
      }
      const angle = Math.atan2(targetCenter.y - sourceCenter.y, targetCenter.x - sourceCenter.x)

      result.push({ edge, sourceCenter, targetCenter, midpoint, angle })
    }

    return result
  }

  /**
   * Cluster edges by proximity and angle similarity.
   */
  private clusterEdges(edgeData: EdgeData[]): EdgeData[][] {
    const clusters: EdgeData[][] = []
    const assigned = new Set<string>()

    for (const item of edgeData) {
      if (assigned.has(item.edge.id)) continue

      // Start new cluster
      const cluster = [item]
      assigned.add(item.edge.id)

      // Find all edges that can be bundled with this one
      for (const other of edgeData) {
        if (assigned.has(other.edge.id)) continue

        const distance = this.distance(item.midpoint, other.midpoint)
        const angleDiff = Math.abs(this.normalizeAngle(item.angle - other.angle))

        // Bundle if midpoints are close and angles are similar
        if (distance < this.config.bundleThreshold && angleDiff < this.config.angleTolerance) {
          cluster.push(other)
          assigned.add(other.edge.id)
        }
      }

      clusters.push(cluster)
    }

    return clusters
  }

  /**
   * Create a single (unbundled) edge.
   */
  private createSingleEdge(item: EdgeData): BundledEdge {
    return {
      id: item.edge.id,
      originalEdges: [item.edge],
      path: [item.sourceCenter, item.targetCenter],
      width: 2,
      color: item.edge.style?.stroke ?? '#64748b'
    }
  }

  /**
   * Create a bundle from multiple edges.
   */
  private createBundle(cluster: EdgeData[]): BundledEdge {
    // Calculate average positions
    const avgMidpoint: Point = {
      x: cluster.reduce((sum, c) => sum + c.midpoint.x, 0) / cluster.length,
      y: cluster.reduce((sum, c) => sum + c.midpoint.y, 0) / cluster.length
    }
    const avgSource: Point = {
      x: cluster.reduce((sum, c) => sum + c.sourceCenter.x, 0) / cluster.length,
      y: cluster.reduce((sum, c) => sum + c.sourceCenter.y, 0) / cluster.length
    }
    const avgTarget: Point = {
      x: cluster.reduce((sum, c) => sum + c.targetCenter.x, 0) / cluster.length,
      y: cluster.reduce((sum, c) => sum + c.targetCenter.y, 0) / cluster.length
    }

    // Create path through midpoint
    const path = [avgSource, avgMidpoint, avgTarget]

    // Calculate bundle width (proportional to edge count, capped)
    const width = Math.min(2 + cluster.length * 0.5, this.config.maxBundleWidth)

    // Get dominant color
    const color = this.getDominantColor(cluster)

    return {
      id: `bundle-${cluster.map((c) => c.edge.id).join('-')}`,
      originalEdges: cluster.map((c) => c.edge),
      path,
      width,
      color
    }
  }

  /**
   * Get the most common color from a cluster of edges.
   */
  private getDominantColor(cluster: EdgeData[]): string {
    const colorCounts = new Map<string, number>()

    for (const item of cluster) {
      const color = item.edge.style?.stroke ?? '#64748b'
      colorCounts.set(color, (colorCounts.get(color) ?? 0) + 1)
    }

    let dominantColor = '#64748b'
    let maxCount = 0

    for (const [color, count] of colorCounts) {
      if (count > maxCount) {
        maxCount = count
        dominantColor = color
      }
    }

    return dominantColor
  }

  /**
   * Calculate distance between two points.
   */
  private distance(a: Point, b: Point): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
  }

  /**
   * Normalize angle to [-PI, PI].
   */
  private normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= 2 * Math.PI
    while (angle < -Math.PI) angle += 2 * Math.PI
    return angle
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create an edge bundler with optional config.
 */
export function createEdgeBundler(config?: Partial<BundleConfig>): EdgeBundler {
  return new EdgeBundler(config)
}
