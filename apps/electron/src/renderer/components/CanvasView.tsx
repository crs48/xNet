/**
 * Canvas View - Infinite canvas for spatial visualization
 */

import type { CanvasHandle, CanvasNode, Rect } from '@xnetjs/canvas'
import { Canvas, createNode } from '@xnetjs/canvas'
import { CanvasSchema, DatabaseSchema, PageSchema } from '@xnetjs/data'
import { useNode, useIdentity } from '@xnetjs/react'
import { Database, FileText, StickyNote } from 'lucide-react'
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
}

export type CanvasViewHandle = {
  focusLinkedDocument: (docId: string) => ViewportSnapshot | null
  restoreViewport: (snapshot: ViewportSnapshot) => void
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

export const CanvasView = forwardRef<CanvasViewHandle, CanvasViewProps>(function CanvasView(
  {
    docId,
    documents = [],
    pendingInsert,
    onPendingInsertConsumed,
    onOpenDocument
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
  const documentMap = useMemo(
    () => new Map(documents.map((entry) => [entry.id, entry])),
    [documents]
  )

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

  useImperativeHandle(
    ref,
    () => ({
      focusLinkedDocument,
      restoreViewport
    }),
    [focusLinkedDocument, restoreViewport]
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
          navigationToolsStyle={{
            bottom: 24,
            right: 24,
            borderRadius: 24,
            background: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 18px 38px rgba(15, 23, 42, 0.12)',
            border: '1px solid rgba(148, 163, 184, 0.28)'
          }}
          renderNode={(node) => {
            const sourceNodeId = getCanvasShellSourceId(node)
            const linkedDocument = sourceNodeId ? documentMap.get(sourceNodeId) : undefined
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
