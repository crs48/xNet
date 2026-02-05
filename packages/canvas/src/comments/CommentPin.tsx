/**
 * CommentPin - Visual marker for canvas comments.
 *
 * Displays a pin at the comment's viewport position with:
 * - Author avatar/initial
 * - Reply count badge
 * - Resolved/active state styling
 *
 * @example
 * ```tsx
 * <CommentPin
 *   thread={thread}
 *   viewportX={100}
 *   viewportY={200}
 *   isHovered={false}
 *   isSelected={false}
 *   onMouseEnter={() => showPreview(thread)}
 *   onMouseLeave={cancelPreview}
 *   onClick={() => showFull(thread)}
 * />
 * ```
 */
import type { CommentThread } from '@xnet/react'
import { cn } from '@xnet/ui'
import React from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CommentPinProps {
  /** The comment thread */
  thread: CommentThread
  /** X coordinate in viewport space (pixels) */
  viewportX: number
  /** Y coordinate in viewport space (pixels) */
  viewportY: number
  /** Whether the pin is being hovered (preview mode) */
  isHovered?: boolean
  /** Whether the pin is selected (full thread mode) */
  isSelected?: boolean
  /** Mouse enter handler */
  onMouseEnter?: () => void
  /** Mouse leave handler */
  onMouseLeave?: () => void
  /** Click handler */
  onClick?: () => void
  /** Additional CSS classes */
  className?: string
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function CommentPin({
  thread,
  viewportX,
  viewportY,
  isHovered = false,
  isSelected = false,
  onMouseEnter,
  onMouseLeave,
  onClick,
  className
}: CommentPinProps) {
  const { root, replies } = thread
  const isResolved = root.properties.resolved
  const totalCount = replies.length + 1
  const authorInitial = getAuthorInitial(root.properties.createdBy)

  return (
    <div
      className={cn(
        'absolute cursor-pointer z-[100] transition-transform duration-100',
        isHovered && 'scale-110',
        isSelected && 'z-[101]',
        className
      )}
      style={{
        left: viewportX,
        top: viewportY,
        transform: 'translate(-50%, -100%)' // Pin point at bottom-center
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`Comment thread with ${totalCount} message${totalCount > 1 ? 's' : ''}${isResolved ? ' (resolved)' : ''}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      }}
    >
      <div
        className={cn(
          'flex items-center gap-0.5 rounded-tl-2xl rounded-tr-2xl rounded-br-2xl rounded-bl-none',
          'px-2 py-1 text-xs font-medium shadow-lg',
          'whitespace-nowrap',
          isResolved
            ? 'bg-muted text-muted-foreground opacity-60'
            : 'bg-primary text-primary-foreground'
        )}
      >
        {/* Author avatar */}
        <span
          className={cn(
            'w-5 h-5 rounded-full flex items-center justify-center text-[10px]',
            isResolved ? 'bg-muted-foreground/30' : 'bg-white/30'
          )}
        >
          {authorInitial}
        </span>

        {/* Reply count */}
        {totalCount > 1 && <span className="text-[11px] opacity-80">{totalCount}</span>}
      </div>
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Get an initial/avatar for the author.
 * Uses last 2 characters of DID as placeholder.
 */
function getAuthorInitial(did?: string): string {
  if (!did) return '?'

  // Try to get something meaningful from the DID
  // did:key:z6Mk... -> use "6M" or similar
  const parts = did.split(':')
  if (parts.length >= 3) {
    const key = parts[2]
    if (key.length >= 4) {
      return key.slice(2, 4).toUpperCase()
    }
  }

  return did.slice(-2).toUpperCase()
}
