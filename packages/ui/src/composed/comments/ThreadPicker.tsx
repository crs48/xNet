/**
 * ThreadPicker - Picker UI for selecting between overlapping comment threads.
 *
 * When clicking on text with multiple comment marks, this picker appears
 * to let the user choose which thread to view.
 */
import { useEffect, useRef, useCallback } from 'react'
import { DIDAvatar } from '../../components/DIDAvatar'
import { cn } from '../../utils'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ThreadPreview {
  /** Root comment ID */
  id: string
  /** Author of the root comment */
  author: string
  /** Display name for author */
  authorDisplayName?: string
  /** Preview of comment content (truncated) */
  contentPreview: string
  /** Number of replies in thread */
  replyCount: number
  /** Whether thread is resolved */
  resolved: boolean
  /** When the root comment was created */
  createdAt: number
}

export interface ThreadPickerProps {
  /** Available threads to pick from */
  threads: ThreadPreview[]
  /** Anchor element for positioning */
  anchor: { x: number; y: number }
  /** Callback when a thread is selected */
  onSelect: (commentId: string) => void
  /** Callback when picker is dismissed */
  onDismiss: () => void
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
  if (minutes < 60) return `${minutes}m`
  if (hours < 24) return `${hours}h`
  if (days < 7) return `${days}d`

  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function ThreadPicker({
  threads,
  anchor,
  onSelect,
  onDismiss,
  className
}: ThreadPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Click outside to dismiss
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onDismiss()
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onDismiss()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onDismiss])

  const handleSelect = useCallback(
    (id: string) => {
      onSelect(id)
    },
    [onSelect]
  )

  if (threads.length === 0) {
    return null
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'fixed z-50 w-64 rounded-lg border bg-popover text-popover-foreground shadow-lg',
        'animate-in fade-in-0 zoom-in-95',
        className
      )}
      style={{
        left: anchor.x,
        top: anchor.y
      }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b">
        <span className="text-xs font-medium text-muted-foreground">
          {threads.length} comments on this text
        </span>
      </div>

      {/* Thread list */}
      <div className="py-1 max-h-64 overflow-y-auto">
        {threads.map((thread) => (
          <button
            key={thread.id}
            className={cn(
              'w-full px-3 py-2 text-left transition-colors',
              'hover:bg-muted focus:bg-muted focus:outline-none',
              thread.resolved && 'opacity-60'
            )}
            onClick={() => handleSelect(thread.id)}
          >
            <div className="flex items-center gap-2 mb-1">
              <DIDAvatar did={thread.author} size={18} />
              <span className="text-sm font-medium truncate flex-1">
                {thread.authorDisplayName || thread.author.slice(-8)}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatRelativeTime(thread.createdAt)}
              </span>
            </div>

            <p className="text-sm text-foreground line-clamp-1 pl-6">{thread.contentPreview}</p>

            <div className="flex items-center gap-2 mt-1 pl-6">
              {thread.replyCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  {thread.replyCount} {thread.replyCount === 1 ? 'reply' : 'replies'}
                </span>
              )}
              {thread.resolved && (
                <span className="text-xs text-green-600 dark:text-green-400">Resolved</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
