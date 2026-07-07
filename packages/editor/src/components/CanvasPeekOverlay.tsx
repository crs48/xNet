/**
 * Canvas peek (exploration 0277, E4): a modal preview of the selected
 * card's source — a page/note editor or a database surface — without
 * leaving the board. Extracted from the desktop CanvasView so the web
 * canvas peeks identically; the shells provide navigation callbacks.
 */

import type { JSX } from 'react'
import type { Doc as YDoc } from 'yjs'
import { getCanvasObjectsMap, type CanvasNode } from '@xnetjs/canvas'
import {
  getCanvasShellSourceId,
  getCanvasShellSourceType,
  getCanvasViewDisplayType,
  isPeekableCanvasDisplayType,
  type CanvasResolvedObject,
  type LinkedDocumentItem,
  type PeekableCanvasDisplayType
} from '@xnetjs/views'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CanvasDatabasePreviewSurface } from './CanvasDatabasePreviewSurface'
import { CanvasInlinePageSurface } from './CanvasInlinePageSurface'

export type CanvasPeekState = {
  nodeId: string
  sourceId: string
  displayType: PeekableCanvasDisplayType
}

export interface UseCanvasPeekOptions {
  doc: YDoc | null
  documentMap: Map<string, LinkedDocumentItem>
  selectedObject: CanvasResolvedObject | null
  focusCanvasSurface: () => void
}

export interface UseCanvasPeekResult {
  peekState: CanvasPeekState | null
  peekedObject: CanvasResolvedObject | null
  openPeek: (target: CanvasPeekState) => void
  closePeekSurface: () => void
  focusSelectionSurface: (
    sourceId: string,
    displayType: PeekableCanvasDisplayType,
    scope?: 'peek' | 'inline'
  ) => void
}

export function useCanvasPeek({
  doc,
  documentMap,
  selectedObject,
  focusCanvasSurface
}: UseCanvasPeekOptions): UseCanvasPeekResult {
  const [peekState, setPeekState] = useState<CanvasPeekState | null>(null)

  const peekedObject = useMemo<CanvasResolvedObject | null>(() => {
    if (!peekState || !doc) {
      return null
    }

    if (
      selectedObject?.node.id === peekState.nodeId &&
      selectedObject.sourceId === peekState.sourceId &&
      selectedObject.displayType === peekState.displayType
    ) {
      return selectedObject
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
  }, [doc, documentMap, peekState, selectedObject])

  // Drop the peek when its node disappears or stops matching.
  useEffect(() => {
    if (!peekState || !doc) {
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

  const openPeek = useCallback(
    (target: CanvasPeekState) => {
      setPeekState(target)
      focusSelectionSurface(target.sourceId, target.displayType, 'peek')
    },
    [focusSelectionSurface]
  )

  const closePeekSurface = useCallback(() => {
    setPeekState(null)
    focusCanvasSurface()
  }, [focusCanvasSurface])

  // Focus the peeked surface's title when it opens.
  useEffect(() => {
    if (!peekState?.sourceId || !isPeekableCanvasDisplayType(peekState.displayType)) {
      return
    }

    focusSelectionSurface(peekState.sourceId, peekState.displayType, 'peek')
  }, [focusSelectionSurface, peekState])

  // Escape closes the peek from anywhere.
  useEffect(() => {
    if (!peekedObject) {
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
  }, [closePeekSurface, peekedObject])

  return {
    peekState,
    peekedObject,
    openPeek,
    closePeekSurface,
    focusSelectionSurface
  }
}

export interface CanvasPeekOverlayProps {
  peekedObject: CanvasResolvedObject | null
  themeMode: 'light' | 'dark'
  onClose: () => void
  onOpenDocument?: (docId: string, docType: 'page' | 'database') => void
  onSplitDocument?: ((docId: string) => void) | null
  onSourceNodeMutated?: () => void
  onSourceDocumentMutated?: () => void
}

export function CanvasPeekOverlay({
  peekedObject,
  themeMode,
  onClose,
  onOpenDocument,
  onSplitDocument,
  onSourceNodeMutated,
  onSourceDocumentMutated
}: CanvasPeekOverlayProps): JSX.Element | null {
  if (!peekedObject?.sourceId) {
    return null
  }

  const sourceId = peekedObject.sourceId

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-6">
      <button
        type="button"
        className="pointer-events-auto absolute inset-0 bg-black/12 backdrop-blur-[2px] dark:bg-black/38"
        onClick={onClose}
        aria-label="Close canvas peek"
        data-canvas-peek-backdrop="true"
        data-canvas-theme={themeMode}
      />

      <div
        className="pointer-events-auto relative z-10 h-[min(78vh,760px)] w-[min(88vw,980px)] overflow-hidden rounded-[32px] border border-border/60 bg-background/92 p-3 shadow-2xl shadow-black/15 backdrop-blur-xl transition-transform duration-150"
        data-canvas-peek-surface="true"
        data-canvas-peek-kind={peekedObject.displayType}
        data-canvas-peek-node-id={peekedObject.node.id}
        data-canvas-peek-source-id={sourceId}
        data-canvas-theme={themeMode}
      >
        <div className="mb-3 flex items-center justify-between gap-3 px-2 pt-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Peek
            </span>
            <span className="text-sm text-muted-foreground">{peekedObject.title}</span>
          </div>

          <button
            type="button"
            className="rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            onClick={onClose}
            data-canvas-peek-close="true"
          >
            Close
          </button>
        </div>

        <div className="h-[calc(100%-3rem)]">
          {peekedObject.displayType === 'database' ? (
            <CanvasDatabasePreviewSurface
              node={peekedObject.node}
              docId={sourceId}
              mode="peek"
              onSourceNodeMutated={onSourceNodeMutated}
              onSourceDocumentMutated={onSourceDocumentMutated}
              onOpenDocument={(targetDocId) => {
                onClose()
                onOpenDocument?.(targetDocId, 'database')
              }}
              onSplitDocument={
                onSplitDocument
                  ? (targetDocId) => {
                      onClose()
                      onSplitDocument(targetDocId)
                    }
                  : undefined
              }
            />
          ) : (
            <CanvasInlinePageSurface
              node={peekedObject.node}
              docId={sourceId}
              variant={peekedObject.displayType === 'note' ? 'note' : 'page'}
              mode="peek"
              onSourceNodeMutated={onSourceNodeMutated}
              onOpenDocument={(targetDocId) => {
                onClose()
                onOpenDocument?.(targetDocId, 'page')
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
