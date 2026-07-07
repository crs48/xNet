/**
 * Canvas View - Web canvas surface with source-backed drops.
 *
 * The canvas capabilities live in the shared controller/cards/panels
 * (@xnetjs/views canvas-view area + @xnetjs/editor cards, exploration
 * 0277); this file keeps the web shell: router navigation, workbench
 * context panel, Desk integration (0273), and header chrome.
 */

import type { CanvasEdge, CanvasNode } from '@xnetjs/canvas'
import { useNavigate } from '@tanstack/react-router'
import {
  Canvas,
  CANVAS_INTERNAL_NODE_MIME,
  serializeCanvasInternalNodeDragData,
  createCanvasFrameExportDocument,
  createCanvasUndoManager,
  getCanvasConnectorsMap,
  getCanvasObjectsMap,
  useCanvasThemeTokens
} from '@xnetjs/canvas'
import { CanvasSchema, DatabaseSchema, PageSchema } from '@xnetjs/data'
import {
  renderCanvasNodeCard,
  shouldRenderCanvasNodeCard,
  useBlobService,
  type CanvasMediaGate
} from '@xnetjs/editor/react'
import { getCommandRegistry } from '@xnetjs/plugins'
import { useIdentity, useMutate, useNode } from '@xnetjs/react'
import { setNodeTransfer } from '@xnetjs/ui'
import {
  CanvasAliasEditorPanel,
  CanvasCommentComposerPanel,
  CanvasWidgetNodeCard,
  useCanvasViewController
} from '@xnetjs/views'
import {
  Download,
  FileImage,
  FileText,
  GitFork,
  Layout,
  Link2,
  Maximize2,
  MessageSquare,
  Presentation,
  Square,
  StickyNote,
  Table2
} from 'lucide-react'
import { useCallback, useEffect, useMemo } from 'react'
import { DESK_TITLE, isDeskId, isDeskRadialEnabled } from '../lib/desk'
import { useContextPanel, type ContextPanelSection } from '../workbench/context-panel'
import { useWorkbench } from '../workbench/state'
import { useIsCompact } from '../workbench/use-layout-mode'
import { DeskListProjection } from './DeskListProjection'
import { DeskRadialMenu } from './DeskRadialMenu'
import { ModeratedMedia } from './ModeratedMedia'
import { PresenceAvatars } from './PresenceAvatars'
import { ShareButton } from './ShareButton'

interface CanvasViewProps {
  docId: string
}

// Every media preview on the web canvas renders behind the moderation veil
// (0176/0277 M1); labels resolve against the excerpted source node when the
// card is source-backed.
const canvasMediaGate: CanvasMediaGate = ({ node, children }) => (
  <ModeratedMedia nodeId={node.sourceNodeId ?? node.id}>{children}</ModeratedMedia>
)

function sanitizeCanvasExportFileName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized.length > 0 ? normalized : 'canvas-frame'
}

function downloadJsonFile(input: { fileName: string; data: unknown }): void {
  const blob = new Blob([JSON.stringify(input.data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = input.fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function CanvasView({ docId }: CanvasViewProps): JSX.Element {
  const navigate = useNavigate()
  const theme = useCanvasThemeTokens()
  const { identity } = useIdentity()
  const { create } = useMutate()
  const blobService = useBlobService()
  const did = identity?.did

  // The Desk (0273) is an ordinary canvas with a deterministic id; visiting
  // it the first time creates it, so provisioning needs no separate write.
  const isDesk = isDeskId(docId)
  const compact = useIsCompact()

  const {
    data: canvas,
    doc,
    loading,
    update,
    awareness,
    presence
  } = useNode(CanvasSchema, docId, {
    createIfMissing: { title: isDesk ? DESK_TITLE : 'Untitled Canvas' },
    did: did ?? undefined
  })

  const controller = useCanvasViewController({
    docId,
    doc,
    awareness,
    blobService
  })
  const {
    canvasRef,
    selection,
    selectedObject,
    selectedCanvasEdge,
    selectedFrame,
    selectionPanel,
    selectedObjectCommentCount
  } = controller
  const selectedSourceBacked = selectedObject?.sourceId ? selectedObject : null

  // Canvas document-local undo (0179): a Y.UndoManager over the scene maps.
  // Cmd+Z claims it only while the canvas surface is focused (the higher-
  // priority 'surface:canvas' scope + focus guard); everywhere else Cmd+Z
  // falls through to the app-wide node-store undo.
  const canvasUndoManager = useMemo(() => (doc ? createCanvasUndoManager(doc) : null), [doc])

  useEffect(() => {
    if (!canvasUndoManager) return

    const registry = getCommandRegistry()
    const isCanvasFocused = () =>
      typeof document !== 'undefined' &&
      document.activeElement instanceof Element &&
      document.activeElement.closest('[data-canvas-surface="true"]') !== null

    const scope = registry.activateScope('surface:canvas')
    const disposables = [
      registry.register({
        id: `canvas.undo:${docId}`,
        title: 'Undo (canvas)',
        key: 'Mod-Z',
        scope: 'surface:canvas',
        when: isCanvasFocused,
        run: () => {
          canvasUndoManager.undo()
        }
      }),
      registry.register({
        id: `canvas.redo:${docId}`,
        title: 'Redo (canvas)',
        key: 'Mod-Shift-Z',
        scope: 'surface:canvas',
        when: isCanvasFocused,
        run: () => {
          canvasUndoManager.redo()
        }
      }),
      registry.register({
        id: `canvas.redoAlt:${docId}`,
        title: 'Redo (canvas, alternate binding)',
        key: 'Mod-Y',
        scope: 'surface:canvas',
        when: isCanvasFocused,
        run: () => {
          canvasUndoManager.redo()
        }
      })
    ]

    return () => {
      for (const disposable of disposables) disposable.dispose()
      scope.dispose()
      canvasUndoManager.destroy()
    }
  }, [canvasUndoManager, docId])

  const handleCanvasUndoRedo = useCallback(
    (direction: 'undo' | 'redo'): boolean => {
      if (!canvasUndoManager) return false
      if (direction === 'undo') canvasUndoManager.undo()
      else canvasUndoManager.redo()
      return true
    },
    [canvasUndoManager]
  )

  // Drain queued "Pin to Desk" entries (0273) through the normal ingestion
  // path — same card creation as a drag-drop, spread so a batch doesn't stack.
  const deskPins = useWorkbench((state) => state.deskPins)
  const { ingestPayload } = controller
  useEffect(() => {
    if (!isDesk || !doc || deskPins.length === 0) return
    const pins = deskPins
    void Promise.all(
      pins.map((pin, index) =>
        ingestPayload(
          {
            kind: 'internal-node',
            data: { nodeId: pin.nodeId, schemaId: pin.schemaId, title: pin.title }
          },
          { spreadIndex: index }
        )
      )
    ).finally(() => useWorkbench.getState().clearDeskPins(pins.map((pin) => pin.nodeId)))
  }, [isDesk, doc, deskPins, ingestPayload])

  // ─── Context panel: selection inspector (0166) ──────────────────────────
  const canvasContextSections = useMemo<ContextPanelSection[]>(
    () => [
      {
        id: 'canvas-selection',
        title: 'Selection',
        badge: selection.nodeIds.length + selection.edgeIds.length,
        content: selectedObject ? (
          <div className="flex flex-col gap-3 p-3 text-xs text-ink-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-3">Title</span>
              <span className="truncate text-ink-1">{selectedObject.title}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-3">Object</span>
              <span className="truncate font-mono text-[11px]">{selectedObject.node.id}</span>
            </div>
            {selectedObject.sourceId && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-3">Source</span>
                <span className="truncate font-mono text-[11px]">{selectedObject.sourceId}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-3">Comments</span>
              <span className="font-mono text-[11px]">{selectedObjectCommentCount}</span>
            </div>
          </div>
        ) : selectedCanvasEdge ? (
          <div className="flex flex-col gap-3 p-3 text-xs text-ink-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-3">Connector</span>
              <span className="truncate font-mono text-[11px]">{selectedCanvasEdge.id}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-ink-3">Type</span>
              <span className="truncate text-ink-1">
                {selectedCanvasEdge.relationship?.kind ?? 'relates-to'}
              </span>
            </div>
            {(selectedCanvasEdge.label ?? selectedCanvasEdge.relationship?.label) && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-3">Label</span>
                <span className="truncate text-ink-1">
                  {selectedCanvasEdge.label ?? selectedCanvasEdge.relationship?.label}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-center text-xs text-ink-3">
            {selection.nodeIds.length > 1
              ? `${selection.nodeIds.length} objects selected`
              : selection.edgeIds.length > 1
                ? `${selection.edgeIds.length} connectors selected`
                : 'Select a canvas object to inspect it.'}
          </div>
        )
      }
    ],
    [
      selection.edgeIds.length,
      selection.nodeIds.length,
      selectedCanvasEdge,
      selectedObject,
      selectedObjectCommentCount
    ]
  )
  useContextPanel(`canvas:${docId}`, canvasContextSections)

  const handleCreateNote = useCallback(async () => {
    const note = await create(PageSchema, { title: 'Untitled Note' })
    if (!note) {
      return
    }

    controller.placeSourceObject({
      objectKind: 'note',
      sourceNodeId: note.id,
      sourceSchemaId: PageSchema._schemaId,
      title: note.title || 'Untitled Note',
      properties: {
        title: note.title || 'Untitled Note',
        shellRole: 'canvas-note'
      }
    })
  }, [controller, create])

  const handleCreatePage = useCallback(async () => {
    const pageNode = await create(PageSchema, { title: 'Untitled Page' })
    if (!pageNode) {
      return
    }

    controller.placeSourceObject({
      objectKind: 'page',
      sourceNodeId: pageNode.id,
      sourceSchemaId: PageSchema._schemaId,
      title: pageNode.title || 'Untitled Page',
      properties: {
        title: pageNode.title || 'Untitled Page'
      }
    })
  }, [controller, create])

  const handleCreateDatabase = useCallback(async () => {
    const databaseNode = await create(DatabaseSchema, { title: 'Untitled Database' })
    if (!databaseNode) {
      return
    }

    controller.placeSourceObject({
      objectKind: 'database',
      sourceNodeId: databaseNode.id,
      sourceSchemaId: DatabaseSchema._schemaId,
      title: databaseNode.title || 'Untitled Database',
      properties: {
        title: databaseNode.title || 'Untitled Database'
      }
    })
  }, [controller, create])

  const handleCreateObject = useCallback(
    (kind: 'page' | 'database' | 'note' | 'shape' | 'frame' | 'mind-map') => {
      if (kind === 'page') {
        void handleCreatePage()
        return
      }

      if (kind === 'database') {
        void handleCreateDatabase()
        return
      }

      if (kind === 'shape') {
        controller.createShape()
        return
      }

      if (kind === 'frame') {
        controller.createFrame()
        return
      }

      if (kind === 'mind-map') {
        controller.createMindMap()
        return
      }

      if (kind === 'note') {
        void handleCreateNote()
      }
    },
    [controller, handleCreateDatabase, handleCreateNote, handleCreatePage]
  )

  const handleNodeDoubleClick = useCallback(
    (nodeId: string) => {
      const node = doc ? getCanvasObjectsMap<CanvasNode>(doc).get(nodeId) : undefined
      if (!node?.sourceNodeId) {
        return
      }

      if (node.type === 'database' || node.sourceSchemaId === DatabaseSchema._schemaId) {
        void navigate({ to: '/db/$dbId', params: { dbId: node.sourceNodeId } })
        return
      }

      if (
        node.type === 'page' ||
        node.type === 'note' ||
        node.sourceSchemaId === PageSchema._schemaId
      ) {
        void navigate({ to: '/doc/$docId', params: { docId: node.sourceNodeId } })
      }
    },
    [doc, navigate]
  )

  const canvasHint = useMemo(
    () =>
      controller.hasNodes
        ? 'Drag pages, databases, links, files, or frame a cluster directly on the board.'
        : 'Drop links, files, pages, or databases anywhere on the board. Press R for a rectangle or F for a frame.',
    [controller.hasNodes]
  )

  const presentSelectedFrame = useCallback(() => {
    if (!selectedFrame) {
      return
    }

    canvasRef.current?.fitToRect(
      {
        x: selectedFrame.node.position.x,
        y: selectedFrame.node.position.y,
        width: selectedFrame.node.position.width,
        height: selectedFrame.node.position.height
      },
      48
    )
  }, [canvasRef, selectedFrame])

  const exportSelectedFrame = useCallback(() => {
    if (!doc || !selectedFrame) {
      return
    }

    const nodes = Array.from(getCanvasObjectsMap<CanvasNode>(doc).values())
    const edges = Array.from(getCanvasConnectorsMap<CanvasEdge>(doc).values())
    const frameExport = createCanvasFrameExportDocument({
      frame: selectedFrame.node,
      nodes,
      edges
    })
    const fileName = `${sanitizeCanvasExportFileName(selectedFrame.title)}.canvas-section.json`

    downloadJsonFile({
      fileName,
      data: frameExport
    })
  }, [doc, selectedFrame])

  if (loading || !doc) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading canvas...</p>
      </div>
    )
  }

  // On phones the Desk renders as an ordered list, not a spatial canvas
  // (0273): pins in reading order, which doubles as the screen-reader order.
  if (isDesk && compact) {
    return <DeskListProjection doc={doc} title={canvas?.title || DESK_TITLE} />
  }

  if (!controller.canvasReady) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Preparing canvas...</p>
      </div>
    )
  }

  const quickActions = [
    {
      id: 'page',
      title: 'Create page (P)',
      label: 'Create page',
      onClick: () => {
        void handleCreatePage()
      },
      icon: <FileText size={14} />,
      dataAttributes: {}
    },
    {
      id: 'database',
      title: 'Create database (D)',
      label: 'Create database',
      onClick: () => {
        void handleCreateDatabase()
      },
      icon: <Table2 size={14} />,
      dataAttributes: {}
    },
    {
      id: 'note',
      title: 'Create note (N)',
      label: 'Create note',
      onClick: () => {
        void handleCreateNote()
      },
      icon: <StickyNote size={14} />,
      dataAttributes: {
        'data-canvas-create-note': 'true'
      }
    },
    {
      id: 'shape',
      title: 'Create shape (R)',
      label: 'Create shape',
      onClick: () => {
        controller.createShape()
      },
      icon: <Square size={14} />,
      dataAttributes: {
        'data-canvas-create-shape': 'true'
      }
    },
    {
      id: 'frame',
      title: 'Create frame (F)',
      label: 'Create frame',
      onClick: () => {
        controller.createFrame()
      },
      icon: <Layout size={14} />,
      dataAttributes: {
        'data-canvas-create-frame': 'true'
      }
    },
    {
      id: 'mind-map',
      title: 'Create mind map (M)',
      label: 'Create mind map',
      onClick: () => {
        controller.createMindMap()
      },
      icon: <GitFork size={14} />,
      dataAttributes: {
        'data-canvas-create-mind-map': 'true'
      }
    },
    {
      id: 'reference',
      title: 'Create link',
      label: 'Create link',
      onClick: () => {
        controller.createExternalReference()
      },
      icon: <Link2 size={14} />,
      dataAttributes: {
        'data-canvas-create-reference': 'true'
      }
    },
    {
      id: 'media',
      title: 'Create file',
      label: 'Create file',
      onClick: () => {
        controller.createMediaFile()
      },
      icon: <FileImage size={14} />,
      dataAttributes: {
        'data-canvas-create-media': 'true'
      }
    },
    {
      id: 'fit',
      title: 'Fit to content (Ctrl/Cmd 1)',
      label: 'Fit to content',
      onClick: () => {
        canvasRef.current?.fitToContent(80)
      },
      icon: <Maximize2 size={14} />,
      dataAttributes: {
        'data-canvas-fit': 'true'
      }
    }
  ] as const

  return (
    <div
      className="flex h-full flex-1 flex-col overflow-hidden -m-6"
      data-canvas-theme={theme.mode}
    >
      <input
        ref={controller.mediaFileInputRef}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-canvas-media-file-input="true"
        onChange={controller.handleMediaFileInputChange}
      />
      <div className="flex items-center gap-3 border-b border-border bg-secondary px-4 py-2.5">
        <input
          type="text"
          className="min-w-0 flex-1 border-none bg-transparent text-lg font-semibold text-foreground outline-none placeholder:text-muted-foreground"
          value={canvas?.title || ''}
          onChange={(event) => update({ title: event.target.value })}
          placeholder="Untitled"
          data-canvas-title="true"
        />

        <PresenceAvatars presence={presence} />
        <ShareButton docId={docId} docType="canvas" />

        <div
          className="inline-flex items-center overflow-hidden rounded-full border border-border/70 bg-background/88 shadow-sm shadow-black/5 backdrop-blur-xl"
          data-canvas-quick-actions="true"
          data-canvas-theme={theme.mode}
        >
          {quickActions.map((action, index) => (
            <button
              key={action.id}
              type="button"
              onClick={action.onClick}
              title={action.title}
              aria-label={action.label}
              data-canvas-quick-action={action.id}
              className={`inline-flex h-9 w-9 items-center justify-center text-foreground transition-colors hover:bg-accent ${
                index > 0 ? 'border-l border-border/60' : ''
              }`}
              {...action.dataAttributes}
            >
              {action.icon}
              <span className="sr-only">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="relative flex-1">
        <div
          className="pointer-events-none absolute left-4 top-4 z-20 max-w-md rounded-full border border-border/60 bg-background/82 px-4 py-2 text-xs uppercase tracking-[0.22em] text-muted-foreground shadow-lg backdrop-blur-xl"
          data-canvas-hint="true"
          data-canvas-theme={theme.mode}
        >
          {canvasHint}
        </div>

        {selectedObject ? (
          <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center px-4">
            <div
              className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/60 bg-background/84 px-3 py-2 shadow-lg backdrop-blur-xl"
              data-canvas-selection-pill="true"
              data-canvas-theme={theme.mode}
              draggable={Boolean(selectedSourceBacked)}
              onDragStart={(event) => {
                // Dragging the pill carries the card's *source* node out
                // of the canvas — excerpting, never copying (0166).
                if (!selectedSourceBacked?.sourceId) return
                event.dataTransfer.effectAllowed = 'copyMove'
                setNodeTransfer(event, {
                  nodeId: selectedSourceBacked.sourceId,
                  nodeType: 'node',
                  title: selectedSourceBacked.title,
                  schemaId: selectedSourceBacked.node.sourceSchemaId,
                  sourceContext: 'canvas-card'
                })
                if (selectedSourceBacked.node.sourceSchemaId) {
                  event.dataTransfer.setData(
                    CANVAS_INTERNAL_NODE_MIME,
                    serializeCanvasInternalNodeDragData({
                      nodeId: selectedSourceBacked.sourceId,
                      schemaId: selectedSourceBacked.node.sourceSchemaId,
                      title: selectedSourceBacked.title
                    })
                  )
                }
              }}
            >
              <span className="max-w-[min(52vw,420px)] truncate px-2 text-sm text-foreground">
                {selectedObject.title}
              </span>
              {selectedSourceBacked ? (
                <button
                  type="button"
                  onClick={controller.openAliasEditor}
                  className="rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                  data-canvas-selection-action="alias"
                >
                  Alias
                </button>
              ) : null}
              <button
                type="button"
                onClick={controller.openCommentComposer}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                data-canvas-selection-action="comment"
              >
                <MessageSquare size={12} />
                Comment{selectedObjectCommentCount > 0 ? ` ${selectedObjectCommentCount}` : ''}
              </button>
              {selectedFrame ? (
                <>
                  <button
                    type="button"
                    onClick={presentSelectedFrame}
                    className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                    data-canvas-selection-action="present-frame"
                  >
                    <Presentation size={12} />
                    Present
                  </button>
                  <button
                    type="button"
                    onClick={exportSelectedFrame}
                    className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                    data-canvas-selection-action="export-frame"
                  >
                    <Download size={12} />
                    Export
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {selectionPanel === 'alias' && selectedSourceBacked ? (
          <div className="pointer-events-none absolute inset-x-0 top-20 z-20 flex justify-center px-4">
            <div
              className="pointer-events-auto w-[min(92vw,520px)] rounded-[24px] border border-border/60 bg-background/88 p-4 shadow-2xl shadow-black/10 backdrop-blur-xl"
              data-canvas-source-panel="alias"
              data-canvas-theme={theme.mode}
            >
              <CanvasAliasEditorPanel controller={controller} themeMode={theme.mode} />
            </div>
          </div>
        ) : null}

        {selectionPanel === 'comment' && selectedObject ? (
          <div className="pointer-events-none absolute inset-x-0 top-20 z-20 flex justify-center px-4">
            <div
              className="pointer-events-auto w-[min(92vw,520px)] rounded-[24px] border border-border/60 bg-background/88 p-4 shadow-2xl shadow-black/10 backdrop-blur-xl"
              data-canvas-source-panel="comment"
              data-canvas-theme={theme.mode}
            >
              <CanvasCommentComposerPanel controller={controller} themeMode={theme.mode} />
            </div>
          </div>
        ) : null}

        {!controller.hasNodes ? (
          isDesk ? (
            // The Desk's starter chips (0273): three quiet ways in, gone the
            // moment the first real content lands — paralysis mitigation
            // without clutter.
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-6">
              <div
                className="pointer-events-auto flex flex-wrap items-center justify-center gap-2"
                data-web-desk-empty-state="true"
                data-canvas-theme={theme.mode}
              >
                <button
                  type="button"
                  onClick={() => void handleCreatePage()}
                  className="cursor-pointer rounded-full border border-border/60 bg-background/78 px-4 py-2 text-sm text-muted-foreground backdrop-blur-xl transition-colors hover:text-foreground"
                >
                  New page
                </button>
                <button
                  type="button"
                  onClick={() => useWorkbench.getState().setPanelOpen('left', true)}
                  className="cursor-pointer rounded-full border border-border/60 bg-background/78 px-4 py-2 text-sm text-muted-foreground backdrop-blur-xl transition-colors hover:text-foreground"
                >
                  Pin something
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateNote()}
                  className="cursor-pointer rounded-full border border-border/60 bg-background/78 px-4 py-2 text-sm text-muted-foreground backdrop-blur-xl transition-colors hover:text-foreground"
                >
                  New note
                </button>
              </div>
            </div>
          ) : (
            <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center px-6">
              <div
                className="max-w-xl rounded-[24px] border border-border/60 bg-background/78 px-5 py-4 text-center shadow-2xl shadow-black/5 backdrop-blur-xl"
                data-canvas-empty-state="true"
                data-canvas-theme={theme.mode}
              >
                <p className="text-sm font-medium text-foreground">Canvas-first workspace</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Drop a URL for a link card, drag in a page or database from the sidebar, or press
                  `R`, `F`, `N`, or `M` to build directly on the board.
                </p>
              </div>
            </div>
          )
        ) : null}

        <Canvas
          ref={controller.setCanvasHandle}
          doc={doc}
          collectPerformanceMetrics={import.meta.env.DEV}
          awareness={awareness}
          presenceIntent={controller.canvasPresenceIntent}
          config={{
            showGrid: true,
            gridSize: 20,
            minZoom: 0.1,
            maxZoom: 4,
            // The Desk is bounded-but-growable (0273): panning clamps to the
            // content bounds, which grow as cards land outside them.
            ...(isDesk ? { infinite: false } : {})
          }}
          showMinimap
          showNavigationTools
          navigationToolsPosition="bottom-right"
          navigationToolsShowZoomLabel={false}
          onSelectionChange={controller.setSelection}
          onUndoRedoShortcut={handleCanvasUndoRedo}
          onCreateObject={handleCreateObject}
          onEditSelectionAlias={controller.openAliasEditor}
          onCreateSelectionComment={controller.openCommentComposer}
          onDismissTransientUi={() => {
            if (selectionPanel) {
              controller.closeSelectionPanel()
              return true
            }

            return false
          }}
          onSurfaceDrop={controller.handleSurfaceDrop}
          onSurfacePaste={controller.handleSurfacePaste}
          canvasNodeId={docId}
          canvasSchema={CanvasSchema._schemaId}
          renderNode={(node, context) => {
            if (node.type === 'widget') {
              return <CanvasWidgetNodeCard node={node} lod={context.lod} />
            }

            if (shouldRenderCanvasNodeCard(node)) {
              return renderCanvasNodeCard(node, {
                themeMode: theme.mode,
                context,
                blobService,
                onUpdateNodeProperties: controller.updateCanvasNodeProperties,
                mediaGate: canvasMediaGate
              })
            }

            return undefined
          }}
          onNodeDoubleClick={handleNodeDoubleClick}
        />

        {/* Flagged long-press radial menu on Desk cards (0273 Phase 5). */}
        {isDesk && isDeskRadialEnabled() ? <DeskRadialMenu doc={doc} /> : null}
      </div>
    </div>
  )
}
