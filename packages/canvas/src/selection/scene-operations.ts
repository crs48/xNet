/**
 * Scene selection operations.
 *
 * Pure helpers for dense-board arrangement and lock workflows.
 */

import type {
  CanvasAlignment,
  CanvasDistributionAxis,
  CanvasLayerDirection,
  CanvasNode,
  CanvasNodePosition,
  ResizeHandle
} from '../types'
import { createNode } from '../store'

export type CanvasPositionUpdate = {
  id: string
  position: Partial<CanvasNodePosition>
}

export type CanvasLockUpdate = {
  id: string
  locked: boolean
}

export type CanvasContainerRole = 'frame' | 'group'

export interface CreateFrameSelectionNodeOptions {
  title?: string
  padding?: number
}

const DEFAULT_FRAME_PADDING = 48
const DEFAULT_FRAME_TITLE = 'Frame'
const DEFAULT_MIN_NODE_WIDTH = 96
const DEFAULT_MIN_NODE_HEIGHT = 72

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

function roundPosition(value: number): number {
  return Math.round(value)
}

function getNodeCenter(node: CanvasNode): { x: number; y: number } {
  return {
    x: node.position.x + node.position.width / 2,
    y: node.position.y + node.position.height / 2
  }
}

export function sortNodesByVisualOrder(nodes: CanvasNode[]): CanvasNode[] {
  return [...nodes].sort((left, right) => {
    if (left.position.y !== right.position.y) {
      return left.position.y - right.position.y
    }

    if (left.position.x !== right.position.x) {
      return left.position.x - right.position.x
    }

    return left.id.localeCompare(right.id)
  })
}

export function getSelectionBounds(nodes: CanvasNode[]): CanvasNodePosition | null {
  if (nodes.length === 0) {
    return null
  }

  const minX = Math.min(...nodes.map((node) => node.position.x))
  const minY = Math.min(...nodes.map((node) => node.position.y))
  const maxX = Math.max(...nodes.map((node) => node.position.x + node.position.width))
  const maxY = Math.max(...nodes.map((node) => node.position.y + node.position.height))

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

export function getUnlockedSelection(nodes: CanvasNode[]): CanvasNode[] {
  return nodes.filter((node) => !node.locked)
}

export function getCanvasContainerRole(node: CanvasNode): CanvasContainerRole | null {
  if (node.type === 'frame') {
    return 'frame'
  }

  if (node.type !== 'group') {
    return null
  }

  return node.properties.containerRole === 'group' ? 'group' : 'frame'
}

export function isCanvasContainerNode(node: CanvasNode): boolean {
  return getCanvasContainerRole(node) !== null
}

export function getCanvasContainerMemberIds(node: CanvasNode): string[] {
  if (!isCanvasContainerNode(node)) {
    return []
  }

  return isStringArray(node.properties.memberIds) ? node.properties.memberIds : []
}

export function getSelectionLockState(nodes: CanvasNode[]): {
  anyLocked: boolean
  allLocked: boolean
  nextLocked: boolean
} {
  const anyLocked = nodes.some((node) => node.locked === true)
  const allLocked = nodes.length > 0 && nodes.every((node) => node.locked === true)

  return {
    anyLocked,
    allLocked,
    nextLocked: !allLocked
  }
}

export function createLockUpdates(nodes: CanvasNode[], forcedLocked?: boolean): CanvasLockUpdate[] {
  if (nodes.length === 0) {
    return []
  }

  const targetLocked = forcedLocked ?? getSelectionLockState(nodes).nextLocked
  return nodes
    .filter((node) => node.locked !== targetLocked)
    .map((node) => ({
      id: node.id,
      locked: targetLocked
    }))
}

export function createAlignmentUpdates(
  nodes: CanvasNode[],
  alignment: CanvasAlignment
): CanvasPositionUpdate[] {
  if (nodes.length < 2) {
    return []
  }

  const bounds = getSelectionBounds(nodes)
  if (!bounds) {
    return []
  }

  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  const maxRight = bounds.x + bounds.width
  const maxBottom = bounds.y + bounds.height

  return nodes.map((node) => {
    switch (alignment) {
      case 'left':
        return { id: node.id, position: { x: roundPosition(bounds.x) } }
      case 'center':
        return {
          id: node.id,
          position: { x: roundPosition(centerX - node.position.width / 2) }
        }
      case 'right':
        return {
          id: node.id,
          position: { x: roundPosition(maxRight - node.position.width) }
        }
      case 'top':
        return { id: node.id, position: { y: roundPosition(bounds.y) } }
      case 'middle':
        return {
          id: node.id,
          position: { y: roundPosition(centerY - node.position.height / 2) }
        }
      case 'bottom':
        return {
          id: node.id,
          position: { y: roundPosition(maxBottom - node.position.height) }
        }
    }
  })
}

export function createDistributionUpdates(
  nodes: CanvasNode[],
  axis: CanvasDistributionAxis
): CanvasPositionUpdate[] {
  if (nodes.length < 3) {
    return []
  }

  const ordered = [...nodes].sort((left, right) =>
    axis === 'horizontal' ? left.position.x - right.position.x : left.position.y - right.position.y
  )

  const first = ordered[0]
  const last = ordered[ordered.length - 1]

  if (!first || !last) {
    return []
  }

  if (axis === 'horizontal') {
    const span =
      last.position.x +
      last.position.width -
      first.position.x -
      ordered.reduce((sum, node) => sum + node.position.width, 0)
    const gap = span / (ordered.length - 1)

    let cursor = first.position.x + first.position.width + gap
    return ordered.slice(1, -1).map((node) => {
      const update = {
        id: node.id,
        position: {
          x: roundPosition(cursor)
        }
      }
      cursor += node.position.width + gap
      return update
    })
  }

  const span =
    last.position.y +
    last.position.height -
    first.position.y -
    ordered.reduce((sum, node) => sum + node.position.height, 0)
  const gap = span / (ordered.length - 1)

  let cursor = first.position.y + first.position.height + gap
  return ordered.slice(1, -1).map((node) => {
    const update = {
      id: node.id,
      position: {
        y: roundPosition(cursor)
      }
    }
    cursor += node.position.height + gap
    return update
  })
}

export function createTidySelectionUpdates(
  nodes: CanvasNode[],
  spacing = 48
): CanvasPositionUpdate[] {
  if (nodes.length < 2) {
    return []
  }

  const bounds = getSelectionBounds(nodes)
  if (!bounds) {
    return []
  }

  const ordered = sortNodesByVisualOrder(nodes)
  const columns = Math.max(1, Math.ceil(Math.sqrt(ordered.length)))
  const maxWidth = Math.max(...ordered.map((node) => node.position.width))
  const maxHeight = Math.max(...ordered.map((node) => node.position.height))
  const cellWidth = maxWidth + spacing
  const cellHeight = maxHeight + spacing

  return ordered.map((node, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    return {
      id: node.id,
      position: {
        x: roundPosition(bounds.x + column * cellWidth),
        y: roundPosition(bounds.y + row * cellHeight)
      }
    }
  })
}

export function createLayerShiftUpdates(
  nodes: CanvasNode[],
  direction: CanvasLayerDirection
): CanvasPositionUpdate[] {
  if (nodes.length === 0) {
    return []
  }

  return nodes.map((node) => {
    const currentZIndex = node.position.zIndex ?? 0
    const nextZIndex = direction === 'forward' ? currentZIndex + 1 : Math.max(0, currentZIndex - 1)

    return {
      id: node.id,
      position: {
        zIndex: nextZIndex
      }
    }
  })
}

export function createResizeUpdate(
  node: CanvasNode,
  handle: ResizeHandle,
  delta: { x: number; y: number },
  options: {
    minWidth?: number
    minHeight?: number
  } = {}
): CanvasPositionUpdate {
  const minWidth = options.minWidth ?? DEFAULT_MIN_NODE_WIDTH
  const minHeight = options.minHeight ?? DEFAULT_MIN_NODE_HEIGHT
  const initial = node.position

  let nextX = initial.x
  let nextY = initial.y
  let nextWidth = initial.width
  let nextHeight = initial.height

  const touchesLeft = handle === 'left' || handle === 'top-left' || handle === 'bottom-left'
  const touchesRight = handle === 'right' || handle === 'top-right' || handle === 'bottom-right'
  const touchesTop = handle === 'top' || handle === 'top-left' || handle === 'top-right'
  const touchesBottom = handle === 'bottom' || handle === 'bottom-left' || handle === 'bottom-right'

  if (touchesLeft) {
    nextWidth = Math.max(minWidth, initial.width - delta.x)
    nextX = roundPosition(initial.x + (initial.width - nextWidth))
  } else if (touchesRight) {
    nextWidth = Math.max(minWidth, initial.width + delta.x)
  }

  if (touchesTop) {
    nextHeight = Math.max(minHeight, initial.height - delta.y)
    nextY = roundPosition(initial.y + (initial.height - nextHeight))
  } else if (touchesBottom) {
    nextHeight = Math.max(minHeight, initial.height + delta.y)
  }

  return {
    id: node.id,
    position: {
      x: nextX,
      y: nextY,
      width: roundPosition(nextWidth),
      height: roundPosition(nextHeight)
    }
  }
}

export function expandContainerPositionUpdates(
  nodesById: Map<string, CanvasNode>,
  updates: CanvasPositionUpdate[]
): CanvasPositionUpdate[] {
  if (updates.length === 0) {
    return []
  }

  const resolved = new Map<string, CanvasPositionUpdate>(
    updates.map((update) => [update.id, update] as const)
  )
  const queue = [...updates]

  while (queue.length > 0) {
    const update = queue.shift()
    if (!update) {
      continue
    }

    const containerNode = nodesById.get(update.id)
    if (!containerNode) {
      continue
    }

    const memberIds = getCanvasContainerMemberIds(containerNode)
    if (memberIds.length === 0) {
      continue
    }

    const currentZIndex = containerNode.position.zIndex ?? 0
    const deltaX =
      update.position.x !== undefined ? update.position.x - containerNode.position.x : 0
    const deltaY =
      update.position.y !== undefined ? update.position.y - containerNode.position.y : 0
    const deltaZ = update.position.zIndex !== undefined ? update.position.zIndex - currentZIndex : 0

    if (deltaX === 0 && deltaY === 0 && deltaZ === 0) {
      continue
    }

    for (const memberId of memberIds) {
      if (resolved.has(memberId)) {
        continue
      }

      const memberNode = nodesById.get(memberId)
      if (!memberNode) {
        continue
      }

      const position: Partial<CanvasNodePosition> = {}

      if (update.position.x !== undefined) {
        position.x = roundPosition(memberNode.position.x + deltaX)
      }

      if (update.position.y !== undefined) {
        position.y = roundPosition(memberNode.position.y + deltaY)
      }

      if (update.position.zIndex !== undefined) {
        position.zIndex = Math.max(0, (memberNode.position.zIndex ?? 0) + deltaZ)
      }

      const memberUpdate = {
        id: memberId,
        position
      }

      resolved.set(memberId, memberUpdate)

      if (isCanvasContainerNode(memberNode)) {
        queue.push(memberUpdate)
      }
    }
  }

  return Array.from(resolved.values())
}

export function createFrameSelectionNode(
  nodes: CanvasNode[],
  options: CreateFrameSelectionNodeOptions = {}
): CanvasNode | null {
  const bounds = getSelectionBounds(nodes)
  if (!bounds) {
    return null
  }

  const padding = options.padding ?? DEFAULT_FRAME_PADDING
  const memberIds = Array.from(new Set(nodes.map((node) => node.id)))
  const minZIndex = Math.min(...nodes.map((node) => node.position.zIndex ?? 0))
  const title = options.title?.trim() || DEFAULT_FRAME_TITLE

  return createNode(
    'group',
    {
      x: roundPosition(bounds.x - padding),
      y: roundPosition(bounds.y - padding),
      width: roundPosition(bounds.width + padding * 2),
      height: roundPosition(bounds.height + padding * 2),
      zIndex: Math.max(0, minZIndex - 1)
    },
    {
      title,
      containerRole: 'frame',
      memberIds,
      memberCount: memberIds.length
    }
  )
}

export function createAnchorSummary(nodes: CanvasNode[]): {
  minX: number
  maxX: number
  minY: number
  maxY: number
  centerX: number
  centerY: number
} | null {
  const bounds = getSelectionBounds(nodes)
  if (!bounds) {
    return null
  }

  return {
    minX: bounds.x,
    maxX: bounds.x + bounds.width,
    minY: bounds.y,
    maxY: bounds.y + bounds.height,
    centerX: bounds.x + bounds.width / 2,
    centerY: bounds.y + bounds.height / 2
  }
}

export function createNodeSnapshot(nodes: CanvasNode[]): Array<{
  id: string
  x: number
  y: number
  centerX: number
  centerY: number
}> {
  return nodes.map((node) => {
    const center = getNodeCenter(node)
    return {
      id: node.id,
      x: node.position.x,
      y: node.position.y,
      centerX: center.x,
      centerY: center.y
    }
  })
}
