/**
 * Contextual popover availability for canvas selections.
 */

import type { CanvasNode } from '../types'

export type CanvasContextPopoverKind =
  | 'style'
  | 'dimensions'
  | 'crop-fit'
  | 'pdf-page'
  | 'edge-type'
  | 'alias'
  | 'references'
  | 'comments'
  | 'source-bulk'
  | 'plugin-fields'

export type CanvasContextPopoverDefinition = {
  kind: CanvasContextPopoverKind
  label: string
  enabled: boolean
  reason?: string
}

export type CreateCanvasContextPopoverDefinitionsInput = {
  nodes: readonly CanvasNode[]
  edgeIds?: readonly string[]
  hasAliasHandler?: boolean
  hasReferencesPanel?: boolean
  hasCommentHandler?: boolean
  hasSourceBulkActions?: boolean
  pluginFieldCount?: number
}

const CONTEXT_POPOVER_LABELS: Record<CanvasContextPopoverKind, string> = {
  style: 'Style',
  dimensions: 'Dimensions',
  'crop-fit': 'Crop/Fit',
  'pdf-page': 'PDF Page',
  'edge-type': 'Edge Type',
  alias: 'Alias',
  references: 'References',
  comments: 'Comments',
  'source-bulk': 'Bulk Actions',
  'plugin-fields': 'Plugin Fields'
}

function hasSelection(nodes: readonly CanvasNode[], edgeIds: readonly string[]): boolean {
  return nodes.length > 0 || edgeIds.length > 0
}

function isSingleUnlockedNode(nodes: readonly CanvasNode[]): boolean {
  return nodes.length === 1 && nodes[0]?.locked !== true
}

function hasSourceBackedNode(nodes: readonly CanvasNode[]): boolean {
  return nodes.some((node) => Boolean(node.sourceNodeId ?? node.linkedNodeId))
}

function hasMultipleSourceBackedNodes(nodes: readonly CanvasNode[]): boolean {
  return nodes.filter((node) => Boolean(node.sourceNodeId ?? node.linkedNodeId)).length > 1
}

function isMediaNode(node: CanvasNode | undefined): boolean {
  return node?.type === 'media' || node?.type === 'image' || node?.type === 'embed'
}

function isPdfNode(node: CanvasNode | undefined): boolean {
  if (!node) {
    return false
  }

  const mimeType = typeof node.properties.mimeType === 'string' ? node.properties.mimeType : ''
  const mediaKind = typeof node.properties.kind === 'string' ? node.properties.kind : ''

  return mimeType === 'application/pdf' || mediaKind === 'pdf' || mediaKind === 'pdf-page'
}

function hasPluginFields(
  nodes: readonly CanvasNode[],
  pluginFieldCount: number | undefined
): boolean {
  if (typeof pluginFieldCount === 'number' && pluginFieldCount > 0) {
    return true
  }

  return nodes.some((node) => {
    const fields = node.properties.pluginFields
    return Array.isArray(fields) && fields.length > 0
  })
}

function createDefinition(
  kind: CanvasContextPopoverKind,
  enabled: boolean,
  reason?: string
): CanvasContextPopoverDefinition {
  return {
    kind,
    label: CONTEXT_POPOVER_LABELS[kind],
    enabled,
    reason: enabled ? undefined : reason
  }
}

export function createCanvasContextPopoverDefinitions(
  input: CreateCanvasContextPopoverDefinitionsInput
): readonly CanvasContextPopoverDefinition[] {
  const edgeIds = input.edgeIds ?? []
  const selected = hasSelection(input.nodes, edgeIds)
  const firstNode = input.nodes[0]
  const singleUnlockedNode = isSingleUnlockedNode(input.nodes)
  const sourceBacked = hasSourceBackedNode(input.nodes)

  return [
    createDefinition('style', selected, 'Select an object or edge to edit style.'),
    createDefinition(
      'dimensions',
      singleUnlockedNode,
      'Select one unlocked object to edit dimensions.'
    ),
    createDefinition(
      'crop-fit',
      singleUnlockedNode && isMediaNode(firstNode),
      'Select one media object.'
    ),
    createDefinition(
      'pdf-page',
      singleUnlockedNode && isPdfNode(firstNode),
      'Select one PDF object.'
    ),
    createDefinition(
      'edge-type',
      edgeIds.length > 0 || input.nodes.length === 2,
      'Select an edge or two objects.'
    ),
    createDefinition(
      'alias',
      input.nodes.length === 1 && sourceBacked && input.hasAliasHandler === true,
      'Select one source-backed object.'
    ),
    createDefinition(
      'references',
      input.nodes.length === 1 && sourceBacked && input.hasReferencesPanel === true,
      'Select one source-backed object.'
    ),
    createDefinition(
      'comments',
      selected && input.hasCommentHandler === true,
      'Select an object or edge.'
    ),
    createDefinition(
      'source-bulk',
      hasMultipleSourceBackedNodes(input.nodes) && input.hasSourceBulkActions === true,
      'Select two or more source-backed objects.'
    ),
    createDefinition(
      'plugin-fields',
      hasPluginFields(input.nodes, input.pluginFieldCount),
      'Select a plugin-backed object.'
    )
  ]
}

export function getEnabledCanvasContextPopovers(
  input: CreateCanvasContextPopoverDefinitionsInput
): readonly CanvasContextPopoverDefinition[] {
  return createCanvasContextPopoverDefinitions(input).filter((definition) => definition.enabled)
}
