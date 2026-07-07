/**
 * Shared CanvasView panels (exploration 0277): the alias editor, comment
 * composer, and shortcut-help card rendered identically on web and
 * desktop. The platform shells own the positioning wrapper; these render
 * the panel card itself.
 */

import type { UseCanvasViewControllerResult } from './useCanvasViewController.js'
import type { JSX } from 'react'

export interface CanvasSelectionPanelCardProps {
  controller: UseCanvasViewControllerResult
  themeMode: 'light' | 'dark'
}

export function CanvasAliasEditorPanel({
  controller,
  themeMode
}: CanvasSelectionPanelCardProps): JSX.Element | null {
  const { selectedObject, aliasDraft, setAliasDraft, aliasInputRef } = controller

  if (!selectedObject) {
    return null
  }

  return (
    <div data-canvas-alias-editor="true" data-canvas-theme={themeMode}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Canvas alias</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This renames the canvas object without touching the underlying page or database title.
          </p>
        </div>

        <button
          type="button"
          className="rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          onClick={controller.closeSelectionPanel}
          data-canvas-source-panel-close="true"
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
              controller.setSelectedAlias(aliasDraft)
              return
            }

            if (event.key === 'Escape') {
              event.preventDefault()
              controller.closeSelectionPanel()
            }
          }}
          placeholder={selectedObject.title}
          className="min-w-0 flex-1 rounded-2xl border border-border/60 bg-background px-4 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          data-canvas-alias-input="true"
        />

        <button
          type="button"
          className="rounded-full border border-border/60 bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          onClick={() => {
            controller.setSelectedAlias(aliasDraft)
          }}
          data-canvas-alias-save="true"
        >
          Save
        </button>

        <button
          type="button"
          className="rounded-full border border-border/60 bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          onClick={() => {
            controller.clearSelectedAlias()
          }}
          data-canvas-alias-clear="true"
        >
          Clear
        </button>
      </div>
    </div>
  )
}

export function CanvasCommentComposerPanel({
  controller,
  themeMode
}: CanvasSelectionPanelCardProps): JSX.Element | null {
  const { selectedObject, commentDraft, setCommentDraft, commentInputRef } = controller
  const commentCount = controller.selectedObjectCommentCount

  if (!selectedObject) {
    return null
  }

  return (
    <div data-canvas-comment-editor="true" data-canvas-theme={themeMode}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Canvas comment</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Anchor a thread to this object. The pin follows the object as it moves, and deleted
            anchors fall back to the orphan tray.
          </p>
        </div>

        <button
          type="button"
          className="rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          onClick={controller.closeSelectionPanel}
          data-canvas-source-panel-close="true"
        >
          Close
        </button>
      </div>

      <div className="mt-3 rounded-2xl bg-muted/35 px-3 py-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
        {commentCount > 0
          ? `${commentCount} existing thread${commentCount === 1 ? '' : 's'} on this object`
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
              void controller.submitSelectionComment()
              return
            }

            if (event.key === 'Escape') {
              event.preventDefault()
              controller.closeSelectionPanel()
            }
          }}
          placeholder={`Comment on ${selectedObject.title}`}
          className="min-h-[104px] w-full rounded-[24px] border border-border/60 bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          data-canvas-comment-input="true"
        />

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Mod+Enter to submit, Esc to close</p>
          <button
            type="button"
            className="rounded-full border border-border/60 bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => {
              void controller.submitSelectionComment()
            }}
            disabled={commentDraft.trim().length === 0}
            data-canvas-comment-save="true"
          >
            Add comment
          </button>
        </div>
      </div>
    </div>
  )
}

export const CANVAS_SHORTCUT_HELP_ENTRIES: ReadonlyArray<readonly [string, string]> = [
  ['P / D / N / M', 'Create page, database, note, or mind map'],
  ['R / F', 'Create a rectangle or an empty frame'],
  ['Drag handle', 'Pull from a selected card to connect objects'],
  ['Tab', 'Step through canvas objects'],
  ['Arrow keys', 'Pan the board or nudge the selection'],
  ['Enter', 'Peek or edit the selected object'],
  ['Mod+Enter', 'Open the focused page or database view'],
  ['Mod+Shift+A', 'Edit the selection alias'],
  ['Mod+Shift+C', 'Comment on the selected object'],
  ['Mod+Shift+K', 'Connect the current two-object selection'],
  ['Mod+Shift+L', 'Lock or unlock the current selection'],
  ['Mod+Shift+F', 'Wrap the selection in a frame'],
  ['Mod+Shift+Arrow', 'Align the selection to one edge'],
  ['[ / ]', 'Send the selection backward or forward'],
  ['Mod+Shift+P', 'Open the command palette'],
  ['Mod+1 / Mod+0', 'Fit content or reset the camera'],
  ['Esc', 'Dismiss help or clear the selection']
]

export interface CanvasShortcutHelpPanelProps {
  themeMode: 'light' | 'dark'
  onClose: () => void
  /** Platform-specific extra rows, appended after the shared set. */
  extraEntries?: ReadonlyArray<readonly [string, string]>
}

export function CanvasShortcutHelpPanel({
  themeMode,
  onClose,
  extraEntries = []
}: CanvasShortcutHelpPanelProps): JSX.Element {
  const entries = [...CANVAS_SHORTCUT_HELP_ENTRIES, ...extraEntries]

  return (
    <div
      className="pointer-events-auto rounded-[28px] border border-border/60 bg-background/90 p-5 shadow-2xl shadow-black/10 backdrop-blur-xl"
      data-canvas-shortcut-help="true"
      data-canvas-theme={themeMode}
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
          onClick={onClose}
          data-canvas-shortcut-help-close="true"
        >
          Close
        </button>
      </div>

      <div className="mt-4 grid gap-2 text-sm text-foreground">
        {entries.map(([shortcut, description]) => (
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
  )
}
