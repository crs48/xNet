/**
 * CommentIndicator - Visual indicator for comments on database elements.
 *
 * Variants:
 * - `dot`: Small dot for cell corners (subtle, space-efficient)
 * - `badge`: Count badge for row/column headers
 *
 * @example
 * ```tsx
 * // Cell indicator (dot)
 * <CommentIndicator
 *   count={2}
 *   variant="dot"
 *   onClick={handleClick}
 *   onMouseEnter={handleHover}
 *   onMouseLeave={handleLeave}
 * />
 *
 * // Row header indicator (badge)
 * <CommentIndicator
 *   count={5}
 *   variant="badge"
 *   onClick={handleClick}
 * />
 * ```
 */
import { cn } from '@xnetjs/ui'
import React from 'react'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CommentIndicatorProps {
  /** Number of comment threads */
  count: number
  /** Visual variant */
  variant: 'dot' | 'badge'
  /** Whether the thread(s) are resolved */
  resolved?: boolean
  /** Click handler */
  onClick?: (e: React.MouseEvent) => void
  /** Mouse enter handler (for hover preview) */
  onMouseEnter?: (e: React.MouseEvent) => void
  /** Mouse leave handler */
  onMouseLeave?: () => void
  /** Additional CSS classes */
  className?: string
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function CommentIndicator({
  count,
  variant,
  resolved = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
  className
}: CommentIndicatorProps) {
  if (count === 0) return null

  const label = `${count} comment${count > 1 ? 's' : ''}${resolved ? ' (resolved)' : ''}`

  if (variant === 'dot') {
    const color = resolved ? 'var(--color-muted-foreground, #9ca3af)' : '#f59e0b'
    return (
      <button
        type="button"
        className={cn(
          'absolute top-0 right-0 w-0 h-0 cursor-pointer border-none p-0',
          'opacity-70 hover:opacity-100 transition-opacity',
          'focus:outline-none',
          className
        )}
        style={{
          borderStyle: 'solid',
          borderWidth: '8px',
          borderColor: `${color} ${color} transparent transparent`
        }}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        aria-label={label}
        title={label}
      />
    )
  }

  // Badge variant
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center',
        'text-[11px] px-1.5 py-0.5 rounded',
        'cursor-pointer border-none',
        'transition-colors',
        resolved
          ? 'bg-muted text-muted-foreground hover:bg-muted/80'
          : 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
        className
      )}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      aria-label={label}
      title={label}
    >
      {count}
    </button>
  )
}
