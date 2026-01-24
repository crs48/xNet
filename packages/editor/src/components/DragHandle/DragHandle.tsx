import * as React from 'react'
import { cn } from '../../utils'

export interface DragHandleProps {
  visible: boolean
  top: number
  left: number
  height: number
  onDragStart?: () => void
  onMenuClick?: () => void
}

/**
 * Visual drag handle component that appears to the left of blocks.
 * Shows a grip icon that can be dragged to reorder or clicked for options.
 */
export function DragHandle({
  visible,
  top,
  left,
  height,
  onDragStart,
  onMenuClick
}: DragHandleProps) {
  return (
    <div
      className={cn(
        'absolute z-50 flex items-start pt-1',
        'transition-opacity duration-150 ease-out',
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      )}
      style={{ top, left, height }}
    >
      <button
        type="button"
        draggable
        className={cn(
          'flex items-center justify-center',
          'w-5 h-6 rounded',
          'text-gray-400 hover:text-gray-600',
          'hover:bg-gray-100 active:bg-gray-200',
          'dark:text-gray-500 dark:hover:text-gray-400',
          'dark:hover:bg-gray-700 dark:active:bg-gray-600',
          'cursor-grab active:cursor-grabbing',
          'transition-colors duration-150'
        )}
        aria-label="Drag to reorder or click for options"
        onMouseDown={onDragStart}
        onClick={onMenuClick}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="currentColor"
          className="pointer-events-none"
        >
          <circle cx="4" cy="3" r="1.5" />
          <circle cx="10" cy="3" r="1.5" />
          <circle cx="4" cy="7" r="1.5" />
          <circle cx="10" cy="7" r="1.5" />
          <circle cx="4" cy="11" r="1.5" />
          <circle cx="10" cy="11" r="1.5" />
        </svg>
      </button>
    </div>
  )
}
