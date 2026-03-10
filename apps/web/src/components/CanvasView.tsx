/**
 * Canvas View - Web canvas surface with source-backed drops.
 */

import type { CanvasHandle, CanvasNode } from '@xnetjs/canvas'
import { useNavigate } from '@tanstack/react-router'
import {
  Canvas,
  extractCanvasIngressPayloads,
  useCanvasObjectIngestion,
  useCanvasThemeTokens
} from '@xnetjs/canvas'
import { CanvasSchema, DatabaseSchema, PageSchema } from '@xnetjs/data'
import { useBlobService } from '@xnetjs/editor/react'
import { useIdentity, useMutate, useNode } from '@xnetjs/react'
import { FileImage, FileText, Link2, Maximize2, Plus, StickyNote, Table2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PresenceAvatars } from './PresenceAvatars'
import { ShareButton } from './ShareButton'

interface CanvasViewProps {
  docId: string
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

  const canvasRef = useRef<CanvasHandle>(null)
  const [canvasReady, setCanvasReady] = useState(false)
  const [hasNodes, setHasNodes] = useState(false)
  const { placeSourceObject, ingestDataTransfer } = useCanvasObjectIngestion({
    doc,
    blobService,
    getViewportSnapshot: () => canvasRef.current?.getViewportSnapshot() ?? { x: 0, y: 0, zoom: 1 }
  })

  useEffect(() => {
    if (!doc) {
      return
    }

    setCanvasReady(true)

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

  useEffect(() => {
    const testHarness = window as Window & {
      __xnetCanvasTestHarness?: {
        registerCanvasDoc?: (canvasId: string, doc: import('yjs').Doc | null) => void
      } | null
    }

    testHarness.__xnetCanvasTestHarness?.registerCanvasDoc?.(docId, doc)

    return () => {
      testHarness.__xnetCanvasTestHarness?.registerCanvasDoc?.(docId, null)
    }
  }, [doc, docId])

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
      const node = doc?.getMap<CanvasNode>('nodes').get(nodeId)
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
        ? 'Drag pages, databases, links, or files directly onto the board.'
        : 'Drop links, files, pages, or databases anywhere on the board.',
    [hasNodes]
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

        {!hasNodes ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center px-6">
            <div
              className="max-w-xl rounded-[24px] border border-border/60 bg-background/78 px-5 py-4 text-center shadow-2xl shadow-black/5 backdrop-blur-xl"
              data-web-canvas-empty-state="true"
              data-canvas-theme={theme.mode}
            >
              <p className="text-sm font-medium text-foreground">Canvas-first workspace</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Drop a URL for a link card, drag in a page or database from the sidebar, or create a
                note directly on the board.
              </p>
            </div>
          </div>
        ) : null}

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
          onSurfaceDrop={handleSurfaceDrop}
          onSurfacePaste={handleSurfacePaste}
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
