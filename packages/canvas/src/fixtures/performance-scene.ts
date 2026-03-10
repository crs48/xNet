/**
 * Dense canvas scene fixtures for large-scene workbenches and performance tests.
 */

import type { CanvasEdge, CanvasNode, CanvasSceneNodeKind, Rect } from '../types'
import * as Y from 'yjs'
import {
  getCanvasConnectorsMap,
  getCanvasMetadataMap,
  getCanvasObjectsMap
} from '../scene/doc-layout'
import { createCanvasDoc, createEdge, createNode } from '../store'

export interface CanvasPerformanceSceneOptions {
  columns?: number
  rows?: number
  startX?: number
  startY?: number
  horizontalGap?: number
  verticalGap?: number
  clusterColumns?: number
  clusterRows?: number
  clusterGapX?: number
  clusterGapY?: number
  includeEdges?: boolean
  includeGroups?: boolean
}

export interface CanvasPerformanceSceneSummary {
  nodeCount: number
  edgeCount: number
  bounds: Rect
  kindCounts: Partial<Record<CanvasSceneNodeKind, number>>
}

export interface CanvasPerformanceSceneSeedResult extends CanvasPerformanceSceneSummary {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

const DEFAULT_OPTIONS: Required<CanvasPerformanceSceneOptions> = {
  columns: 36,
  rows: 24,
  startX: -9000,
  startY: -5200,
  horizontalGap: 520,
  verticalGap: 340,
  clusterColumns: 6,
  clusterRows: 4,
  clusterGapX: 480,
  clusterGapY: 360,
  includeEdges: true,
  includeGroups: true
}

const CONTENT_NODE_SEQUENCE: CanvasSceneNodeKind[] = [
  'page',
  'database',
  'note',
  'external-reference',
  'media',
  'shape'
]

function resolveOptions(
  options: CanvasPerformanceSceneOptions = {}
): Required<CanvasPerformanceSceneOptions> {
  return {
    ...DEFAULT_OPTIONS,
    ...options
  }
}

function createClusterGroup(
  clusterIndex: number,
  clusterRow: number,
  clusterColumn: number,
  options: Required<CanvasPerformanceSceneOptions>
): CanvasNode {
  const clusterOriginX =
    options.startX +
    clusterColumn * options.clusterColumns * options.horizontalGap +
    clusterColumn * options.clusterGapX
  const clusterOriginY =
    options.startY +
    clusterRow * options.clusterRows * options.verticalGap +
    clusterRow * options.clusterGapY

  return createNode(
    'group',
    {
      x: clusterOriginX - 120,
      y: clusterOriginY - 120,
      width: options.clusterColumns * options.horizontalGap - options.horizontalGap + 700,
      height: options.clusterRows * options.verticalGap - options.verticalGap + 520,
      zIndex: -10
    },
    {
      title: `Cluster ${clusterIndex + 1}`,
      subtitle: 'Large-scene performance fixture'
    }
  )
}

function createContentNode(
  index: number,
  row: number,
  column: number,
  options: Required<CanvasPerformanceSceneOptions>
): CanvasNode {
  const kind = CONTENT_NODE_SEQUENCE[index % CONTENT_NODE_SEQUENCE.length]
  const clusterColumnOffset = Math.floor(column / options.clusterColumns) * options.clusterGapX
  const clusterRowOffset = Math.floor(row / options.clusterRows) * options.clusterGapY
  const x = options.startX + column * options.horizontalGap + clusterColumnOffset
  const y = options.startY + row * options.verticalGap + clusterRowOffset

  const properties: Record<string, unknown> = {
    title: `${kind} ${index + 1}`,
    subtitle: `Grid ${row + 1}, ${column + 1}`
  }

  if (kind === 'shape') {
    const shapeTypes = ['rectangle', 'diamond', 'ellipse', 'triangle'] as const
    properties.shapeType = shapeTypes[index % shapeTypes.length]
  }

  if (kind === 'external-reference') {
    properties.url = `https://example.com/workbench/${index + 1}`
  }

  if (kind === 'media') {
    properties.alt = `Media preview ${index + 1}`
  }

  return createNode(kind, { x, y, zIndex: 1 }, properties)
}

function calculateBounds(nodes: CanvasNode[]): Rect {
  if (nodes.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const node of nodes) {
    minX = Math.min(minX, node.position.x)
    minY = Math.min(minY, node.position.y)
    maxX = Math.max(maxX, node.position.x + node.position.width)
    maxY = Math.max(maxY, node.position.y + node.position.height)
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

function incrementKindCount(
  kindCounts: Partial<Record<CanvasSceneNodeKind, number>>,
  kind: CanvasSceneNodeKind
): void {
  kindCounts[kind] = (kindCounts[kind] ?? 0) + 1
}

export function buildCanvasPerformanceScene(
  options: CanvasPerformanceSceneOptions = {}
): CanvasPerformanceSceneSeedResult {
  const resolved = resolveOptions(options)
  const nodes: CanvasNode[] = []
  const edges: CanvasEdge[] = []
  const kindCounts: Partial<Record<CanvasSceneNodeKind, number>> = {}

  if (resolved.includeGroups) {
    const clusterColumns = Math.ceil(resolved.columns / resolved.clusterColumns)
    const clusterRows = Math.ceil(resolved.rows / resolved.clusterRows)

    for (let clusterRow = 0; clusterRow < clusterRows; clusterRow += 1) {
      for (let clusterColumn = 0; clusterColumn < clusterColumns; clusterColumn += 1) {
        const clusterIndex = clusterRow * clusterColumns + clusterColumn
        const group = createClusterGroup(clusterIndex, clusterRow, clusterColumn, resolved)
        nodes.push(group)
        incrementKindCount(kindCounts, group.type as CanvasSceneNodeKind)
      }
    }
  }

  const gridNodes: CanvasNode[][] = []

  for (let row = 0; row < resolved.rows; row += 1) {
    const rowNodes: CanvasNode[] = []

    for (let column = 0; column < resolved.columns; column += 1) {
      const index = row * resolved.columns + column
      const node = createContentNode(index, row, column, resolved)
      rowNodes.push(node)
      nodes.push(node)
      incrementKindCount(kindCounts, node.type as CanvasSceneNodeKind)
    }

    gridNodes.push(rowNodes)
  }

  if (resolved.includeEdges) {
    for (let row = 0; row < gridNodes.length; row += 1) {
      const rowNodes = gridNodes[row] ?? []

      for (let column = 0; column < rowNodes.length; column += 1) {
        const node = rowNodes[column]
        if (!node) {
          continue
        }

        const rightNode = rowNodes[column + 1]
        if (rightNode && column % 2 === 0) {
          edges.push(
            createEdge(node.id, rightNode.id, {
              style: { markerEnd: 'arrow', strokeWidth: 1.25 }
            })
          )
        }

        const lowerNode = gridNodes[row + 1]?.[column]
        if (lowerNode && column % 3 === 0) {
          edges.push(
            createEdge(node.id, lowerNode.id, {
              style: { markerEnd: 'arrow', strokeDasharray: '6,6', strokeWidth: 1 }
            })
          )
        }
      }
    }
  }

  return {
    nodes,
    edges,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    bounds: calculateBounds(nodes),
    kindCounts
  }
}

export function seedCanvasPerformanceScene(
  doc: Y.Doc,
  options: CanvasPerformanceSceneOptions = {}
): CanvasPerformanceSceneSummary {
  const scene = buildCanvasPerformanceScene(options)
  const nodesMap = getCanvasObjectsMap<CanvasNode>(doc)
  const edgesMap = getCanvasConnectorsMap<CanvasEdge>(doc)
  const metadata = getCanvasMetadataMap(doc)

  doc.transact(() => {
    nodesMap.clear()
    edgesMap.clear()

    for (const node of scene.nodes) {
      nodesMap.set(node.id, node)
    }

    for (const edge of scene.edges) {
      edgesMap.set(edge.id, edge)
    }

    metadata.set('performanceScene', {
      nodeCount: scene.nodeCount,
      edgeCount: scene.edgeCount,
      kindCounts: scene.kindCounts,
      bounds: scene.bounds
    })
    metadata.set('performanceSceneSeededAt', Date.now())
  })

  return {
    nodeCount: scene.nodeCount,
    edgeCount: scene.edgeCount,
    kindCounts: scene.kindCounts,
    bounds: scene.bounds
  }
}

export function createCanvasPerformanceSceneDoc(
  id: string,
  title = 'Canvas Performance Scene',
  options: CanvasPerformanceSceneOptions = {}
): Y.Doc {
  const doc = createCanvasDoc(id, title)
  seedCanvasPerformanceScene(doc, options)
  return doc
}
