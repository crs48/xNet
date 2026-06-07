/**
 * Canvas View - Infinite canvas for spatial visualization
 */

import type {
  CanvasAlignment,
  CanvasDistributionAxis,
  CanvasHandle,
  CanvasLayerDirection,
  CanvasNode,
  CanvasNodeRenderContext,
  CanvasPlanningTemplateId,
  CanvasQueryFrameExecutionSnapshot,
  CanvasQueryFrameResultCard,
  CanvasQueryFrameResultPreview,
  CanvasQueryFrameResultSummary,
  CanvasSelectionSnapshot,
  Rect,
  ShapeType
} from '@xnetjs/canvas'
import {
  Canvas,
  CANVAS_MIND_MAP_CREATION_TOOL,
  createCanvasFrameVariantProperties,
  createCanvasMindMapRootProperties,
  createCanvasObjectAnchorId,
  createCanvasQueryFrameDefinitionFromSavedView,
  createCanvasQueryFrameProperties,
  createCanvasQueryFrameResultSummaryFromExecution,
  extractCanvasIngressPayloads,
  getCanvasQueryFrameDefinition,
  getCanvasQueryFrameResultPreview,
  getCanvasQueryFrameResultSummary,
  getCanvasObjectsMap,
  getSelectionBounds,
  isCanvasQueryFrameNode,
  updateCanvasQueryFrameResults,
  useCanvasThemeTokens,
  useCanvasObjectIngestion
} from '@xnetjs/canvas'
import {
  CanvasSchema,
  DatabaseSchema,
  PageSchema,
  decodeAnchor,
  encodeAnchor,
  validateSavedViewDescriptor,
  type SavedViewDescriptor,
  type CanvasObjectAnchor
} from '@xnetjs/data'
import {
  CanvasExternalReferenceCard,
  CanvasFailedCardActions,
  CanvasLifecycleStatusBadge,
  useBlobService
} from '@xnetjs/editor/react'
import {
  useComments,
  useDatabaseDoc,
  useIdentity,
  useNode,
  useSavedView,
  useUndo,
  type SavedViewQueryResult,
  type SavedViewSchemaRegistry,
  type UseSavedViewResult
} from '@xnetjs/react'
import { useUndoScope } from '@xnetjs/react/internal'
import { socialSchemas } from '@xnetjs/social/schemas'
import {
  Command,
  Database,
  Eye,
  FileImage,
  FileText,
  Link2,
  MessageSquare,
  StickyNote,
  X
} from 'lucide-react'
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import * as Y from 'yjs'
import {
  useCanvasSourceReferences,
  type CanvasSourceReference
} from '../hooks/useCanvasSourceReferences'
import {
  createCanvasShellNoteProperties,
  getCanvasShellDisplayType,
  getCanvasShellPreviewModel,
  getCanvasShellSourceId,
  getCanvasShellSourceType,
  shouldRenderCanvasShellCard,
  type LinkedDocType,
  type LinkedDocumentItem
} from '../lib/canvas-shell'
import { CanvasDatabasePreviewSurface } from './CanvasDatabasePreviewSurface'
import { CanvasInlinePageSurface } from './CanvasInlinePageSurface'

type ViewportSnapshot = {
  x: number
  y: number
  zoom: number
}

type PeekableCanvasDisplayType = LinkedDocType | 'note'

type CanvasPeekState = {
  nodeId: string
  sourceId: string
  displayType: PeekableCanvasDisplayType
}

type CanvasResolvedObject = {
  node: CanvasNode
  sourceId: string | null
  sourceType: Exclude<LinkedDocType, 'canvas'> | null
  displayType: LinkedDocType | 'note' | 'external-reference' | 'media' | 'shape' | 'frame'
  title: string
}

type CanvasSelectionPanel = 'alias' | 'references' | 'comment' | null

type CanvasUndoDomain = 'scene' | 'source-node' | 'source-scope' | 'source-document'

type CanvasViewProps = {
  docId: string
  documents?: LinkedDocumentItem[]
  pendingInsert?: {
    requestId: string
    document: LinkedDocumentItem
  } | null
  onPendingInsertConsumed?: (requestId: string) => void
  onOpenDocument?: (docId: string, docType: Exclude<LinkedDocType, 'canvas'>) => void
  onOpenDatabaseSplit?: (docId: string) => void
  onCreatePage?: () => void
  onCreateDatabase?: () => void
  onCreateNote?: () => void
  onCommandStateChange?: (state: CanvasViewCommandState) => void
}

type CanvasQueryFrameTarget = {
  nodeId: string
  descriptorJson: string
}

const SOCIAL_QUERY_FRAME_SCHEMA_REGISTRY = socialSchemas as unknown as SavedViewSchemaRegistry
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

function getYjsStackDepth(manager: Y.UndoManager | null, stack: 'undoStack' | 'redoStack'): number {
  if (!manager) {
    return 0
  }

  const entries = (manager as unknown as Record<'undoStack' | 'redoStack', unknown[]>)[stack]
  return Array.isArray(entries) ? entries.length : 0
}

function createUndoOrderMap(): Record<CanvasUndoDomain, number[]> {
  return {
    scene: [],
    'source-node': [],
    'source-scope': [],
    'source-document': []
  }
}

export type CanvasViewCommandState = {
  selectionCount: number
  selectedNodeId: string | null
  selectedSourceId: string | null
  selectedSourceType: Exclude<LinkedDocType, 'canvas'> | null
  selectedDisplayType:
    | LinkedDocType
    | 'note'
    | 'external-reference'
    | 'media'
    | 'shape'
    | 'frame'
    | null
  selectedTitle: string | null
  selectionAllLocked: boolean
  selectionAnyLocked: boolean
  shortcutHelpOpen: boolean
}

export type CanvasViewHandle = {
  focusLinkedDocument: (docId: string) => ViewportSnapshot | null
  restoreViewport: (snapshot: ViewportSnapshot) => void
  zoomOut: () => boolean
  zoomIn: () => boolean
  fitCanvasContent: () => boolean
  resetCanvasView: () => boolean
  clearSelection: () => void
  fitSelection: () => boolean
  openSelection: (mode?: 'peek' | 'focus' | 'split') => boolean
  toggleSelectionLock: () => boolean
  alignSelection: (
    alignment: Extract<CanvasAlignment, 'left' | 'right' | 'top' | 'bottom'>
  ) => boolean
  distributeSelection: (axis: CanvasDistributionAxis) => boolean
  tidySelection: () => boolean
  clusterSelection: () => boolean
  stackSelection: () => boolean
  convertSelectionToMindMap: () => boolean
  shiftSelectionLayer: (direction: CanvasLayerDirection) => boolean
  connectSelection: () => boolean
  createShape: (shapeType?: ShapeType) => boolean
  createFrame: () => boolean
  createMindMap: () => boolean
  createPlanningTemplate: (templateId: CanvasPlanningTemplateId) => boolean
  createQueryFrameFromSavedView: (input: SavedViewCanvasQueryFrameInput) => boolean
  createExternalReference: (url?: string) => boolean
  createMediaFile: () => boolean
  wrapSelectionInFrame: () => boolean
  openAliasEditor: () => boolean
  openCommentComposer: () => boolean
  clearSelectionAlias: () => boolean
  toggleSourceReferences: (open?: boolean) => boolean
  toggleShortcutHelp: (open?: boolean) => void
}

export type SavedViewCanvasQueryFrameInput = {
  viewId: string
  title?: string | null
  descriptorJson?: string | null
}

function getNodeRect(node: CanvasNode): Rect {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.position.width,
    height: node.position.height
  }
}

function parseSavedViewDescriptorForCanvasFrame(
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

function getCanvasQueryFrameTargets(doc: Y.Doc | null): CanvasQueryFrameTarget[] {
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

function queryFrameSummaryMatches(
  current: CanvasQueryFrameResultSummary,
  next: CanvasQueryFrameResultSummary
): boolean {
  return (
    current.totalCount === next.totalCount &&
    current.visibleCount === next.visibleCount &&
    current.stale === next.stale &&
    current.status === next.status &&
    current.sourceVersion === next.sourceVersion &&
    current.contentHash === next.contentHash &&
    current.errorMessage === next.errorMessage
  )
}

function queryFramePreviewMatches(
  current: CanvasQueryFrameResultPreview,
  next: CanvasQueryFrameResultPreview
): boolean {
  return JSON.stringify(current) === JSON.stringify(next)
}

function CanvasSavedViewQueryFrameExecutor({
  doc,
  nodeId,
  descriptorJson
}: {
  doc: Y.Doc | null
  nodeId: string
  descriptorJson: string
}): null {
  const result = useSavedView(descriptorJson, SOCIAL_QUERY_FRAME_SCHEMA_REGISTRY)
  const snapshots = useMemo(() => savedViewExecutionSnapshots(result), [result])
  const preview = useMemo(() => savedViewResultPreview(result), [result])
  const summaryKey = useMemo(() => JSON.stringify(snapshots), [snapshots])
  const previewKey = useMemo(() => JSON.stringify(preview), [preview])

  useEffect(() => {
    if (!doc) return

    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    const node = objects.get(nodeId)
    if (!node) return

    const nextBaseline = createCanvasQueryFrameResultSummaryFromExecution({ queries: snapshots })
    const current = getCanvasQueryFrameResultSummary(node)
    const currentPreview = getCanvasQueryFrameResultPreview(node)
    if (
      queryFrameSummaryMatches(current, nextBaseline) &&
      queryFramePreviewMatches(currentPreview, preview)
    ) {
      return
    }

    const next = updateCanvasQueryFrameResults(node, {
      summary: createCanvasQueryFrameResultSummaryFromExecution({
        queries: snapshots,
        now: new Date().toISOString()
      }),
      preview
    })

    if (next !== node) {
      objects.set(nodeId, next)
    }
    // summaryKey/previewKey are stable execution signatures; the values remain the source for the write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, nodeId, previewKey, summaryKey])

  return null
}

function getCanvasViewDisplayType(
  node: CanvasNode,
  document?: LinkedDocumentItem
): LinkedDocType | 'note' | 'external-reference' | 'media' | 'shape' | 'frame' {
  if (node.type === 'shape') {
    return 'shape'
  }

  if (node.type === 'group' || node.type === 'frame') {
    return 'frame'
  }

  if (node.type === 'external-reference' || node.type === 'media') {
    return node.type
  }

  return getCanvasShellDisplayType(node, document)
}

function readStringList(value: unknown, limit = 4): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .flatMap((item) => (typeof item === 'string' && item.trim() ? [item.trim()] : []))
    .slice(0, limit)
}

function schemaIdLabel(schemaId: string | undefined): string {
  if (!schemaId) {
    return 'Source record'
  }

  const withoutVersion = schemaId.split('@')[0] ?? schemaId
  const lastSegment = withoutVersion.split('/').pop()
  return lastSegment && lastSegment.trim().length > 0 ? lastSegment.trim() : schemaId
}

function isPinnedSourceRecordCard(node: CanvasNode): boolean {
  return (
    node.type === 'external-reference' &&
    (node.properties.sourceCardRole === 'query-result' ||
      node.properties.sourceCardRole === 'social-projection')
  )
}

function getShapeLabel(shapeType: ShapeType): string {
  switch (shapeType) {
    case 'ellipse':
      return 'Ellipse'
    case 'diamond':
      return 'Diamond'
    case 'triangle':
      return 'Triangle'
    case 'hexagon':
      return 'Hexagon'
    case 'star':
      return 'Star'
    case 'arrow':
      return 'Arrow'
    case 'cylinder':
      return 'Cylinder'
    case 'cloud':
      return 'Cloud'
    case 'rounded-rectangle':
      return 'Rounded Rectangle'
    case 'rectangle':
    default:
      return 'Rectangle'
  }
}

function sortCanvasSourceReferences(
  left: CanvasSourceReference,
  right: CanvasSourceReference
): number {
  if (left.isCurrentCanvas !== right.isCurrentCanvas) {
    return left.isCurrentCanvas ? -1 : 1
  }

  const canvasCompare = left.canvasTitle.localeCompare(right.canvasTitle)
  if (canvasCompare !== 0) {
    return canvasCompare
  }

  const titleCompare = left.title.localeCompare(right.title)
  if (titleCompare !== 0) {
    return titleCompare
  }

  return left.objectId.localeCompare(right.objectId)
}

function isPeekableCanvasDisplayType(
  displayType: LinkedDocType | 'note' | 'external-reference' | 'media' | 'shape' | 'frame'
): displayType is PeekableCanvasDisplayType {
  return displayType === 'page' || displayType === 'database' || displayType === 'note'
}

type CanvasNodeCardActions = {
  onOpen?: () => void
  onPeek?: () => void
}

function stopCanvasCardAction(event: React.MouseEvent<HTMLButtonElement>): void {
  event.preventDefault()
  event.stopPropagation()
}

function CanvasPageStaticPreviewCard({
  node,
  document,
  themeMode,
  context,
  actions
}: {
  node: CanvasNode
  document: LinkedDocumentItem | undefined
  themeMode: 'light' | 'dark'
  context?: CanvasNodeRenderContext
  actions?: CanvasNodeCardActions
}): React.ReactElement {
  const model = getCanvasShellPreviewModel(node, document)
  const previewMode =
    context && (context.lod !== 'full' || context.viewportZoom < 0.9) ? 'low-zoom' : 'static'
  const isNote = model?.displayType === 'note'
  const title =
    model?.title ??
    node.alias ??
    document?.title ??
    (node.properties.title as string) ??
    (isNote ? 'Untitled Note' : 'Untitled Page')
  const badge = model?.badge ?? (isNote ? 'Note' : 'Page')
  const previewLines = model?.previewLines ?? []
  const accentClass = isNote
    ? 'border-amber-300/70 bg-amber-50/80 text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100'
    : 'border-sky-300/70 bg-sky-50/80 text-sky-950 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-100'

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-[24px] border border-border/70 bg-background shadow-lg shadow-black/5"
      data-canvas-page-preview="true"
      data-canvas-page-preview-mode={previewMode}
      data-canvas-page-preview-kind={isNote ? 'note' : 'page'}
      data-canvas-theme={themeMode}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.16em] ${accentClass}`}
        >
          {isNote ? <StickyNote size={12} /> : <FileText size={12} />}
          {badge}
        </span>

        <div className="flex items-center gap-1.5">
          {actions?.onPeek ? (
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1 rounded-full border border-border/60 bg-background px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={(event) => {
                stopCanvasCardAction(event)
                actions.onPeek?.()
              }}
              aria-label={`Peek ${title}`}
              title={`Peek ${title}`}
              data-canvas-interactive="true"
              data-canvas-page-peek="true"
            >
              <Eye size={13} />
              Peek
            </button>
          ) : null}
          {actions?.onOpen ? (
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1 rounded-full border border-border/60 bg-background px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
              onClick={(event) => {
                stopCanvasCardAction(event)
                actions.onOpen?.()
              }}
              aria-label={`Open ${title}`}
              title={`Open ${title}`}
              data-canvas-interactive="true"
              data-canvas-page-open="true"
            >
              <FileText size={13} />
              Open
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
        <div className="mb-3 line-clamp-2 text-lg font-semibold leading-tight text-foreground">
          {title}
        </div>

        <div className="min-h-0 flex-1 rounded-2xl border border-border/55 bg-muted/20 p-3">
          {previewLines.length > 0 ? (
            <div className="space-y-2 text-sm leading-6 text-muted-foreground">
              {previewLines.map((line, index) => (
                <p key={`${line}:${index}`} className="line-clamp-1">
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <div className="space-y-2" aria-hidden="true">
              <div className="h-2.5 w-11/12 rounded-full bg-muted-foreground/18" />
              <div className="h-2.5 w-4/5 rounded-full bg-muted-foreground/14" />
              <div className="h-2.5 w-2/3 rounded-full bg-muted-foreground/10" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function renderNodeCard(
  node: CanvasNode,
  document: LinkedDocumentItem | undefined,
  themeMode: 'light' | 'dark',
  context?: CanvasNodeRenderContext,
  actions?: CanvasNodeCardActions
): React.ReactElement {
  const displayType = getCanvasViewDisplayType(node, document)
  const sourceId = getCanvasShellSourceId(node)
  const linkedTitle =
    node.alias ?? document?.title ?? (node.properties.title as string) ?? 'Untitled'
  const subtitle =
    displayType === 'page'
      ? 'Document'
      : displayType === 'database'
        ? 'Database'
        : displayType === 'note'
          ? 'Canvas note'
          : displayType === 'external-reference'
            ? 'Link preview'
            : 'Media asset'

  const Icon =
    displayType === 'page'
      ? FileText
      : displayType === 'database'
        ? Database
        : displayType === 'note'
          ? StickyNote
          : displayType === 'external-reference'
            ? Link2
            : FileImage
  const isOpenable = Boolean(
    sourceId && (displayType === 'page' || displayType === 'database' || displayType === 'note')
  )
  const status = typeof node.properties.status === 'string' ? node.properties.status : null

  if (displayType === 'external-reference' && isPinnedSourceRecordCard(node)) {
    const badges = readStringList(node.properties.badges)
    const description =
      typeof node.properties.description === 'string' ? node.properties.description : null
    const pinnedSubtitle =
      typeof node.properties.subtitle === 'string' ? node.properties.subtitle : null
    const href = typeof node.properties.href === 'string' ? node.properties.href : null

    return (
      <div
        className="flex h-full flex-col justify-between rounded-[24px] border border-border/70 bg-background p-4 shadow-lg shadow-black/5"
        data-canvas-node-card="true"
        data-canvas-card-kind="source-record"
        data-canvas-pinned-source-card="true"
        data-canvas-source-node-id={sourceId}
        data-canvas-source-schema-id={node.sourceSchemaId}
        data-canvas-theme={themeMode}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex min-w-0 items-center gap-2 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <Database size={12} />
            <span className="truncate">{schemaIdLabel(node.sourceSchemaId)}</span>
          </span>
          <CanvasLifecycleStatusBadge status={status} />
        </div>

        <div className="space-y-2">
          <div className="text-lg font-semibold leading-tight text-foreground">{linkedTitle}</div>
          {pinnedSubtitle || description ? (
            <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
              {description ?? pinnedSubtitle}
            </p>
          ) : null}
          {href ? <p className="truncate text-xs text-muted-foreground">{href}</p> : null}
        </div>

        {badges.length > 0 ? (
          <div className="flex min-w-0 flex-wrap gap-1.5 overflow-hidden">
            {badges.map((badge) => (
              <span
                key={badge}
                className="max-w-full truncate rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {badge}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  if (displayType === 'page' || displayType === 'note') {
    return (
      <CanvasPageStaticPreviewCard
        node={node}
        document={document}
        themeMode={themeMode}
        context={context}
        actions={actions}
      />
    )
  }

  if (displayType === 'external-reference') {
    return (
      <CanvasExternalReferenceCard
        title={linkedTitle}
        url={typeof node.properties.url === 'string' ? node.properties.url : 'Dropped URL'}
        provider={typeof node.properties.provider === 'string' ? node.properties.provider : null}
        embedUrl={typeof node.properties.embedUrl === 'string' ? node.properties.embedUrl : null}
        subtitle={typeof node.properties.subtitle === 'string' ? node.properties.subtitle : null}
        status={status}
        themeMode={themeMode}
        renderMode="compact"
      />
    )
  }

  const summary =
    displayType === 'database'
      ? 'Open a focused database surface from the canvas.'
      : displayType === 'page'
        ? 'Open a focused writing surface from the canvas.'
        : displayType === 'note'
          ? 'A lightweight note pinned directly to the workspace.'
          : typeof node.properties.mimeType === 'string'
            ? `${String(node.properties.kind ?? 'file')} · ${node.properties.mimeType}`
            : 'Dropped media or file'

  return (
    <div
      className="flex h-full flex-col justify-between rounded-[24px] border border-border/70 bg-background p-4 shadow-lg shadow-black/5"
      data-canvas-node-card="true"
      data-canvas-card-kind={displayType}
      data-canvas-theme={themeMode}
      data-canvas-card-render-mode={displayType === 'database' ? 'compact' : undefined}
      data-canvas-database-compact-renderer={displayType === 'database' ? 'true' : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <Icon size={12} />
          {subtitle}
        </span>
        {isOpenable ? (
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Open
          </span>
        ) : (
          <CanvasLifecycleStatusBadge status={status} />
        )}
      </div>

      <div className="space-y-2">
        <div className="text-lg font-semibold leading-tight text-foreground">{linkedTitle}</div>
        <p className="text-sm leading-relaxed text-muted-foreground">{summary}</p>
        {status === 'error' ? (
          <CanvasFailedCardActions
            url={typeof node.properties.url === 'string' ? node.properties.url : null}
            themeMode={themeMode}
          />
        ) : null}
      </div>
    </div>
  )
}

function shouldActivateInlinePageSurface(
  node: CanvasNode,
  context: CanvasNodeRenderContext,
  linkedDocument?: LinkedDocumentItem
): boolean {
  const displayType = getCanvasShellDisplayType(node, linkedDocument)
  const sourceId = getCanvasShellSourceId(node)

  if (!sourceId) {
    return false
  }

  if (displayType !== 'page' && displayType !== 'note') {
    return false
  }

  return (
    context.selected &&
    context.selectionSize === 1 &&
    context.lod === 'full' &&
    context.viewportZoom >= 0.9
  )
}

function shouldActivateDatabasePreviewSurface(
  node: CanvasNode,
  context: CanvasNodeRenderContext,
  linkedDocument?: LinkedDocumentItem
): boolean {
  const displayType = getCanvasShellDisplayType(node, linkedDocument)
  const sourceId = getCanvasShellSourceId(node)

  if (!sourceId || displayType !== 'database') {
    return false
  }

  return (
    context.selected &&
    context.selectionSize === 1 &&
    context.lod === 'full' &&
    context.viewportZoom >= 0.9
  )
}

export const CanvasView = forwardRef<CanvasViewHandle, CanvasViewProps>(function CanvasView(
  {
    docId,
    documents = [],
    pendingInsert,
    onPendingInsertConsumed,
    onOpenDocument,
    onOpenDatabaseSplit,
    onCreatePage,
    onCreateDatabase,
    onCreateNote,
    onCommandStateChange
  }: CanvasViewProps,
  ref
): React.ReactElement {
  const { did } = useIdentity()
  const blobService = useBlobService()

  const {
    data: canvas,
    doc,
    loading,
    awareness
  } = useNode(CanvasSchema, docId, {
    createIfMissing: { title: 'Untitled Canvas' },
    did: did ?? undefined
  })
  const theme = useCanvasThemeTokens()

  const canvasRef = useRef<CanvasHandle | null>(null)
  const setCanvasHandle = useCallback(
    (handle: CanvasHandle | null) => {
      canvasRef.current = handle

      const testHarness = window as Window & {
        __xnetCanvasTestHarness?: {
          registerCanvasHandle?: (canvasId: string, handle: CanvasHandle | null) => void
        } | null
      }

      testHarness.__xnetCanvasTestHarness?.registerCanvasHandle?.(docId, handle)
    },
    [docId]
  )
  const handledInsertIdsRef = useRef<Set<string>>(new Set())
  const lastViewportSnapshotRef = useRef<ViewportSnapshot>({
    x: 0,
    y: 0,
    zoom: 1
  })
  const [canvasReady, setCanvasReady] = useState(false)
  const [hasNodes, setHasNodes] = useState(false)
  const [sceneRevision, setSceneRevision] = useState(0)
  const [selection, setSelection] = useState<CanvasSelectionSnapshot>({
    nodeIds: [],
    edgeIds: []
  })
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false)
  const [peekState, setPeekState] = useState<CanvasPeekState | null>(null)
  const [selectionPanel, setSelectionPanel] = useState<CanvasSelectionPanel>(null)
  const [aliasDraft, setAliasDraft] = useState('')
  const aliasInputRef = useRef<HTMLInputElement | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null)
  const mediaFileInputRef = useRef<HTMLInputElement | null>(null)
  const selectedDatabaseUndoManagerRef = useRef<Y.UndoManager | null>(null)
  const undoOrderSequenceRef = useRef(0)
  const undoOrderRef = useRef<Record<CanvasUndoDomain, number[]>>(createUndoOrderMap())
  const redoOrderRef = useRef<Record<CanvasUndoDomain, number[]>>(createUndoOrderMap())
  const [activeUndoDomain, setActiveUndoDomain] = useState<CanvasUndoDomain>('scene')
  const documentMap = useMemo(
    () => new Map(documents.map((entry) => [entry.id, entry])),
    [documents]
  )
  const canvasDocuments = useMemo(
    () =>
      documents
        .filter((entry) => entry.type === 'canvas')
        .map((entry) => ({
          id: entry.id,
          title: entry.title
        })),
    [documents]
  )
  const { placeSourceObject, placePrimitiveObject, ingestPayload, ingestDataTransfer } =
    useCanvasObjectIngestion({
      doc,
      blobService,
      getViewportSnapshot: () =>
        canvasRef.current?.getViewportSnapshot() ?? lastViewportSnapshotRef.current
    })
  const { threads: canvasObjectCommentThreads, addComment: addCanvasComment } = useComments({
    nodeId: docId,
    anchorType: 'canvas-object'
  })
  const selectedCanvasObject = useMemo<CanvasResolvedObject | null>(() => {
    void sceneRevision

    if (!doc || selection.nodeIds.length !== 1) {
      return null
    }

    const node = getCanvasObjectsMap<CanvasNode>(doc).get(selection.nodeIds[0])
    if (!node) {
      return null
    }

    const sourceId = getCanvasShellSourceId(node)
    const linkedDocument = sourceId ? documentMap.get(sourceId) : undefined
    const displayType = getCanvasViewDisplayType(node, linkedDocument)
    const sourceType = getCanvasShellSourceType(node, linkedDocument)
    const title =
      node.alias ?? linkedDocument?.title ?? (node.properties.title as string) ?? 'Untitled'

    return {
      node,
      sourceId: sourceId ?? null,
      sourceType,
      displayType,
      title
    }
  }, [doc, documentMap, sceneRevision, selection.nodeIds])

  const {
    loading: sourceReferencesLoading,
    indexedCanvases: indexedReferenceCanvases,
    totalCanvases: totalReferenceCanvases,
    getReferences
  } = useCanvasSourceReferences({
    enabled: Boolean(selectedCanvasObject?.sourceId),
    currentCanvasId: docId,
    canvases: canvasDocuments
  })

  const selectedNodes = useMemo(() => {
    void sceneRevision

    if (!doc || selection.nodeIds.length === 0) {
      return []
    }

    const nodes = getCanvasObjectsMap<CanvasNode>(doc)
    return selection.nodeIds
      .map((nodeId) => nodes.get(nodeId))
      .filter((node): node is CanvasNode => node !== undefined)
  }, [doc, sceneRevision, selection.nodeIds])
  const queryFrameTargets = useMemo(() => {
    void sceneRevision
    return getCanvasQueryFrameTargets(doc)
  }, [doc, sceneRevision])

  const selectionAllLocked = selectedNodes.length > 0 && selectedNodes.every((node) => node.locked)
  const selectionAnyLocked = selectedNodes.some((node) => node.locked)
  const selectedSourceNodeIds = useMemo(
    () =>
      Array.from(
        new Set(
          selectedNodes
            .map((node) => getCanvasShellSourceId(node))
            .filter((sourceId): sourceId is string => typeof sourceId === 'string')
        )
      ),
    [selectedNodes]
  )
  const selectedDatabaseSourceId =
    selectedCanvasObject?.displayType === 'database' ? (selectedCanvasObject.sourceId ?? '') : ''
  const { doc: selectedDatabaseDoc } = useDatabaseDoc(selectedDatabaseSourceId)
  const {
    undo: undoSelectedSource,
    redo: redoSelectedSource,
    canUndo: canUndoSelectedSource,
    canRedo: canRedoSelectedSource
  } = useUndo(selectedSourceNodeIds.length === 1 ? selectedSourceNodeIds[0] : null, {
    localDID: did ?? null,
    options: {
      mergeInterval: 750
    }
  })
  const {
    undo: undoSelectedSourceScope,
    redo: redoSelectedSourceScope,
    canUndo: canUndoSelectedSourceScope,
    canRedo: canRedoSelectedSourceScope
  } = useUndoScope(selectedSourceNodeIds, {
    localDID: did ?? null,
    options: {
      mergeInterval: 750
    }
  })

  const currentCanvasSourceReferences = useMemo(() => {
    void sceneRevision

    if (!doc || !selectedCanvasObject?.sourceId) {
      return []
    }

    const refs: CanvasSourceReference[] = []
    const nodesMap = getCanvasObjectsMap<CanvasNode>(doc)

    nodesMap.forEach((value: unknown, key: string) => {
      const node = value as CanvasNode
      if (getCanvasShellSourceId(node) !== selectedCanvasObject.sourceId) {
        return
      }

      if (key === selectedCanvasObject.node.id) {
        return
      }

      refs.push({
        sourceNodeId: selectedCanvasObject.sourceId,
        canvasId: docId,
        canvasTitle: canvas?.title || 'Workspace Canvas',
        objectId: key,
        objectType: node.type,
        alias: typeof node.alias === 'string' && node.alias.trim().length > 0 ? node.alias : null,
        title:
          node.alias ??
          (node.properties.title as string) ??
          documentMap.get(selectedCanvasObject.sourceId)?.title ??
          'Untitled',
        isCurrentCanvas: true
      })
    })

    return refs
  }, [canvas?.title, doc, docId, documentMap, sceneRevision, selectedCanvasObject])

  const selectedSourceReferences = useMemo(() => {
    if (!selectedCanvasObject?.sourceId) {
      return []
    }

    const merged = new Map<string, CanvasSourceReference>()

    currentCanvasSourceReferences.forEach((reference) => {
      merged.set(reference.objectId, reference)
    })

    getReferences(selectedCanvasObject.sourceId, {
      excludeObjectId: selectedCanvasObject.node.id
    }).forEach((reference) => {
      merged.set(reference.objectId, reference)
    })

    return Array.from(merged.values()).sort(sortCanvasSourceReferences)
  }, [currentCanvasSourceReferences, getReferences, selectedCanvasObject])
  const selectedObjectCommentCount = useMemo(() => {
    if (!selectedCanvasObject) {
      return 0
    }

    return canvasObjectCommentThreads.filter((thread) => {
      try {
        return (
          decodeAnchor<CanvasObjectAnchor>(thread.root.properties.anchorData).objectId ===
          selectedCanvasObject.node.id
        )
      } catch {
        return false
      }
    }).length
  }, [canvasObjectCommentThreads, selectedCanvasObject])
  const recordUndoBoundary = useCallback((domain: CanvasUndoDomain) => {
    undoOrderSequenceRef.current += 1
    undoOrderRef.current[domain].push(undoOrderSequenceRef.current)
    redoOrderRef.current = createUndoOrderMap()
    setActiveUndoDomain(domain)
  }, [])
  const getUndoBoundaryOrder = useCallback(
    (domain: CanvasUndoDomain, direction: 'undo' | 'redo'): number => {
      const stack =
        direction === 'undo' ? undoOrderRef.current[domain] : redoOrderRef.current[domain]
      return stack.length > 0 ? (stack.at(-1) ?? -1) : -1
    },
    []
  )
  const applyUndoBoundary = useCallback((domain: CanvasUndoDomain, direction: 'undo' | 'redo') => {
    const sourceStack =
      direction === 'undo' ? undoOrderRef.current[domain] : redoOrderRef.current[domain]
    const targetStack =
      direction === 'undo' ? redoOrderRef.current[domain] : undoOrderRef.current[domain]
    const boundaryOrder = sourceStack.pop()

    if (typeof boundaryOrder === 'number') {
      targetStack.push(boundaryOrder)
    }

    setActiveUndoDomain(domain)
  }, [])
  const canvasPresenceIntent = useMemo(() => {
    if (peekState) {
      return {
        activity: 'peeking' as const,
        editingNodeId: peekState.nodeId
      }
    }

    if (!selectedCanvasObject) {
      return null
    }

    if (selectionPanel === 'comment') {
      return {
        activity: 'commenting' as const,
        editingNodeId: selectedCanvasObject.node.id
      }
    }

    if (selectionPanel === 'alias') {
      return {
        activity: 'editing' as const,
        editingNodeId: selectedCanvasObject.node.id
      }
    }

    return null
  }, [peekState, selectedCanvasObject, selectionPanel])

  const peekedCanvasObject = useMemo<CanvasResolvedObject | null>(() => {
    if (!peekState || !doc) {
      return null
    }

    if (
      selectedCanvasObject?.node.id === peekState.nodeId &&
      selectedCanvasObject.sourceId === peekState.sourceId &&
      selectedCanvasObject.displayType === peekState.displayType
    ) {
      return selectedCanvasObject
    }

    const node = getCanvasObjectsMap<CanvasNode>(doc).get(peekState.nodeId)
    if (!node) {
      return null
    }

    const sourceId = getCanvasShellSourceId(node)
    const linkedDocument = sourceId ? documentMap.get(sourceId) : undefined
    const displayType = getCanvasViewDisplayType(node, linkedDocument)

    if (sourceId !== peekState.sourceId || displayType !== peekState.displayType) {
      return null
    }

    return {
      node,
      sourceId,
      sourceType: getCanvasShellSourceType(node, linkedDocument),
      displayType,
      title: node.alias ?? linkedDocument?.title ?? (node.properties.title as string) ?? 'Untitled'
    }
  }, [doc, documentMap, peekState, selectedCanvasObject])

  useEffect(() => {
    if (!selectedDatabaseDoc) {
      selectedDatabaseUndoManagerRef.current = null
      return
    }

    const dataMap = selectedDatabaseDoc.getMap('data')
    const manager = new Y.UndoManager([dataMap], { captureTimeout: 300 })
    selectedDatabaseUndoManagerRef.current = manager

    return () => {
      manager.destroy()
      if (selectedDatabaseUndoManagerRef.current === manager) {
        selectedDatabaseUndoManagerRef.current = null
      }
    }
  }, [selectedDatabaseDoc])

  useEffect(() => {
    if (!doc) return
    setCanvasReady(true)
  }, [doc])

  useEffect(() => {
    if (!canvasReady || !canvasRef.current) return
    lastViewportSnapshotRef.current = canvasRef.current.getViewportSnapshot()
  }, [canvasReady])

  useEffect(() => {
    if (!peekState) {
      return
    }

    if (!doc) {
      return
    }

    const node = getCanvasObjectsMap<CanvasNode>(doc).get(peekState.nodeId)
    const sourceId = node ? getCanvasShellSourceId(node) : undefined
    const linkedDocument = sourceId ? documentMap.get(sourceId) : undefined
    const displayType = node ? getCanvasViewDisplayType(node, linkedDocument) : null

    if (!node || sourceId !== peekState.sourceId || displayType !== peekState.displayType) {
      setPeekState(null)
    }
  }, [doc, documentMap, peekState])

  useEffect(() => {
    if (!selectedCanvasObject) {
      setSelectionPanel(null)
      setAliasDraft('')
      setCommentDraft('')
      return
    }

    if (
      (selectionPanel === 'alias' || selectionPanel === 'references') &&
      !selectedCanvasObject.sourceId
    ) {
      setSelectionPanel(null)
    }

    setAliasDraft(selectedCanvasObject.node.alias ?? '')
  }, [selectedCanvasObject, selectionPanel])

  useEffect(() => {
    if (!doc) return

    const nodesMap = getCanvasObjectsMap<CanvasNode>(doc)
    const syncHasNodes = () => {
      setHasNodes(nodesMap.size > 0)
      setSceneRevision((current) => current + 1)
    }

    syncHasNodes()
    nodesMap.observe(syncHasNodes)

    return () => {
      nodesMap.unobserve(syncHasNodes)
    }
  }, [doc])

  useEffect(() => {
    const testHarness = window as Window & {
      __xnetCanvasTestHarness?: {
        registerCanvasDoc?: (canvasId: string, doc: import('yjs').Doc | null) => void
        registerCanvasAwareness?: (canvasId: string, awareness: unknown | null) => void
      } | null
    }

    testHarness.__xnetCanvasTestHarness?.registerCanvasDoc?.(docId, doc)
    testHarness.__xnetCanvasTestHarness?.registerCanvasAwareness?.(docId, awareness ?? null)

    return () => {
      testHarness.__xnetCanvasTestHarness?.registerCanvasDoc?.(docId, null)
      testHarness.__xnetCanvasTestHarness?.registerCanvasAwareness?.(docId, null)
    }
  }, [awareness, doc, docId])

  const placeLinkedDocumentNode = useCallback(
    (document: LinkedDocumentItem): boolean => {
      if (document.type === 'canvas') {
        return false
      }

      const canvasKind = document.canvasKind ?? document.type
      const properties =
        canvasKind === 'note'
          ? {
              ...createCanvasShellNoteProperties(),
              title: document.title
            }
          : { title: document.title }

      const placed = Boolean(
        placeSourceObject({
          objectKind: canvasKind,
          sourceNodeId: document.id,
          sourceSchemaId:
            document.type === 'page' ? PageSchema._schemaId : DatabaseSchema._schemaId,
          title: document.title,
          properties
        })
      )

      if (placed) {
        recordUndoBoundary('scene')
      }

      return placed
    },
    [placeSourceObject, recordUndoBoundary]
  )

  useEffect(() => {
    if (!pendingInsert || handledInsertIdsRef.current.has(pendingInsert.requestId)) {
      return
    }

    const inserted = placeLinkedDocumentNode(pendingInsert.document)

    if (!inserted) {
      return
    }

    handledInsertIdsRef.current.add(pendingInsert.requestId)
    onPendingInsertConsumed?.(pendingInsert.requestId)
  }, [onPendingInsertConsumed, pendingInsert, placeLinkedDocumentNode])

  const focusLinkedDocument = useCallback(
    (linkedDocumentId: string): ViewportSnapshot | null => {
      if (!doc || !canvasRef.current) return null

      const nodesMap = getCanvasObjectsMap<CanvasNode>(doc)
      const targetNode = Array.from(nodesMap.values()).find(
        (node) => getCanvasShellSourceId(node) === linkedDocumentId
      )
      if (!targetNode) return null

      const snapshot = canvasRef.current.getViewportSnapshot()
      lastViewportSnapshotRef.current = snapshot
      canvasRef.current.fitToRect(getNodeRect(targetNode), 140)
      return snapshot
    },
    [doc]
  )

  const restoreViewport = useCallback((snapshot: ViewportSnapshot) => {
    lastViewportSnapshotRef.current = snapshot
    canvasRef.current?.setViewportSnapshot(snapshot)
  }, [])

  const focusCanvasSurface = useCallback(() => {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-canvas-surface="true"]')?.focus()
    })
  }, [])

  const closePeekSurface = useCallback(() => {
    setPeekState(null)
    focusCanvasSurface()
  }, [focusCanvasSurface])

  const closeSelectionPanel = useCallback(() => {
    setSelectionPanel(null)
    focusCanvasSurface()
  }, [focusCanvasSurface])

  const clearCanvasSelection = useCallback(() => {
    closeSelectionPanel()
    closePeekSurface()
    canvasRef.current?.clearSelection()
  }, [closePeekSurface, closeSelectionPanel])

  const zoomCanvas = useCallback((direction: 'out' | 'in'): boolean => {
    const handle = canvasRef.current
    if (!handle) {
      return false
    }

    const snapshot = handle.getViewportSnapshot()
    const nextZoom =
      direction === 'in' ? Math.min(snapshot.zoom * 1.5, 4) : Math.max(snapshot.zoom / 1.5, 0.1)

    if (nextZoom === snapshot.zoom) {
      return false
    }

    const nextSnapshot = {
      ...snapshot,
      zoom: nextZoom
    }

    lastViewportSnapshotRef.current = nextSnapshot
    handle.setViewportSnapshot(nextSnapshot)
    return true
  }, [])

  const fitCanvasContent = useCallback((): boolean => {
    const handle = canvasRef.current
    if (!handle) {
      return false
    }

    handle.fitToContent(50)
    lastViewportSnapshotRef.current = handle.getViewportSnapshot()
    return true
  }, [])

  const resetCanvasView = useCallback((): boolean => {
    const handle = canvasRef.current
    if (!handle) {
      return false
    }

    handle.resetView()
    lastViewportSnapshotRef.current = handle.getViewportSnapshot()
    return true
  }, [])

  const fitSelection = useCallback((): boolean => {
    if (selectedNodes.length === 0) {
      return false
    }

    if (selectedNodes.length === 1) {
      canvasRef.current?.fitToRect(getNodeRect(selectedNodes[0]), 140)
      return true
    }

    const selectionBounds = getSelectionBounds(selectedNodes)
    if (!selectionBounds) {
      return false
    }

    canvasRef.current?.fitToRect(selectionBounds, 140)
    return true
  }, [selectedNodes])

  const toggleSelectionLock = useCallback((): boolean => {
    return canvasRef.current?.toggleSelectionLock() ?? false
  }, [])

  const alignSelection = useCallback(
    (alignment: Extract<CanvasAlignment, 'left' | 'right' | 'top' | 'bottom'>): boolean => {
      return canvasRef.current?.alignSelection(alignment) ?? false
    },
    []
  )

  const distributeSelection = useCallback((axis: CanvasDistributionAxis): boolean => {
    return canvasRef.current?.distributeSelection(axis) ?? false
  }, [])

  const tidySelection = useCallback((): boolean => {
    return canvasRef.current?.tidySelection() ?? false
  }, [])

  const clusterSelection = useCallback((): boolean => {
    return canvasRef.current?.clusterSelection() ?? false
  }, [])

  const stackSelection = useCallback((): boolean => {
    return canvasRef.current?.stackSelection() ?? false
  }, [])

  const convertSelectionToMindMap = useCallback((): boolean => {
    return canvasRef.current?.convertSelectionToMindMap() ?? false
  }, [])

  const shiftSelectionLayer = useCallback((direction: CanvasLayerDirection): boolean => {
    return canvasRef.current?.shiftSelectionLayer(direction) ?? false
  }, [])

  const connectSelection = useCallback((): boolean => {
    return canvasRef.current?.connectSelection() ?? false
  }, [])

  const focusSelectionSurface = useCallback(
    (
      sourceId: string,
      displayType: PeekableCanvasDisplayType,
      scope: 'peek' | 'inline' = 'inline'
    ) => {
      window.requestAnimationFrame(() => {
        const targetSelector =
          displayType === 'database'
            ? `[data-canvas-source-id="${sourceId}"] [data-canvas-database-title="true"]`
            : `[data-canvas-source-id="${sourceId}"] [data-canvas-page-title="true"]`
        const scopeSelector =
          scope === 'peek' ? `[data-canvas-peek-surface="true"] ${targetSelector}` : targetSelector
        const target =
          document.querySelector<HTMLElement>(scopeSelector) ??
          document.querySelector<HTMLElement>(targetSelector)
        target?.focus()
        if (target instanceof HTMLInputElement) {
          target.select()
        }
      })
    },
    []
  )

  useEffect(() => {
    if (!peekState?.sourceId || !isPeekableCanvasDisplayType(peekState.displayType)) {
      return
    }

    focusSelectionSurface(peekState.sourceId, peekState.displayType, 'peek')
  }, [focusSelectionSurface, peekState])

  const openSelection = useCallback(
    (mode: 'peek' | 'focus' | 'split' = 'focus'): boolean => {
      if (!selectedCanvasObject) {
        return false
      }

      if (mode === 'peek') {
        const didFit = fitSelection()

        if (
          selectedCanvasObject.sourceId &&
          isPeekableCanvasDisplayType(selectedCanvasObject.displayType)
        ) {
          setPeekState({
            nodeId: selectedCanvasObject.node.id,
            sourceId: selectedCanvasObject.sourceId,
            displayType: selectedCanvasObject.displayType
          })
          focusSelectionSurface(
            selectedCanvasObject.sourceId,
            selectedCanvasObject.displayType,
            'peek'
          )
          return true
        }

        return didFit
      }

      if (
        mode === 'split' &&
        selectedCanvasObject.displayType === 'database' &&
        selectedCanvasObject.sourceId
      ) {
        if (!onOpenDatabaseSplit) {
          return false
        }

        closePeekSurface()
        onOpenDatabaseSplit?.(selectedCanvasObject.sourceId)
        return true
      }

      if (!selectedCanvasObject.sourceId || !selectedCanvasObject.sourceType) {
        return false
      }

      closePeekSurface()
      onOpenDocument?.(selectedCanvasObject.sourceId, selectedCanvasObject.sourceType)
      return true
    },
    [
      closePeekSurface,
      fitSelection,
      focusSelectionSurface,
      onOpenDatabaseSplit,
      onOpenDocument,
      selectedCanvasObject
    ]
  )

  const openCanvasObjectSource = useCallback(
    ({
      node,
      sourceId,
      sourceType,
      displayType,
      mode
    }: {
      node: CanvasNode
      sourceId: string
      sourceType: Exclude<LinkedDocType, 'canvas'> | null
      displayType: PeekableCanvasDisplayType
      mode: 'peek' | 'focus'
    }): boolean => {
      canvasRef.current?.selectNodes([node.id])
      setSelectionPanel(null)

      if (mode === 'peek') {
        setPeekState({
          nodeId: node.id,
          sourceId,
          displayType
        })
        focusSelectionSurface(sourceId, displayType, 'peek')
        return true
      }

      if (!sourceType) {
        return false
      }

      closePeekSurface()
      onOpenDocument?.(sourceId, sourceType)
      return true
    },
    [closePeekSurface, focusSelectionSurface, onOpenDocument]
  )

  const handleSurfaceDrop = useCallback(
    (
      event: React.DragEvent<HTMLDivElement>,
      context: {
        screenToCanvas: (clientX: number, clientY: number) => { x: number; y: number }
      }
    ) => {
      void ingestDataTransfer(event.dataTransfer, {
        canvasPoint: context.screenToCanvas(event.clientX, event.clientY)
      })
    },
    [ingestDataTransfer]
  )

  const handleSurfacePaste = useCallback(
    (
      event: React.ClipboardEvent<HTMLDivElement>,
      _context: {
        screenToCanvas: (clientX: number, clientY: number) => { x: number; y: number }
      }
    ) => {
      const payloads = extractCanvasIngressPayloads(event.clipboardData)
      const hasMeaningfulPaste = payloads.some((payload) => payload.kind !== 'text')
      if (!hasMeaningfulPaste) {
        return
      }

      event.preventDefault()
      void ingestDataTransfer(event.clipboardData)
    },
    [ingestDataTransfer]
  )

  useEffect(() => {
    if (!peekedCanvasObject) {
      return
    }

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      event.preventDefault()
      closePeekSurface()
    }

    window.addEventListener('keydown', handleWindowKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown, true)
    }
  }, [closePeekSurface, peekedCanvasObject])

  const toggleShortcutHelp = useCallback(
    (open?: boolean) => {
      const nextOpen = typeof open === 'boolean' ? open : !shortcutHelpOpen
      setShortcutHelpOpen(nextOpen)

      if (!nextOpen) {
        focusCanvasSurface()
      }
    },
    [focusCanvasSurface, shortcutHelpOpen]
  )

  const runCanvasScopedUndo = useCallback(
    (direction: 'undo' | 'redo'): boolean => {
      const canSelectedSource = direction === 'undo' ? canUndoSelectedSource : canRedoSelectedSource
      const canSelectedSourceScope =
        direction === 'undo' ? canUndoSelectedSourceScope : canRedoSelectedSourceScope
      const canSelectedSourceDocument =
        getYjsStackDepth(
          selectedDatabaseUndoManagerRef.current,
          direction === 'undo' ? 'undoStack' : 'redoStack'
        ) > 0

      const runScene = (): boolean => {
        const handled =
          direction === 'undo'
            ? (canvasRef.current?.undo() ?? false)
            : (canvasRef.current?.redo() ?? false)

        if (handled) {
          applyUndoBoundary('scene', direction)
        }

        return handled
      }

      const runSelectedSource = (): boolean => {
        if (!canSelectedSource) {
          return false
        }

        applyUndoBoundary('source-node', direction)
        void (direction === 'undo' ? undoSelectedSource() : redoSelectedSource())
        return true
      }

      const runSelectedSourceScope = (): boolean => {
        if (!canSelectedSourceScope) {
          return false
        }

        applyUndoBoundary('source-scope', direction)
        void (direction === 'undo' ? undoSelectedSourceScope() : redoSelectedSourceScope())
        return true
      }

      const runSelectedSourceDocument = (): boolean => {
        if (!canSelectedSourceDocument || !selectedDatabaseUndoManagerRef.current) {
          return false
        }

        applyUndoBoundary('source-document', direction)
        if (direction === 'undo') {
          selectedDatabaseUndoManagerRef.current.undo()
        } else {
          selectedDatabaseUndoManagerRef.current.redo()
        }
        return true
      }

      const orderedDomains = (
        [
          { domain: 'scene', available: true, run: runScene },
          {
            domain: 'source-document',
            available: canSelectedSourceDocument,
            run: runSelectedSourceDocument
          },
          {
            domain: 'source-scope',
            available: canSelectedSourceScope,
            run: runSelectedSourceScope
          },
          { domain: 'source-node', available: canSelectedSource, run: runSelectedSource }
        ] as const
      )
        .filter((entry) => entry.available)
        .sort(
          (left, right) =>
            getUndoBoundaryOrder(right.domain, direction) -
            getUndoBoundaryOrder(left.domain, direction)
        )

      for (const entry of orderedDomains) {
        if (entry.run()) {
          return true
        }
      }

      return false
    },
    [
      applyUndoBoundary,
      canRedoSelectedSource,
      canRedoSelectedSourceScope,
      canUndoSelectedSource,
      canUndoSelectedSourceScope,
      getUndoBoundaryOrder,
      redoSelectedSource,
      redoSelectedSourceScope,
      undoSelectedSource,
      undoSelectedSourceScope
    ]
  )

  const handleDismissTransientUi = useCallback((): boolean => {
    if (selectionPanel) {
      closeSelectionPanel()
      return true
    }

    if (peekedCanvasObject) {
      closePeekSurface()
      return true
    }

    if (!shortcutHelpOpen) {
      return false
    }

    setShortcutHelpOpen(false)
    return true
  }, [closePeekSurface, closeSelectionPanel, peekedCanvasObject, selectionPanel, shortcutHelpOpen])

  const setSelectedSourceAlias = useCallback(
    (nextAlias: string | null): boolean => {
      if (!doc || !selectedCanvasObject?.sourceId) {
        return false
      }

      const nodesMap = getCanvasObjectsMap<CanvasNode>(doc)
      const current = nodesMap.get(selectedCanvasObject.node.id)
      if (!current) {
        return false
      }

      const normalized = nextAlias?.trim() ?? ''
      const resolvedAlias = normalized.length > 0 ? normalized : undefined

      if ((current.alias ?? undefined) === resolvedAlias) {
        closeSelectionPanel()
        return true
      }

      doc.transact(() => {
        nodesMap.set(current.id, {
          ...current,
          alias: resolvedAlias
        })
      })

      recordUndoBoundary('scene')

      closeSelectionPanel()
      return true
    },
    [closeSelectionPanel, doc, recordUndoBoundary, selectedCanvasObject]
  )

  const openAliasEditor = useCallback((): boolean => {
    if (!selectedCanvasObject?.sourceId) {
      return false
    }

    setAliasDraft(selectedCanvasObject.node.alias ?? '')
    setSelectionPanel('alias')
    return true
  }, [selectedCanvasObject])

  const openCommentComposer = useCallback((): boolean => {
    if (!selectedCanvasObject) {
      return false
    }

    setCommentDraft('')
    setSelectionPanel('comment')
    return true
  }, [selectedCanvasObject])

  const clearSelectionAlias = useCallback((): boolean => {
    return setSelectedSourceAlias(null)
  }, [setSelectedSourceAlias])

  const toggleSourceReferences = useCallback(
    (open?: boolean): boolean => {
      if (!selectedCanvasObject?.sourceId) {
        return false
      }

      setSelectionPanel((current) => {
        const nextOpen = typeof open === 'boolean' ? open : current !== 'references'
        return nextOpen ? 'references' : null
      })
      return true
    },
    [selectedCanvasObject]
  )

  const handleRevealSourceReference = useCallback(
    (objectId: string): boolean => {
      if (!doc) {
        return false
      }

      const node = getCanvasObjectsMap<CanvasNode>(doc).get(objectId)
      if (!node) {
        return false
      }

      closeSelectionPanel()
      closePeekSurface()
      canvasRef.current?.selectNodes([objectId])
      canvasRef.current?.fitToRect(getNodeRect(node), 140)
      return true
    },
    [closePeekSurface, closeSelectionPanel, doc]
  )

  useEffect(() => {
    if (selectionPanel !== 'alias') {
      return
    }

    window.requestAnimationFrame(() => {
      aliasInputRef.current?.focus()
      aliasInputRef.current?.select()
    })
  }, [selectionPanel])

  useEffect(() => {
    if (selectionPanel !== 'comment') {
      return
    }

    window.requestAnimationFrame(() => {
      commentInputRef.current?.focus()
    })
  }, [selectionPanel])

  const submitSelectionComment = useCallback(async (): Promise<boolean> => {
    if (!selectedCanvasObject) {
      return false
    }

    const content = commentDraft.trim()
    if (!content) {
      return false
    }

    const anchor: CanvasObjectAnchor = {
      objectId: selectedCanvasObject.node.id,
      anchorId: createCanvasObjectAnchorId({
        objectId: selectedCanvasObject.node.id,
        placement: 'right'
      }),
      placement: 'right'
    }

    const createdCommentId = await addCanvasComment({
      content,
      anchorType: 'canvas-object',
      anchorData: encodeAnchor(anchor),
      targetSchema: CanvasSchema._schemaId
    })

    if (!createdCommentId) {
      return false
    }

    setCommentDraft('')
    closeSelectionPanel()
    return true
  }, [addCanvasComment, closeSelectionPanel, commentDraft, selectedCanvasObject])

  const createShape = useCallback(
    (shapeType: ShapeType = 'rectangle'): boolean => {
      const created = Boolean(
        placePrimitiveObject({
          objectKind: 'shape',
          title: getShapeLabel(shapeType),
          properties: {
            title: getShapeLabel(shapeType),
            label: getShapeLabel(shapeType),
            shapeType
          }
        })
      )

      if (created) {
        recordUndoBoundary('scene')
      }

      return created
    },
    [placePrimitiveObject, recordUndoBoundary]
  )

  const createFrame = useCallback((): boolean => {
    const created = Boolean(
      placePrimitiveObject({
        objectKind: 'group',
        title: 'Frame',
        rect: {
          width: 640,
          height: 420
        },
        properties: createCanvasFrameVariantProperties('standard', {
          title: 'Frame'
        })
      })
    )

    if (created) {
      recordUndoBoundary('scene')
    }

    return created
  }, [placePrimitiveObject, recordUndoBoundary])

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
            query: queryDefinition
          })
        })
      )

      if (created) {
        recordUndoBoundary('scene')
      }

      return created
    },
    [placePrimitiveObject, recordUndoBoundary]
  )

  const createMindMap = useCallback((): boolean => {
    const properties = createCanvasMindMapRootProperties()
    const created = Boolean(
      placePrimitiveObject({
        objectKind: CANVAS_MIND_MAP_CREATION_TOOL.objectKind,
        title: properties.title,
        rect: CANVAS_MIND_MAP_CREATION_TOOL.rootRect,
        properties
      })
    )

    if (created) {
      recordUndoBoundary('scene')
    }

    return created
  }, [placePrimitiveObject, recordUndoBoundary])

  const createPlanningTemplate = useCallback(
    (templateId: CanvasPlanningTemplateId): boolean => {
      const created = canvasRef.current?.createPlanningTemplate(templateId) ?? false

      if (created) {
        recordUndoBoundary('scene')
      }

      return created
    },
    [recordUndoBoundary]
  )

  const createExternalReference = useCallback(
    (url?: string): boolean => {
      const candidate = (
        url ?? window.prompt('Paste a URL to add to the canvas', 'https://')
      )?.trim()

      if (!candidate) {
        return false
      }

      void ingestPayload({ kind: 'text', text: candidate }).then((result) => {
        if (result) {
          recordUndoBoundary('scene')
        }
      })

      return true
    },
    [ingestPayload, recordUndoBoundary]
  )

  const createMediaFile = useCallback((): boolean => {
    const input = mediaFileInputRef.current
    if (!input) {
      return false
    }

    input.click()
    return true
  }, [])

  const handleMediaFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const files = Array.from(event.currentTarget.files ?? [])
      event.currentTarget.value = ''

      if (files.length === 0) {
        return
      }

      void Promise.all(
        files.map((file, index) => ingestPayload({ kind: 'file', file }, { spreadIndex: index }))
      ).then((results) => {
        if (results.some(Boolean)) {
          recordUndoBoundary('scene')
        }
      })
    },
    [ingestPayload, recordUndoBoundary]
  )

  const wrapSelectionInFrame = useCallback((): boolean => {
    return canvasRef.current?.wrapSelectionInFrame() ?? false
  }, [])

  const handleCreateObject = useCallback(
    (kind: 'page' | 'database' | 'note' | 'shape' | 'frame' | 'mind-map') => {
      if (kind === 'page') {
        onCreatePage?.()
        return
      }

      if (kind === 'database') {
        onCreateDatabase?.()
        return
      }

      if (kind === 'shape') {
        createShape()
        return
      }

      if (kind === 'frame') {
        createFrame()
        return
      }

      if (kind === 'mind-map') {
        createMindMap()
        return
      }

      onCreateNote?.()
    },
    [createFrame, createMindMap, createShape, onCreateDatabase, onCreateNote, onCreatePage]
  )

  useEffect(() => {
    onCommandStateChange?.({
      selectionCount: selection.nodeIds.length,
      selectedNodeId: selectedCanvasObject?.node.id ?? null,
      selectedSourceId: selectedCanvasObject?.sourceId ?? null,
      selectedSourceType: selectedCanvasObject?.sourceType ?? null,
      selectedDisplayType: selectedCanvasObject?.displayType ?? null,
      selectedTitle: selectedCanvasObject?.title ?? null,
      selectionAllLocked,
      selectionAnyLocked,
      shortcutHelpOpen
    })
  }, [
    onCommandStateChange,
    selectedCanvasObject,
    selection.nodeIds.length,
    selectionAllLocked,
    selectionAnyLocked,
    shortcutHelpOpen
  ])

  useImperativeHandle(
    ref,
    () => ({
      focusLinkedDocument,
      restoreViewport,
      zoomOut: () => zoomCanvas('out'),
      zoomIn: () => zoomCanvas('in'),
      fitCanvasContent,
      resetCanvasView,
      clearSelection: clearCanvasSelection,
      fitSelection,
      openSelection,
      toggleSelectionLock,
      alignSelection,
      distributeSelection,
      tidySelection,
      clusterSelection,
      stackSelection,
      convertSelectionToMindMap,
      shiftSelectionLayer,
      connectSelection,
      createShape,
      createFrame,
      createMindMap,
      createPlanningTemplate,
      createQueryFrameFromSavedView,
      createExternalReference,
      createMediaFile,
      wrapSelectionInFrame,
      openAliasEditor,
      openCommentComposer,
      clearSelectionAlias,
      toggleSourceReferences,
      toggleShortcutHelp
    }),
    [
      alignSelection,
      clearCanvasSelection,
      clusterSelection,
      convertSelectionToMindMap,
      createExternalReference,
      createFrame,
      createMindMap,
      createPlanningTemplate,
      createQueryFrameFromSavedView,
      createMediaFile,
      createShape,
      connectSelection,
      clearSelectionAlias,
      distributeSelection,
      fitCanvasContent,
      fitSelection,
      focusLinkedDocument,
      openAliasEditor,
      openCommentComposer,
      openSelection,
      resetCanvasView,
      restoreViewport,
      shiftSelectionLayer,
      stackSelection,
      tidySelection,
      toggleSourceReferences,
      toggleSelectionLock,
      toggleShortcutHelp,
      wrapSelectionInFrame,
      zoomCanvas
    ]
  )

  if (loading || !doc) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading canvas...</p>
      </div>
    )
  }

  if (!canvasReady) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Preparing canvas...</p>
      </div>
    )
  }

  return (
    <div
      className="relative h-full flex-1 overflow-hidden"
      data-canvas-view="true"
      data-canvas-theme={theme.mode}
      data-canvas-undo-domain={activeUndoDomain}
    >
      <input
        ref={mediaFileInputRef}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-canvas-media-file-input="true"
        onChange={handleMediaFileInputChange}
      />
      <div
        className="pointer-events-none absolute left-6 top-6 z-20 rounded-full border border-border/60 bg-background/80 px-4 py-2 text-xs uppercase tracking-[0.24em] text-muted-foreground shadow-lg backdrop-blur-xl"
        data-canvas-home-badge="true"
        data-canvas-theme={theme.mode}
      >
        {canvas?.title || 'Workspace Canvas'}
      </div>

      {selection.nodeIds.length > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 top-6 z-20 flex justify-center px-4">
          <div
            className="pointer-events-auto flex max-w-[min(92vw,780px)] items-center gap-2 rounded-full border border-border/60 bg-background/82 px-3 py-2 shadow-lg shadow-black/5 backdrop-blur-xl"
            data-canvas-selection-hud="true"
            data-canvas-selection-count={selection.nodeIds.length}
            data-canvas-selection-type={selectedCanvasObject?.displayType ?? 'mixed'}
            data-canvas-selection-all-locked={selectionAllLocked ? 'true' : 'false'}
            data-canvas-theme={theme.mode}
          >
            <span className="truncate px-2 text-sm text-foreground">
              {selectedCanvasObject
                ? `${
                    selectedCanvasObject.displayType === 'note'
                      ? 'Note'
                      : selectedCanvasObject.displayType === 'database'
                        ? 'Database'
                        : selectedCanvasObject.displayType === 'external-reference'
                          ? 'Link'
                          : selectedCanvasObject.displayType === 'media'
                            ? 'Media'
                            : selectedCanvasObject.displayType === 'shape'
                              ? 'Shape'
                              : selectedCanvasObject.displayType === 'frame'
                                ? 'Frame'
                                : 'Page'
                  } · ${selectedCanvasObject.title}`
                : `${selection.nodeIds.length} selected`}
            </span>

            {selectedCanvasObject ? (
              <>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  onClick={() => {
                    void openSelection('peek')
                  }}
                  data-canvas-selection-action="peek"
                >
                  <Eye size={12} />
                  {selectedCanvasObject.displayType === 'page' ||
                  selectedCanvasObject.displayType === 'database' ||
                  selectedCanvasObject.displayType === 'note'
                    ? 'Peek'
                    : 'Center'}
                  <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    Enter
                  </span>
                </button>
                {selectedCanvasObject.sourceId && selectedCanvasObject.sourceType ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    onClick={() => {
                      void openSelection('focus')
                    }}
                    data-canvas-selection-action="focus"
                  >
                    <Command size={12} />
                    Open
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Mod+Enter
                    </span>
                  </button>
                ) : null}
                {selectedCanvasObject.displayType === 'database' &&
                selectedCanvasObject.sourceId ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    onClick={() => {
                      void openSelection('split')
                    }}
                    data-canvas-selection-action="split"
                  >
                    <Database size={12} />
                    Split
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Alt+Enter
                    </span>
                  </button>
                ) : null}
                {selectedCanvasObject.sourceId ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    onClick={() => {
                      openAliasEditor()
                    }}
                    data-canvas-selection-action="alias"
                  >
                    Alias
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Mod+Shift+A
                    </span>
                  </button>
                ) : null}
                {selectedCanvasObject.sourceId ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    onClick={() => {
                      toggleSourceReferences()
                    }}
                    data-canvas-selection-action="references"
                  >
                    Copies {selectedSourceReferences.length}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  onClick={() => {
                    openCommentComposer()
                  }}
                  data-canvas-selection-action="comment"
                >
                  <MessageSquare size={12} />
                  Comment{selectedObjectCommentCount > 0 ? ` ${selectedObjectCommentCount}` : ''}
                  <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    Mod+Shift+C
                  </span>
                </button>
              </>
            ) : null}

            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              onClick={() => {
                toggleSelectionLock()
              }}
              data-canvas-selection-action="lock"
            >
              {selectionAllLocked ? 'Unlock' : 'Lock'}
              <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Mod+Shift+L
              </span>
            </button>

            {selection.nodeIds.length > 1 ? (
              <>
                {selection.nodeIds.length === 2 ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    onClick={() => {
                      connectSelection()
                    }}
                    data-canvas-selection-action="connect"
                  >
                    <Link2 size={12} />
                    Connect
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Mod+Shift+K
                    </span>
                  </button>
                ) : null}

                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  onClick={() => {
                    alignSelection('left')
                  }}
                  data-canvas-selection-action="align-left"
                >
                  Align left
                  <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    Mod+Shift+←
                  </span>
                </button>

                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  onClick={() => {
                    distributeSelection('horizontal')
                  }}
                  data-canvas-selection-action="distribute"
                >
                  Distribute
                </button>

                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  onClick={() => {
                    tidySelection()
                  }}
                  data-canvas-selection-action="tidy"
                >
                  Tidy
                </button>
              </>
            ) : null}

            {selection.nodeIds.length > 0 ? (
              <>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  onClick={() => {
                    shiftSelectionLayer('backward')
                  }}
                  data-canvas-selection-action="send-backward"
                >
                  Back
                  <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    [
                  </span>
                </button>

                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  onClick={() => {
                    shiftSelectionLayer('forward')
                  }}
                  data-canvas-selection-action="bring-forward"
                >
                  Forward
                  <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    ]
                  </span>
                </button>
              </>
            ) : null}

            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              onClick={clearCanvasSelection}
              data-canvas-selection-action="clear"
            >
              <X size={12} />
              Clear
              <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Esc
              </span>
            </button>
          </div>
        </div>
      ) : null}

      {selectionPanel && selectedCanvasObject ? (
        <div className="pointer-events-none absolute inset-x-0 top-24 z-20 flex justify-center px-4">
          <div
            className="pointer-events-auto w-[min(92vw,560px)] rounded-[28px] border border-border/60 bg-background/90 p-4 shadow-2xl shadow-black/10 backdrop-blur-xl"
            data-canvas-source-panel={selectionPanel}
            data-canvas-theme={theme.mode}
          >
            {selectionPanel === 'alias' ? (
              <div data-canvas-alias-editor="true">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Canvas alias</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      This renames the canvas object without touching the underlying page or
                      database title.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    onClick={closeSelectionPanel}
                    data-canvas-source-panel-close="true"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <input
                    ref={aliasInputRef}
                    type="text"
                    value={aliasDraft}
                    onChange={(event) => setAliasDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        setSelectedSourceAlias(aliasDraft)
                        return
                      }

                      if (event.key === 'Escape') {
                        event.preventDefault()
                        closeSelectionPanel()
                      }
                    }}
                    placeholder={selectedCanvasObject.title}
                    className="min-w-0 flex-1 rounded-2xl border border-border/60 bg-background px-4 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    data-canvas-alias-input="true"
                  />

                  <button
                    type="button"
                    className="rounded-full border border-border/60 bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    onClick={() => {
                      setSelectedSourceAlias(aliasDraft)
                    }}
                    data-canvas-alias-save="true"
                  >
                    Save
                  </button>

                  <button
                    type="button"
                    className="rounded-full border border-border/60 bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    onClick={() => {
                      clearSelectionAlias()
                    }}
                    data-canvas-alias-clear="true"
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : selectionPanel === 'comment' ? (
              <div data-canvas-comment-editor="true">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Canvas comment</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Anchor a thread to this object. The pin follows the object as it moves, and
                      deleted anchors fall back to the orphan tray.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    onClick={closeSelectionPanel}
                    data-canvas-source-panel-close="true"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-3 rounded-2xl bg-muted/35 px-3 py-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {selectedObjectCommentCount > 0
                    ? `${selectedObjectCommentCount} existing thread${
                        selectedObjectCommentCount === 1 ? '' : 's'
                      } on this object`
                    : 'No existing threads on this object yet'}
                </div>

                <div className="mt-4 space-y-3">
                  <textarea
                    ref={commentInputRef}
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault()
                        void submitSelectionComment()
                        return
                      }

                      if (event.key === 'Escape') {
                        event.preventDefault()
                        closeSelectionPanel()
                      }
                    }}
                    placeholder={`Comment on ${selectedCanvasObject.title}`}
                    className="min-h-[104px] w-full rounded-[24px] border border-border/60 bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    data-canvas-comment-input="true"
                  />

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      Mod+Enter to submit, Esc to close
                    </p>
                    <button
                      type="button"
                      className="rounded-full border border-border/60 bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => {
                        void submitSelectionComment()
                      }}
                      disabled={commentDraft.trim().length === 0}
                      data-canvas-comment-save="true"
                    >
                      Add comment
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div data-canvas-source-references="true">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Linked copies</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Other canvas objects that point at the same source node.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    onClick={closeSelectionPanel}
                    data-canvas-source-panel-close="true"
                  >
                    Close
                  </button>
                </div>

                {sourceReferencesLoading ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    Indexing boards... {indexedReferenceCanvases}/{totalReferenceCanvases}
                  </p>
                ) : selectedSourceReferences.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    No other canvas objects reference this source yet.
                  </p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {selectedSourceReferences.map((reference) => (
                      <div
                        key={`${reference.canvasId}:${reference.objectId}`}
                        className="flex items-center justify-between gap-3 rounded-2xl bg-muted/35 px-3 py-3"
                        data-canvas-source-reference="true"
                        data-canvas-source-reference-canvas-id={reference.canvasId}
                        data-canvas-source-reference-current-canvas={
                          reference.isCurrentCanvas ? 'true' : 'false'
                        }
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {reference.title}
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                            {reference.isCurrentCanvas ? 'This canvas' : reference.canvasTitle}
                          </p>
                        </div>

                        {reference.isCurrentCanvas ? (
                          <button
                            type="button"
                            className="rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                            onClick={() => {
                              handleRevealSourceReference(reference.objectId)
                            }}
                            data-canvas-source-reference-action="reveal"
                          >
                            Reveal
                          </button>
                        ) : (
                          <span className="rounded-full border border-border/60 bg-background px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                            {reference.objectType}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {shortcutHelpOpen ? (
        <div className="pointer-events-none absolute right-6 top-20 z-20 w-[min(92vw,380px)]">
          <div
            className="pointer-events-auto rounded-[28px] border border-border/60 bg-background/90 p-5 shadow-2xl shadow-black/10 backdrop-blur-xl"
            data-canvas-shortcut-help="true"
            data-canvas-theme={theme.mode}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Canvas shortcuts</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Keep the chrome quiet. Create, select, edit, and open directly from the board.
                </p>
              </div>

              <button
                type="button"
                className="rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                onClick={() => toggleShortcutHelp(false)}
                data-canvas-shortcut-help-close="true"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-2 text-sm text-foreground">
              {[
                ['P / D / N / M', 'Create page, database, note, or mind map'],
                ['R / F', 'Create a rectangle or an empty frame'],
                ['Drag handle', 'Pull from a selected card to connect objects'],
                ['Tab', 'Step through canvas objects'],
                ['Arrow keys', 'Pan the board or nudge the selection'],
                ['Enter', 'Peek or edit the selected object'],
                ['Alt+Enter', 'Open the selected database beside the canvas'],
                ['Mod+Enter', 'Open the focused page or database view'],
                ['Mod+Shift+A', 'Edit the selection alias'],
                ['Mod+Shift+C', 'Comment on the selected object'],
                ['Mod+Shift+K', 'Connect the current two-object selection'],
                ['Mod+Shift+L', 'Lock or unlock the current selection'],
                ['Mod+Shift+F', 'Wrap the selection in a frame'],
                ['Mod+Shift+Arrow', 'Align the selection to one edge'],
                ['[ / ]', 'Send the selection backward or forward'],
                ['Mod+Shift+P', 'Open the command palette'],
                ['Mod+1 / Mod+0', 'Fit content or reset the camera'],
                ['Esc', 'Dismiss help or clear the selection']
              ].map(([shortcut, description]) => (
                <div
                  key={shortcut}
                  className="flex items-center justify-between gap-4 rounded-2xl bg-muted/35 px-3 py-2"
                >
                  <span className="text-muted-foreground">{description}</span>
                  <span className="rounded-full border border-border/60 bg-background px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">
                    {shortcut}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {peekedCanvasObject?.sourceId ? (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-6">
          <button
            type="button"
            className="pointer-events-auto absolute inset-0 bg-black/12 backdrop-blur-[2px] dark:bg-black/38"
            onClick={closePeekSurface}
            aria-label="Close canvas peek"
            data-canvas-peek-backdrop="true"
            data-canvas-theme={theme.mode}
          />

          <div
            className="pointer-events-auto relative z-10 h-[min(78vh,760px)] w-[min(88vw,980px)] overflow-hidden rounded-[32px] border border-border/60 bg-background/92 p-3 shadow-2xl shadow-black/15 backdrop-blur-xl transition-transform duration-150"
            data-canvas-peek-surface="true"
            data-canvas-peek-kind={peekedCanvasObject.displayType}
            data-canvas-peek-node-id={peekedCanvasObject.node.id}
            data-canvas-peek-source-id={peekedCanvasObject.sourceId}
            data-canvas-theme={theme.mode}
          >
            <div className="mb-3 flex items-center justify-between gap-3 px-2 pt-1">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Peek
                </span>
                <span className="text-sm text-muted-foreground">{peekedCanvasObject.title}</span>
              </div>

              <button
                type="button"
                className="rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                onClick={closePeekSurface}
                data-canvas-peek-close="true"
              >
                Close
              </button>
            </div>

            <div className="h-[calc(100%-3rem)]">
              {peekedCanvasObject.displayType === 'database' ? (
                <CanvasDatabasePreviewSurface
                  node={peekedCanvasObject.node}
                  docId={peekedCanvasObject.sourceId}
                  mode="peek"
                  onSourceNodeMutated={() => {
                    recordUndoBoundary('source-node')
                  }}
                  onSourceDocumentMutated={() => {
                    recordUndoBoundary('source-document')
                  }}
                  onOpenDocument={(targetDocId) => {
                    closePeekSurface()
                    onOpenDocument?.(targetDocId, 'database')
                  }}
                  onSplitDocument={(targetDocId) => {
                    closePeekSurface()
                    onOpenDatabaseSplit?.(targetDocId)
                  }}
                />
              ) : (
                <CanvasInlinePageSurface
                  node={peekedCanvasObject.node}
                  docId={peekedCanvasObject.sourceId}
                  variant={peekedCanvasObject.displayType === 'note' ? 'note' : 'page'}
                  mode="peek"
                  onSourceNodeMutated={() => {
                    recordUndoBoundary('source-node')
                  }}
                  onOpenDocument={(targetDocId) => {
                    closePeekSurface()
                    onOpenDocument?.(targetDocId, 'page')
                  }}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}

      {!hasNodes ? (
        <div className="pointer-events-none absolute bottom-28 left-1/2 z-20 w-full max-w-xl -translate-x-1/2 px-6">
          <div
            className="mx-auto rounded-[28px] border border-border/60 bg-background/70 px-5 py-4 text-center shadow-2xl shadow-black/5 backdrop-blur-xl"
            data-canvas-empty-state="true"
            data-canvas-theme={theme.mode}
          >
            <p className="text-sm font-medium text-foreground">Canvas-first workspace</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create from the dock or keyboard, frame a cluster with `Mod+Shift+F`, and double-click
              linked content to open it.
            </p>
          </div>
        </div>
      ) : null}

      {queryFrameTargets.map((target) => (
        <CanvasSavedViewQueryFrameExecutor
          key={target.nodeId}
          doc={doc}
          nodeId={target.nodeId}
          descriptorJson={target.descriptorJson}
        />
      ))}

      <div className="h-full">
        <Canvas
          ref={setCanvasHandle}
          doc={doc}
          collectPerformanceMetrics={import.meta.env.DEV}
          awareness={awareness}
          presenceIntent={canvasPresenceIntent}
          config={{
            showGrid: true,
            gridSize: 20,
            minZoom: 0.1,
            maxZoom: 4
          }}
          showMinimap
          showNavigationTools={false}
          onSelectionChange={setSelection}
          onCreateObject={handleCreateObject}
          onOpenSelection={openSelection}
          onToggleShortcutHelp={toggleShortcutHelp}
          onEditSelectionAlias={openAliasEditor}
          onCreateSelectionComment={openCommentComposer}
          onDismissTransientUi={handleDismissTransientUi}
          onUndoRedoShortcut={runCanvasScopedUndo}
          onSceneMutation={() => {
            recordUndoBoundary('scene')
          }}
          onSurfaceDrop={handleSurfaceDrop}
          onSurfacePaste={handleSurfacePaste}
          canvasNodeId={docId}
          canvasSchema={CanvasSchema._schemaId}
          renderNode={(node, context) => {
            const sourceNodeId = getCanvasShellSourceId(node)
            const linkedDocument = sourceNodeId ? documentMap.get(sourceNodeId) : undefined
            const displayType = getCanvasViewDisplayType(node, linkedDocument)
            const sourceType = getCanvasShellSourceType(node, linkedDocument)
            const isPeekedNode = peekedCanvasObject?.node.id === node.id
            const peekableDisplayType = isPeekableCanvasDisplayType(displayType)
              ? displayType
              : null
            const cardActions: CanvasNodeCardActions = {}

            if (sourceNodeId && peekableDisplayType) {
              cardActions.onPeek = () => {
                void openCanvasObjectSource({
                  node,
                  sourceId: sourceNodeId,
                  sourceType,
                  displayType: peekableDisplayType,
                  mode: 'peek'
                })
              }
            }

            if (sourceNodeId && sourceType) {
              cardActions.onOpen = () => {
                void openCanvasObjectSource({
                  node,
                  sourceId: sourceNodeId,
                  sourceType,
                  displayType: peekableDisplayType ?? 'page',
                  mode: 'focus'
                })
              }
            }

            const resolvedCardActions =
              cardActions.onOpen || cardActions.onPeek ? cardActions : undefined

            if (
              sourceNodeId &&
              !isPeekedNode &&
              shouldActivateInlinePageSurface(node, context, linkedDocument)
            ) {
              return (
                <CanvasInlinePageSurface
                  node={node}
                  docId={sourceNodeId}
                  variant={displayType === 'note' ? 'note' : 'page'}
                  onSourceNodeMutated={() => {
                    recordUndoBoundary('source-node')
                  }}
                  onOpenDocument={(targetDocId) => onOpenDocument?.(targetDocId, 'page')}
                />
              )
            }

            if (
              sourceNodeId &&
              !isPeekedNode &&
              shouldActivateDatabasePreviewSurface(node, context, linkedDocument)
            ) {
              return (
                <CanvasDatabasePreviewSurface
                  node={node}
                  docId={sourceNodeId}
                  onSourceNodeMutated={() => {
                    recordUndoBoundary('source-node')
                  }}
                  onSourceDocumentMutated={() => {
                    recordUndoBoundary('source-document')
                  }}
                  onOpenDocument={(targetDocId) => onOpenDocument?.(targetDocId, 'database')}
                  onSplitDocument={onOpenDatabaseSplit}
                />
              )
            }

            if (
              node.type === 'external-reference' ||
              node.type === 'media' ||
              shouldRenderCanvasShellCard(node, linkedDocument)
            ) {
              return renderNodeCard(node, linkedDocument, theme.mode, context, resolvedCardActions)
            }
            return undefined
          }}
          onNodeDoubleClick={(id) => {
            const nodesMap = getCanvasObjectsMap<CanvasNode>(doc)
            const targetNode = nodesMap.get(id)
            const sourceId = targetNode ? getCanvasShellSourceId(targetNode) : undefined
            const sourceType = targetNode ? getCanvasShellSourceType(targetNode) : null
            if (sourceId && sourceType) {
              onOpenDocument?.(sourceId, sourceType)
            }
          }}
        />
      </div>
    </div>
  )
})
