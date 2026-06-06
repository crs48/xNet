/**
 * Bounded canvas projection drafts for social graph lenses.
 */

import { createSocialNodeId } from '../import/ids'

export type SocialProjectionNodeKind =
  | 'actor'
  | 'content'
  | 'interaction'
  | 'conversation'
  | 'message'
  | 'collection'
  | 'collection-item'
  | 'source-record'

export type SocialProjectionRelationshipKind =
  | 'follows'
  | 'saved'
  | 'authored'
  | 'participated'
  | 'referenced'
  | 'cited'
  | 'contains'
  | 'related'

export type SocialProjectionNodeInput = {
  id: string
  schemaId: string
  kind: SocialProjectionNodeKind
  title?: string
  subtitle?: string
  platform?: string
  privacyClass?: string
  groupKey?: string
}

export type SocialProjectionEdgeInput = {
  id?: string
  sourceId: string
  targetId: string
  relationshipKind: SocialProjectionRelationshipKind
  label?: string
}

export type SocialCanvasNodeDraft = {
  id: string
  type: 'note'
  sourceNodeId: string
  sourceSchemaId: string
  locked: boolean
  position: {
    x: number
    y: number
    width: number
    height: number
    zIndex: number
  }
  properties: {
    title: string
    subtitle?: string
    socialKind: SocialProjectionNodeKind
    platform?: string
    privacyClass?: string
    groupKey?: string
  }
}

export type SocialCanvasEdgeDraft = {
  id: string
  sourceId: string
  targetId: string
  source: { objectId: string; placement: 'right' }
  target: { objectId: string; placement: 'left' }
  label?: string
  relationship: {
    kind: 'references' | 'contains' | 'relates-to'
    direction: 'directed'
    label?: string
    sourceRole: SocialProjectionNodeKind
    targetRole: SocialProjectionNodeKind
    properties: {
      socialRelationshipKind: SocialProjectionRelationshipKind
      sourceNodeId: string
      targetNodeId: string
    }
  }
}

export type SocialCanvasProjectionPlan = {
  commandId: 'social.canvasProjection.create'
  title: string
  lensId?: string
  nodeCount: number
  edgeCount: number
  omittedNodeCount: number
  omittedEdgeCount: number
  bounds: {
    x: number
    y: number
    width: number
    height: number
  }
  nodes: SocialCanvasNodeDraft[]
  edges: SocialCanvasEdgeDraft[]
}

export type SocialCanvasProjectionOptions = {
  title: string
  lensId?: string
  maxNodes?: number
  maxEdges?: number
  nodeWidth?: number
  nodeHeight?: number
  gapX?: number
  gapY?: number
  columns?: number
}

const DEFAULT_MAX_NODES = 75
const DEFAULT_MAX_EDGES = 200
const DEFAULT_NODE_WIDTH = 260
const DEFAULT_NODE_HEIGHT = 132
const DEFAULT_GAP_X = 96
const DEFAULT_GAP_Y = 72

function nodeTitle(node: SocialProjectionNodeInput): string {
  const fallback = `${node.kind} ${node.id.slice(0, 8)}`
  return node.title?.trim() || fallback
}

function relationshipKindForCanvas(
  relationshipKind: SocialProjectionRelationshipKind
): SocialCanvasEdgeDraft['relationship']['kind'] {
  if (relationshipKind === 'contains') return 'contains'
  if (relationshipKind === 'referenced' || relationshipKind === 'cited') return 'references'
  return 'relates-to'
}

/**
 * Build a bounded, source-backed canvas projection plan from resolved lens records.
 */
export function createSocialCanvasProjectionPlan(input: {
  nodes: readonly SocialProjectionNodeInput[]
  edges?: readonly SocialProjectionEdgeInput[]
  options: SocialCanvasProjectionOptions
}): SocialCanvasProjectionPlan {
  const maxNodes = input.options.maxNodes ?? DEFAULT_MAX_NODES
  const maxEdges = input.options.maxEdges ?? DEFAULT_MAX_EDGES
  const nodeWidth = input.options.nodeWidth ?? DEFAULT_NODE_WIDTH
  const nodeHeight = input.options.nodeHeight ?? DEFAULT_NODE_HEIGHT
  const gapX = input.options.gapX ?? DEFAULT_GAP_X
  const gapY = input.options.gapY ?? DEFAULT_GAP_Y
  const selectedNodes = input.nodes.slice(0, maxNodes)
  const selectedNodeIds = new Set(selectedNodes.map((node) => node.id))
  const columns =
    input.options.columns ?? Math.max(1, Math.ceil(Math.sqrt(Math.max(selectedNodes.length, 1))))

  const nodes = selectedNodes.map<SocialCanvasNodeDraft>((node, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)

    return {
      id: createSocialNodeId('canvas-node', [input.options.lensId, node.id]),
      type: 'note',
      sourceNodeId: node.id,
      sourceSchemaId: node.schemaId,
      locked: false,
      position: {
        x: column * (nodeWidth + gapX),
        y: row * (nodeHeight + gapY),
        width: nodeWidth,
        height: nodeHeight,
        zIndex: index
      },
      properties: {
        title: nodeTitle(node),
        ...(node.subtitle ? { subtitle: node.subtitle } : {}),
        socialKind: node.kind,
        ...(node.platform ? { platform: node.platform } : {}),
        ...(node.privacyClass ? { privacyClass: node.privacyClass } : {}),
        ...(node.groupKey ? { groupKey: node.groupKey } : {})
      }
    }
  })

  const canvasNodeIdBySourceId = new Map(nodes.map((node) => [node.sourceNodeId, node.id]))
  const nodeKindBySourceId = new Map(selectedNodes.map((node) => [node.id, node.kind]))
  const candidateEdges = (input.edges ?? []).filter(
    (edge) => selectedNodeIds.has(edge.sourceId) && selectedNodeIds.has(edge.targetId)
  )
  const edges = candidateEdges.slice(0, maxEdges).map<SocialCanvasEdgeDraft>((edge) => {
    const sourceId = canvasNodeIdBySourceId.get(edge.sourceId) ?? edge.sourceId
    const targetId = canvasNodeIdBySourceId.get(edge.targetId) ?? edge.targetId
    const label = edge.label ?? edge.relationshipKind

    return {
      id:
        edge.id ??
        createSocialNodeId('canvas-edge', [
          input.options.lensId,
          edge.sourceId,
          edge.targetId,
          edge.relationshipKind
        ]),
      sourceId,
      targetId,
      source: { objectId: sourceId, placement: 'right' },
      target: { objectId: targetId, placement: 'left' },
      label,
      relationship: {
        kind: relationshipKindForCanvas(edge.relationshipKind),
        direction: 'directed',
        label,
        sourceRole: nodeKindBySourceId.get(edge.sourceId) ?? 'source-record',
        targetRole: nodeKindBySourceId.get(edge.targetId) ?? 'source-record',
        properties: {
          socialRelationshipKind: edge.relationshipKind,
          sourceNodeId: edge.sourceId,
          targetNodeId: edge.targetId
        }
      }
    }
  })

  const rowCount = Math.ceil(nodes.length / columns)
  const bounds = {
    x: 0,
    y: 0,
    width: nodes.length === 0 ? 0 : columns * nodeWidth + Math.max(0, columns - 1) * gapX,
    height: nodes.length === 0 ? 0 : rowCount * nodeHeight + Math.max(0, rowCount - 1) * gapY
  }

  return {
    commandId: 'social.canvasProjection.create',
    title: input.options.title,
    ...(input.options.lensId ? { lensId: input.options.lensId } : {}),
    nodeCount: nodes.length,
    edgeCount: edges.length,
    omittedNodeCount: Math.max(0, input.nodes.length - nodes.length),
    omittedEdgeCount: Math.max(0, candidateEdges.length - edges.length),
    bounds,
    nodes,
    edges
  }
}
