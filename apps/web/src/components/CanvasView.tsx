/**
 * Canvas View - Web canvas surface with source-backed drops.
 */

import type { CanvasHandle, CanvasNode, CanvasSelectionSnapshot, ShapeType } from '@xnetjs/canvas'
import { useNavigate } from '@tanstack/react-router'
import {
  Canvas,
  createCanvasObjectAnchorId,
  extractCanvasIngressPayloads,
  getCanvasObjectsMap,
  useCanvasObjectIngestion,
  useCanvasThemeTokens
} from '@xnetjs/canvas'
import {
  CanvasSchema,
  DatabaseSchema,
  PageSchema,
  decodeAnchor,
  encodeAnchor,
  type CanvasObjectAnchor
} from '@xnetjs/data'
import { useBlobService } from '@xnetjs/editor/react'
import { useComments, useIdentity, useMutate, useNode } from '@xnetjs/react'
import {
  FileImage,
  FileText,
  Link2,
  Maximize2,
  MessageSquare,
  Plus,
  StickyNote,
  Table2
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PresenceAvatars } from './PresenceAvatars'
import { ShareButton } from './ShareButton'

interface CanvasViewProps {
  docId: string
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

function getNodeCard(node: CanvasNode, themeMode: 'light' | 'dark'): JSX.Element {
  const title = node.alias ?? (node.properties.title as string) ?? 'Untitled'
  const status = typeof node.properties.status === 'string' ? node.properties.status : null

  if (node.type === 'external-reference') {
    return (
      <div
        className="flex h-full flex-col justify-between rounded-[22px] border border-border/70 bg-background/95 p-4 shadow-lg shadow-black/5"
        data-canvas-node-card="true"
        data-canvas-card-kind="external-reference"
        data-canvas-theme={themeMode}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <Link2 size={12} />
            Link preview
          </span>
          {status ? (
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {status}
            </span>
          ) : null}
        </div>
        <div className="space-y-2">
          <div className="text-lg font-semibold leading-tight text-foreground">{title}</div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {typeof node.properties.url === 'string' ? node.properties.url : 'Dropped URL'}
          </p>
        </div>
      </div>
    )
  }

  if (node.type === 'media') {
    return (
      <div
        className="flex h-full flex-col justify-between rounded-[22px] border border-border/70 bg-background/95 p-4 shadow-lg shadow-black/5"
        data-canvas-node-card="true"
        data-canvas-card-kind="media"
        data-canvas-theme={themeMode}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <FileImage size={12} />
            Media asset
          </span>
          {status ? (
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {status}
            </span>
          ) : null}
        </div>
        <div className="space-y-2">
          <div className="text-lg font-semibold leading-tight text-foreground">{title}</div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {typeof node.properties.mimeType === 'string'
              ? `${String(node.properties.kind ?? 'file')} · ${node.properties.mimeType}`
              : 'Dropped media or file'}
          </p>
        </div>
      </div>
    )
  }

  const displayType = node.type === 'database' ? 'database' : node.type === 'note' ? 'note' : 'page'
  const Icon = displayType === 'database' ? Table2 : displayType === 'note' ? StickyNote : FileText

  return (
    <div
      className="flex h-full flex-col justify-between rounded-[22px] border border-border/70 bg-background/95 p-4 shadow-lg shadow-black/5"
      data-canvas-node-card="true"
      data-canvas-card-kind={displayType}
      data-canvas-theme={themeMode}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <Icon size={12} />
          {displayType === 'database'
            ? 'Database'
            : displayType === 'note'
              ? 'Canvas note'
              : 'Document'}
        </span>
        {node.sourceNodeId ? (
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Open
          </span>
        ) : null}
      </div>
      <div className="space-y-2">
        <div className="text-lg font-semibold leading-tight text-foreground">{title}</div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {displayType === 'database'
            ? 'A linked database surface placed on the board.'
            : displayType === 'note'
              ? 'A page-backed note created directly on the board.'
              : 'A linked page placed directly on the board.'}
        </p>
      </div>
    </div>
  )
}

export function CanvasView({ docId }: CanvasViewProps): JSX.Element {
  const navigate = useNavigate()
  const theme = useCanvasThemeTokens()
  const { identity } = useIdentity()
  const { create } = useMutate()
  const blobService = useBlobService()
  const did = identity?.did

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
  const aliasInputRef = useRef<HTMLInputElement | null>(null)
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null)
  const [canvasReady, setCanvasReady] = useState(false)
  const [hasNodes, setHasNodes] = useState(false)
  const [sceneRevision, setSceneRevision] = useState(0)
  const [selection, setSelection] = useState<CanvasSelectionSnapshot>({
    nodeIds: [],
    edgeIds: []
  })
  const [aliasEditorOpen, setAliasEditorOpen] = useState(false)
  const [aliasDraft, setAliasDraft] = useState('')
  const [commentEditorOpen, setCommentEditorOpen] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const { placeSourceObject, placePrimitiveObject, ingestDataTransfer } = useCanvasObjectIngestion({
    doc,
    blobService,
    getViewportSnapshot: () => canvasRef.current?.getViewportSnapshot() ?? { x: 0, y: 0, zoom: 1 }
  })
  const { threads: canvasObjectCommentThreads, addComment: addCanvasComment } = useComments({
    nodeId: docId,
    anchorType: 'canvas-object'
  })

  const selectedCanvasNode = useMemo(() => {
    void sceneRevision

    if (!doc || selection.nodeIds.length !== 1) {
      return null
    }

    const node = getCanvasObjectsMap<CanvasNode>(doc).get(selection.nodeIds[0])
    if (!node) {
      return null
    }

    return {
      node,
      title: node.alias ?? (node.properties.title as string) ?? 'Untitled'
    }
  }, [doc, sceneRevision, selection.nodeIds])

  const selectedCanvasObject = useMemo(() => {
    if (!selectedCanvasNode) {
      return null
    }

    const node = selectedCanvasNode.node
    const sourceNodeId = node.sourceNodeId ?? node.linkedNodeId
    if (!sourceNodeId) {
      return null
    }

    return {
      node,
      sourceNodeId,
      title: selectedCanvasNode.title
    }
  }, [selectedCanvasNode])
  const selectedObjectCommentCount = useMemo(() => {
    if (!selectedCanvasNode) {
      return 0
    }

    return canvasObjectCommentThreads.filter((thread) => {
      try {
        return (
          decodeAnchor<CanvasObjectAnchor>(thread.root.properties.anchorData).objectId ===
          selectedCanvasNode.node.id
        )
      } catch {
        return false
      }
    }).length
  }, [canvasObjectCommentThreads, selectedCanvasNode])
  const canvasPresenceIntent = useMemo(() => {
    if (!selectedCanvasNode) {
      return null
    }

    if (commentEditorOpen) {
      return {
        activity: 'commenting' as const,
        editingNodeId: selectedCanvasNode.node.id
      }
    }

    if (aliasEditorOpen) {
      return {
        activity: 'editing' as const,
        editingNodeId: selectedCanvasNode.node.id
      }
    }

    return null
  }, [aliasEditorOpen, commentEditorOpen, selectedCanvasNode])

  useEffect(() => {
    if (!doc) {
      return
    }

    setCanvasReady(true)

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

  const handleCreateNote = useCallback(async () => {
    const note = await create(PageSchema, { title: 'Untitled Note' })
    if (!note) {
      return
    }

    placeSourceObject({
      objectKind: 'note',
      sourceNodeId: note.id,
      sourceSchemaId: PageSchema._schemaId,
      title: note.title || 'Untitled Note',
      properties: {
        title: note.title || 'Untitled Note',
        shellRole: 'canvas-note'
      }
    })
  }, [create, placeSourceObject])

  const handleCreatePage = useCallback(async () => {
    const pageNode = await create(PageSchema, { title: 'Untitled Page' })
    if (!pageNode) {
      return
    }

    placeSourceObject({
      objectKind: 'page',
      sourceNodeId: pageNode.id,
      sourceSchemaId: PageSchema._schemaId,
      title: pageNode.title || 'Untitled Page',
      properties: {
        title: pageNode.title || 'Untitled Page'
      }
    })
  }, [create, placeSourceObject])

  const handleCreateDatabase = useCallback(async () => {
    const databaseNode = await create(DatabaseSchema, { title: 'Untitled Database' })
    if (!databaseNode) {
      return
    }

    placeSourceObject({
      objectKind: 'database',
      sourceNodeId: databaseNode.id,
      sourceSchemaId: DatabaseSchema._schemaId,
      title: databaseNode.title || 'Untitled Database',
      properties: {
        title: databaseNode.title || 'Untitled Database'
      }
    })
  }, [create, placeSourceObject])

  const handleCreateShape = useCallback(
    (shapeType: ShapeType = 'rectangle'): void => {
      placePrimitiveObject({
        objectKind: 'shape',
        title: getShapeLabel(shapeType),
        properties: {
          title: getShapeLabel(shapeType),
          label: getShapeLabel(shapeType),
          shapeType
        }
      })
    },
    [placePrimitiveObject]
  )

  const handleCreateFrame = useCallback((): void => {
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
  }, [placePrimitiveObject])

  const handleCreateObject = useCallback(
    (kind: 'page' | 'database' | 'note' | 'shape' | 'frame') => {
      if (kind === 'page') {
        void handleCreatePage()
        return
      }

      if (kind === 'database') {
        void handleCreateDatabase()
        return
      }

      if (kind === 'shape') {
        handleCreateShape()
        return
      }

      if (kind === 'frame') {
        handleCreateFrame()
        return
      }

      if (kind === 'note') {
        void handleCreateNote()
      }
    },
    [handleCreateDatabase, handleCreateFrame, handleCreateNote, handleCreatePage, handleCreateShape]
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
    (event: React.ClipboardEvent<HTMLDivElement>) => {
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
      hasNodes
        ? 'Drag pages, databases, links, files, or frame a cluster directly on the board.'
        : 'Drop links, files, pages, or databases anywhere on the board. Press R for a rectangle or F for a frame.',
    [hasNodes]
  )

  const closeAliasEditor = useCallback(() => {
    setAliasEditorOpen(false)
  }, [])

  const closeCommentEditor = useCallback(() => {
    setCommentEditorOpen(false)
  }, [])

  const openAliasEditor = useCallback(() => {
    if (!selectedCanvasObject) {
      return
    }

    setAliasDraft(selectedCanvasObject.node.alias ?? '')
    setAliasEditorOpen(true)
  }, [selectedCanvasObject])

  const openCommentEditor = useCallback(() => {
    if (!selectedCanvasNode) {
      return
    }

    setCommentDraft('')
    setCommentEditorOpen(true)
  }, [selectedCanvasNode])

  const setSelectedAlias = useCallback(
    (nextAlias: string | null) => {
      if (!doc || !selectedCanvasObject) {
        return
      }

      const nodesMap = getCanvasObjectsMap<CanvasNode>(doc)
      const current = nodesMap.get(selectedCanvasObject.node.id)
      if (!current) {
        return
      }

      const normalized = nextAlias?.trim() ?? ''
      const resolvedAlias = normalized.length > 0 ? normalized : undefined

      doc.transact(() => {
        nodesMap.set(current.id, {
          ...current,
          alias: resolvedAlias
        })
      })

      closeAliasEditor()
    },
    [closeAliasEditor, doc, selectedCanvasObject]
  )

  const submitSelectedComment = useCallback(async () => {
    if (!selectedCanvasNode) {
      return
    }

    const content = commentDraft.trim()
    if (!content) {
      return
    }

    const anchor: CanvasObjectAnchor = {
      objectId: selectedCanvasNode.node.id,
      anchorId: createCanvasObjectAnchorId({
        objectId: selectedCanvasNode.node.id,
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
      return
    }

    setCommentDraft('')
    closeCommentEditor()
  }, [addCanvasComment, closeCommentEditor, commentDraft, selectedCanvasNode])

  useEffect(() => {
    if (!selectedCanvasNode) {
      setAliasEditorOpen(false)
      setAliasDraft('')
      setCommentEditorOpen(false)
      setCommentDraft('')
      return
    }

    if (selectedCanvasObject) {
      setAliasDraft(selectedCanvasObject.node.alias ?? '')
    } else {
      setAliasDraft('')
      setAliasEditorOpen(false)
    }
  }, [selectedCanvasNode, selectedCanvasObject])

  useEffect(() => {
    if (!aliasEditorOpen) {
      return
    }

    window.requestAnimationFrame(() => {
      aliasInputRef.current?.focus()
      aliasInputRef.current?.select()
    })
  }, [aliasEditorOpen])

  useEffect(() => {
    if (!commentEditorOpen) {
      return
    }

    window.requestAnimationFrame(() => {
      commentInputRef.current?.focus()
    })
  }, [commentEditorOpen])

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
      className="flex h-full flex-1 flex-col overflow-hidden -m-6"
      data-canvas-theme={theme.mode}
    >
      <div className="flex items-center gap-3 border-b border-border bg-secondary px-4 py-3">
        <input
          type="text"
          className="min-w-0 flex-1 border-none bg-transparent text-lg font-semibold text-foreground outline-none placeholder:text-muted-foreground"
          value={canvas?.title || ''}
          onChange={(event) => update({ title: event.target.value })}
          placeholder="Untitled"
          data-web-canvas-title="true"
        />

        <PresenceAvatars presence={presence} />
        <ShareButton docId={docId} docType="canvas" />

        <button
          type="button"
          onClick={() => {
            void handleCreateNote()
          }}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm text-white transition-colors hover:bg-primary/90"
          data-web-canvas-create-note="true"
        >
          <Plus size={14} />
          <span>Note</span>
        </button>

        <button
          type="button"
          onClick={() => canvasRef.current?.fitToContent(80)}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
        >
          <Maximize2 size={14} />
          <span>Center</span>
        </button>
      </div>

      <div className="relative flex-1">
        <div
          className="pointer-events-none absolute left-4 top-4 z-20 max-w-md rounded-full border border-border/60 bg-background/82 px-4 py-2 text-xs uppercase tracking-[0.22em] text-muted-foreground shadow-lg backdrop-blur-xl"
          data-web-canvas-hint="true"
          data-canvas-theme={theme.mode}
        >
          {canvasHint}
        </div>

        {selectedCanvasNode ? (
          <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center px-4">
            <div
              className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/60 bg-background/84 px-3 py-2 shadow-lg backdrop-blur-xl"
              data-web-canvas-selection-pill="true"
              data-canvas-theme={theme.mode}
            >
              <span className="max-w-[min(52vw,420px)] truncate px-2 text-sm text-foreground">
                {selectedCanvasNode.title}
              </span>
              {selectedCanvasObject ? (
                <button
                  type="button"
                  onClick={openAliasEditor}
                  className="rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                  data-web-canvas-selection-action="alias"
                >
                  Alias
                </button>
              ) : null}
              <button
                type="button"
                onClick={openCommentEditor}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                data-web-canvas-selection-action="comment"
              >
                <MessageSquare size={12} />
                Comment{selectedObjectCommentCount > 0 ? ` ${selectedObjectCommentCount}` : ''}
              </button>
            </div>
          </div>
        ) : null}

        {aliasEditorOpen && selectedCanvasObject ? (
          <div className="pointer-events-none absolute inset-x-0 top-20 z-20 flex justify-center px-4">
            <div
              className="pointer-events-auto w-[min(92vw,520px)] rounded-[24px] border border-border/60 bg-background/88 p-4 shadow-2xl shadow-black/10 backdrop-blur-xl"
              data-web-canvas-alias-editor="true"
              data-canvas-theme={theme.mode}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Canvas alias</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Rename just this canvas copy without changing the source title.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeAliasEditor}
                  className="rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
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
                      setSelectedAlias(aliasDraft)
                      return
                    }

                    if (event.key === 'Escape') {
                      event.preventDefault()
                      closeAliasEditor()
                    }
                  }}
                  placeholder={selectedCanvasObject.title}
                  className="min-w-0 flex-1 rounded-2xl border border-border/60 bg-background px-4 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  data-web-canvas-alias-input="true"
                />

                <button
                  type="button"
                  onClick={() => setSelectedAlias(aliasDraft)}
                  className="rounded-full border border-border/60 bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                  data-web-canvas-alias-save="true"
                >
                  Save
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedAlias(null)}
                  className="rounded-full border border-border/60 bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                  data-web-canvas-alias-clear="true"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {commentEditorOpen && selectedCanvasNode ? (
          <div className="pointer-events-none absolute inset-x-0 top-20 z-20 flex justify-center px-4">
            <div
              className="pointer-events-auto w-[min(92vw,520px)] rounded-[24px] border border-border/60 bg-background/88 p-4 shadow-2xl shadow-black/10 backdrop-blur-xl"
              data-web-canvas-comment-editor="true"
              data-canvas-theme={theme.mode}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Canvas comment</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Pin feedback to this object. The comment follows moves and falls back to the
                    orphan tray if the object is removed.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeCommentEditor}
                  className="rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
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
                      void submitSelectedComment()
                      return
                    }

                    if (event.key === 'Escape') {
                      event.preventDefault()
                      closeCommentEditor()
                    }
                  }}
                  placeholder={`Comment on ${selectedCanvasNode.title}`}
                  className="min-h-[104px] w-full rounded-[24px] border border-border/60 bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  data-web-canvas-comment-input="true"
                />

                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">Mod+Enter to submit, Esc to close</p>
                  <button
                    type="button"
                    onClick={() => {
                      void submitSelectedComment()
                    }}
                    className="rounded-full border border-border/60 bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={commentDraft.trim().length === 0}
                    data-web-canvas-comment-save="true"
                  >
                    Add comment
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {!hasNodes ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center px-6">
            <div
              className="max-w-xl rounded-[24px] border border-border/60 bg-background/78 px-5 py-4 text-center shadow-2xl shadow-black/5 backdrop-blur-xl"
              data-web-canvas-empty-state="true"
              data-canvas-theme={theme.mode}
            >
              <p className="text-sm font-medium text-foreground">Canvas-first workspace</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Drop a URL for a link card, drag in a page or database from the sidebar, or press
                `R`, `F`, or `N` to build directly on the board.
              </p>
            </div>
          </div>
        ) : null}

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
          showNavigationTools
          navigationToolsPosition="bottom-right"
          navigationToolsShowZoomLabel={false}
          onSelectionChange={setSelection}
          onCreateObject={handleCreateObject}
          onEditSelectionAlias={openAliasEditor}
          onCreateSelectionComment={openCommentEditor}
          onDismissTransientUi={() => {
            if (commentEditorOpen) {
              closeCommentEditor()
              return true
            }

            if (aliasEditorOpen) {
              closeAliasEditor()
              return true
            }

            return false
          }}
          onSurfaceDrop={handleSurfaceDrop}
          onSurfacePaste={handleSurfacePaste}
          canvasNodeId={docId}
          canvasSchema={CanvasSchema._schemaId}
          renderNode={(node) => {
            if (
              node.type === 'page' ||
              node.type === 'database' ||
              node.type === 'note' ||
              node.type === 'external-reference' ||
              node.type === 'media'
            ) {
              return getNodeCard(node, theme.mode)
            }

            return undefined
          }}
          onNodeDoubleClick={handleNodeDoubleClick}
        />
      </div>
    </div>
  )
}
