/**
 * Canvas View - Infinite canvas for spatial visualization
 */

import type {
  CanvasAlignment,
  CanvasDistributionAxis,
  CanvasLayerDirection,
  CanvasNode,
  CanvasPlanningTemplateId,
  Rect,
  ShapeType
} from '@xnetjs/canvas'
import {
  Canvas,
  getCanvasObjectsMap,
  getSelectionBounds,
  useCanvasThemeTokens
} from '@xnetjs/canvas'
import { CanvasSchema, DatabaseSchema, PageSchema } from '@xnetjs/data'
import {
  CanvasDatabasePreviewSurface,
  CanvasInlinePageSurface,
  CanvasPeekOverlay,
  renderCanvasNodeCard,
  shouldRenderCanvasNodeCard,
  useBlobService,
  useCanvasPeek
} from '@xnetjs/editor/react'
import { useIdentity, useNode } from '@xnetjs/react'
import {
  CANVAS_DASHBOARD_SCHEMA_REGISTRY,
  CanvasAliasEditorPanel,
  CanvasCommentComposerPanel,
  CanvasQueryFrameExecutors,
  CanvasSelectionHud,
  CanvasShortcutHelpPanel,
  CanvasSourceReferencesPanel,
  CanvasWidgetNodeCard,
  createCanvasShellNoteProperties,
  getCanvasShellSourceId,
  getCanvasShellSourceType,
  getCanvasViewDisplayType,
  isPeekableCanvasDisplayType,
  shouldActivateDatabasePreviewSurface,
  shouldActivateInlinePageSurface,
  useCanvasCommands,
  useCanvasQueryFrames,
  useCanvasSourceReferences,
  useCanvasUndoLadder,
  useCanvasViewController,
  useSelectedSourceReferences,
  type CanvasNodeCardActions,
  type CanvasUndoDomain,
  type PeekableCanvasDisplayType,
  type CanvasViewportSnapshot as ViewportSnapshot,
  type LinkedDocType,
  type LinkedDocumentItem,
  type SavedViewCanvasQueryFrameInput,
  type UseCanvasUndoLadderResult
} from '@xnetjs/views'
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import { PresenceAvatars } from './PresenceAvatars'

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

export type { SavedViewCanvasQueryFrameInput }

function getNodeRect(node: CanvasNode): Rect {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.position.width,
    height: node.position.height
  }
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
    update,
    awareness,
    presence
  } = useNode(CanvasSchema, docId, {
    createIfMissing: { title: 'Untitled Canvas' },
    did: did ?? undefined
  })
  const theme = useCanvasThemeTokens()

  const handledInsertIdsRef = useRef<Set<string>>(new Set())
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false)
  // The ladder needs the controller's refs and the controller needs the
  // ladder's boundary recorder; break the cycle with a ref.
  const undoLadderRef = useRef<UseCanvasUndoLadderResult | null>(null)
  const recordUndoBoundary = useCallback((domain: CanvasUndoDomain) => {
    undoLadderRef.current?.recordUndoBoundary(domain)
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
    createPlanningTemplate,
    wrapSelectionInFrame,
    presentSelectedFrame,
    exportSelectedFrame,
    selectedFrame,
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

  const {
    queryFrameTargets,
    manualQueryFrameRefreshRequests,
    selectedQueryFrameNode,
    selectedQueryFrameDefinition,
    createQueryFrameFromSavedView,
    refreshSelectedQueryFrame
  } = useCanvasQueryFrames({
    doc,
    sceneRevision,
    selectedNodes,
    placePrimitiveObject,
    onUndoBoundary: recordSceneUndoBoundary
  })

  const selectedDatabaseSourceId =
    selectedCanvasObject?.displayType === 'database' ? (selectedCanvasObject.sourceId ?? '') : ''
  const undoLadder = useCanvasUndoLadder({
    doc,
    selectedSourceNodeIds,
    selectedDatabaseSourceId,
    did
  })
  useEffect(() => {
    undoLadderRef.current = undoLadder
  }, [undoLadder])
  const { activeUndoDomain, runCanvasScopedUndo } = undoLadder

  const selectedSourceReferences = useSelectedSourceReferences({
    doc,
    docId,
    canvasTitle: canvas?.title,
    sceneRevision,
    selectedObject: selectedCanvasObject,
    resolveTitle: (sourceId) => documentMap.get(sourceId)?.title,
    getReferences
  })

  // Peek (0277 E4): shared modal preview of the selected card's source.
  const {
    peekState,
    peekedObject: peekedCanvasObject,
    openPeek,
    closePeekSurface
  } = useCanvasPeek({
    doc,
    documentMap,
    selectedObject: selectedCanvasObject,
    focusCanvasSurface
  })

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

  const openSelectionRef = useRef<((mode?: 'peek' | 'focus' | 'split') => boolean) | null>(null)
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
          openPeek({
            nodeId: selectedCanvasObject.node.id,
            sourceId: selectedCanvasObject.sourceId,
            displayType: selectedCanvasObject.displayType
          })
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
      onOpenDatabaseSplit,
      onOpenDocument,
      openPeek,
      selectedCanvasObject
    ]
  )

  useEffect(() => {
    openSelectionRef.current = openSelection
  }, [openSelection])

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
        openPeek({
          nodeId: node.id,
          sourceId,
          displayType
        })
        return true
      }

      if (!sourceType) {
        return false
      }

      closePeekSurface()
      onOpenDocument?.(sourceId, sourceType)
      return true
    },
    [closePeekSurface, onOpenDocument, openPeek, setSelectionPanel]
  )

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

  // Canvas commands live in the shared registry (0277 E10). The desktop
  // palette still renders its own metadata table over the same actions via
  // the imperative handle below — that handle is now a transitional
  // adapter, not the command source.
  useCanvasCommands({
    docId,
    controller,
    extraCommands: [
      {
        id: 'canvas.peek',
        title: 'Canvas: Peek at selection',
        when: () => Boolean(selectedCanvasObject),
        run: () => {
          void openSelectionRef.current?.('peek')
        }
      },
      {
        id: 'canvas.open',
        title: 'Canvas: Open selection',
        when: () => Boolean(selectedCanvasObject?.sourceId),
        run: () => {
          void openSelectionRef.current?.('focus')
        }
      }
    ]
  })

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
        className="pointer-events-auto absolute left-6 top-6 z-20 flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-4 py-2 shadow-lg backdrop-blur-xl"
        data-canvas-home-badge="true"
        data-canvas-theme={theme.mode}
      >
        <input
          type="text"
          className="min-w-0 border-none bg-transparent text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground outline-none placeholder:text-muted-foreground/70 focus:text-foreground"
          value={canvas?.title || ''}
          onChange={(event) => update({ title: event.target.value })}
          placeholder="Workspace Canvas"
          data-canvas-title="true"
        />
        <PresenceAvatars presence={presence} />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-6 z-20 flex justify-center px-4">
        <CanvasSelectionHud
          controller={controller}
          themeMode={theme.mode}
          onPeek={() => {
            void openSelection('peek')
          }}
          onOpen={() => {
            void openSelection('focus')
          }}
          onSplit={
            onOpenDatabaseSplit
              ? () => {
                  void openSelection('split')
                }
              : null
          }
          onRefreshQueryFrame={
            selectedQueryFrameDefinition
              ? () => {
                  refreshSelectedQueryFrame()
                }
              : null
          }
          queryFrameRefreshMode={selectedQueryFrameDefinition?.refreshMode ?? null}
          referencesCount={selectedSourceReferences.length}
          onToggleReferences={() => {
            toggleSourceReferences()
          }}
          onPresentFrame={
            selectedFrame
              ? () => {
                  presentSelectedFrame()
                }
              : null
          }
          onExportFrame={
            selectedFrame
              ? () => {
                  exportSelectedFrame()
                }
              : null
          }
          onClearSelection={clearCanvasSelection}
        />
      </div>

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
              <CanvasSourceReferencesPanel
                themeMode={theme.mode}
                loading={sourceReferencesLoading}
                indexedCanvases={indexedReferenceCanvases}
                totalCanvases={totalReferenceCanvases}
                references={selectedSourceReferences}
                onReveal={(objectId) => {
                  handleRevealSourceReference(objectId)
                }}
                onClose={closeSelectionPanel}
              />
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

      <CanvasPeekOverlay
        peekedObject={peekedCanvasObject}
        themeMode={theme.mode}
        onClose={closePeekSurface}
        onOpenDocument={(targetDocId, docType) => {
          onOpenDocument?.(targetDocId, docType)
        }}
        onSplitDocument={onOpenDatabaseSplit ?? null}
        onSourceNodeMutated={() => {
          recordUndoBoundary('source-node')
        }}
        onSourceDocumentMutated={() => {
          recordUndoBoundary('source-document')
        }}
      />

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

      <CanvasQueryFrameExecutors
        doc={doc}
        targets={queryFrameTargets}
        manualRefreshRequests={manualQueryFrameRefreshRequests}
        schemas={CANVAS_DASHBOARD_SCHEMA_REGISTRY}
      />

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
