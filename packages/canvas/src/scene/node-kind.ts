import type { CanvasObjectKind } from '../types'

type CanvasNodeLike = {
  type: string
  properties?: Record<string, unknown>
}

export type CanvasResolvedNodeKind = CanvasObjectKind | 'frame' | 'legacy'

export const CANVAS_SCENE_NODE_KINDS: readonly CanvasObjectKind[] = [
  'page',
  'database',
  'external-reference',
  'media',
  'shape',
  'note',
  'group'
] as const

export function isCanvasObjectKind(type: string): type is CanvasObjectKind {
  return CANVAS_SCENE_NODE_KINDS.includes(type as CanvasObjectKind)
}

export function isFrameLikeCanvasNode(node: CanvasNodeLike): boolean {
  return (
    node.type === 'frame' || (node.type === 'group' && node.properties?.containerRole === 'frame')
  )
}

export function getCanvasResolvedNodeKind(
  node: Pick<CanvasNodeLike, 'type' | 'properties'>
): CanvasResolvedNodeKind {
  if (isFrameLikeCanvasNode(node)) {
    return 'frame'
  }

  return isCanvasObjectKind(node.type) ? node.type : 'legacy'
}
