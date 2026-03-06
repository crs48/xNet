/**
 * Canvas View - Infinite canvas for spatial visualization
 */

import type { CanvasHandle, CanvasNode, Rect } from '@xnetjs/canvas'
import { Canvas, createNode } from '@xnetjs/canvas'
import { CanvasSchema } from '@xnetjs/data'
import { useNode, useIdentity } from '@xnetjs/react'
import { IconButton } from '@xnetjs/ui'
import { Compass, Database, FileText, Maximize2, StickyNote } from 'lucide-react'
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
  isCanvasShellNote,
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
  onOpenDocument?: (docId: string, docType: Exclude<LinkedDocType, 'canvas'>) => void
}

export type CanvasViewHandle = {
  addLinkedDocumentNode: (document: LinkedDocumentItem) => void
  addCanvasNote: () => void
  focusLinkedDocument: (docId: string) => ViewportSnapshot | null
  restoreViewport: (snapshot: ViewportSnapshot) => void
}

function getLinkedType(node: CanvasNode): LinkedDocType | null {
  const linkedType = node.properties.linkedType
  return linkedType === 'page' || linkedType === 'database' || linkedType === 'canvas'
    ? linkedType
    : null
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
  const linkedType = document?.type ?? getLinkedType(node) ?? 'canvas'
  const linkedTitle = document?.title ?? (node.properties.title as string) ?? 'Untitled'
  const subtitle =
    linkedType === 'page'
      ? 'Document'
      : linkedType === 'database'
        ? 'Database'
        : isCanvasShellNote(node)
          ? 'Canvas note'
          : 'Canvas'

  const Icon = linkedType === 'page' ? FileText : linkedType === 'database' ? Database : StickyNote

  return (
    <div className="flex h-full flex-col justify-between rounded-[24px] border border-border/70 bg-background/95 p-4 shadow-lg shadow-black/5">
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <Icon size={12} />
          {subtitle}
        </span>
        {node.linkedNodeId && linkedType !== 'canvas' ? (
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Open
          </span>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="text-lg font-semibold leading-tight text-foreground">{linkedTitle}</div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {linkedType === 'database'
            ? 'Open a focused database surface from the canvas.'
            : linkedType === 'page'
              ? 'Open a focused writing surface from the canvas.'
              : 'A lightweight note pinned directly to the workspace.'}
        </p>
      </div>
    </div>
  )
}

export const CanvasView = forwardRef<CanvasViewHandle, CanvasViewProps>(function CanvasView(
  { docId, documents = [], onOpenDocument }: CanvasViewProps,
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

  const addCanvasNote = useCallback(() => {
    if (!doc || !canvasRef.current) return

    const viewport = canvasRef.current.getViewportSnapshot()
    const nodesMap = doc.getMap<CanvasNode>('nodes')
    const noteNode = createNode(
      'card',
      {
        x: viewport.x - 160,
        y: viewport.y - 100,
        width: 320,
        height: 180
      },
      createCanvasShellNoteProperties()
    )

    nodesMap.set(noteNode.id, noteNode)
  }, [doc])

  const addLinkedDocumentNode = useCallback(
    (document: LinkedDocumentItem) => {
      if (!doc || !canvasRef.current) return

      const viewport = canvasRef.current.getViewportSnapshot()
      const nodesMap = doc.getMap<CanvasNode>('nodes')
      const linkedNode = createNode(
        'embed',
        {
          x: viewport.x - (document.type === 'database' ? 220 : 180),
          y: viewport.y - 120,
          width: document.type === 'database' ? 440 : 360,
          height: document.type === 'database' ? 260 : 220
        },
        {
          title: document.title,
          linkedType: document.type
        }
      )
      linkedNode.linkedNodeId = document.id
      nodesMap.set(linkedNode.id, linkedNode)
    },
    [doc]
  )

  const focusLinkedDocument = useCallback(
    (linkedDocumentId: string): ViewportSnapshot | null => {
      if (!doc || !canvasRef.current) return null

      const nodesMap = doc.getMap<CanvasNode>('nodes')
      const targetNode = Array.from(nodesMap.values()).find(
        (node) => node.linkedNodeId === linkedDocumentId
      )
      if (!targetNode) return null

      const snapshot = canvasRef.current.getViewportSnapshot()
      canvasRef.current.fitToRect(getNodeRect(targetNode), 140)
      return snapshot
    },
    [doc]
  )

  const restoreViewport = useCallback((snapshot: ViewportSnapshot) => {
    canvasRef.current?.setViewportSnapshot(snapshot)
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      addLinkedDocumentNode,
      addCanvasNote,
      focusLinkedDocument,
      restoreViewport
    }),
    [addCanvasNote, addLinkedDocumentNode, focusLinkedDocument, restoreViewport]
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
    <div className="relative flex-1 overflow-hidden">
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

      <div className="pointer-events-none absolute bottom-24 right-6 z-20 flex items-center gap-2">
        <div className="pointer-events-auto rounded-[24px] border border-border/70 bg-background/80 p-2 shadow-xl backdrop-blur-xl">
          <IconButton
            icon={<Maximize2 size={16} />}
            label="Fit canvas to content"
            onClick={() => canvasRef.current?.fitToContent(80)}
            className="h-10 w-10 rounded-2xl"
          />
        </div>
        <div className="pointer-events-auto rounded-[24px] border border-border/70 bg-background/80 p-2 shadow-xl backdrop-blur-xl">
          <IconButton
            icon={<Compass size={16} />}
            label="Reset canvas view"
            onClick={() => canvasRef.current?.resetView()}
            className="h-10 w-10 rounded-2xl"
          />
        </div>
      </div>

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
          renderNode={(node) => {
            const linkedDocument = node.linkedNodeId
              ? documentMap.get(node.linkedNodeId)
              : undefined
            if (shouldRenderCanvasShellCard(node, linkedDocument)) {
              return renderNodeCard(node, linkedDocument)
            }
            return undefined
          }}
          onNodeDoubleClick={(id) => {
            const nodesMap = doc.getMap<CanvasNode>('nodes')
            const targetNode = nodesMap.get(id)
            const linkedType = targetNode ? getLinkedType(targetNode) : null
            if (targetNode?.linkedNodeId && linkedType && linkedType !== 'canvas') {
              onOpenDocument?.(targetNode.linkedNodeId, linkedType)
            }
          }}
        />
      </div>
    </div>
  )
})
