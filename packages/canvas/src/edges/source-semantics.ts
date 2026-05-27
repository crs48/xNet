/**
 * Source-aware semantic connector defaults.
 */

import type {
  CanvasEdge,
  CanvasEdgeRelationship,
  CanvasEdgeRelationshipKind,
  CanvasNode,
  CanvasObjectAnchorPlacement
} from '../types'
import {
  DatabaseRowSchema,
  DatabaseSchema,
  ExternalReferenceSchema,
  MediaAssetSchema,
  PageSchema
} from '@xnetjs/data'
import { createCanvasEdgeEndpoint } from './bindings'
import { createCanvasEdgeRelationship } from './relationships'

export type CanvasSemanticEndpointRole =
  | 'page'
  | 'database'
  | 'database-row'
  | 'external-reference'
  | 'pdf'
  | 'pdf-page'
  | 'media'
  | 'note'
  | 'shape'
  | 'frame'
  | 'group'
  | 'unknown'

export type CanvasSemanticEdgeDraft = Pick<CanvasEdge, 'source' | 'target' | 'relationship'>

export type CreateCanvasSemanticEdgeDraftInput = {
  sourceNode: CanvasNode
  targetNode: CanvasNode
  sourcePlacement?: CanvasObjectAnchorPlacement
  targetPlacement?: CanvasObjectAnchorPlacement
  relationshipKind?: CanvasEdgeRelationshipKind
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readPositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

function isPdfNode(node: CanvasNode): boolean {
  return (
    node.type === 'media' &&
    (node.properties.mimeType === 'application/pdf' ||
      node.properties.kind === 'document' ||
      node.properties.mediaKind === 'document')
  )
}

function isFrameNode(node: CanvasNode): boolean {
  return node.properties.containerRole === 'frame' || node.type === 'frame'
}

function getPdfPageNumber(node: CanvasNode): number | null {
  return isPdfNode(node) ? readPositiveInteger(node.properties.pageNumber) : null
}

function getSourceSchemaId(node: CanvasNode): string | null {
  return (
    readNonEmptyString(node.sourceSchemaId) ?? readNonEmptyString(node.properties.sourceSchemaId)
  )
}

function getSourceNodeId(node: CanvasNode): string | null {
  return readNonEmptyString(node.sourceNodeId) ?? readNonEmptyString(node.properties.sourceNodeId)
}

function getRelationshipKindForRoles(
  sourceRole: CanvasSemanticEndpointRole,
  targetRole: CanvasSemanticEndpointRole
): CanvasEdgeRelationshipKind {
  if (sourceRole === 'frame' || sourceRole === 'group' || sourceRole === 'database') {
    if (targetRole !== 'external-reference' && targetRole !== 'pdf' && targetRole !== 'pdf-page') {
      return 'contains'
    }
  }

  if (
    sourceRole === 'external-reference' ||
    targetRole === 'external-reference' ||
    sourceRole === 'pdf' ||
    targetRole === 'pdf' ||
    sourceRole === 'pdf-page' ||
    targetRole === 'pdf-page'
  ) {
    return 'references'
  }

  return 'relates-to'
}

function getSemanticRelationshipProperties(
  sourceNode: CanvasNode,
  targetNode: CanvasNode,
  sourceRole: CanvasSemanticEndpointRole,
  targetRole: CanvasSemanticEndpointRole
): Record<string, string | number> {
  const sourceSchemaId = getSourceSchemaId(sourceNode)
  const targetSchemaId = getSourceSchemaId(targetNode)
  const sourceNodeId = getSourceNodeId(sourceNode)
  const targetNodeId = getSourceNodeId(targetNode)
  const sourcePageNumber = getPdfPageNumber(sourceNode)
  const targetPageNumber = getPdfPageNumber(targetNode)

  return {
    sourceRole,
    targetRole,
    ...(sourceSchemaId ? { sourceSchemaId } : {}),
    ...(targetSchemaId ? { targetSchemaId } : {}),
    ...(sourceNodeId ? { sourceNodeId } : {}),
    ...(targetNodeId ? { targetNodeId } : {}),
    ...(sourcePageNumber ? { sourcePageNumber } : {}),
    ...(targetPageNumber ? { targetPageNumber } : {})
  }
}

export function getCanvasSemanticEndpointRole(node: CanvasNode): CanvasSemanticEndpointRole {
  const sourceSchemaId = getSourceSchemaId(node)

  if (sourceSchemaId === PageSchema._schemaId || node.type === 'page') {
    return 'page'
  }

  if (sourceSchemaId === DatabaseSchema._schemaId || node.type === 'database') {
    return 'database'
  }

  if (sourceSchemaId === DatabaseRowSchema._schemaId) {
    return 'database-row'
  }

  if (sourceSchemaId === ExternalReferenceSchema._schemaId || node.type === 'external-reference') {
    return 'external-reference'
  }

  if (sourceSchemaId === MediaAssetSchema._schemaId || node.type === 'media') {
    if (isPdfNode(node)) {
      return getPdfPageNumber(node) ? 'pdf-page' : 'pdf'
    }

    return 'media'
  }

  if (node.type === 'note') {
    return 'note'
  }

  if (node.type === 'shape') {
    return 'shape'
  }

  if (isFrameNode(node)) {
    return 'frame'
  }

  if (node.type === 'group') {
    return 'group'
  }

  return 'unknown'
}

export function createCanvasSemanticEdgeRelationshipForNodes(input: {
  sourceNode: CanvasNode
  targetNode: CanvasNode
  relationshipKind?: CanvasEdgeRelationshipKind
}): CanvasEdgeRelationship {
  const sourceRole = getCanvasSemanticEndpointRole(input.sourceNode)
  const targetRole = getCanvasSemanticEndpointRole(input.targetNode)
  const kind = input.relationshipKind ?? getRelationshipKindForRoles(sourceRole, targetRole)

  return createCanvasEdgeRelationship({
    kind,
    sourceRole,
    targetRole,
    properties: getSemanticRelationshipProperties(
      input.sourceNode,
      input.targetNode,
      sourceRole,
      targetRole
    )
  })
}

export function createCanvasSemanticEdgeDraft({
  sourceNode,
  targetNode,
  sourcePlacement,
  targetPlacement,
  relationshipKind
}: CreateCanvasSemanticEdgeDraftInput): CanvasSemanticEdgeDraft {
  const sourcePageNumber = getPdfPageNumber(sourceNode)
  const targetPageNumber = getPdfPageNumber(targetNode)

  return {
    source: createCanvasEdgeEndpoint(sourceNode.id, {
      ...(sourcePlacement ? { placement: sourcePlacement } : {}),
      ...(sourcePageNumber ? { pageNumber: sourcePageNumber } : {})
    }),
    target: createCanvasEdgeEndpoint(targetNode.id, {
      ...(targetPlacement ? { placement: targetPlacement } : {}),
      ...(targetPageNumber ? { pageNumber: targetPageNumber } : {})
    }),
    relationship: createCanvasSemanticEdgeRelationshipForNodes({
      sourceNode,
      targetNode,
      relationshipKind
    })
  }
}
