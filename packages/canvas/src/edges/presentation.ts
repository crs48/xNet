/**
 * Edge labels, style presets, filters, and endpoint anchor picking.
 */

import type {
  CanvasEdge,
  CanvasEdgeEndpoint,
  CanvasEdgeRelationshipKind,
  EdgeStyle,
  Point,
  Rect
} from '../types'
import {
  createCanvasEdgeEndpoint,
  getCanvasEdgeSourceObjectId,
  getCanvasEdgeTargetObjectId,
  toLegacyEdgeAnchor
} from './bindings'
import { normalizeCanvasEdgeRelationship } from './relationships'

export type CanvasEdgePresentation = {
  label?: string
  stroke: string
  strokeWidth: number
  strokeDasharray?: string
  markerEnd?: EdgeStyle['markerEnd']
  curved: boolean
}

export type CanvasEdgeFilter = {
  relationshipKinds?: readonly CanvasEdgeRelationshipKind[]
  sourceObjectIds?: readonly string[]
  targetObjectIds?: readonly string[]
  query?: string
}

export type CanvasEdgeEndpointAnchorPickMode = 'placement' | 'ratio'

export type PickCanvasEdgeEndpointAnchorInput = {
  objectId: string
  rect: Rect
  point: Point
  mode?: CanvasEdgeEndpointAnchorPickMode
}

const RELATIONSHIP_STYLE_PRESETS: Record<
  CanvasEdgeRelationshipKind,
  Pick<CanvasEdgePresentation, 'stroke' | 'strokeWidth' | 'strokeDasharray' | 'markerEnd'>
> = {
  'relates-to': {
    stroke: '#64748b',
    strokeWidth: 1.5
  },
  'parent-child': {
    stroke: '#7c3aed',
    strokeWidth: 1.75,
    markerEnd: 'arrow'
  },
  'depends-on': {
    stroke: '#dc2626',
    strokeWidth: 1.75,
    markerEnd: 'arrow'
  },
  blocks: {
    stroke: '#b91c1c',
    strokeWidth: 2,
    markerEnd: 'arrow'
  },
  references: {
    stroke: '#2563eb',
    strokeWidth: 1.5,
    markerEnd: 'arrow'
  },
  duplicates: {
    stroke: '#0f766e',
    strokeWidth: 1.5,
    strokeDasharray: '6 4'
  },
  contains: {
    stroke: '#9333ea',
    strokeWidth: 1.75,
    markerEnd: 'arrow'
  },
  custom: {
    stroke: '#475569',
    strokeWidth: 1.5
  }
}

function getSearchText(edge: CanvasEdge): string {
  return [
    edge.label,
    edge.relationship?.label,
    edge.relationship?.kind,
    edge.relationship?.sourceRole,
    edge.relationship?.targetRole
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()
}

function matchesOptionalSet(value: string | null, allowed: readonly string[] | undefined): boolean {
  return !allowed || allowed.length === 0 || (value !== null && allowed.includes(value))
}

function getAnchorRatio(rect: Rect, point: Point): { xRatio: number; yRatio: number } {
  return {
    xRatio: rect.width > 0 ? Math.min(1, Math.max(0, (point.x - rect.x) / rect.width)) : 0.5,
    yRatio: rect.height > 0 ? Math.min(1, Math.max(0, (point.y - rect.y) / rect.height)) : 0.5
  }
}

export function getCanvasEdgePresentation(edge: CanvasEdge): CanvasEdgePresentation {
  const relationship = normalizeCanvasEdgeRelationship(edge.relationship)
  const preset = RELATIONSHIP_STYLE_PRESETS[relationship.kind]
  const style = edge.style ?? {}

  return {
    label: edge.label ?? relationship.label,
    stroke: style.stroke ?? preset.stroke,
    strokeWidth: style.strokeWidth ?? preset.strokeWidth,
    strokeDasharray: style.strokeDasharray ?? preset.strokeDasharray,
    markerEnd: style.markerEnd ?? preset.markerEnd,
    curved: style.curved ?? true
  }
}

export function canvasEdgeMatchesFilter(edge: CanvasEdge, filter: CanvasEdgeFilter): boolean {
  const relationship = normalizeCanvasEdgeRelationship(edge.relationship)
  const query = filter.query?.trim().toLowerCase()

  return (
    matchesOptionalSet(relationship.kind, filter.relationshipKinds) &&
    matchesOptionalSet(getCanvasEdgeSourceObjectId(edge), filter.sourceObjectIds) &&
    matchesOptionalSet(getCanvasEdgeTargetObjectId(edge), filter.targetObjectIds) &&
    (!query || getSearchText(edge).includes(query))
  )
}

export function filterCanvasEdges(
  edges: readonly CanvasEdge[],
  filter: CanvasEdgeFilter
): CanvasEdge[] {
  return edges.filter((edge) => canvasEdgeMatchesFilter(edge, filter))
}

export function pickCanvasEdgeEndpointAnchor(
  input: PickCanvasEdgeEndpointAnchorInput
): CanvasEdgeEndpoint {
  const ratio = getAnchorRatio(input.rect, input.point)
  if (input.mode === 'ratio') {
    return createCanvasEdgeEndpoint(input.objectId, ratio)
  }

  return createCanvasEdgeEndpoint(input.objectId, {
    placement: toLegacyEdgeAnchor(undefined, ratio.xRatio, ratio.yRatio)
  })
}
