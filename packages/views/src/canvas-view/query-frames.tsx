/**
 * Canvas query frames (exploration 0277, E1/E2): saved-view lenses that
 * execute on the canvas. Extracted from the desktop CanvasView so query
 * frames synced from either platform run everywhere; the schema registry
 * is a parameter so each surface can pass its own superset.
 */

import type {
  CanvasNode,
  CanvasQueryFrameExecutionSnapshot,
  CanvasQueryFrameRefreshTrigger,
  CanvasQueryFrameResultCard,
  CanvasQueryFrameResultPreview
} from '@xnetjs/canvas'
import type { JSX } from 'react'
import type { Doc as YDoc } from 'yjs'
import {
  createCanvasQueryFrameDefinitionFromSavedView,
  createCanvasQueryFrameProperties,
  createCanvasQueryFrameResultSummaryFromExecution,
  getCanvasObjectsMap,
  getCanvasQueryFrameDefinition,
  getCanvasQueryFrameResultPreview,
  getCanvasQueryFrameResultSummary,
  isCanvasQueryFrameNode,
  shouldRefreshCanvasQueryFrameResult,
  updateCanvasQueryFrameResults,
  useCanvasObjectIngestion
} from '@xnetjs/canvas'
import { validateSavedViewDescriptor, type SavedViewDescriptor } from '@xnetjs/data'
import {
  useSavedView,
  type SavedViewQueryResult,
  type SavedViewSchemaRegistry,
  type UseSavedViewResult
} from '@xnetjs/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type SavedViewCanvasQueryFrameInput = {
  viewId: string
  title?: string | null
  descriptorJson?: string | null
}

export type CanvasQueryFrameTarget = {
  nodeId: string
  descriptorJson: string
}

const QUERY_RESULT_PREVIEW_LIMIT = 4
const QUERY_RESULT_TITLE_FIELDS = [
  'title',
  'displayName',
  'handle',
  'name',
  'username',
  'url',
  'sourceUrl',
  'id'
]
const QUERY_RESULT_SUBTITLE_FIELDS = [
  'platform',
  'contentKind',
  'interactionKind',
  'messageKind',
  'collectionKind',
  'publishedAt',
  'observedAt',
  'sentAt',
  'createdAt',
  'updatedAt'
]
const QUERY_RESULT_DESCRIPTION_FIELDS = ['summary', 'description', 'text', 'body', 'content']
const QUERY_RESULT_BADGE_FIELDS = [
  'platform',
  'privacyClass',
  'visibility',
  'contentKind',
  'interactionKind',
  'messageKind',
  'collectionKind'
]

export function parseSavedViewDescriptorForCanvasFrame(
  value: string | null | undefined
): SavedViewDescriptor | null {
  if (!value) return null

  try {
    const descriptor = JSON.parse(value) as SavedViewDescriptor
    return validateSavedViewDescriptor(descriptor).valid ? descriptor : null
  } catch {
    return null
  }
}

export function getCanvasQueryFrameTargets(doc: YDoc | null): CanvasQueryFrameTarget[] {
  if (!doc) return []

  return Array.from(getCanvasObjectsMap<CanvasNode>(doc).values()).flatMap((node) => {
    if (!isCanvasQueryFrameNode(node)) return []

    const definition = getCanvasQueryFrameDefinition(node)
    if (!definition?.queryText) return []

    return [
      {
        nodeId: node.id,
        descriptorJson: definition.queryText
      }
    ]
  })
}

function savedViewQueryExecutionSnapshot(
  query: SavedViewQueryResult
): CanvasQueryFrameExecutionSnapshot {
  return {
    status: query.status,
    loading: query.loading,
    totalCount: query.totalCount,
    visibleCount: query.data.length,
    sourceVersion: query.metadata?.updatedAt ? String(query.metadata.updatedAt) : null,
    contentHash: query.plan?.descriptorHash ?? null,
    errorMessage: query.error?.message ?? query.metadata?.error ?? null
  }
}

function savedViewExecutionSnapshots(
  result: UseSavedViewResult
): CanvasQueryFrameExecutionSnapshot[] {
  const queries = result.queryIds.map((queryId) => result.queries[queryId]).filter(Boolean)
  if (queries.length > 0) {
    return queries.map(savedViewQueryExecutionSnapshot)
  }

  return [
    {
      status: result.status,
      loading: result.loading,
      totalCount: 0,
      visibleCount: 0,
      errorMessage: result.error?.message ?? null
    }
  ]
}

function savedViewResultPreview(result: UseSavedViewResult): CanvasQueryFrameResultPreview {
  const queries = result.queryIds.map((queryId) => result.queries[queryId]).filter(Boolean)
  const loadedCount = queries.reduce((total, query) => total + query.data.length, 0)
  const cards = queries.flatMap((query) =>
    query.data.map((row, index) => savedViewRowResultCard(query, row, index))
  )

  return {
    cards: cards.slice(0, QUERY_RESULT_PREVIEW_LIMIT),
    overflowCount: Math.max(0, loadedCount - QUERY_RESULT_PREVIEW_LIMIT)
  }
}

function savedViewRowResultCard(
  query: SavedViewQueryResult,
  row: Record<string, unknown>,
  index: number
): CanvasQueryFrameResultCard {
  const title = firstPreviewFieldValue(row, QUERY_RESULT_TITLE_FIELDS) ?? `${query.rowRole} result`
  const subtitleParts = QUERY_RESULT_SUBTITLE_FIELDS.flatMap((field) => {
    const value = previewValueLabel(field, row[field], 48)
    return value ? [value] : []
  })
  const badges = QUERY_RESULT_BADGE_FIELDS.flatMap((field) => {
    const value = previewValueLabel(field, row[field], 28)
    return value ? [value] : []
  })
  const sourceNodeId = typeof row.id === 'string' ? row.id : null

  return {
    id: `${query.queryId}:${sourceNodeId ?? index}`,
    title,
    subtitle: subtitleParts.slice(0, 2).join(' / ') || undefined,
    eyebrow: query.rowRole,
    description: firstPreviewFieldValue(row, QUERY_RESULT_DESCRIPTION_FIELDS, 180) ?? undefined,
    sourceNodeId: sourceNodeId ?? undefined,
    schemaId: query.schemaId,
    href: firstPreviewFieldValue(row, ['url', 'sourceUrl', 'uri'], 240) ?? undefined,
    badges: [...new Set(badges)].slice(0, 4)
  }
}

function firstPreviewFieldValue(
  row: Record<string, unknown>,
  fields: readonly string[],
  maxLength = 120
): string | null {
  for (const field of fields) {
    const value = previewValueLabel(field, row[field], maxLength)
    if (value) return value
  }

  return null
}

function previewValueLabel(field: string, value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number' && field.endsWith('At') && value > 1_000_000_000_000) {
    return new Date(value).toLocaleDateString()
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    return trimmed.length > maxLength
      ? `${trimmed.slice(0, Math.max(0, maxLength - 3))}...`
      : trimmed
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? `${value.length} items` : null
  }

  return null
}

export function CanvasSavedViewQueryFrameExecutor({
  doc,
  nodeId,
  descriptorJson,
  manualRefreshRequestId,
  schemas
}: {
  doc: YDoc | null
  nodeId: string
  descriptorJson: string
  manualRefreshRequestId: string | null
  schemas: SavedViewSchemaRegistry
}): null {
  const result = useSavedView(descriptorJson, schemas)
  const snapshots = useMemo(() => savedViewExecutionSnapshots(result), [result])
  const preview = useMemo(() => savedViewResultPreview(result), [result])
  const summaryKey = useMemo(() => JSON.stringify(snapshots), [snapshots])
  const previewKey = useMemo(() => JSON.stringify(preview), [preview])
  const lastManualRefreshRequestRef = useRef<string | null>(null)
  const openRefreshPendingRef = useRef(true)

  useEffect(() => {
    if (!doc) return

    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    const node = objects.get(nodeId)
    if (!node) return

    const definition = getCanvasQueryFrameDefinition(node)
    if (!definition) return
    if (definition.refreshMode === 'manual') {
      openRefreshPendingRef.current = false
    }

    const manualRefreshRequested =
      manualRefreshRequestId !== null &&
      manualRefreshRequestId !== lastManualRefreshRequestRef.current
    const trigger: CanvasQueryFrameRefreshTrigger = manualRefreshRequested
      ? 'manual'
      : openRefreshPendingRef.current
        ? 'open'
        : 'result-change'
    const nextBaseline = createCanvasQueryFrameResultSummaryFromExecution({ queries: snapshots })
    const current = getCanvasQueryFrameResultSummary(node)
    const currentPreview = getCanvasQueryFrameResultPreview(node)
    const shouldRefresh = shouldRefreshCanvasQueryFrameResult({
      refreshMode: definition.refreshMode,
      trigger,
      currentSummary: current,
      nextSummary: nextBaseline,
      currentPreview,
      nextPreview: preview
    })

    if (manualRefreshRequested) {
      lastManualRefreshRequestRef.current = manualRefreshRequestId
    }
    if (!shouldRefresh) {
      if (trigger === 'open' && nextBaseline.status !== 'loading') {
        openRefreshPendingRef.current = false
      }
      return
    }

    const nextSummary = createCanvasQueryFrameResultSummaryFromExecution({
      queries: snapshots,
      now: new Date().toISOString()
    })
    const next = updateCanvasQueryFrameResults(node, {
      summary: nextSummary,
      preview
    })

    if (next !== node) {
      objects.set(nodeId, next)
    }
    if (trigger === 'open' && nextSummary.status !== 'loading') {
      openRefreshPendingRef.current = false
    }
    // summaryKey/previewKey are stable execution signatures; the values remain the source for the write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, manualRefreshRequestId, nodeId, previewKey, summaryKey])

  return null
}

export function CanvasQueryFrameExecutors({
  doc,
  targets,
  manualRefreshRequests,
  schemas
}: {
  doc: YDoc | null
  targets: CanvasQueryFrameTarget[]
  manualRefreshRequests: Record<string, string>
  schemas: SavedViewSchemaRegistry
}): JSX.Element {
  return (
    <>
      {targets.map((target) => (
        <CanvasSavedViewQueryFrameExecutor
          key={target.nodeId}
          doc={doc}
          nodeId={target.nodeId}
          descriptorJson={target.descriptorJson}
          manualRefreshRequestId={manualRefreshRequests[target.nodeId] ?? null}
          schemas={schemas}
        />
      ))}
    </>
  )
}

export interface UseCanvasQueryFramesOptions {
  doc: YDoc | null
  sceneRevision: number
  selectedNodes: CanvasNode[]
  placePrimitiveObject: ReturnType<typeof useCanvasObjectIngestion>['placePrimitiveObject']
  onUndoBoundary?: () => void
}

export interface UseCanvasQueryFramesResult {
  queryFrameTargets: CanvasQueryFrameTarget[]
  manualQueryFrameRefreshRequests: Record<string, string>
  selectedQueryFrameNode: CanvasNode | null
  selectedQueryFrameDefinition: ReturnType<typeof getCanvasQueryFrameDefinition> | null
  createQueryFrameFromSavedView: (input: SavedViewCanvasQueryFrameInput) => boolean
  refreshSelectedQueryFrame: () => boolean
}

export function useCanvasQueryFrames({
  doc,
  sceneRevision,
  selectedNodes,
  placePrimitiveObject,
  onUndoBoundary
}: UseCanvasQueryFramesOptions): UseCanvasQueryFramesResult {
  const [manualQueryFrameRefreshRequests, setManualQueryFrameRefreshRequests] = useState<
    Record<string, string>
  >({})

  const selectedQueryFrameNode = useMemo(
    () =>
      selectedNodes.length === 1 && isCanvasQueryFrameNode(selectedNodes[0])
        ? selectedNodes[0]
        : null,
    [selectedNodes]
  )
  const selectedQueryFrameDefinition = useMemo(
    () => (selectedQueryFrameNode ? getCanvasQueryFrameDefinition(selectedQueryFrameNode) : null),
    [selectedQueryFrameNode]
  )
  const queryFrameTargets = useMemo(() => {
    void sceneRevision
    return getCanvasQueryFrameTargets(doc)
  }, [doc, sceneRevision])

  const createQueryFrameFromSavedView = useCallback(
    (input: SavedViewCanvasQueryFrameInput): boolean => {
      const descriptor = parseSavedViewDescriptorForCanvasFrame(input.descriptorJson)
      if (!descriptor) return false

      const title = input.title?.trim() || descriptor.title || 'Saved lens'
      const queryDefinition = createCanvasQueryFrameDefinitionFromSavedView({
        viewId: input.viewId,
        descriptor,
        label: title
      })
      const insertedQueryDefinition = {
        ...queryDefinition,
        refreshMode: 'on-open' as const
      }
      const created = Boolean(
        placePrimitiveObject({
          objectKind: 'group',
          title,
          rect: {
            width: 720,
            height: 460
          },
          properties: createCanvasQueryFrameProperties({
            title,
            query: insertedQueryDefinition
          })
        })
      )

      if (created) {
        onUndoBoundary?.()
      }

      return created
    },
    [onUndoBoundary, placePrimitiveObject]
  )

  const refreshSelectedQueryFrame = useCallback((): boolean => {
    if (!selectedQueryFrameNode) return false

    const requestId = `${Date.now()}:${Math.random().toString(36).slice(2)}`
    setManualQueryFrameRefreshRequests((current) => ({
      ...current,
      [selectedQueryFrameNode.id]: requestId
    }))
    return true
  }, [selectedQueryFrameNode])

  return {
    queryFrameTargets,
    manualQueryFrameRefreshRequests,
    selectedQueryFrameNode,
    selectedQueryFrameDefinition,
    createQueryFrameFromSavedView,
    refreshSelectedQueryFrame
  }
}
