/**
 * CommentBubble - Individual comment display in a thread.
 */
import { useState } from 'react'
import { cn } from '../../utils'
import { DIDAvatar } from '../../components/DIDAvatar'
import { Button } from '../../primitives/Button'

export interface CommentBubbleProps {
  /** Comment ID */
  id: string
  /** Comment author (DID) */
  author: string
  /** Display name for author (resolved from DID) */
  authorDisplayName?: string
  /** Comment content */
  content: string
  /** When the comment was created (wall time) */
  createdAt: number
  /** Whether the comment has been edited */
  edited?: boolean
  /** When the comment was last edited */
  editedAt?: number
  /** "Replying to @user" context */
  replyToUser?: string
  /** Comment ID being replied to */
  replyToCommentId?: string
  /** Whether this is a compact preview */
  compact?: boolean
  /** Whether currently editing */
  isEditing?: boolean
  /** Callback when edit is submitted */
  onEdit?: (content: string) => void
  /** Callback to start editing */
  onStartEdit?: () => void
  /** Callback to cancel editing */
  onCancelEdit?: () => void
  /** Callback to delete comment */
  onDelete?: () => void
  /** Callback to reply to this specific comment */
  onReplyTo?: () => void
  /** Custom className */
  className?: string
}

/**
 * Format a timestamp as a relative time string.
 */
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

export function CommentBubble({
  id,
  author,
  authorDisplayName,
  content,
  createdAt,
  edited,
  editedAt,
  replyToUser,
  replyToCommentId,
  compact = false,
  isEditing = false,
  onEdit,
  onStartEdit,
  onCancelEdit,
  onDelete,
  onReplyTo,
  className
}: CommentBubbleProps) {
  const [editText, setEditText] = useState(content)
  const [showMenu, setShowMenu] = useState(false)

  const displayName = authorDisplayName || author.slice(-8)
  const isDeleted = content === '[deleted]'

  if (isDeleted) {
    return (
      <div className={cn('px-3 py-2 opacity-50 italic text-muted-foreground text-sm', className)}>
        [deleted]
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative group/comment px-3 py-2 rounded-md transition-colors',
        !compact && 'hover:bg-muted/50',
        className
      )}
      onMouseEnter={() => !compact && setShowMenu(true)}
      onMouseLeave={() => setShowMenu(false)}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <DIDAvatar did={author} size={24} />
        <span className="text-sm font-medium text-foreground">{displayName}</span>
        <span className="text-xs text-muted-foreground">{formatRelativeTime(createdAt)}</span>
        {edited && <span className="text-xs text-muted-foreground italic">(edited)</span>}
      </div>

      {/* Reply-to context */}
      {replyToUser && !compact && (
        <div className="text-xs text-muted-foreground mb-1 pl-7">
          replying to{' '}
          <a href={`#comment-${replyToCommentId}`} className="text-primary hover:underline">
            @{replyToUser}
          </a>
        </div>
      )}

      {/* Content */}
      {isEditing ? (
        <div className="pl-7">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full p-2 text-sm rounded border bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            rows={3}
            autoFocus
            placeholder="Edit your comment..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                onEdit?.(editText)
              }
              if (e.key === 'Escape') {
                onCancelEdit?.()
              }
            }}
          />
          <div className="flex gap-2 mt-2">
            <Button size="sm" onClick={() => onEdit?.(editText)}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancelEdit}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="pl-7 text-sm text-foreground whitespace-pre-wrap break-words">
          {content}
        </div>
      )}

      {/* Actions menu (on hover) */}
      {showMenu && !compact && !isEditing && (
        <div className="absolute right-2 top-2 flex gap-1">
          {onReplyTo && (
            <Button size="sm" variant="ghost" onClick={onReplyTo} className="h-6 px-2 text-xs">
              Reply
            </Button>
          )}
          {onStartEdit && (
            <Button size="sm" variant="ghost" onClick={onStartEdit} className="h-6 px-2 text-xs">
              Edit
            </Button>
          )}
          {onDelete && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              className="h-6 px-2 text-xs text-destructive"
            >
              Delete
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
