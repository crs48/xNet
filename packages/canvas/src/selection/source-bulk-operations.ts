/**
 * Bulk operations for selected source-backed canvas cards.
 */

import type { CanvasDisplayDensity, CanvasDisplayState, CanvasNode } from '../types'

export type CanvasSourceBulkOperationKind =
  | 'open-sources'
  | 'copy-source-links'
  | 'refresh-previews'
  | 'set-status'
  | 'add-tags'
  | 'remove-tags'
  | 'set-display-density'
  | 'clear-aliases'

export type CanvasSourceBulkOperation =
  | { kind: 'open-sources' }
  | { kind: 'copy-source-links' }
  | { kind: 'refresh-previews' }
  | { kind: 'set-status'; status: string }
  | { kind: 'add-tags'; tags: readonly string[] }
  | { kind: 'remove-tags'; tags: readonly string[] }
  | { kind: 'set-display-density'; previewDensity: CanvasDisplayDensity }
  | { kind: 'clear-aliases' }

export type CanvasSourceBackedCardRef = {
  canvasNodeId: string
  sourceNodeId: string
  sourceSchemaId?: string
  sourceUri: string
  title: string
  type: CanvasNode['type']
  provider?: string
  kind?: string
  locked: boolean
}

export type CanvasSourceBulkOperationDefinition = {
  kind: CanvasSourceBulkOperationKind
  label: string
  enabled: boolean
  sourceCount: number
  affectedCanvasNodeIds: readonly string[]
  reason?: string
}

export type CreateCanvasSourceBulkOperationDefinitionsInput = {
  nodes: readonly CanvasNode[]
  canOpenSources?: boolean
  canCopySourceLinks?: boolean
  canEditMetadata?: boolean
  canRefreshPreviews?: boolean
}

export type CanvasSourceBulkNodeUpdate = {
  id: string
  alias?: string | null
  display?: Partial<CanvasDisplayState>
  properties?: Record<string, unknown>
}

export type CanvasSourceBulkExternalAction = {
  kind: 'open-source' | 'copy-source-link' | 'refresh-preview'
  canvasNodeId: string
  sourceNodeId: string
  sourceSchemaId?: string
  sourceUri: string
}

export type CreateCanvasSourceBulkOperationPlanOptions = {
  respectLocks?: boolean
}

export type CanvasSourceBulkOperationPlan = {
  operation: CanvasSourceBulkOperation
  sourceRefs: readonly CanvasSourceBackedCardRef[]
  skippedNodeIds: readonly string[]
  lockedNodeIds: readonly string[]
  updates: readonly CanvasSourceBulkNodeUpdate[]
  actions: readonly CanvasSourceBulkExternalAction[]
  warnings: readonly string[]
}

const SOURCE_BULK_OPERATION_LABELS: Record<CanvasSourceBulkOperationKind, string> = {
  'open-sources': 'Open Sources',
  'copy-source-links': 'Copy Source Links',
  'refresh-previews': 'Refresh Previews',
  'set-status': 'Set Status',
  'add-tags': 'Add Tags',
  'remove-tags': 'Remove Tags',
  'set-display-density': 'Set Display Density',
  'clear-aliases': 'Clear Aliases'
}

const MUTATING_OPERATION_KINDS = new Set<CanvasSourceBulkOperationKind>([
  'set-status',
  'add-tags',
  'remove-tags',
  'set-display-density',
  'clear-aliases'
])

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function normalizeStringList(values: readonly string[] | undefined): string[] {
  if (!values) {
    return []
  }

  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))
  ).sort((left, right) => left.localeCompare(right))
}

function getStringProperty(node: CanvasNode, key: string): string | null {
  return normalizeString(node.properties[key])
}

function getSourceNodeId(node: CanvasNode): string | null {
  return normalizeString(node.sourceNodeId) ?? normalizeString(node.linkedNodeId)
}

function createSourceUri(node: CanvasNode, sourceNodeId: string): string {
  return getStringProperty(node, 'url') ?? `xnet://node/${encodeURIComponent(sourceNodeId)}`
}

function getCardTitle(node: CanvasNode): string {
  return (
    normalizeString(node.alias) ??
    getStringProperty(node, 'title') ??
    getStringProperty(node, 'name') ??
    node.id
  )
}

function getExistingTags(node: CanvasNode): string[] {
  const tags = node.properties.tags
  return Array.isArray(tags)
    ? normalizeStringList(tags.filter((tag): tag is string => typeof tag === 'string'))
    : []
}

function createAction(
  kind: CanvasSourceBulkExternalAction['kind'],
  ref: CanvasSourceBackedCardRef
): CanvasSourceBulkExternalAction {
  return {
    kind,
    canvasNodeId: ref.canvasNodeId,
    sourceNodeId: ref.sourceNodeId,
    sourceUri: ref.sourceUri,
    ...(ref.sourceSchemaId ? { sourceSchemaId: ref.sourceSchemaId } : {})
  }
}

function isMutatingOperation(operation: CanvasSourceBulkOperation): boolean {
  return MUTATING_OPERATION_KINDS.has(operation.kind)
}

function createDefinition(
  kind: CanvasSourceBulkOperationKind,
  sourceRefs: readonly CanvasSourceBackedCardRef[],
  enabled: boolean,
  reason?: string
): CanvasSourceBulkOperationDefinition {
  return {
    kind,
    label: SOURCE_BULK_OPERATION_LABELS[kind],
    enabled,
    sourceCount: sourceRefs.length,
    affectedCanvasNodeIds: sourceRefs.map((ref) => ref.canvasNodeId),
    ...(enabled ? {} : { reason })
  }
}

export function isCanvasSourceBackedNode(node: CanvasNode): boolean {
  return getSourceNodeId(node) !== null
}

export function getCanvasSourceBackedCardRef(node: CanvasNode): CanvasSourceBackedCardRef | null {
  const sourceNodeId = getSourceNodeId(node)
  if (!sourceNodeId) {
    return null
  }

  const provider = getStringProperty(node, 'provider')
  const kind = getStringProperty(node, 'kind')

  return {
    canvasNodeId: node.id,
    sourceNodeId,
    ...(node.sourceSchemaId ? { sourceSchemaId: node.sourceSchemaId } : {}),
    sourceUri: createSourceUri(node, sourceNodeId),
    title: getCardTitle(node),
    type: node.type,
    ...(provider ? { provider } : {}),
    ...(kind ? { kind } : {}),
    locked: node.locked === true
  }
}

export function getCanvasSourceBackedSelection(
  nodes: readonly CanvasNode[]
): readonly CanvasSourceBackedCardRef[] {
  return nodes.flatMap((node) => {
    const ref = getCanvasSourceBackedCardRef(node)
    return ref ? [ref] : []
  })
}

export function createCanvasSourceBulkOperationDefinitions(
  input: CreateCanvasSourceBulkOperationDefinitionsInput
): readonly CanvasSourceBulkOperationDefinition[] {
  const sourceRefs = getCanvasSourceBackedSelection(input.nodes)
  const unlockedRefs = sourceRefs.filter((ref) => !ref.locked)
  const hasSources = sourceRefs.length > 0
  const hasUnlockedSources = unlockedRefs.length > 0
  const noSourceReason = 'Select one or more source-backed cards.'
  const lockedReason = 'Selected source-backed cards are locked.'

  return [
    createDefinition(
      'open-sources',
      sourceRefs,
      hasSources && input.canOpenSources !== false,
      hasSources ? 'Source opening is unavailable.' : noSourceReason
    ),
    createDefinition(
      'copy-source-links',
      sourceRefs,
      hasSources && input.canCopySourceLinks !== false,
      hasSources ? 'Clipboard access is unavailable.' : noSourceReason
    ),
    createDefinition(
      'refresh-previews',
      sourceRefs,
      hasSources && input.canRefreshPreviews !== false,
      hasSources ? 'Preview refresh is unavailable.' : noSourceReason
    ),
    ...(
      ['set-status', 'add-tags', 'remove-tags', 'set-display-density', 'clear-aliases'] as const
    ).map((kind) =>
      createDefinition(
        kind,
        unlockedRefs,
        hasUnlockedSources && input.canEditMetadata !== false,
        hasSources ? lockedReason : noSourceReason
      )
    )
  ]
}

export function createCanvasSourceBulkOperationPlan(
  nodes: readonly CanvasNode[],
  operation: CanvasSourceBulkOperation,
  options: CreateCanvasSourceBulkOperationPlanOptions = {}
): CanvasSourceBulkOperationPlan {
  const sourceRefs = getCanvasSourceBackedSelection(nodes)
  const sourceNodeIds = new Set(sourceRefs.map((ref) => ref.canvasNodeId))
  const skippedNodeIds = nodes
    .filter((node) => !sourceNodeIds.has(node.id))
    .map((node) => node.id)
    .sort((left, right) => left.localeCompare(right))
  const respectLocks = options.respectLocks !== false
  const lockedNodeIds =
    respectLocks && isMutatingOperation(operation)
      ? sourceRefs.filter((ref) => ref.locked).map((ref) => ref.canvasNodeId)
      : []
  const mutableNodeIds = new Set(lockedNodeIds)
  const targetRefs = sourceRefs.filter((ref) => !mutableNodeIds.has(ref.canvasNodeId))
  const nodesById = new Map(nodes.map((node) => [node.id, node] as const))
  const warnings: string[] = []

  if (sourceRefs.length === 0) {
    warnings.push('No source-backed cards were selected.')
  }

  if (lockedNodeIds.length > 0) {
    warnings.push(`${lockedNodeIds.length} locked source-backed card(s) were skipped.`)
  }

  switch (operation.kind) {
    case 'open-sources':
      return {
        operation,
        sourceRefs,
        skippedNodeIds,
        lockedNodeIds: [],
        updates: [],
        actions: sourceRefs.map((ref) => createAction('open-source', ref)),
        warnings
      }
    case 'copy-source-links':
      return {
        operation,
        sourceRefs,
        skippedNodeIds,
        lockedNodeIds: [],
        updates: [],
        actions: sourceRefs.map((ref) => createAction('copy-source-link', ref)),
        warnings
      }
    case 'refresh-previews':
      return {
        operation,
        sourceRefs,
        skippedNodeIds,
        lockedNodeIds: [],
        updates: [],
        actions: sourceRefs.map((ref) => createAction('refresh-preview', ref)),
        warnings
      }
    case 'set-status': {
      const status = operation.status.trim()
      if (!status) {
        warnings.push('Status was empty, so no card metadata updates were created.')
      }

      return {
        operation,
        sourceRefs,
        skippedNodeIds,
        lockedNodeIds,
        updates: status
          ? targetRefs.map((ref) => ({
              id: ref.canvasNodeId,
              properties: { status }
            }))
          : [],
        actions: [],
        warnings
      }
    }
    case 'add-tags': {
      const tags = normalizeStringList(operation.tags)

      return {
        operation,
        sourceRefs,
        skippedNodeIds,
        lockedNodeIds,
        updates: targetRefs.map((ref) => {
          const node = nodesById.get(ref.canvasNodeId)
          const nextTags = normalizeStringList([...(node ? getExistingTags(node) : []), ...tags])
          return {
            id: ref.canvasNodeId,
            properties: { tags: nextTags }
          }
        }),
        actions: [],
        warnings
      }
    }
    case 'remove-tags': {
      const tags = new Set(normalizeStringList(operation.tags))

      return {
        operation,
        sourceRefs,
        skippedNodeIds,
        lockedNodeIds,
        updates: targetRefs.map((ref) => {
          const node = nodesById.get(ref.canvasNodeId)
          const nextTags = (node ? getExistingTags(node) : []).filter((tag) => !tags.has(tag))
          return {
            id: ref.canvasNodeId,
            properties: { tags: nextTags }
          }
        }),
        actions: [],
        warnings
      }
    }
    case 'set-display-density':
      return {
        operation,
        sourceRefs,
        skippedNodeIds,
        lockedNodeIds,
        updates: targetRefs.map((ref) => ({
          id: ref.canvasNodeId,
          display: { previewDensity: operation.previewDensity }
        })),
        actions: [],
        warnings
      }
    case 'clear-aliases':
      return {
        operation,
        sourceRefs,
        skippedNodeIds,
        lockedNodeIds,
        updates: targetRefs.map((ref) => ({
          id: ref.canvasNodeId,
          alias: null
        })),
        actions: [],
        warnings
      }
  }
}
