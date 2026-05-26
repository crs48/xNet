/**
 * Semantic relationship helpers for canvas connectors.
 */

import type {
  CanvasEdge,
  CanvasEdgeRelationship,
  CanvasEdgeRelationshipDirection,
  CanvasEdgeRelationshipKind
} from '../types'
import { getCanvasEdgeNodeIds } from './bindings'

export type CanvasConnectorRecordKind = 'line' | 'reference' | 'dependency'

export type CanvasSemanticRelationshipRecord = {
  id: string
  sourceObjectId: string
  targetObjectId: string
  kind: CanvasEdgeRelationshipKind
  direction: CanvasEdgeRelationshipDirection
  label?: string
  sourceRole?: string
  targetRole?: string
  schemaId?: string
  properties?: Record<string, unknown>
}

export type CreateCanvasEdgeRelationshipInput = {
  kind: CanvasEdgeRelationshipKind
  direction?: CanvasEdgeRelationshipDirection
  label?: string
  sourceRole?: string
  targetRole?: string
  schemaId?: string
  properties?: Record<string, unknown>
}

export const CANVAS_EDGE_RELATIONSHIP_KINDS = [
  'relates-to',
  'parent-child',
  'depends-on',
  'blocks',
  'references',
  'duplicates',
  'contains',
  'custom'
] as const satisfies readonly CanvasEdgeRelationshipKind[]

const RELATIONSHIP_KIND_SET = new Set<CanvasEdgeRelationshipKind>(CANVAS_EDGE_RELATIONSHIP_KINDS)

function hasRelationshipKind(value: unknown): value is CanvasEdgeRelationshipKind {
  return typeof value === 'string' && RELATIONSHIP_KIND_SET.has(value as CanvasEdgeRelationshipKind)
}

function getRelationshipDirection(
  value: unknown,
  kind: CanvasEdgeRelationshipKind
): CanvasEdgeRelationshipDirection {
  if (value === 'directed' || value === 'undirected') {
    return value
  }

  return kind === 'relates-to' || kind === 'duplicates' ? 'undirected' : 'directed'
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

export function createCanvasEdgeRelationship(
  input: CreateCanvasEdgeRelationshipInput
): CanvasEdgeRelationship {
  return {
    kind: input.kind,
    direction: getRelationshipDirection(input.direction, input.kind),
    ...(getOptionalString(input.label) ? { label: getOptionalString(input.label) } : {}),
    ...(getOptionalString(input.sourceRole)
      ? { sourceRole: getOptionalString(input.sourceRole) }
      : {}),
    ...(getOptionalString(input.targetRole)
      ? { targetRole: getOptionalString(input.targetRole) }
      : {}),
    ...(getOptionalString(input.schemaId) ? { schemaId: getOptionalString(input.schemaId) } : {}),
    ...(input.properties ? { properties: { ...input.properties } } : {})
  }
}

export function normalizeCanvasEdgeRelationship(
  relationship: CanvasEdge['relationship'] | undefined,
  fallbackKind: CanvasEdgeRelationshipKind = 'relates-to'
): CanvasEdgeRelationship {
  const kind = hasRelationshipKind(relationship?.kind) ? relationship.kind : fallbackKind

  return createCanvasEdgeRelationship({
    kind,
    direction: relationship?.direction,
    label: relationship?.label,
    sourceRole: relationship?.sourceRole,
    targetRole: relationship?.targetRole,
    schemaId: relationship?.schemaId,
    properties: relationship?.properties
  })
}

export function applyCanvasEdgeRelationship(
  edge: CanvasEdge,
  relationship: CanvasEdgeRelationship
): CanvasEdge {
  return {
    ...edge,
    relationship: normalizeCanvasEdgeRelationship(relationship)
  }
}

export function getCanvasConnectorKindForRelationship(
  relationship: CanvasEdge['relationship'] | undefined
): CanvasConnectorRecordKind {
  const normalized = normalizeCanvasEdgeRelationship(relationship)

  if (normalized.kind === 'references' || normalized.kind === 'duplicates') {
    return 'reference'
  }

  if (
    normalized.kind === 'depends-on' ||
    normalized.kind === 'blocks' ||
    normalized.kind === 'parent-child'
  ) {
    return 'dependency'
  }

  return 'line'
}

export function createCanvasSemanticRelationshipRecord(
  edge: CanvasEdge
): CanvasSemanticRelationshipRecord | null {
  const [sourceObjectId, targetObjectId] = getCanvasEdgeNodeIds(edge)
  if (!sourceObjectId || !targetObjectId) {
    return null
  }

  const relationship = normalizeCanvasEdgeRelationship(edge.relationship)

  return {
    id: edge.id,
    sourceObjectId,
    targetObjectId,
    kind: relationship.kind,
    direction: relationship.direction ?? getRelationshipDirection(undefined, relationship.kind),
    ...(relationship.label ? { label: relationship.label } : {}),
    ...(relationship.sourceRole ? { sourceRole: relationship.sourceRole } : {}),
    ...(relationship.targetRole ? { targetRole: relationship.targetRole } : {}),
    ...(relationship.schemaId ? { schemaId: relationship.schemaId } : {}),
    ...(relationship.properties ? { properties: { ...relationship.properties } } : {})
  }
}
