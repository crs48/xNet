/**
 * CanvasSelectionHud (exploration 0277, E6/E9/W6/W9): the selection
 * action bar shared by web and desktop. Selection operations (lock,
 * align, distribute, tidy, connect, layering) delegate to the shared
 * CanvasHandle engine; platform-specific actions (peek/open/split,
 * query-frame refresh, linked copies) arrive as optional props and the
 * button hides when the prop is absent.
 */

import type { UseCanvasViewControllerResult } from './useCanvasViewController.js'
import type { DragEvent, JSX, ReactNode } from 'react'
import {
  Command,
  Database,
  Download,
  Eye,
  Link2,
  MessageSquare,
  Presentation,
  RefreshCw,
  X
} from 'lucide-react'

function HudButton({
  action,
  onClick,
  children,
  hint,
  draggable,
  onDragStart
}: {
  action: string
  onClick: () => void
  children: ReactNode
  hint?: string
  draggable?: boolean
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void
}): JSX.Element {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
      onClick={onClick}
      data-canvas-selection-action={action}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      {children}
      {hint ? (
        <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </button>
  )
}

export interface CanvasSelectionHudProps {
  controller: UseCanvasViewControllerResult
  themeMode: 'light' | 'dark'
  /** Peek/Center the selected object (desktop today; web via 0277 E4). */
  onPeek?: (() => void) | null
  /** Open the selected source in its full surface. */
  onOpen?: (() => void) | null
  /** Open the selected database beside the canvas (desktop shell). */
  onSplit?: (() => void) | null
  /** Refresh the selected query frame (present only when one is selected). */
  onRefreshQueryFrame?: (() => void) | null
  queryFrameRefreshMode?: string | null
  /** Linked-copies count + panel toggle (source references, E3). */
  referencesCount?: number | null
  onToggleReferences?: (() => void) | null
  /** Present/export the selected frame (W6). */
  onPresentFrame?: (() => void) | null
  onExportFrame?: (() => void) | null
  /** Clear the whole selection (closes platform overlays too). */
  onClearSelection: () => void
  /** Drag-to-excerpt payload setup for the title chip (web, 0166). */
  onTitleDragStart?: (event: DragEvent<HTMLElement>) => void
}

export function CanvasSelectionHud({
  controller,
  themeMode,
  onPeek,
  onOpen,
  onSplit,
  onRefreshQueryFrame,
  queryFrameRefreshMode,
  referencesCount,
  onToggleReferences,
  onPresentFrame,
  onExportFrame,
  onClearSelection,
  onTitleDragStart
}: CanvasSelectionHudProps): JSX.Element | null {
  const {
    canvasRef,
    selection,
    selectedObject,
    selectedCanvasEdge,
    selectionAllLocked,
    selectedObjectCommentCount
  } = controller

  if (selection.nodeIds.length === 0 && selectedCanvasEdge) {
    return (
      <div
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/60 bg-background/82 px-3 py-2 shadow-lg shadow-black/5 backdrop-blur-xl"
        data-canvas-selection-hud="true"
        data-canvas-selection-type="connector"
        data-canvas-theme={themeMode}
      >
        <span className="truncate px-2 text-sm text-foreground">
          {`Connector · ${selectedCanvasEdge.relationship?.kind ?? 'relates-to'}`}
          {(selectedCanvasEdge.label ?? selectedCanvasEdge.relationship?.label)
            ? ` · ${selectedCanvasEdge.label ?? selectedCanvasEdge.relationship?.label}`
            : ''}
        </span>
        <HudButton action="clear" onClick={onClearSelection} hint="Esc">
          <X size={12} />
          Clear
        </HudButton>
      </div>
    )
  }

  if (selection.nodeIds.length === 0) {
    return null
  }

  return (
    <div
      className="pointer-events-auto flex max-w-[min(92vw,780px)] items-center gap-2 rounded-full border border-border/60 bg-background/82 px-3 py-2 shadow-lg shadow-black/5 backdrop-blur-xl"
      data-canvas-selection-hud="true"
      data-canvas-selection-count={selection.nodeIds.length}
      data-canvas-selection-type={selectedObject?.displayType ?? 'mixed'}
      data-canvas-selection-all-locked={selectionAllLocked ? 'true' : 'false'}
      data-canvas-theme={themeMode}
    >
      <span
        className="truncate px-2 text-sm text-foreground"
        draggable={Boolean(onTitleDragStart)}
        onDragStart={onTitleDragStart}
        data-canvas-selection-title="true"
      >
        {selectedObject
          ? `${
              selectedObject.displayType === 'note'
                ? 'Note'
                : selectedObject.displayType === 'database'
                  ? 'Database'
                  : selectedObject.displayType === 'external-reference'
                    ? 'Link'
                    : selectedObject.displayType === 'media'
                      ? 'Media'
                      : selectedObject.displayType === 'shape'
                        ? 'Shape'
                        : selectedObject.displayType === 'frame'
                          ? 'Frame'
                          : 'Page'
            } · ${selectedObject.title}`
          : `${selection.nodeIds.length} selected`}
      </span>

      {selectedObject ? (
        <>
          {onPeek ? (
            <HudButton action="peek" onClick={onPeek} hint="Enter">
              <Eye size={12} />
              {selectedObject.displayType === 'page' ||
              selectedObject.displayType === 'database' ||
              selectedObject.displayType === 'note'
                ? 'Peek'
                : 'Center'}
            </HudButton>
          ) : null}
          {onOpen && selectedObject.sourceId && selectedObject.sourceType ? (
            <HudButton action="focus" onClick={onOpen} hint="Mod+Enter">
              <Command size={12} />
              Open
            </HudButton>
          ) : null}
          {onRefreshQueryFrame ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              onClick={onRefreshQueryFrame}
              data-canvas-selection-action="refresh-query-frame"
              title={`Refresh ${queryFrameRefreshMode ?? 'manual'} query frame`}
            >
              <RefreshCw size={12} />
              Refresh
            </button>
          ) : null}
          {onSplit && selectedObject.displayType === 'database' && selectedObject.sourceId ? (
            <HudButton action="split" onClick={onSplit} hint="Alt+Enter">
              <Database size={12} />
              Split
            </HudButton>
          ) : null}
          {onPresentFrame ? (
            <HudButton action="present-frame" onClick={onPresentFrame}>
              <Presentation size={12} />
              Present
            </HudButton>
          ) : null}
          {onExportFrame ? (
            <HudButton action="export-frame" onClick={onExportFrame}>
              <Download size={12} />
              Export
            </HudButton>
          ) : null}
          {selectedObject.sourceId ? (
            <HudButton
              action="alias"
              onClick={() => {
                controller.openAliasEditor()
              }}
              hint="Mod+Shift+A"
            >
              Alias
            </HudButton>
          ) : null}
          {onToggleReferences && selectedObject.sourceId ? (
            <HudButton action="references" onClick={onToggleReferences}>
              Copies {referencesCount ?? 0}
            </HudButton>
          ) : null}
          <HudButton
            action="comment"
            onClick={() => {
              controller.openCommentComposer()
            }}
            hint="Mod+Shift+C"
          >
            <MessageSquare size={12} />
            Comment{selectedObjectCommentCount > 0 ? ` ${selectedObjectCommentCount}` : ''}
          </HudButton>
        </>
      ) : null}

      <HudButton
        action="lock"
        onClick={() => {
          canvasRef.current?.toggleSelectionLock()
        }}
        hint="Mod+Shift+L"
      >
        {selectionAllLocked ? 'Unlock' : 'Lock'}
      </HudButton>

      {selection.nodeIds.length > 1 ? (
        <>
          {selection.nodeIds.length === 2 ? (
            <HudButton
              action="connect"
              onClick={() => {
                canvasRef.current?.connectSelection()
              }}
              hint="Mod+Shift+K"
            >
              <Link2 size={12} />
              Connect
            </HudButton>
          ) : null}

          <HudButton
            action="align-left"
            onClick={() => {
              canvasRef.current?.alignSelection('left')
            }}
            hint="Mod+Shift+←"
          >
            Align left
          </HudButton>

          <HudButton
            action="distribute"
            onClick={() => {
              canvasRef.current?.distributeSelection('horizontal')
            }}
          >
            Distribute
          </HudButton>

          <HudButton
            action="tidy"
            onClick={() => {
              canvasRef.current?.tidySelection()
            }}
          >
            Tidy
          </HudButton>
        </>
      ) : null}

      <HudButton
        action="send-backward"
        onClick={() => {
          canvasRef.current?.shiftSelectionLayer('backward')
        }}
        hint="["
      >
        Back
      </HudButton>

      <HudButton
        action="bring-forward"
        onClick={() => {
          canvasRef.current?.shiftSelectionLayer('forward')
        }}
        hint="]"
      >
        Forward
      </HudButton>

      <HudButton action="clear" onClick={onClearSelection} hint="Esc">
        <X size={12} />
        Clear
      </HudButton>
    </div>
  )
}
