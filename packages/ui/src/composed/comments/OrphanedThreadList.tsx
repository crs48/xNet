/**
 * OrphanedThreadList - Display section for detached/orphaned comment threads.
 *
 * Shows comments whose anchors can no longer be resolved (deleted text, rows, etc.)
 * with options to reattach or dismiss.
 */
import { cn } from '../../utils'
import { Button } from '../../primitives/Button'
import { DIDAvatar } from '../../components/DIDAvatar'

// ─── Types ─────────────────────────────────────────────────────────────────────

/** Why an anchor is orphaned (matches @xnet/data OrphanReason) */
export type OrphanReason =
  | 'text-deleted'
  | 'row-deleted'
  | 'column-deleted'
  | 'object-deleted'
  | 'invalid-anchor'

export interface OrphanedCommentData {
  id: string
  author: string
  authorDisplayName?: string
  content: string
  createdAt: number
  replyCount: number
}

export interface OrphanedThread {
  comment: OrphanedCommentData
  reason: OrphanReason
  context?: string
}

export interface OrphanedThreadListProps {
  /** List of orphaned threads to display */
  orphanedThreads: OrphanedThread[]
  /** Callback when user wants to reattach a comment */
  onReattach?: (commentId: string) => void
  /** Callback when user dismisses (deletes) an orphaned comment */
  onDismiss?: (commentId: string) => void
  /** Callback when clicking on a thread to view details */
  onSelect?: (commentId: string) => void
  /** Whether to show in collapsed mode (just count) */
  collapsed?: boolean
  /** Callback when expanding/collapsing */
  onToggleCollapse?: () => void
  /** Custom className */
  className?: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`

  return new Date(timestamp).toLocaleDateString()
}

function getReasonLabel(reason: OrphanReason): string {
  switch (reason) {
    case 'text-deleted':
      return 'Text was deleted'
    case 'row-deleted':
      return 'Row was deleted'
    case 'column-deleted':
      return 'Column was deleted'
    case 'object-deleted':
      return 'Object was deleted'
    case 'invalid-anchor':
      return 'Invalid anchor'
    default:
      return 'Content was removed'
  }
}

function getReasonIcon(reason: OrphanReason): string {
  switch (reason) {
    case 'text-deleted':
      return '¶' // paragraph
    case 'row-deleted':
      return '⊟' // row
    case 'column-deleted':
      return '⊞' // column
    case 'object-deleted':
      return '◇' // object
    default:
      return '?'
  }
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function OrphanedThreadList({
  orphanedThreads,
  onReattach,
  onDismiss,
  onSelect,
  collapsed = false,
  onToggleCollapse,
  className
}: OrphanedThreadListProps) {
  if (orphanedThreads.length === 0) {
    return null
  }

  return (
    <div
      className={cn('rounded-lg border border-dashed border-warning/50 bg-warning/5', className)}
    >
      {/* Header */}
      <button
        className="w-full flex items-center justify-between p-3 text-left hover:bg-warning/10 transition-colors"
        onClick={onToggleCollapse}
      >
        <div className="flex items-center gap-2">
          <span className="text-warning text-sm">⚠</span>
          <span className="text-sm font-medium text-foreground">
            Detached Comments ({orphanedThreads.length})
          </span>
        </div>
        <span className="text-muted-foreground text-xs">{collapsed ? '▸' : '▾'}</span>
      </button>

      {/* Content */}
      {!collapsed && (
        <div className="px-3 pb-3">
          <p className="text-xs text-muted-foreground mb-3">
            These comments were on content that has been removed.
          </p>

          <div className="space-y-2">
            {orphanedThreads.map(({ comment, reason, context }) => (
              <div
                key={comment.id}
                className="rounded-md border bg-background p-3 hover:border-muted-foreground/30 transition-colors"
              >
                {/* Context line */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <span className="font-mono">{getReasonIcon(reason)}</span>
                  <span>{getReasonLabel(reason)}</span>
                  {context && (
                    <>
                      <span>•</span>
                      <span className="truncate italic">"{context}"</span>
                    </>
                  )}
                </div>

                {/* Comment preview */}
                <div
                  className="cursor-pointer"
                  onClick={() => onSelect?.(comment.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && onSelect?.(comment.id)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <DIDAvatar did={comment.author} size={20} />
                    <span className="text-sm font-medium">
                      {comment.authorDisplayName || comment.author.slice(-8)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(comment.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-foreground line-clamp-2 pl-7">{comment.content}</p>
                  {comment.replyCount > 0 && (
                    <p className="text-xs text-muted-foreground mt-1 pl-7">
                      {comment.replyCount} {comment.replyCount === 1 ? 'reply' : 'replies'}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-3 pl-7">
                  {onReattach && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onReattach(comment.id)}
                      className="h-7 text-xs"
                    >
                      Reattach
                    </Button>
                  )}
                  {onDismiss && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDismiss(comment.id)}
                      className="h-7 text-xs text-muted-foreground hover:text-destructive"
                    >
                      Dismiss
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
