/**
 * Mind-map creation helpers for canvas objects and keyboard workflows.
 */

import type { Rect, ShapeType } from '../types'

export type CanvasMindMapNodeRole = 'root' | 'branch'

export type CanvasMindMapBranchDirection = 'right' | 'left' | 'down' | 'up'

export type CanvasMindMapKeyboardIntent =
  | 'create-root'
  | 'create-child'
  | 'create-sibling'
  | 'focus-parent'
  | 'focus-previous-sibling'
  | 'focus-next-sibling'

export type CanvasMindMapKeyboardEventLike = Pick<
  KeyboardEvent,
  'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'
>

export type CanvasMindMapCreationTool = {
  id: 'mind-map'
  label: 'Mind map'
  objectKind: 'shape'
  shapeType: Extract<ShapeType, 'rounded-rectangle'>
  rootRect: Pick<Rect, 'width' | 'height'>
  branchRect: Pick<Rect, 'width' | 'height'>
  shortcuts: readonly string[]
}

export type CanvasMindMapNodeMetadata = {
  mapId: string
  role: CanvasMindMapNodeRole
  parentId: string | null
  depth: number
  index: number
  direction: CanvasMindMapBranchDirection
  collapsed: boolean
}

export type CanvasMindMapNodeProperties = {
  title: string
  label: string
  shapeType: Extract<ShapeType, 'rounded-rectangle'>
  mindMap: CanvasMindMapNodeMetadata
}

export type CreateCanvasMindMapRootPropertiesInput = {
  title?: string
  mapId?: string
  direction?: CanvasMindMapBranchDirection
}

export type CreateCanvasMindMapBranchPropertiesInput = {
  title?: string
  mapId: string
  parentId: string
  depth: number
  index?: number
  direction?: CanvasMindMapBranchDirection
}

const DEFAULT_MIND_MAP_TITLE = 'Mind map'
const DEFAULT_BRANCH_TITLE = 'Branch'

export const CANVAS_MIND_MAP_CREATION_TOOL: CanvasMindMapCreationTool = {
  id: 'mind-map',
  label: 'Mind map',
  objectKind: 'shape',
  shapeType: 'rounded-rectangle',
  rootRect: {
    width: 280,
    height: 120
  },
  branchRect: {
    width: 220,
    height: 88
  },
  shortcuts: ['M', 'Tab', 'Enter', 'Shift+Tab', 'ArrowUp', 'ArrowDown']
}

function createMindMapId(): string {
  return `mindmap_${crypto.randomUUID()}`
}

function normalizeTitle(value: string | null | undefined, fallback: string): string {
  const title = value?.trim()
  return title ? title : fallback
}

export function createCanvasMindMapRootProperties(
  input: CreateCanvasMindMapRootPropertiesInput = {}
): CanvasMindMapNodeProperties {
  const title = normalizeTitle(input.title, DEFAULT_MIND_MAP_TITLE)

  return {
    title,
    label: title,
    shapeType: CANVAS_MIND_MAP_CREATION_TOOL.shapeType,
    mindMap: {
      mapId: input.mapId ?? createMindMapId(),
      role: 'root',
      parentId: null,
      depth: 0,
      index: 0,
      direction: input.direction ?? 'right',
      collapsed: false
    }
  }
}

export function createCanvasMindMapBranchProperties(
  input: CreateCanvasMindMapBranchPropertiesInput
): CanvasMindMapNodeProperties {
  const title = normalizeTitle(input.title, DEFAULT_BRANCH_TITLE)

  return {
    title,
    label: title,
    shapeType: CANVAS_MIND_MAP_CREATION_TOOL.shapeType,
    mindMap: {
      mapId: input.mapId,
      role: 'branch',
      parentId: input.parentId,
      depth: Math.max(1, input.depth),
      index: input.index ?? 0,
      direction: input.direction ?? 'right',
      collapsed: false
    }
  }
}

export function getCanvasMindMapKeyboardIntent(
  event: CanvasMindMapKeyboardEventLike
): CanvasMindMapKeyboardIntent | null {
  const key = event.key.toLowerCase()
  const isMod = event.metaKey || event.ctrlKey

  if (isMod || event.altKey) {
    return null
  }

  if (!event.shiftKey && key === 'm') {
    return 'create-root'
  }

  if (!event.shiftKey && key === 'tab') {
    return 'create-child'
  }

  if (event.shiftKey && key === 'tab') {
    return 'focus-parent'
  }

  if (!event.shiftKey && key === 'enter') {
    return 'create-sibling'
  }

  if (!event.shiftKey && key === 'arrowup') {
    return 'focus-previous-sibling'
  }

  if (!event.shiftKey && key === 'arrowdown') {
    return 'focus-next-sibling'
  }

  return null
}
