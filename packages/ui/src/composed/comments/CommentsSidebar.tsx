/**
 * CommentsSidebar - Side panel listing all comment threads for a document.
 *
 * Features:
 * - Lists all unresolved threads, with resolved threads collapsible
 * - Click a thread to scroll to and highlight it in the editor
 * - Reply, resolve, reopen, edit, and delete actions inline
 */
import React, { useState, useCallback, useRef, useEffect, type KeyboardEvent } from 'react'
import { cn } from '../../utils'
import { Button } from '../../primitives/Button'
import { CommentBubble } from './CommentBubble'
import type { CommentThreadData } from './CommentPopover'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CommentsSidebarProps {
  /** All threads for this document */
  threads: CommentThreadData[]
  /** Whether the sidebar is open */
  open: boolean
  /** Close the sidebar */
  onClose: () => void
  /** Callback when a thread is clicked (e.g. to scroll to it in the editor) */
  onSelectThread?: (threadId: string) => void
  /** Currently selected thread ID */
  selectedThreadId?: string | null
  /** Callback when a reply is submitted */
  onReply?: (threadId: string, content: string) => void
  /** Callback to resolve a thread */
  onResolve?: (threadId: string) => void
  /** Callback to reopen a thread */
  onReopen?: (threadId: string) => void
  /** Callback to delete a comment */
  onDelete?: (commentId: string) => void
  /** Callback to edit a comment */
  onEdit?: (commentId: string, content: string) => void
  /** Callback when cursor enters a thread (e.g. to highlight mark in editor) */
  onHoverThread?: (threadId: string) => void
  /** Callback when cursor leaves a thread */
  onLeaveThread?: () => void
  /** Custom className */
  className?: string
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function CommentsSidebar({
  threads,
  open,
  onClose,
  onSelectThread,
  selectedThreadId,
  onReply,
  onResolve,
  onReopen,
  onDelete,
  onEdit,
  onHoverThread,
  onLeaveThread,
  className
}: CommentsSidebarProps) {
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null)
  const [replyingToId, setReplyingToId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [showResolved, setShowResolved] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null)

  const unresolvedThreads = threads.filter((t) => !t.resolved)
  const resolvedThreads = threads.filter((t) => t.resolved)

  // Focus reply textarea when replying
  useEffect(() => {
    if (replyingToId && replyTextareaRef.current) {
      requestAnimationFrame(() => replyTextareaRef.current?.focus())
    }
  }, [replyingToId])

  const handleSubmitReply = useCallback(
    (threadId: string) => {
      if (replyText.trim() && onReply) {
        onReply(threadId, replyText.trim())
        setReplyText('')
        setReplyingToId(null)
      }
    },
    [replyText, onReply]
  )

  const handleReplyKeyDown = useCallback(
    (e: KeyboardEvent, threadId: string) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSubmitReply(threadId)
      }
      if (e.key === 'Escape') {
        setReplyingToId(null)
        setReplyText('')
      }
    },
    [handleSubmitReply]
  )

  const handleThreadClick = useCallback(
    (threadId: string) => {
      setExpandedThreadId((prev) => (prev === threadId ? null : threadId))
      onSelectThread?.(threadId)
    },
    [onSelectThread]
  )

  if (!open) return null

  const renderThread = (thread: CommentThreadData) => {
    const isExpanded = expandedThreadId === thread.root.id
    const isSelected = selectedThreadId === thread.root.id
    const isReplying = replyingToId === thread.root.id
    return (
      <div
        key={thread.root.id}
        className={cn(
          'border-b border-border/50 last:border-b-0 transition-colors',
          isSelected && 'bg-amber-500/5'
        )}
        onMouseEnter={() => onHoverThread?.(thread.root.id)}
        onMouseLeave={() => onLeaveThread?.()}
      >
        {/* Thread header - clickable to expand/select */}
        <div
          className="cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => handleThreadClick(thread.root.id)}
        >
          <CommentBubble
            id={thread.root.id}
            author={thread.root.author}
            authorDisplayName={thread.root.authorDisplayName}
            content={thread.root.content}
            createdAt={thread.root.createdAt}
            edited={thread.root.edited}
            editedAt={thread.root.editedAt}
            compact={!isExpanded}
          />
          {!isExpanded && thread.replies.length > 0 && (
            <div className="text-xs text-muted-foreground pb-2 pl-10">
              {thread.replies.length} {thread.replies.length === 1 ? 'reply' : 'replies'}
            </div>
          )}
        </div>

        {/* Expanded thread */}
        {isExpanded && (
          <div className="pb-2">
            {/* Replies */}
            {thread.replies.length > 0 && (
              <div className="pl-4 border-l-2 border-border/30 ml-6 space-y-0">
                {thread.replies.map((reply) => (
                  <CommentBubble
                    key={reply.id}
                    id={reply.id}
                    author={reply.author}
                    authorDisplayName={reply.authorDisplayName}
                    content={reply.content}
                    createdAt={reply.createdAt}
                    edited={reply.edited}
                    editedAt={reply.editedAt}
                    replyToUser={reply.replyToUser}
                    replyToCommentId={reply.replyToCommentId}
                    isEditing={editingId === reply.id}
                    onEdit={(newContent) => {
                      onEdit?.(reply.id, newContent)
                      setEditingId(null)
                    }}
                    onStartEdit={() => setEditingId(reply.id)}
                    onCancelEdit={() => setEditingId(null)}
                    onDelete={() => onDelete?.(reply.id)}
                  />
                ))}
              </div>
            )}

            {/* Reply input */}
            {isReplying ? (
              <div className="px-3 pt-2">
                <textarea
                  ref={replyTextareaRef}
                  className="w-full p-2 text-sm rounded border bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring min-h-[60px]"
                  placeholder="Reply..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => handleReplyKeyDown(e, thread.root.id)}
                  rows={2}
                />
                <div className="flex justify-end gap-2 mt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setReplyingToId(null)
                      setReplyText('')
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={!replyText.trim()}
                    onClick={() => handleSubmitReply(thread.root.id)}
                  >
                    Reply
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 pt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  onClick={() => setReplyingToId(thread.root.id)}
                >
                  Reply
                </Button>
                {thread.resolved ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs"
                    onClick={() => onReopen?.(thread.root.id)}
                  >
                    Reopen
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs"
                    onClick={() => onResolve?.(thread.root.id)}
                  >
                    Resolve
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'w-80 border-l border-border bg-background flex flex-col h-full overflow-hidden',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h3 className="text-sm font-medium">
          Comments
          {unresolvedThreads.length > 0 && (
            <span className="ml-1.5 text-xs text-muted-foreground">
              ({unresolvedThreads.length})
            </span>
          )}
        </h3>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
          aria-label="Close comments"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M10.5 3.5L3.5 10.5M3.5 3.5L10.5 10.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">No comments yet</div>
        ) : (
          <>
            {/* Unresolved threads */}
            {unresolvedThreads.map(renderThread)}

            {/* Resolved threads (collapsible) */}
            {resolvedThreads.length > 0 && (
              <div className="mt-1">
                <button
                  className="w-full px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors flex items-center gap-1.5"
                  onClick={() => setShowResolved((prev) => !prev)}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    className={cn('transition-transform', showResolved && 'rotate-90')}
                  >
                    <path
                      d="M3 1L7 5L3 9"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  {resolvedThreads.length} resolved
                </button>
                {showResolved && (
                  <div className="opacity-60">{resolvedThreads.map(renderThread)}</div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
