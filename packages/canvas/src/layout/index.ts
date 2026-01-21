/**
 * Graph Layout Engine using ELK.js
 *
 * Provides automatic layout algorithms for canvas nodes:
 * - Layered (hierarchical) layout
 * - Force-directed layout
 * - Tree layout
 * - Radial layout
 */

// Use bundled version to avoid web-worker dependency issues in Electron
import ELK from 'elkjs/lib/elk.bundled.js'
import type { ElkNode, ElkExtendedEdge, LayoutOptions } from 'elkjs'
import type { CanvasNode, CanvasEdge, CanvasNodePosition, Rect } from '../types'

/**
 * Layout algorithm types
 */
export type LayoutAlgorithm =
  | 'layered' // Hierarchical/Sugiyama
  | 'force' // Force-directed
  | 'mrtree' // Tree layout
  | 'radial' // Radial layout
  | 'stress' // Stress-minimization
  | 'box' // Simple box packing

/**
 * Layout direction for hierarchical layouts
 */
export type LayoutDirection = 'RIGHT' | 'LEFT' | 'DOWN' | 'UP'

/**
 * Layout configuration options
 */
export interface LayoutConfig {
  /** Layout algorithm to use */
  algorithm?: LayoutAlgorithm
  /** Direction for hierarchical layouts */
  direction?: LayoutDirection
  /** Spacing between nodes */
  nodeSpacing?: number
  /** Spacing between layers/ranks */
  layerSpacing?: number
  /** Edge routing style */
  edgeRouting?: 'POLYLINE' | 'ORTHOGONAL' | 'SPLINES'
  /** Padding around the layout */
  padding?: number
  /** Whether to pack disconnected components */
  packComponents?: boolean
}

/**
 * Default layout configuration
 */
const DEFAULT_LAYOUT_CONFIG: Required<LayoutConfig> = {
  algorithm: 'layered',
  direction: 'RIGHT',
  nodeSpacing: 50,
  layerSpacing: 100,
  edgeRouting: 'ORTHOGONAL',
  padding: 50,
  packComponents: true
}

/**
 * Result of layout computation
 */
export interface LayoutResult {
  /** New positions for nodes */
  positions: Map<string, CanvasNodePosition>
  /** Bounding box of the layout */
  bounds: Rect
  /** Layout computation time in ms */
  duration: number
}

/**
 * Layout Engine for automatic graph layout
 */
export class LayoutEngine {
  private elk: InstanceType<typeof ELK>

  constructor() {
    this.elk = new ELK()
  }

  /**
   * Compute layout for nodes and edges
   */
  async layout(
    nodes: CanvasNode[],
    edges: CanvasEdge[],
    config: LayoutConfig = {}
  ): Promise<LayoutResult> {
    const startTime = performance.now()
    const options = { ...DEFAULT_LAYOUT_CONFIG, ...config }

    // Convert to ELK format
    const elkGraph = this.toElkGraph(nodes, edges, options)

    // Run layout
    const result = await this.elk.layout(elkGraph)

    // Extract positions
    const positions = this.extractPositions(result, nodes)

    // Calculate bounds
    const bounds = this.calculateBounds(positions)

    return {
      positions,
      bounds,
      duration: performance.now() - startTime
    }
  }

  /**
   * Layout only a subset of nodes (keeping others fixed)
   */
  async layoutSubset(
    allNodes: CanvasNode[],
    subsetIds: Set<string>,
    edges: CanvasEdge[],
    config: LayoutConfig = {}
  ): Promise<LayoutResult> {
    // Filter to only layout subset nodes
    const subsetNodes = allNodes.filter((n) => subsetIds.has(n.id))
    const subsetEdges = edges.filter((e) => subsetIds.has(e.sourceId) && subsetIds.has(e.targetId))

    return this.layout(subsetNodes, subsetEdges, config)
  }

  /**
   * Convert nodes/edges to ELK graph format
   */
  private toElkGraph(
    nodes: CanvasNode[],
    edges: CanvasEdge[],
    config: Required<LayoutConfig>
  ): ElkNode {
    const layoutOptions = this.getLayoutOptions(config)

    const elkNodes: ElkNode[] = nodes.map((node) => ({
      id: node.id,
      width: node.position.width,
      height: node.position.height,
      // Preserve fixed positions if needed
      ...(node.properties.fixed
        ? {
            x: node.position.x,
            y: node.position.y
          }
        : {})
    }))

    const elkEdges: ElkExtendedEdge[] = edges.map((edge) => ({
      id: edge.id,
      sources: [edge.sourceId],
      targets: [edge.targetId]
    }))

    return {
      id: 'root',
      layoutOptions,
      children: elkNodes,
      edges: elkEdges
    }
  }

  /**
   * Get ELK layout options from config
   */
  private getLayoutOptions(config: Required<LayoutConfig>): LayoutOptions {
    const algorithmMap: Record<LayoutAlgorithm, string> = {
      layered: 'org.eclipse.elk.layered',
      force: 'org.eclipse.elk.force',
      mrtree: 'org.eclipse.elk.mrtree',
      radial: 'org.eclipse.elk.radial',
      stress: 'org.eclipse.elk.stress',
      box: 'org.eclipse.elk.box'
    }

    const options: LayoutOptions = {
      'elk.algorithm': algorithmMap[config.algorithm],
      'elk.spacing.nodeNode': String(config.nodeSpacing),
      'elk.padding': `[top=${config.padding},left=${config.padding},bottom=${config.padding},right=${config.padding}]`
    }

    // Algorithm-specific options
    if (config.algorithm === 'layered') {
      options['elk.direction'] = config.direction
      options['elk.layered.spacing.nodeNodeBetweenLayers'] = String(config.layerSpacing)
      options['elk.edgeRouting'] = config.edgeRouting
    }

    if (config.algorithm === 'force') {
      options['elk.force.iterations'] = '300'
    }

    if (config.packComponents) {
      options['elk.separateConnectedComponents'] = 'true'
    }

    return options
  }

  /**
   * Extract positions from ELK result
   */
  private extractPositions(
    result: ElkNode,
    originalNodes: CanvasNode[]
  ): Map<string, CanvasNodePosition> {
    const positions = new Map<string, CanvasNodePosition>()

    // Build a map of original nodes for preserving properties
    const nodeMap = new Map(originalNodes.map((n) => [n.id, n]))

    if (result.children) {
      for (const child of result.children) {
        const original = nodeMap.get(child.id)
        if (original && child.x !== undefined && child.y !== undefined) {
          positions.set(child.id, {
            x: child.x,
            y: child.y,
            width: child.width ?? original.position.width,
            height: child.height ?? original.position.height,
            rotation: original.position.rotation,
            zIndex: original.position.zIndex
          })
        }
      }
    }

    return positions
  }

  /**
   * Calculate bounding box of positions
   */
  private calculateBounds(positions: Map<string, CanvasNodePosition>): Rect {
    if (positions.size === 0) {
      return { x: 0, y: 0, width: 0, height: 0 }
    }

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const pos of positions.values()) {
      minX = Math.min(minX, pos.x)
      minY = Math.min(minY, pos.y)
      maxX = Math.max(maxX, pos.x + pos.width)
      maxY = Math.max(maxY, pos.y + pos.height)
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    }
  }

  /**
   * Layout nodes in a grid pattern (simple, no edges)
   */
  layoutGrid(
    nodes: CanvasNode[],
    options: { columns?: number; spacing?: number; padding?: number } = {}
  ): Map<string, CanvasNodePosition> {
    const { columns = 4, spacing = 20, padding = 50 } = options
    const positions = new Map<string, CanvasNodePosition>()

    let x = padding
    let y = padding
    let rowHeight = 0
    let col = 0

    for (const node of nodes) {
      positions.set(node.id, {
        x,
        y,
        width: node.position.width,
        height: node.position.height,
        rotation: node.position.rotation,
        zIndex: node.position.zIndex
      })

      rowHeight = Math.max(rowHeight, node.position.height)
      col++

      if (col >= columns) {
        col = 0
        x = padding
        y += rowHeight + spacing
        rowHeight = 0
      } else {
        x += node.position.width + spacing
      }
    }

    return positions
  }

  /**
   * Layout nodes in a circle
   */
  layoutCircle(
    nodes: CanvasNode[],
    options: { radius?: number; center?: { x: number; y: number } } = {}
  ): Map<string, CanvasNodePosition> {
    const positions = new Map<string, CanvasNodePosition>()

    if (nodes.length === 0) return positions

    // Calculate default radius based on node sizes
    const avgSize =
      nodes.reduce((sum, n) => sum + n.position.width + n.position.height, 0) / (nodes.length * 2)
    const defaultRadius = Math.max(200, (nodes.length * avgSize) / Math.PI)

    const { radius = defaultRadius, center = { x: 0, y: 0 } } = options
    const angleStep = (2 * Math.PI) / nodes.length

    nodes.forEach((node, i) => {
      const angle = i * angleStep - Math.PI / 2 // Start from top
      positions.set(node.id, {
        x: center.x + radius * Math.cos(angle) - node.position.width / 2,
        y: center.y + radius * Math.sin(angle) - node.position.height / 2,
        width: node.position.width,
        height: node.position.height,
        rotation: node.position.rotation,
        zIndex: node.position.zIndex
      })
    })

    return positions
  }
}

/**
 * Create a layout engine instance
 */
export function createLayoutEngine(): LayoutEngine {
  return new LayoutEngine()
}
