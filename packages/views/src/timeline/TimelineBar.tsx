/**
 * TimelineBar - A single bar representing an item in the timeline
 */

import type { TimelineItem, TimelineRange, ZoomConfig } from './useTimelineState.js'
import { cn } from '@xnet/ui'
import React from 'react'
import { getDatePosition, getDateWidth } from './useTimelineState.js'

export interface TimelineBarProps {
  /** The timeline item */
  item: TimelineItem
  /** Timeline date range */
  range: TimelineRange
  /** Zoom configuration */
  zoomConfig: ZoomConfig
  /** Row index */
  rowIndex: number
  /** Row height in pixels */
  rowHeight: number
  /** Callback when item is clicked */
  onClick?: (itemId: string) => void
}

/**
 * TimelineBar component
 */
export function TimelineBar({
  item,
  range,
  zoomConfig,
  rowIndex,
  rowHeight,
  onClick
}: TimelineBarProps): React.JSX.Element {
  const left = getDatePosition(item.startDate, range, zoomConfig)
  const width = Math.max(getDateWidth(item.startDate, item.endDate, zoomConfig), 20)
  const top = rowIndex * rowHeight + 4
  const height = rowHeight - 8

  const handleClick = () => {
    if (onClick) onClick(item.id)
  }

  return (
    <div
      className={cn(
        'absolute rounded flex items-center px-2 cursor-pointer',
        'text-white text-xs font-medium truncate',
        'hover:brightness-110 transition-all'
      )}
      style={{
        left,
        width,
        top,
        height,
        backgroundColor: item.color
      }}
      onClick={handleClick}
      title={`${item.title}\n${formatDate(item.startDate)} - ${formatDate(item.endDate)}`}
    >
      <span className="truncate">{item.title}</span>
    </div>
  )
}

/**
 * Format date as short string
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
