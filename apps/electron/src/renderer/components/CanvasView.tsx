/**
 * Canvas View - Infinite canvas for spatial visualization
 */

import type {
  CanvasAlignment,
  CanvasDistributionAxis,
  CanvasLayerDirection,
  CanvasNode,
  CanvasNodeRenderContext,
  CanvasPlanningTemplateId,
  CanvasQueryFrameExecutionSnapshot,
  CanvasQueryFrameRefreshTrigger,
  CanvasQueryFrameResultCard,
  CanvasQueryFrameResultPreview,
  Rect,
  ShapeType
} from '@xnetjs/canvas'
import {
  Canvas,
  createCanvasQueryFrameDefinitionFromSavedView,
  createCanvasQueryFrameProperties,
  createCanvasQueryFrameResultSummaryFromExecution,
  getCanvasQueryFrameDefinition,
  getCanvasQueryFrameResultPreview,
  getCanvasQueryFrameResultSummary,
  getCanvasObjectsMap,
  getSelectionBounds,
  isCanvasQueryFrameNode,
  shouldRefreshCanvasQueryFrameResult,
  updateCanvasQueryFrameResults,
  useCanvasThemeTokens
} from '@xnetjs/canvas'
import { CanvasSchema, validateSavedViewDescriptor, type SavedViewDescriptor } from '@xnetjs/data'
import {
  renderCanvasNodeCard,
  shouldRenderCanvasNodeCard,
  useBlobService
} from '@xnetjs/editor/react'
import {
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
  CanvasAliasEditorPanel,
  CanvasCommentComposerPanel,
  CanvasShortcutHelpPanel,
  CanvasWidgetNodeCard,
  createCanvasShellNoteProperties,
  getCanvasShellDisplayType,
  getCanvasShellSourceId,
  getCanvasShellSourceType,
  getCanvasViewDisplayType,
  useCanvasViewController,
  type CanvasNodeCardActions,
  type CanvasResolvedObject,
  type CanvasViewDisplayType,
  type CanvasViewportSnapshot as ViewportSnapshot,
  type LinkedDocType,
  type LinkedDocumentItem
} from '@xnetjs/views'
import { Command, Database, Eye, Link2, MessageSquare, RefreshCw, X } from 'lucide-react'
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
import { CanvasDatabasePreviewSurface } from './CanvasDatabasePreviewSurface'
import { CanvasInlinePageSurface } from './CanvasInlinePageSurface'

type PeekableCanvasDisplayType = LinkedDocType | 'note'

type CanvasPeekState = {
  nodeId: string
  sourceId: string
  displayType: PeekableCanvasDisplayType
}

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
  selectedIsQueryFrame: boolean
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
  refreshSelectedQueryFrame: () => boolean
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

function CanvasSavedViewQueryFrameExecutor({
  doc,
  nodeId,
  descriptorJson,
  manualRefreshRequestId
}: {
  doc: Y.Doc | null
  nodeId: string
  descriptorJson: string
  manualRefreshRequestId: string | null
}): null {
  const result = useSavedView(descriptorJson, SOCIAL_QUERY_FRAME_SCHEMA_REGISTRY)
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
  displayType: CanvasViewDisplayType
): displayType is PeekableCanvasDisplayType {
  return displayType === 'page' || displayType === 'database' || displayType === 'note'
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

  const handledInsertIdsRef = useRef<Set<string>>(new Set())
  const [manualQueryFrameRefreshRequests, setManualQueryFrameRefreshRequests] = useState<
    Record<string, string>
  >({})
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false)
  const [peekState, setPeekState] = useState<CanvasPeekState | null>(null)
  const selectedDatabaseUndoManagerRef = useRef<Y.UndoManager | null>(null)
  const undoOrderSequenceRef = useRef(0)
  const undoOrderRef = useRef<Record<CanvasUndoDomain, number[]>>(createUndoOrderMap())
  const redoOrderRef = useRef<Record<CanvasUndoDomain, number[]>>(createUndoOrderMap())
  const [activeUndoDomain, setActiveUndoDomain] = useState<CanvasUndoDomain>('scene')
  const recordUndoBoundary = useCallback((domain: CanvasUndoDomain) => {
    undoOrderSequenceRef.current += 1
    undoOrderRef.current[domain].push(undoOrderSequenceRef.current)
    redoOrderRef.current = createUndoOrderMap()
    setActiveUndoDomain(domain)
  }, [])
  const recordSceneUndoBoundary = useCallback(() => {
    recordUndoBoundary('scene')
  }, [recordUndoBoundary])

  const controller = useCanvasViewController({
    docId,
    doc,
    awareness,
    blobService,
    documents,
    onUndoBoundary: recordSceneUndoBoundary
  })
  const {
    canvasRef,
    setCanvasHandle,
    canvasReady,
    hasNodes,
    sceneRevision,
    lastViewportSnapshotRef,
    focusCanvasSurface,
    selection,
    setSelection,
    selectedNodes,
    selectedObject: selectedCanvasObject,
    selectedCanvasEdge,
    selectionAllLocked,
    selectionAnyLocked,
    selectedSourceNodeIds,
    documentMap,
    selectionPanel,
    setSelectionPanel,
    closeSelectionPanel,
    openAliasEditor,
    openCommentComposer,
    clearSelectedAlias: clearSelectionAlias,
    selectedObjectCommentCount,
    updateCanvasNodeProperties,
    placeSourceObject,
    placePrimitiveObject,
    handleSurfaceDrop,
    handleSurfacePaste,
    createShape,
    createFrame,
    createMindMap,
    createExternalReference,
    createMediaFile,
    mediaFileInputRef,
    handleMediaFileInputChange
  } = controller
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
  // The shared controller reports commenting/editing; peeking is a
  // desktop-only overlay layered on top.
  const canvasPresenceIntent = useMemo(() => {
    if (peekState) {
      return {
        activity: 'peeking' as const,
        editingNodeId: peekState.nodeId
      }
    }

    return controller.canvasPresenceIntent
  }, [controller.canvasPresenceIntent, peekState])

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

  const closePeekSurface = useCallback(() => {
    setPeekState(null)
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

  const toggleSourceReferences = useCallback(
    (open?: boolean): boolean => {
      if (!selectedCanvasObject?.sourceId) {
        return false
      }

      const nextOpen = typeof open === 'boolean' ? open : selectionPanel !== 'references'
      setSelectionPanel(nextOpen ? 'references' : null)
      return true
    },
    [selectedCanvasObject, selectionPanel, setSelectionPanel]
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
        recordUndoBoundary('scene')
      }

      return created
    },
    [placePrimitiveObject, recordUndoBoundary]
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
      selectedIsQueryFrame: Boolean(selectedQueryFrameNode),
      selectionAllLocked,
      selectionAnyLocked,
      shortcutHelpOpen
    })
  }, [
    onCommandStateChange,
    selectedCanvasObject,
    selectedQueryFrameNode,
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
      refreshSelectedQueryFrame,
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
      refreshSelectedQueryFrame,
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

      {selection.nodeIds.length === 0 && selectedCanvasEdge ? (
        <div className="pointer-events-none absolute inset-x-0 top-6 z-20 flex justify-center px-4">
          <div
            className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/60 bg-background/82 px-3 py-2 shadow-lg shadow-black/5 backdrop-blur-xl"
            data-canvas-selection-hud="true"
            data-canvas-selection-type="connector"
            data-canvas-theme={theme.mode}
          >
            <span className="truncate px-2 text-sm text-foreground">
              {`Connector · ${selectedCanvasEdge.relationship?.kind ?? 'relates-to'}`}
              {(selectedCanvasEdge.label ?? selectedCanvasEdge.relationship?.label)
                ? ` · ${selectedCanvasEdge.label ?? selectedCanvasEdge.relationship?.label}`
                : ''}
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              onClick={clearCanvasSelection}
              data-canvas-selection-action="clear"
            >
              <X size={12} />
              Clear
            </button>
          </div>
        </div>
      ) : null}

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
                {selectedQueryFrameDefinition ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    onClick={() => {
                      refreshSelectedQueryFrame()
                    }}
                    data-canvas-selection-action="refresh-query-frame"
                    title={`Refresh ${selectedQueryFrameDefinition.refreshMode} query frame`}
                  >
                    <RefreshCw size={12} />
                    Refresh
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
              <CanvasAliasEditorPanel controller={controller} themeMode={theme.mode} />
            ) : selectionPanel === 'comment' ? (
              <CanvasCommentComposerPanel controller={controller} themeMode={theme.mode} />
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
          <CanvasShortcutHelpPanel
            themeMode={theme.mode}
            onClose={() => toggleShortcutHelp(false)}
            extraEntries={[['Alt+Enter', 'Open the selected database beside the canvas']]}
          />
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
          manualRefreshRequestId={manualQueryFrameRefreshRequests[target.nodeId] ?? null}
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

            if (node.type === 'widget') {
              // Dashboard widget nodes sync from any platform; render them
              // through the shared runtime host so they hydrate identically
              // here and on the web (0277 W2).
              return <CanvasWidgetNodeCard node={node} lod={context.lod} />
            }

            if (shouldRenderCanvasNodeCard(node, linkedDocument)) {
              return renderCanvasNodeCard(node, {
                themeMode: theme.mode,
                document: linkedDocument,
                context,
                actions: resolvedCardActions,
                blobService,
                onUpdateNodeProperties: updateCanvasNodeProperties,
                externalReferenceRenderMode: 'compact'
              })
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
