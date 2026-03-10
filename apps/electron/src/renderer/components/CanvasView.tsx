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
  CanvasSelectionSnapshot,
  Rect,
  ShapeType
} from '@xnetjs/canvas'
import {
  Canvas,
  extractCanvasIngressPayloads,
  getSelectionBounds,
  useCanvasThemeTokens,
  useCanvasObjectIngestion
} from '@xnetjs/canvas'
import { CanvasSchema, DatabaseSchema, PageSchema } from '@xnetjs/data'
import { useBlobService } from '@xnetjs/editor/react'
import { useNode, useIdentity } from '@xnetjs/react'
import { Command, Database, Eye, FileImage, FileText, Link2, StickyNote, X } from 'lucide-react'
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import {
  createCanvasShellNoteProperties,
  getCanvasShellDisplayType,
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
  clearSelection: () => void
  fitSelection: () => boolean
  openSelection: (mode?: 'peek' | 'focus' | 'split') => boolean
  toggleSelectionLock: () => boolean
  alignSelection: (
    alignment: Extract<CanvasAlignment, 'left' | 'right' | 'top' | 'bottom'>
  ) => boolean
  distributeSelection: (axis: CanvasDistributionAxis) => boolean
  tidySelection: () => boolean
  shiftSelectionLayer: (direction: CanvasLayerDirection) => boolean
  createShape: (shapeType?: ShapeType) => boolean
  createFrame: () => boolean
  wrapSelectionInFrame: () => boolean
  toggleShortcutHelp: (open?: boolean) => void
}

function getNodeRect(node: CanvasNode): Rect {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.position.width,
    height: node.position.height
  }
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

function isPeekableCanvasDisplayType(
  displayType: LinkedDocType | 'note' | 'external-reference' | 'media' | 'shape' | 'frame'
): displayType is PeekableCanvasDisplayType {
  return displayType === 'page' || displayType === 'database' || displayType === 'note'
}

function renderNodeCard(
  node: CanvasNode,
  document: LinkedDocumentItem | undefined,
  themeMode: 'light' | 'dark'
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
  const summary =
    displayType === 'database'
      ? 'Open a focused database surface from the canvas.'
      : displayType === 'page'
        ? 'Open a focused writing surface from the canvas.'
        : displayType === 'note'
          ? 'A lightweight note pinned directly to the workspace.'
          : displayType === 'external-reference'
            ? typeof node.properties.url === 'string'
              ? node.properties.url
              : 'Dropped link preview'
            : typeof node.properties.mimeType === 'string'
              ? `${String(node.properties.kind ?? 'file')} · ${node.properties.mimeType}`
              : 'Dropped media or file'

  return (
    <div
      className="flex h-full flex-col justify-between rounded-[24px] border border-border/70 bg-background/95 p-4 shadow-lg shadow-black/5"
      data-canvas-node-card="true"
      data-canvas-card-kind={displayType}
      data-canvas-theme={themeMode}
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
        ) : status ? (
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {status}
          </span>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="text-lg font-semibold leading-tight text-foreground">{linkedTitle}</div>
        <p className="text-sm leading-relaxed text-muted-foreground">{summary}</p>
        {displayType === 'external-reference' && typeof node.properties.subtitle === 'string' ? (
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {node.properties.subtitle}
          </p>
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

  const canvasRef = useRef<CanvasHandle>(null)
  const handledInsertIdsRef = useRef<Set<string>>(new Set())
  const lastViewportSnapshotRef = useRef<ViewportSnapshot>({
    x: 0,
    y: 0,
    zoom: 1
  })
  const [canvasReady, setCanvasReady] = useState(false)
  const [hasNodes, setHasNodes] = useState(false)
  const [selection, setSelection] = useState<CanvasSelectionSnapshot>({
    nodeIds: [],
    edgeIds: []
  })
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false)
  const [peekState, setPeekState] = useState<CanvasPeekState | null>(null)
  const documentMap = useMemo(
    () => new Map(documents.map((entry) => [entry.id, entry])),
    [documents]
  )
  const { placeSourceObject, placePrimitiveObject, ingestDataTransfer } = useCanvasObjectIngestion({
    doc,
    blobService,
    getViewportSnapshot: () =>
      canvasRef.current?.getViewportSnapshot() ?? lastViewportSnapshotRef.current
  })

  const selectedCanvasObject = useMemo(() => {
    if (!doc || selection.nodeIds.length !== 1) {
      return null
    }

    const node = doc.getMap<CanvasNode>('nodes').get(selection.nodeIds[0])
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
  }, [doc, documentMap, selection.nodeIds])

  const selectedNodes = useMemo(() => {
    if (!doc || selection.nodeIds.length === 0) {
      return []
    }

    const nodes = doc.getMap<CanvasNode>('nodes')
    return selection.nodeIds
      .map((nodeId) => nodes.get(nodeId))
      .filter((node): node is CanvasNode => node !== undefined)
  }, [doc, selection.nodeIds])

  const selectionAllLocked = selectedNodes.length > 0 && selectedNodes.every((node) => node.locked)
  const selectionAnyLocked = selectedNodes.some((node) => node.locked)

  const peekedCanvasObject = useMemo(() => {
    if (!peekState || !selectedCanvasObject) {
      return null
    }

    return selectedCanvasObject.node.id === peekState.nodeId &&
      selectedCanvasObject.sourceId === peekState.sourceId &&
      selectedCanvasObject.displayType === peekState.displayType
      ? selectedCanvasObject
      : null
  }, [peekState, selectedCanvasObject])

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

    if (
      !selectedCanvasObject ||
      selectedCanvasObject.node.id !== peekState.nodeId ||
      selectedCanvasObject.sourceId !== peekState.sourceId ||
      selectedCanvasObject.displayType !== peekState.displayType
    ) {
      setPeekState(null)
    }
  }, [peekState, selectedCanvasObject])

  useEffect(() => {
    if (!doc) return

    const nodesMap = doc.getMap<CanvasNode>('nodes')
    const syncHasNodes = () => {
      setHasNodes(nodesMap.size > 0)
    }

    syncHasNodes()
    nodesMap.observe(syncHasNodes)

    return () => {
      nodesMap.unobserve(syncHasNodes)
    }
  }, [doc])

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

      return Boolean(
        placeSourceObject({
          objectKind: canvasKind,
          sourceNodeId: document.id,
          sourceSchemaId:
            document.type === 'page' ? PageSchema._schemaId : DatabaseSchema._schemaId,
          title: document.title,
          properties
        })
      )
    },
    [placeSourceObject]
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

      const nodesMap = doc.getMap<CanvasNode>('nodes')
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
  }, [])

  const clearCanvasSelection = useCallback(() => {
    closePeekSurface()
    canvasRef.current?.clearSelection()
  }, [closePeekSurface])

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

  const shiftSelectionLayer = useCallback((direction: CanvasLayerDirection): boolean => {
    return canvasRef.current?.shiftSelectionLayer(direction) ?? false
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

  const toggleShortcutHelp = useCallback((open?: boolean) => {
    setShortcutHelpOpen((current) => (typeof open === 'boolean' ? open : !current))
  }, [])

  const handleDismissTransientUi = useCallback((): boolean => {
    if (peekedCanvasObject) {
      closePeekSurface()
      return true
    }

    if (!shortcutHelpOpen) {
      return false
    }

    setShortcutHelpOpen(false)
    return true
  }, [closePeekSurface, peekedCanvasObject, shortcutHelpOpen])

  const createShape = useCallback(
    (shapeType: ShapeType = 'rectangle'): boolean => {
      return Boolean(
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
    },
    [placePrimitiveObject]
  )

  const createFrame = useCallback((): boolean => {
    return Boolean(
      placePrimitiveObject({
        objectKind: 'group',
        title: 'Frame',
        rect: {
          width: 640,
          height: 420
        },
        properties: {
          title: 'Frame',
          containerRole: 'frame',
          memberIds: [],
          memberCount: 0
        }
      })
    )
  }, [placePrimitiveObject])

  const wrapSelectionInFrame = useCallback((): boolean => {
    return canvasRef.current?.wrapSelectionInFrame() ?? false
  }, [])

  const handleCreateObject = useCallback(
    (kind: 'page' | 'database' | 'note' | 'shape' | 'frame') => {
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

      onCreateNote?.()
    },
    [createFrame, createShape, onCreateDatabase, onCreateNote, onCreatePage]
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
      clearSelection: clearCanvasSelection,
      fitSelection,
      openSelection,
      toggleSelectionLock,
      alignSelection,
      distributeSelection,
      tidySelection,
      shiftSelectionLayer,
      createShape,
      createFrame,
      wrapSelectionInFrame,
      toggleShortcutHelp
    }),
    [
      alignSelection,
      clearCanvasSelection,
      createFrame,
      createShape,
      distributeSelection,
      fitSelection,
      focusLinkedDocument,
      openSelection,
      restoreViewport,
      shiftSelectionLayer,
      tidySelection,
      toggleSelectionLock,
      toggleShortcutHelp,
      wrapSelectionInFrame
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
    <div className="relative h-full flex-1 overflow-hidden" data-canvas-theme={theme.mode}>
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
                ['P / D / N', 'Create page, database, or note'],
                ['R / F', 'Create a rectangle or an empty frame'],
                ['Tab', 'Step through canvas objects'],
                ['Arrow keys', 'Pan the board or nudge the selection'],
                ['Enter', 'Peek or edit the selected object'],
                ['Alt+Enter', 'Open the selected database beside the canvas'],
                ['Mod+Enter', 'Open the focused page or database view'],
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

      <div className="h-full">
        <Canvas
          ref={canvasRef}
          doc={doc}
          awareness={awareness}
          config={{
            showGrid: true,
            gridSize: 20,
            minZoom: 0.1,
            maxZoom: 4
          }}
          showMinimap
          showNavigationTools
          navigationToolsPosition="bottom-right"
          navigationToolsShowZoomLabel={false}
          onSelectionChange={setSelection}
          onCreateObject={handleCreateObject}
          onOpenSelection={openSelection}
          onToggleShortcutHelp={toggleShortcutHelp}
          onDismissTransientUi={handleDismissTransientUi}
          onSurfaceDrop={handleSurfaceDrop}
          onSurfacePaste={handleSurfacePaste}
          navigationToolsStyle={{
            bottom: 24,
            right: 24,
            borderRadius: 24,
            backdropFilter: 'blur(16px)'
          }}
          renderNode={(node, context) => {
            const sourceNodeId = getCanvasShellSourceId(node)
            const linkedDocument = sourceNodeId ? documentMap.get(sourceNodeId) : undefined
            const displayType = getCanvasViewDisplayType(node, linkedDocument)
            const isPeekedNode = peekedCanvasObject?.node.id === node.id

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
              return renderNodeCard(node, linkedDocument, theme.mode)
            }
            return undefined
          }}
          onNodeDoubleClick={(id) => {
            const nodesMap = doc.getMap<CanvasNode>('nodes')
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
