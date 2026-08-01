/**
 * Placing a projected social graph on a canvas (exploration 0419).
 *
 * ## Resolving the duplication
 *
 * Two functions looked like the same thing and were not:
 *
 * - `createSavedViewCanvasProjectionNodes` (`@xnetjs/react`) **extracts** — it
 *   turns rendered previews into `{ id, schemaId, kind, title, … }` node
 *   inputs. It knows about previews and nothing about geometry.
 * - `createSocialCanvasProjectionPlan` (`@xnetjs/social`) **lays out** — it
 *   takes those inputs plus edges and produces positioned, source-backed
 *   drafts with connectors, bounded by node and edge caps. It knows about
 *   geometry and nothing about previews.
 *
 * They compose; neither was redundant. What was missing was this file — the
 * step that writes a plan into a canvas document, which is why the layout half
 * had no caller for so long.
 *
 * ## Idempotence
 *
 * Plan ids are deterministic in the lens and the source node, so projecting
 * the same lens twice overwrites the same objects rather than stacking a
 * second copy on top of the first.
 */

import type { CanvasEdge, CanvasNode } from '@xnetjs/canvas'
import type { SocialCanvasProjectionPlan } from '@xnetjs/social/projection'
import type * as Y from 'yjs'
import { getCanvasConnectorsMap, getCanvasObjectsMap } from '@xnetjs/canvas'

export type ApplySocialCanvasProjectionResult = {
  /** Objects written. */
  nodeCount: number
  /** Connectors written. */
  edgeCount: number
  /** Nodes the plan's cap left out of the projection. */
  omittedNodeCount: number
  /** Edges the plan's cap left out. */
  omittedEdgeCount: number
  /** Ids of the objects written, for selection. */
  objectIds: string[]
}

/**
 * Write a projection plan into a canvas document.
 *
 * The whole plan lands in one transaction, so the canvas never renders a
 * half-placed graph and undo treats the projection as a single act.
 *
 * The result reports what the plan's caps dropped. A caller that ignores those
 * numbers is showing the user a partial graph as if it were the whole one.
 */
export function applySocialCanvasProjectionPlan(
  doc: Y.Doc,
  plan: SocialCanvasProjectionPlan,
  options: { origin?: { x: number; y: number } } = {}
): ApplySocialCanvasProjectionResult {
  const originX = options.origin?.x ?? 0
  const originY = options.origin?.y ?? 0
  const objects = getCanvasObjectsMap<CanvasNode>(doc)
  const connectors = getCanvasConnectorsMap<CanvasEdge>(doc)

  const nodes: CanvasNode[] = plan.nodes.map((draft) => ({
    id: draft.id,
    type: draft.type,
    position: {
      x: originX + draft.position.x,
      y: originY + draft.position.y,
      width: draft.position.width,
      height: draft.position.height,
      zIndex: draft.position.zIndex
    },
    properties: {
      ...draft.properties,
      sourceNodeId: draft.sourceNodeId,
      sourceSchemaId: draft.sourceSchemaId
    },
    locked: draft.locked
  })) as CanvasNode[]

  const edges: CanvasEdge[] = plan.edges.map((draft) => ({
    id: draft.id,
    sourceId: draft.sourceId,
    targetId: draft.targetId,
    source: { objectId: draft.source.objectId, placement: draft.source.placement },
    target: { objectId: draft.target.objectId, placement: draft.target.placement },
    ...(draft.label ? { label: draft.label } : {}),
    relationship: draft.relationship
  })) as CanvasEdge[]

  doc.transact(() => {
    for (const node of nodes) objects.set(node.id, node)
    for (const edge of edges) connectors.set(edge.id, edge)
  })

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    omittedNodeCount: plan.omittedNodeCount,
    omittedEdgeCount: plan.omittedEdgeCount,
    objectIds: nodes.map((node) => node.id)
  }
}

/**
 * A one-line account of what landed, naming anything the caps dropped.
 *
 * Bounded projection is the right default on a canvas — 10 000 cards is not a
 * view of anything — but the bound has to be visible, or the board silently
 * misrepresents the library it came from.
 */
export function describeSocialCanvasProjection(result: ApplySocialCanvasProjectionResult): string {
  const parts = [`${result.nodeCount} cards`, `${result.edgeCount} connections`]
  if (result.omittedNodeCount > 0) parts.push(`${result.omittedNodeCount} more not shown`)
  if (result.omittedEdgeCount > 0) {
    parts.push(`${result.omittedEdgeCount} connections not shown`)
  }
  return `Projected ${parts.join(', ')}.`
}
