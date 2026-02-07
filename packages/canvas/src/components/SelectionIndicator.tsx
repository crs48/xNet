/**
 * Selection Indicator Component
 *
 * Shows a colored border around nodes selected by remote users,
 * with user name and optional lock icon.
 */

import { memo } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface SelectionIndicatorProps {
  /** Bounding rectangle in screen coordinates */
  bounds: Rect
  /** User who selected this node */
  user: { name: string; color: string }
  /** Whether this node is actively being edited */
  isEditLocked?: boolean
}

// ─── Component ───────────────────────────────────────────────────────────────

export const SelectionIndicator = memo(function SelectionIndicator({
  bounds,
  user,
  isEditLocked
}: SelectionIndicatorProps) {
  return (
    <div
      className="selection-indicator"
      style={{
        position: 'absolute',
        left: bounds.x - 2,
        top: bounds.y - 2,
        width: bounds.width + 4,
        height: bounds.height + 4,
        border: `2px solid ${user.color}`,
        borderRadius: 6,
        pointerEvents: 'none',
        boxShadow: `0 0 0 1px white, 0 0 8px ${user.color}40`
      }}
    >
      {/* User label */}
      <div
        className="selection-label"
        style={{
          position: 'absolute',
          top: -20,
          left: -2,
          backgroundColor: user.color,
          color: 'white',
          fontSize: 10,
          fontWeight: 500,
          padding: '2px 6px',
          borderRadius: '4px 4px 0 0',
          whiteSpace: 'nowrap'
        }}
      >
        {user.name}
        {isEditLocked && ' (editing)'}
      </div>

      {/* Lock icon for edit-locked nodes */}
      {isEditLocked && (
        <div
          className="lock-icon"
          style={{
            position: 'absolute',
            top: -20,
            right: -2,
            backgroundColor: user.color,
            borderRadius: 4,
            padding: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="white">
            <rect x="2" y="5" width="8" height="6" rx="1" />
            <path d="M3.5 5V3.5a2.5 2.5 0 015 0V5" fill="none" stroke="white" strokeWidth="1.5" />
          </svg>
        </div>
      )}
    </div>
  )
})
