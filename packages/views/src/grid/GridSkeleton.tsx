/**
 * GridSkeleton — loading placeholder shaped like the grid (toolbar bar,
 * header row, shimmering body rows).
 */

import { cn } from '@xnetjs/ui'
import React from 'react'

export interface GridSkeletonProps {
  rows?: number
  className?: string
}

export function GridSkeleton({ rows = 8, className }: GridSkeletonProps): React.JSX.Element {
  return (
    <div
      data-testid="grid-skeleton"
      aria-busy
      className={cn('flex flex-col h-full bg-white dark:bg-gray-900', className)}
    >
      {/* Toolbar bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="h-5 w-16 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
        <div className="flex-1" />
        <div className="h-5 w-24 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
        <div className="h-5 w-32 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </div>
      {/* Header */}
      <div className="flex gap-px px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        {[160, 120, 120, 100].map((w, i) => (
          <div
            key={i}
            style={{ width: w }}
            className="h-4 rounded bg-gray-100 dark:bg-gray-800 animate-pulse"
          />
        ))}
      </div>
      {/* Body rows */}
      <div className="flex-1 px-3 py-2 space-y-2 overflow-hidden">
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="h-7 rounded bg-gray-50 dark:bg-gray-800/60 animate-pulse"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
    </div>
  )
}
