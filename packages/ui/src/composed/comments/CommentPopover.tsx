/**
 * CommentPopover - Inline popover for viewing and interacting with comment threads.
 *
 * Features:
 * - Preview mode (hover): Shows first comment and reply count
 * - Full mode (click): Shows complete thread with reply input
 * - Resolve/reopen actions
 */
import { useState, useCallback, type KeyboardEvent } from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { cn } from '../../utils'
import { Button } from '../../primitives/Button'
import { CommentBubble, type CommentBubbleProps } from './CommentBubble'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CommentData {
  id: string
  author: string
  authorDisplayName?: string
  content: string
  createdAt: number
  edited?: boolean
  editedAt?: number
  replyToUser?: string
  replyToCommentId?: string
}

export interface CommentThreadData {
  root: CommentData
  replies: CommentData[]
  resolved: boolean
}

export interface CommentPopoverProps {
  /** The thread to display */
  thread: CommentThreadData
  /** Anchor element or coordinates for positioning */
  anchor: HTMLElement | { x: number; y: number }
  /** Display mode */
  mode: 'preview' | 'full'
  /** Whether the popover is open */
  open: boolean
  /** Preferred side for popover placement */
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** Callback when a reply is submitted */
  onReply?: (content: string) => void
  /** Callback to resolve the thread */
  onResolve?: () => void
  /** Callback to reopen the thread */
  onReopen?: () => void
  /** Callback to delete a comment */
  onDelete?: (commentId: string) => void
  /** Callback to edit a comment */
  onEdit?: (commentId: string, newContent: string) => void
  /** Callback when popover should close */
  onDismiss?: () => void
  /** Callback to upgrade from preview to full mode */
  onUpgradeToFull?: () => void
  /** Custom className */
  className?: string
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function CommentPopover({
  thread,
  anchor,
  mode,
  open,
  side = 'right',
  onReply,
  onResolve,
  onReopen,
  onDelete,
  onEdit,
  onDismiss,
  onUpgradeToFull,
  className
}: CommentPopoverProps) {
  const [replyText, setReplyText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const handleSubmitReply = useCallback(() => {
    if (replyText.trim() && onReply) {
      onReply(replyText.trim())
      setReplyText('')
    }
  }, [replyText, onReply])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        handleSubmitReply()
      }
      if (e.key === 'Escape') {
        onDismiss?.()
      }
    },
    [handleSubmitReply, onDismiss]
  )

  const allComments = [thread.root, ...thread.replies]

  // Determine anchor position
  const anchorStyle =
    'x' in anchor
      ? {
          position: 'fixed' as const,
          left: anchor.x,
          top: anchor.y
        }
      : undefined

  // For element anchors, we use Radix's built-in positioning
  const anchorElement = 'x' in anchor ? undefined : anchor

  const content = (
    <div
      className={cn(
        'w-80 max-h-96 overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-lg',
        className
      )}
      onKeyDown={handleKeyDown}
    >
      {mode === 'preview' ? (
        // Preview mode - compact view
        <div
          className="p-3 cursor-pointer hover:bg-muted/30 transition-colors"
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
            <div className="text-xs text-muted-foreground mt-2 pt-2 border-t pl-3">
              {thread.replies.length} {thread.replies.length === 1 ? 'reply' : 'replies'}
            </div>
          )}
        </div>
      ) : (
        // Full mode - complete thread with interactions
        <div className="p-3">
          {/* Thread comments */}
          <div className="space-y-1">
            {allComments.map((comment) => (
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

          {/* Reply input */}
          <div className="mt-3 pt-3 border-t">
            <div className="flex gap-2">
              <textarea
                className="flex-1 p-2 text-sm rounded border bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring min-h-[60px]"
                placeholder="Reply..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={2}
              />
            </div>
            {replyText.trim() && (
              <div className="flex justify-end mt-2">
                <Button size="sm" onClick={handleSubmitReply}>
                  Reply
                </Button>
              </div>
            )}
          </div>

          {/* Thread actions */}
          <div className="mt-3 pt-3 border-t flex justify-between items-center">
            {thread.resolved ? (
              <Button size="sm" variant="ghost" onClick={onReopen}>
                Reopen
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={onResolve}>
                Resolve
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  )

  // If using coordinate anchor, render with fixed positioning
  if ('x' in anchor) {
    return open ? (
      <div style={anchorStyle} className="z-50">
        {content}
      </div>
    ) : null
  }

  // Otherwise use Radix popover with element anchor.
  // We use a virtualRef so the popover is positioned relative to the actual
  // comment mark <span> in the editor DOM without needing to wrap it.
  const virtualRef = anchorElement
    ? { current: { getBoundingClientRect: () => anchorElement.getBoundingClientRect() } }
    : undefined

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={(isOpen) => !isOpen && onDismiss?.()}>
      <PopoverPrimitive.Anchor virtualRef={virtualRef} />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side={side}
          align="start"
          sideOffset={8}
          className="z-50 animate-in fade-in-0 zoom-in-95"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {content}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
