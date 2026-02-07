/**
 * Remote Cursor Component
 *
 * Renders a remote user's cursor with their name and color.
 */

import type { Point } from '../types'
import { memo, useMemo } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RemoteCursorProps {
  /** Cursor position in screen coordinates */
  position: Point
  /** User information */
  user: {
    name: string
    color: string
    avatar?: string
  }
  /** Current user activity */
  activity?: 'idle' | 'dragging' | 'drawing' | 'editing' | 'selecting'
  /** Whether the cursor is stale (hasn't updated recently) */
  isStale?: boolean
  /** Whether to show the name tag */
  showName?: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export const RemoteCursor = memo(function RemoteCursor({
  position,
  user,
  activity,
  isStale = false,
  showName = true
}: RemoteCursorProps) {
  // Default pointer cursor SVG path
  const cursorPath = useMemo(() => {
    return 'M5.65 2.65L18.35 12.35L12.35 13.35L10.35 19.35L5.65 2.65Z'
  }, [])

  // Get activity indicator color
  const activityColor = useMemo(() => {
    switch (activity) {
      case 'drawing':
        return '#10b981' // Green
      case 'editing':
        return '#f59e0b' // Amber
      case 'dragging':
        return '#3b82f6' // Blue
      case 'selecting':
        return '#8b5cf6' // Purple
      default:
        return null
    }
  }, [activity])

  return (
    <div
      className="remote-cursor"
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        pointerEvents: 'none',
        opacity: isStale ? 0.3 : 1,
        transition: 'left 50ms linear, top 50ms linear, opacity 300ms ease',
        zIndex: 1000,
        willChange: 'left, top'
      }}
    >
      {/* Cursor icon */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        style={{
          filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))',
          overflow: 'visible'
        }}
      >
        <path d={cursorPath} fill={user.color} stroke="white" strokeWidth="1.5" />
      </svg>

      {/* Activity indicator */}
      {activityColor && (
        <div
          className="activity-indicator"
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: activityColor,
            border: '2px solid white',
            boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
          }}
        />
      )}

      {/* Name tag */}
      {showName && (
        <div
          className="cursor-name-tag"
          style={{
            position: 'absolute',
            left: 16,
            top: 16,
            backgroundColor: user.color,
            color: 'white',
            fontSize: 11,
            fontWeight: 500,
            padding: '2px 6px',
            borderRadius: 4,
            whiteSpace: 'nowrap',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            maxWidth: 150,
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {user.name}
        </div>
      )}
    </div>
  )
})
