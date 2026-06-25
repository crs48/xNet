/**
 * Canvas scene builder — wraps the real `@xnetjs/canvas` constructors so a seed
 * can build a scene exercising the card kinds (page/database/media/task/
 * external-reference), frames + groups (group nodes with a `containerRole`), and
 * styled connectors across the relationship-kind vocabulary.
 *
 * Canvas docs are applied created-only, so the constructors' internal random ids
 * are fine (the scene is never re-applied).
 */

import { createEdge, createNode, type CanvasEdge, type CanvasNode } from '@xnetjs/canvas'

type Pos = { x: number; y: number; width?: number; height?: number }

/** A card embedding a seeded node (page/database/media/task/external-reference). */
export function card(
  kind: 'page' | 'database' | 'media' | 'task' | 'external-reference',
  pos: Pos,
  properties: Record<string, unknown>,
  source?: { nodeId: string; schemaId: string }
): CanvasNode {
  const node = createNode(kind, pos, properties)
  if (source) {
    node.sourceNodeId = source.nodeId
    node.sourceSchemaId = source.schemaId as CanvasNode['sourceSchemaId']
  }
  return node
}

/** A plain shape (rectangle/ellipse/diamond/…). */
export function shape(pos: Pos, title: string, shapeType: string): CanvasNode {
  return createNode('shape', pos, { title, shapeType })
}
/** A sticky note. */
export function note(pos: Pos, title: string): CanvasNode {
  return createNode('note', pos, { title })
}

function withMembers(node: CanvasNode, memberIds: string[]): CanvasNode {
  (node as { memberIds?: string[] }).memberIds = memberIds
  return node
}

/** A frame container (a group node with `containerRole: 'frame'`). */
export function frame(pos: Pos, title: string, variant: string, memberIds: string[]): CanvasNode {
  return withMembers(
    createNode('group', pos, { title, containerRole: 'frame', frameVariant: variant }),
    memberIds
  )
}

/** A non-frame group container. */
export function group(pos: Pos, title: string, memberIds: string[]): CanvasNode {
  return withMembers(createNode('group', pos, { title, containerRole: 'group' }), memberIds)
}

/** A connector with a semantic relationship + optional visual style. */
export function styledEdge(
  sourceId: string,
  targetId: string,
  relationship:
    | 'relates-to'
    | 'parent-child'
    | 'depends-on'
    | 'blocks'
    | 'references'
    | 'duplicates'
    | 'contains',
  style?: CanvasEdge['style'],
  label?: string
): CanvasEdge {
  return createEdge(sourceId, targetId, {
    relationship: { kind: relationship, direction: 'directed' },
    ...(label ? { label } : {}),
    ...(style ? { style } : {})
  })
}
