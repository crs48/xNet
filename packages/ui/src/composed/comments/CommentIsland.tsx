/**
 * CommentIsland — the inline comment surface, as a workbench island (0375).
 *
 * Replaces CommentPopover, which had drifted from the shell in three ways: it
 * scrolled its whole body as one column (so a long thread pushed Resolve out of
 * reach), it mounted its reply composer unconditionally (so ~140px of a 384px
 * box was always a text field), and it measured its anchor once at render (so
 * it stranded on scroll and clipped at viewport edges).
 *
 * The layout is three regions and exactly one scroll container:
 *
 *   ┌────────────────────────────┐
 *   │ header    shrink-0         │  anchor context · resolve · close
 *   ├────────────────────────────┤
 *   │ thread    flex-1 min-h-0   │  ← the only thing that scrolls
 *   ├────────────────────────────┤
 *   │ composer  shrink-0         │  collapsed to a button until invited
 *   └────────────────────────────┘
 *
 * Chrome comes from the shared ISLAND_OVERLAY recipe, so it cannot drift from
 * the rest of the shell again. Positioning and enter/exit likewise come from
 * the shared vocabulary rather than hand-rolled rects and raw animate-in.
 */
import React, { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Presence } from '../../motion/Presence'
import { useAnchoredPosition, type AnchorLike, type AnchorSide } from '../../motion/useAnchoredPosition'
import { Button } from '../../primitives/Button'
import { ISLAND_OVERLAY } from '../../primitives/island'
import { cn } from '../../utils'
import { type TaskPersonOption } from '../tasks/people'
import { CommentBubble } from './CommentBubble'
import { MentionTextArea } from './MentionTextArea'
import type { CommentThreadData } from './CommentPopover'

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * `preview` — hover peek: root comment plus a reply count, click to open.
 * `full`    — the whole thread, with reply/resolve/edit.
 * `composing` — no thread yet; just the composer, anchored to the selection.
 */
export type CommentIslandMode = 'preview' | 'full' | 'composing'

export interface CommentIslandProps {
  /** The thread to display. Omitted (or null) in `composing` mode. */
  thread?: CommentThreadData | null
  /** Element or virtual anchor to position against. */
  anchor: AnchorLike | null
  /** Display mode. */
  mode: CommentIslandMode
  /** Whether the island is open. Drives the enter/exit animation. */
  open: boolean
  /** Preferred side; mirrored automatically when it would leave the viewport. */
  side?: AnchorSide
  /** Quoted anchor text shown as context while composing. */
  quotedText?: string
  /** Submit a reply to an open thread. */
  onReply?: (content: string) => void
  /** Submit the first comment of a new thread (`composing` mode). */
  onCreate?: (content: string) => void
  onResolve?: () => void
  onReopen?: () => void
  onDelete?: (commentId: string) => void
  onEdit?: (commentId: string, newContent: string) => void
  onDismiss?: () => void
  /** Upgrade a hover preview to the full thread. */
  onUpgradeToFull?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  /** Open with the composer already expanded and focused. */
  focusReply?: boolean
  /** Candidates for @mention typeahead (0170). */
  people?: TaskPersonOption[]
  /** Thread N of M, when several threads overlap the same anchor. */
  position?: { index: number; total: number; onPrev: () => void; onNext: () => void }
  className?: string
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function CommentIsland({
  thread,
  anchor,
  mode,
  open,
  side = 'right',
  quotedText,
  onReply,
  onCreate,
  onResolve,
  onReopen,
  onDelete,
  onEdit,
  onDismiss,
  onUpgradeToFull,
  onMouseEnter,
  onMouseLeave,
  focusReply = false,
  people = [],
  position,
  className
}: CommentIslandProps) {
  const composing = mode === 'composing'
  const [draft, setDraft] = useState('')
  // The composer stays collapsed until invited — this is what gives the thread
  // its vertical budget back. Composing mode has nothing else to show, so it
  // opens expanded.
  const [replying, setReplying] = useState(composing || focusReply)
  const [editingId, setEditingId] = useState<string | null>(null)
  const islandRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef<HTMLTextAreaElement>(null)

  const pos = useAnchoredPosition(open ? anchor : null, side, islandRef)

  useEffect(() => {
    if (composing || focusReply) setReplying(true)
  }, [composing, focusReply])

  useEffect(() => {
    if (replying && open) {
      // Wait for the island to be positioned before stealing the caret,
      // otherwise the browser scrolls to its pre-measurement offscreen spot.
      const id = requestAnimationFrame(() => draftRef.current?.focus())
      return () => cancelAnimationFrame(id)
    }
  }, [replying, open])

  const submit = useCallback(() => {
    const text = draft.trim()
    if (!text) return
    if (composing) onCreate?.(text)
    else onReply?.(text)
    setDraft('')
    if (!composing) setReplying(false)
  }, [draft, composing, onCreate, onReply])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        submit()
      }
      if (e.key === 'Escape') {
        e.stopPropagation()
        onDismiss?.()
      }
    },
    [submit, onDismiss]
  )

  if (typeof document === 'undefined') return null
  if (!anchor) return null
  if (!composing && !thread) return null

  const comments = thread ? [thread.root, ...thread.replies] : []

  // ─── Preview: a peek, not a thread ──────────────────────────────────────────
  const previewBody = thread ? (
    <div
      className="cursor-pointer p-3 transition-colors hover:bg-muted/30"
      onClick={onUpgradeToFull}
    >
      <CommentBubble
        id={thread.root.id}
        author={thread.root.author}
        authorDisplayName={thread.root.authorDisplayName}
        content={thread.root.content}
        createdAt={thread.root.createdAt}
        compact
      />
      {thread.replies.length > 0 && (
        <div className="mt-2 border-t border-hairline pt-2 pl-3 text-xs text-muted-foreground">
          {thread.replies.length} {thread.replies.length === 1 ? 'reply' : 'replies'}
        </div>
      )}
    </div>
  ) : null

  // ─── Full / composing: header + scrolling thread + composer ────────────────
  const fullBody = (
    <>
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {position && position.total > 1 && (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <button
                type="button"
                aria-label="Previous thread"
                onClick={position.onPrev}
                className="rounded px-1 hover:bg-muted"
              >
                ‹
              </button>
              {position.index + 1} of {position.total}
              <button
                type="button"
                aria-label="Next thread"
                onClick={position.onNext}
                className="rounded px-1 hover:bg-muted"
              >
                ›
              </button>
            </span>
          )}
          {quotedText && (
            <span className="truncate text-xs italic text-muted-foreground" title={quotedText}>
              “{quotedText}”
            </span>
          )}
          {!quotedText && !position && (
            <span className="text-xs font-medium text-muted-foreground">
              {composing ? 'New comment' : thread?.resolved ? 'Resolved' : 'Comment'}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!composing &&
            (thread?.resolved ? (
              <Button size="sm" variant="ghost" onClick={onReopen}>
                Reopen
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={onResolve}>
                Resolve
              </Button>
            ))}
          <Button size="sm" variant="ghost" aria-label="Close" onClick={onDismiss}>
            ✕
          </Button>
        </div>
      </header>

      {/* The only scroll container. min-h-0 is what lets it actually shrink
          inside the flex column instead of forcing the island taller. */}
      {!composing && (
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {comments.map((comment) => (
            <CommentBubble
              key={comment.id}
              id={comment.id}
              author={comment.author}
              authorDisplayName={comment.authorDisplayName}
              content={comment.content}
              createdAt={comment.createdAt}
              edited={comment.edited}
              editedAt={comment.editedAt}
              replyToUser={comment.replyToUser}
              replyToCommentId={comment.replyToCommentId}
              isEditing={editingId === comment.id}
              onEdit={(newContent) => {
                onEdit?.(comment.id, newContent)
                setEditingId(null)
              }}
              onStartEdit={() => setEditingId(comment.id)}
              onCancelEdit={() => setEditingId(null)}
              onDelete={() => onDelete?.(comment.id)}
            />
          ))}
        </div>
      )}

      <footer className={cn('shrink-0 px-3 py-2', !composing && 'border-t border-hairline')}>
        {replying ? (
          <>
            <MentionTextArea
              textareaRef={draftRef}
              className="w-full resize-none rounded-lg border border-hairline bg-background p-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder={composing ? 'Write a comment… (@ to mention)' : 'Reply…'}
              value={draft}
              onChange={setDraft}
              people={people}
              rows={2}
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft('')
                  if (composing) onDismiss?.()
                  else setReplying(false)
                }}
              >
                Cancel
              </Button>
              <Button size="sm" disabled={!draft.trim()} onClick={submit}>
                {composing ? 'Comment' : 'Reply'}
              </Button>
            </div>
          </>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="w-full justify-start text-muted-foreground"
            onClick={() => setReplying(true)}
          >
            Reply…
          </Button>
        )}
      </footer>
    </>
  )

  return createPortal(
    <div
      // Parked offscreen until measured, so it never flashes at 0,0.
      style={{
        position: 'fixed',
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        zIndex: 50
      }}
      className={pos ? undefined : 'invisible'}
      onKeyDown={handleKeyDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <Presence show={open} motion="pop">
        <div
          ref={islandRef}
          role="dialog"
          aria-label={composing ? 'New comment' : 'Comment thread'}
          className={cn(
            ISLAND_OVERLAY,
            'flex w-80 flex-col text-popover-foreground',
            'max-h-[min(28rem,60vh)]',
            className
          )}
        >
          {mode === 'preview' ? previewBody : fullBody}
        </div>
      </Presence>
    </div>,
    document.body
  )
}
