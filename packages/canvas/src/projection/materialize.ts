/**
 * Generic canvas projection materialization helpers.
 */

import type {
  CanvasEdge,
  CanvasEdgeEndpoint,
  CanvasEdgeRelationship,
  CanvasNode,
  CanvasNodePosition,
  CanvasNodeProperties,
  CanvasNodeType
} from '../types'
import { normalizeCanvasEdgeBindings } from '../edges/bindings'

export type CanvasProjectionNodeDraft = {
  id: string
  type: CanvasNodeType
  sourceNodeId?: string
  sourceSchemaId?: string
  linkedNodeId?: string
  alias?: string
  locked?: boolean
  position: CanvasNodePosition
  properties: CanvasNodeProperties
}

export type CanvasProjectionEdgeDraft = {
  id: string
  sourceId: string
  targetId: string
  source?: CanvasEdgeEndpoint
  target?: CanvasEdgeEndpoint
  label?: string
  relationship?: CanvasEdgeRelationship
}

export type CanvasProjectionPlanLike = {
  nodes: readonly CanvasProjectionNodeDraft[]
  edges?: readonly CanvasProjectionEdgeDraft[]
}

export type MaterializedCanvasProjection = {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

function materializeCanvasProjectionNode(draft: CanvasProjectionNodeDraft): CanvasNode {
  return {
    id: draft.id,
    type: draft.type,
    position: {
      ...draft.position
    },
    properties: {
      ...draft.properties
    },
    ...(draft.sourceNodeId ? { sourceNodeId: draft.sourceNodeId } : {}),
    ...(draft.sourceSchemaId ? { sourceSchemaId: draft.sourceSchemaId } : {}),
    ...(draft.linkedNodeId ? { linkedNodeId: draft.linkedNodeId } : {}),
    ...(draft.alias ? { alias: draft.alias } : {}),
    ...(draft.locked !== undefined ? { locked: draft.locked } : {})
  } as CanvasNode
}

function materializeCanvasProjectionEdge(
  draft: CanvasProjectionEdgeDraft,
  nodesById: ReadonlyMap<string, CanvasNode>
): CanvasEdge {
  return normalizeCanvasEdgeBindings(
    {
      id: draft.id,
      sourceId: draft.sourceId,
      targetId: draft.targetId,
      ...(draft.source ? { source: draft.source } : {}),
      ...(draft.target ? { target: draft.target } : {}),
      ...(draft.label ? { label: draft.label } : {}),
      ...(draft.relationship ? { relationship: draft.relationship } : {})
    },
    {
      sourceNode: nodesById.get(draft.sourceId),
      targetNode: nodesById.get(draft.targetId)
    }
  )
}

export function materializeCanvasProjectionPlan(
  plan: CanvasProjectionPlanLike
): MaterializedCanvasProjection {
  const nodes = plan.nodes.map(materializeCanvasProjectionNode)
  const nodesById = new Map(nodes.map((node) => [node.id, node] as const))
  const edges = (plan.edges ?? []).map((edge) => materializeCanvasProjectionEdge(edge, nodesById))

  return {
    nodes,
    edges
  }
}
