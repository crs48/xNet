/**
 * Canvas View - Infinite canvas for spatial visualization
 */

import type {
  CanvasHandle,
  CanvasNode,
  CanvasNodeRenderContext,
  CanvasSelectionSnapshot,
  Rect
} from '@xnetjs/canvas'
import { Canvas, createNode } from '@xnetjs/canvas'
import { CanvasSchema, DatabaseSchema, PageSchema } from '@xnetjs/data'
import { useNode, useIdentity } from '@xnetjs/react'
import { Command, Database, Eye, FileText, StickyNote, X } from 'lucide-react'
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
  getCanvasShellNotePlacement,
  getLinkedDocumentPlacement,
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

type CanvasViewProps = {
  docId: string
  documents?: LinkedDocumentItem[]
  pendingInsert?: {
    requestId: string
    document: LinkedDocumentItem
  } | null
  onPendingInsertConsumed?: (requestId: string) => void
  onOpenDocument?: (docId: string, docType: Exclude<LinkedDocType, 'canvas'>) => void
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
  selectedDisplayType: LinkedDocType | 'note' | null
  selectedTitle: string | null
  shortcutHelpOpen: boolean
}

export type CanvasViewHandle = {
  focusLinkedDocument: (docId: string) => ViewportSnapshot | null
  restoreViewport: (snapshot: ViewportSnapshot) => void
  clearSelection: () => void
  fitSelection: () => boolean
  openSelection: (mode?: 'peek' | 'focus') => boolean
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

function renderNodeCard(node: CanvasNode, document?: LinkedDocumentItem): React.ReactElement {
  const displayType = getCanvasShellDisplayType(node, document)
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
          : 'Canvas'

  const Icon =
    displayType === 'page' ? FileText : displayType === 'database' ? Database : StickyNote
  const isOpenable = Boolean(
    sourceId && (displayType === 'page' || displayType === 'database' || displayType === 'note')
  )

  return (
    <div className="flex h-full flex-col justify-between rounded-[24px] border border-border/70 bg-background/95 p-4 shadow-lg shadow-black/5">
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <Icon size={12} />
          {subtitle}
        </span>
        {isOpenable ? (
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Open
          </span>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="text-lg font-semibold leading-tight text-foreground">{linkedTitle}</div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {displayType === 'database'
            ? 'Open a focused database surface from the canvas.'
            : displayType === 'page'
              ? 'Open a focused writing surface from the canvas.'
              : 'A lightweight note pinned directly to the workspace.'}
        </p>
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
    onCreatePage,
    onCreateDatabase,
    onCreateNote,
    onCommandStateChange
  }: CanvasViewProps,
  ref
): React.ReactElement {
  const { did } = useIdentity()

  const {
    data: canvas,
    doc,
    loading,
    awareness
  } = useNode(CanvasSchema, docId, {
    createIfMissing: { title: 'Untitled Canvas' },
    did: did ?? undefined
  })

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
  const documentMap = useMemo(
    () => new Map(documents.map((entry) => [entry.id, entry])),
    [documents]
  )

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
    const displayType = getCanvasShellDisplayType(node, linkedDocument)
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

  useEffect(() => {
    if (!doc) return
    setCanvasReady(true)
  }, [doc])

  useEffect(() => {
    if (!canvasReady || !canvasRef.current) return
    lastViewportSnapshotRef.current = canvasRef.current.getViewportSnapshot()
  }, [canvasReady])

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

  const addLinkedDocumentNode = useCallback(
    (document: LinkedDocumentItem): boolean => {
      if (!doc || document.type === 'canvas') return false

      const viewport = canvasRef.current?.getViewportSnapshot() ?? lastViewportSnapshotRef.current
      const nodesMap = doc.getMap<CanvasNode>('nodes')
      const canvasKind = document.canvasKind ?? document.type
      const properties =
        canvasKind === 'note'
          ? {
              ...createCanvasShellNoteProperties(),
              title: document.title
            }
          : { title: document.title }
      const placement =
        canvasKind === 'note'
          ? getCanvasShellNotePlacement(viewport)
          : getLinkedDocumentPlacement(viewport, document.type)
      const linkedNode = createNode(canvasKind, placement, properties)

      linkedNode.sourceNodeId = document.id
      linkedNode.sourceSchemaId =
        document.type === 'page' ? PageSchema._schemaId : DatabaseSchema._schemaId

      nodesMap.set(linkedNode.id, linkedNode)
      return true
    },
    [doc]
  )

  const addCanvasNote = useCallback(
    (document: LinkedDocumentItem): boolean => {
      if (document.type !== 'page') return false
      return addLinkedDocumentNode({ ...document, canvasKind: 'note' })
    },
    [addLinkedDocumentNode]
  )

  useEffect(() => {
    if (!pendingInsert || handledInsertIdsRef.current.has(pendingInsert.requestId)) {
      return
    }

    const inserted =
      pendingInsert.document.canvasKind === 'note'
        ? addCanvasNote(pendingInsert.document)
        : addLinkedDocumentNode(pendingInsert.document)

    if (!inserted) {
      return
    }

    handledInsertIdsRef.current.add(pendingInsert.requestId)
    onPendingInsertConsumed?.(pendingInsert.requestId)
  }, [addCanvasNote, addLinkedDocumentNode, onPendingInsertConsumed, pendingInsert])

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

  const clearCanvasSelection = useCallback(() => {
    canvasRef.current?.clearSelection()
  }, [])

  const fitSelection = useCallback((): boolean => {
    if (!selectedCanvasObject) {
      return false
    }

    canvasRef.current?.fitToRect(getNodeRect(selectedCanvasObject.node), 140)
    return true
  }, [selectedCanvasObject])

  const focusSelectionSurface = useCallback(
    (sourceId: string, displayType: LinkedDocType | 'note') => {
      window.requestAnimationFrame(() => {
        const titleSelector =
          displayType === 'database'
            ? `[data-canvas-source-id="${sourceId}"] [data-canvas-database-title="true"]`
            : `[data-canvas-source-id="${sourceId}"] [data-canvas-page-title="true"]`
        const target = document.querySelector<HTMLElement>(titleSelector)
        target?.focus()
        if (target instanceof HTMLInputElement) {
          target.select()
        }
      })
    },
    []
  )

  const openSelection = useCallback(
    (mode: 'peek' | 'focus' = 'focus'): boolean => {
      if (!selectedCanvasObject) {
        return false
      }

      if (mode === 'peek') {
        const didFit = fitSelection()

        if (selectedCanvasObject.sourceId) {
          focusSelectionSurface(selectedCanvasObject.sourceId, selectedCanvasObject.displayType)
        }

        return didFit
      }

      if (!selectedCanvasObject.sourceId || !selectedCanvasObject.sourceType) {
        return false
      }

      onOpenDocument?.(selectedCanvasObject.sourceId, selectedCanvasObject.sourceType)
      return true
    },
    [fitSelection, focusSelectionSurface, onOpenDocument, selectedCanvasObject]
  )

  const toggleShortcutHelp = useCallback((open?: boolean) => {
    setShortcutHelpOpen((current) => (typeof open === 'boolean' ? open : !current))
  }, [])

  const handleDismissTransientUi = useCallback((): boolean => {
    if (!shortcutHelpOpen) {
      return false
    }

    setShortcutHelpOpen(false)
    return true
  }, [shortcutHelpOpen])

  const handleCreateObject = useCallback(
    (kind: 'page' | 'database' | 'note') => {
      if (kind === 'page') {
        onCreatePage?.()
        return
      }

      if (kind === 'database') {
        onCreateDatabase?.()
        return
      }

      onCreateNote?.()
    },
    [onCreateDatabase, onCreateNote, onCreatePage]
  )

  useEffect(() => {
    onCommandStateChange?.({
      selectionCount: selection.nodeIds.length,
      selectedNodeId: selectedCanvasObject?.node.id ?? null,
      selectedSourceId: selectedCanvasObject?.sourceId ?? null,
      selectedSourceType: selectedCanvasObject?.sourceType ?? null,
      selectedDisplayType: selectedCanvasObject?.displayType ?? null,
      selectedTitle: selectedCanvasObject?.title ?? null,
      shortcutHelpOpen
    })
  }, [onCommandStateChange, selectedCanvasObject, selection.nodeIds.length, shortcutHelpOpen])

  useImperativeHandle(
    ref,
    () => ({
      focusLinkedDocument,
      restoreViewport,
      clearSelection: clearCanvasSelection,
      fitSelection,
      openSelection,
      toggleShortcutHelp
    }),
    [
      clearCanvasSelection,
      fitSelection,
      focusLinkedDocument,
      openSelection,
      restoreViewport,
      toggleShortcutHelp
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
    <div className="relative h-full flex-1 overflow-hidden">
      <div className="pointer-events-none absolute left-6 top-6 z-20 rounded-full border border-border/60 bg-background/80 px-4 py-2 text-xs uppercase tracking-[0.24em] text-muted-foreground shadow-lg backdrop-blur-xl">
        {canvas?.title || 'Workspace Canvas'}
      </div>

      {selection.nodeIds.length > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 top-6 z-20 flex justify-center px-4">
          <div
            className="pointer-events-auto flex max-w-[min(92vw,780px)] items-center gap-2 rounded-full border border-border/60 bg-background/82 px-3 py-2 shadow-lg shadow-black/5 backdrop-blur-xl"
            data-canvas-selection-hud="true"
            data-canvas-selection-count={selection.nodeIds.length}
            data-canvas-selection-type={selectedCanvasObject?.displayType ?? 'mixed'}
          >
            <span className="truncate px-2 text-sm text-foreground">
              {selectedCanvasObject
                ? `${selectedCanvasObject.displayType === 'note' ? 'Note' : selectedCanvasObject.displayType === 'database' ? 'Database' : 'Page'} · ${selectedCanvasObject.title}`
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
                  {selectedCanvasObject.displayType === 'database' ? 'Peek' : 'Edit'}
                  <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    Enter
                  </span>
                </button>
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
                ['Tab', 'Step through canvas objects'],
                ['Arrow keys', 'Pan the board or nudge the selection'],
                ['Enter', 'Peek or edit the selected object'],
                ['Mod+Enter', 'Open the focused page or database view'],
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

      {!hasNodes ? (
        <div className="pointer-events-none absolute bottom-28 left-1/2 z-20 w-full max-w-xl -translate-x-1/2 px-6">
          <div className="mx-auto rounded-[28px] border border-border/60 bg-background/70 px-5 py-4 text-center shadow-2xl shadow-black/5 backdrop-blur-xl">
            <p className="text-sm font-medium text-foreground">Canvas-first workspace</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create from the bottom dock, double-click any linked card to open it, and use the
              Canvas action to zoom back out.
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
          navigationToolsStyle={{
            bottom: 24,
            right: 24,
            borderRadius: 24,
            background: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 18px 38px rgba(15, 23, 42, 0.12)',
            border: '1px solid rgba(148, 163, 184, 0.28)'
          }}
          renderNode={(node, context) => {
            const sourceNodeId = getCanvasShellSourceId(node)
            const linkedDocument = sourceNodeId ? documentMap.get(sourceNodeId) : undefined
            const displayType = getCanvasShellDisplayType(node, linkedDocument)

            if (sourceNodeId && shouldActivateInlinePageSurface(node, context, linkedDocument)) {
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
              shouldActivateDatabasePreviewSurface(node, context, linkedDocument)
            ) {
              return (
                <CanvasDatabasePreviewSurface
                  node={node}
                  docId={sourceNodeId}
                  onOpenDocument={(targetDocId) => onOpenDocument?.(targetDocId, 'database')}
                />
              )
            }

            if (shouldRenderCanvasShellCard(node, linkedDocument)) {
              return renderNodeCard(node, linkedDocument)
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
