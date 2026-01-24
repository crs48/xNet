import * as React from 'react'
import { cn } from '../../utils'

export interface DropIndicatorProps {
  visible: boolean
  top: number
  side: 'before' | 'after'
}

/**
 * Visual line indicating where a dragged block will be inserted.
 * Shows a horizontal blue line with a circle accent on the left.
 */
export function DropIndicator({ visible, top, side }: DropIndicatorProps) {
  if (!visible) return null

  return (
    <div
      className={cn(
        'absolute left-0 right-0 h-0.5 rounded-full pointer-events-none z-50',
        'bg-blue-500 dark:bg-blue-400',
        'animate-in fade-in duration-150',
        side === 'before' ? '-translate-y-px -mt-1' : 'translate-y-px -mb-1'
      )}
      style={{ top }}
    >
      {/* Circle accent on left */}
      <div
        className={cn(
          'absolute -left-1 top-1/2 -translate-y-1/2',
          'w-2 h-2 rounded-full',
          'bg-blue-500 dark:bg-blue-400',
          'border-2 border-white dark:border-gray-900'
        )}
      />
    </div>
  )
}
