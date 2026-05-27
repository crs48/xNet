/**
 * Mind-map branch visibility and inherited style helpers.
 */

import type { CanvasNode, CanvasNodeProperties } from '../types'
import type { CanvasMindMapNodeMetadata } from './creation'

export type CanvasMindMapBranchStyle = {
  fill?: string
  stroke?: string
  labelColor?: string
  strokeWidth?: number
  cornerRadius?: number
  edgeStroke?: string
  edgeStrokeWidth?: number
}

export type CanvasMindMapNodePropertiesUpdate = {
  id: string
  properties: CanvasNodeProperties
}

export type CanvasMindMapVisibilityState = {
  visibleNodeIds: Set<string>
  hiddenNodeIds: Set<string>
  collapsedBranchIds: Set<string>
}

const STYLE_PROPERTY_KEYS = [
  'fill',
  'stroke',
  'labelColor',
  'strokeWidth',
  'cornerRadius',
  'edgeStroke',
  'edgeStrokeWidth'
] as const satisfies readonly (keyof CanvasMindMapBranchStyle)[]

const BRANCH_DIRECTIONS = new Set(['right', 'left', 'down', 'up'])
const NODE_ROLES = new Set(['root', 'branch'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === null || value === undefined || typeof value === 'string'
}

function isStyleValue(key: keyof CanvasMindMapBranchStyle, value: unknown): boolean {
  if (key === 'strokeWidth' || key === 'cornerRadius' || key === 'edgeStrokeWidth') {
    return typeof value === 'number' && Number.isFinite(value)
  }

  return typeof value === 'string' && value.length > 0
}

function getChildrenByParentId(nodes: readonly CanvasNode[]): Map<string, CanvasNode[]> {
  const childrenByParentId = new Map<string, CanvasNode[]>()
  const nodesById = new Map(nodes.map((node) => [node.id, node]))

  for (const node of nodes) {
    const metadata = getCanvasMindMapMetadata(node)
    if (!metadata?.parentId) {
      continue
    }

    const parent = nodesById.get(metadata.parentId)
    const parentMetadata = parent ? getCanvasMindMapMetadata(parent) : null
    if (!parentMetadata || parentMetadata.mapId !== metadata.mapId) {
      continue
    }

    const siblings = childrenByParentId.get(metadata.parentId) ?? []
    siblings.push(node)
    childrenByParentId.set(metadata.parentId, siblings)
  }

  for (const siblings of childrenByParentId.values()) {
    siblings.sort((a, b) => {
      const aMetadata = getCanvasMindMapMetadata(a)
      const bMetadata = getCanvasMindMapMetadata(b)

      return (aMetadata?.index ?? 0) - (bMetadata?.index ?? 0)
    })
  }

  return childrenByParentId
}

function getCanvasMindMapAncestorChain(nodes: readonly CanvasNode[], nodeId: string): CanvasNode[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const chain: CanvasNode[] = []
  const visited = new Set<string>()
  let current = nodesById.get(nodeId)

  while (current && !visited.has(current.id)) {
    const metadata = getCanvasMindMapMetadata(current)
    if (!metadata) {
      break
    }

    visited.add(current.id)
    chain.unshift(current)
    current = metadata.parentId ? nodesById.get(metadata.parentId) : undefined
  }

  return chain
}

function getDirectCanvasMindMapBranchStyle(node: CanvasNode): CanvasMindMapBranchStyle {
  const style: CanvasMindMapBranchStyle = {}

  for (const key of STYLE_PROPERTY_KEYS) {
    const value = node.properties[key]
    if (isStyleValue(key, value)) {
      style[key] = value as never
    }
  }

  return style
}

function hasStyleEntries(style: CanvasMindMapBranchStyle): boolean {
  return STYLE_PROPERTY_KEYS.some((key) => style[key] !== undefined)
}

export function getCanvasMindMapMetadata(node: CanvasNode): CanvasMindMapNodeMetadata | null {
  const value = node.properties.mindMap
  if (!isRecord(value)) {
    return null
  }

  const { mapId, role, parentId, depth, index, direction, collapsed } = value
  if (
    typeof mapId !== 'string' ||
    !NODE_ROLES.has(String(role)) ||
    !isOptionalString(parentId) ||
    typeof depth !== 'number' ||
    typeof index !== 'number' ||
    !BRANCH_DIRECTIONS.has(String(direction)) ||
    typeof collapsed !== 'boolean'
  ) {
    return null
  }

  return value as CanvasMindMapNodeMetadata
}

export function isCanvasMindMapNode(node: CanvasNode): boolean {
  return getCanvasMindMapMetadata(node) !== null
}

export function getCanvasMindMapDescendantIds(
  nodes: readonly CanvasNode[],
  nodeId: string
): string[] {
  const childrenByParentId = getChildrenByParentId(nodes)
  const descendantIds: string[] = []
  const stack = [...(childrenByParentId.get(nodeId) ?? [])]

  while (stack.length > 0) {
    const child = stack.shift()
    if (!child) {
      continue
    }

    descendantIds.push(child.id)
    stack.unshift(...(childrenByParentId.get(child.id) ?? []))
  }

  return descendantIds
}

export function createCanvasMindMapVisibilityState(
  nodes: readonly CanvasNode[]
): CanvasMindMapVisibilityState {
  const hiddenNodeIds = new Set<string>()
  const collapsedBranchIds = new Set<string>()
  const childrenByParentId = getChildrenByParentId(nodes)
  const mindMapNodeIds = new Set(
    nodes.filter((node) => isCanvasMindMapNode(node)).map((node) => node.id)
  )

  const hideDescendants = (nodeId: string) => {
    for (const child of childrenByParentId.get(nodeId) ?? []) {
      hiddenNodeIds.add(child.id)
      hideDescendants(child.id)
    }
  }

  for (const node of nodes) {
    const metadata = getCanvasMindMapMetadata(node)
    if (!metadata?.collapsed) {
      continue
    }

    collapsedBranchIds.add(node.id)
    hideDescendants(node.id)
  }

  return {
    visibleNodeIds: new Set(
      Array.from(mindMapNodeIds).filter((nodeId) => !hiddenNodeIds.has(nodeId))
    ),
    hiddenNodeIds,
    collapsedBranchIds
  }
}

export function createCanvasMindMapCollapseUpdates(
  nodes: readonly CanvasNode[],
  nodeId: string,
  collapsed?: boolean
): CanvasMindMapNodePropertiesUpdate[] {
  const node = nodes.find((candidate) => candidate.id === nodeId)
  const metadata = node ? getCanvasMindMapMetadata(node) : null
  if (!node || !metadata) {
    return []
  }

  const nextCollapsed = collapsed ?? !metadata.collapsed

  return [
    {
      id: node.id,
      properties: {
        ...node.properties,
        mindMap: {
          ...metadata,
          collapsed: nextCollapsed
        }
      }
    }
  ]
}

export function resolveCanvasMindMapBranchStyle(
  nodes: readonly CanvasNode[],
  nodeId: string,
  defaults: CanvasMindMapBranchStyle = {}
): CanvasMindMapBranchStyle {
  return getCanvasMindMapAncestorChain(nodes, nodeId).reduce<CanvasMindMapBranchStyle>(
    (style, node) => ({
      ...style,
      ...getDirectCanvasMindMapBranchStyle(node)
    }),
    { ...defaults }
  )
}

export function createCanvasMindMapInheritedStyleMap(
  nodes: readonly CanvasNode[],
  defaults: CanvasMindMapBranchStyle = {}
): Map<string, CanvasMindMapBranchStyle> {
  const styles = new Map<string, CanvasMindMapBranchStyle>()

  for (const node of nodes) {
    if (!isCanvasMindMapNode(node)) {
      continue
    }

    const style = resolveCanvasMindMapBranchStyle(nodes, node.id, defaults)
    if (hasStyleEntries(style)) {
      styles.set(node.id, style)
    }
  }

  return styles
}

export function createCanvasMindMapInheritedStyleUpdates(
  nodes: readonly CanvasNode[],
  defaults: CanvasMindMapBranchStyle = {}
): CanvasMindMapNodePropertiesUpdate[] {
  const styles = createCanvasMindMapInheritedStyleMap(nodes, defaults)

  return nodes.flatMap((node): CanvasMindMapNodePropertiesUpdate[] => {
    const style = styles.get(node.id)
    if (!style) {
      return []
    }

    const needsUpdate = STYLE_PROPERTY_KEYS.some(
      (key) => style[key] !== undefined && node.properties[key] !== style[key]
    )
    if (!needsUpdate) {
      return []
    }

    return [
      {
        id: node.id,
        properties: {
          ...node.properties,
          ...style
        }
      }
    ]
  })
}
