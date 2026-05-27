/**
 * Mind-map tree layout helpers backed by the canvas layout worker.
 */

import type { CanvasPositionUpdate } from '../selection/scene-operations'
import type { Point } from '../types'
import {
  createLayoutManager,
  type LayoutEdge,
  type LayoutManager,
  type LayoutNode,
  type LayoutRequest
} from '../workers'

export type CanvasMindMapTreeLayoutDirection = 'right' | 'left' | 'down' | 'up'

export type CanvasMindMapTreeLayoutOptions = {
  direction?: CanvasMindMapTreeLayoutDirection
  siblingGap?: number
  levelGap?: number
  options?: Record<string, string>
}

export type CanvasMindMapTreeLayoutInput = CanvasMindMapTreeLayoutOptions & {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
}

export type LayoutCanvasMindMapTreeInput = CanvasMindMapTreeLayoutInput & {
  manager?: LayoutManager
  useWorker?: boolean
  anchorNodeId?: string
  roundPositions?: boolean
}

export type CanvasMindMapTreePositionUpdatesInput = {
  nodes: LayoutNode[]
  positions: Map<string, Point>
  anchorNodeId?: string
  roundPositions?: boolean
}

export type CanvasMindMapTreeLayoutResult = {
  request: LayoutRequest
  positions: Map<string, Point>
  positionUpdates: CanvasPositionUpdate[]
}

export const CANVAS_MIND_MAP_TREE_LAYOUT_DEFAULTS = {
  direction: 'right',
  siblingGap: 48,
  levelGap: 112
} as const

const ELK_DIRECTION_BY_MIND_MAP_DIRECTION: Record<CanvasMindMapTreeLayoutDirection, string> = {
  right: 'RIGHT',
  left: 'LEFT',
  down: 'DOWN',
  up: 'UP'
}

function normalizeGap(value: number | undefined, fallback: number): string {
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    return String(fallback)
  }

  return String(Math.round(value))
}

function normalizePosition(value: number, roundPositions: boolean): number {
  return roundPositions ? Math.round(value) : value
}

export function createCanvasMindMapTreeLayoutRequest(
  input: CanvasMindMapTreeLayoutInput
): LayoutRequest {
  const direction: CanvasMindMapTreeLayoutDirection =
    input.direction ?? CANVAS_MIND_MAP_TREE_LAYOUT_DEFAULTS.direction
  const siblingGap = normalizeGap(input.siblingGap, CANVAS_MIND_MAP_TREE_LAYOUT_DEFAULTS.siblingGap)
  const levelGap = normalizeGap(input.levelGap, CANVAS_MIND_MAP_TREE_LAYOUT_DEFAULTS.levelGap)

  return {
    nodes: input.nodes.map((node) => ({ ...node, position: { ...node.position } })),
    edges: input.edges.map((edge) => ({ ...edge })),
    algorithm: 'tree',
    options: {
      'elk.direction': ELK_DIRECTION_BY_MIND_MAP_DIRECTION[direction],
      'elk.spacing.nodeNode': siblingGap,
      'elk.layered.spacing.nodeNodeBetweenLayers': levelGap,
      ...input.options
    }
  }
}

export function createCanvasMindMapTreePositionUpdates(
  input: CanvasMindMapTreePositionUpdatesInput
): CanvasPositionUpdate[] {
  const roundPositions = input.roundPositions ?? true
  const nodesById = new Map(input.nodes.map((node) => [node.id, node]))
  const anchorNode = input.anchorNodeId ? nodesById.get(input.anchorNodeId) : undefined
  const anchorLayoutPosition = anchorNode ? input.positions.get(anchorNode.id) : undefined
  const offset =
    anchorNode && anchorLayoutPosition
      ? {
          x: anchorNode.position.x - anchorLayoutPosition.x,
          y: anchorNode.position.y - anchorLayoutPosition.y
        }
      : { x: 0, y: 0 }

  return input.nodes.flatMap((node): CanvasPositionUpdate[] => {
    const layoutPosition = input.positions.get(node.id)
    if (!layoutPosition) {
      return []
    }

    return [
      {
        id: node.id,
        position: {
          x: normalizePosition(layoutPosition.x + offset.x, roundPositions),
          y: normalizePosition(layoutPosition.y + offset.y, roundPositions)
        }
      }
    ]
  })
}

export async function layoutCanvasMindMapTree(
  input: LayoutCanvasMindMapTreeInput
): Promise<CanvasMindMapTreeLayoutResult> {
  const request = createCanvasMindMapTreeLayoutRequest(input)
  const manager = input.manager ?? createLayoutManager({ useWorker: input.useWorker ?? true })
  const ownsManager = input.manager === undefined

  try {
    const positions = await manager.layout(request)

    return {
      request,
      positions,
      positionUpdates: createCanvasMindMapTreePositionUpdates({
        nodes: request.nodes,
        positions,
        anchorNodeId: input.anchorNodeId,
        roundPositions: input.roundPositions
      })
    }
  } finally {
    if (ownsManager) {
      manager.terminate()
    }
  }
}
