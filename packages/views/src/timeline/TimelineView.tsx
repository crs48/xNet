/**
 * TimelineView - Gantt-style timeline view
 */

import React, { useRef, useMemo } from 'react'
import { cn } from '@xnet/ui'
import type { Schema } from '@xnet/data'
import {
  useTimelineState,
  getDatePosition,
  type TimelineRow,
  type ZoomLevel
} from './useTimelineState.js'
import { TimelineBar } from './TimelineBar.js'
import type { ViewConfig } from '../types.js'

export interface TimelineViewProps {
  /** Schema defining the timeline structure */
  schema: Schema
  /** View configuration */
  view: ViewConfig
  /** Data rows */
  data: TimelineRow[]
  /** Callback when a row is updated */
  onUpdateRow?: (rowId: string, propertyId: string, value: unknown) => void
  /** Callback when view config changes */
  onUpdateView?: (changes: Partial<ViewConfig>) => void
  /** Callback when an item is clicked */
  onItemClick?: (itemId: string) => void
  /** Additional CSS class */
  className?: string
}

const ROW_HEIGHT = 40
const HEADER_HEIGHT = 60
const SIDEBAR_WIDTH = 200

/**
 * TimelineView component - Gantt-style timeline
 */
export function TimelineView({
  schema,
  view,
  data,
  onUpdateRow,
  onItemClick,
  className
}: TimelineViewProps): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)

  const { items, zoom, setZoom, zoomConfig, range, totalWidth } = useTimelineState({
    schema,
    view,
    data,
    onUpdateRow
  })

  // Generate grid lines and header labels
  const gridLines = useMemo(() => {
    const lines: Array<{ x: number; label: string; isWeekend: boolean }> = []
    const current = new Date(range.start)

    while (current <= range.end) {
      const x = getDatePosition(current, range, zoomConfig)
      const isWeekend = current.getDay() === 0 || current.getDay() === 6

      let label = ''
      if (zoom === 'day') {
        label = current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      } else if (zoom === 'week') {
        if (current.getDay() === 1 || lines.length === 0) {
          // Monday
          label = current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        }
      } else if (zoom === 'month') {
        if (current.getDate() === 1 || lines.length === 0) {
          label = current.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        }
      } else {
        // Quarter
        if (current.getDate() === 1 && [0, 3, 6, 9].includes(current.getMonth())) {
          label = `Q${Math.floor(current.getMonth() / 3) + 1} ${current.getFullYear()}`
        }
      }

      lines.push({ x, label, isWeekend })
      current.setDate(current.getDate() + 1)
    }

    return lines
  }, [range, zoomConfig, zoom])

  // Today marker position
  const todayPosition = useMemo(() => {
    const today = new Date()
    if (today < range.start || today > range.end) return null
    return getDatePosition(today, range, zoomConfig)
  }, [range, zoomConfig])

  // Scroll to today
  const scrollToToday = () => {
    if (!scrollRef.current || !todayPosition) return
    scrollRef.current.scrollLeft = todayPosition - scrollRef.current.clientWidth / 2
  }

  const zoomButtons: { level: ZoomLevel; label: string }[] = [
    { level: 'day', label: 'Day' },
    { level: 'week', label: 'Week' },
    { level: 'month', label: 'Month' },
    { level: 'quarter', label: 'Quarter' }
  ]

  return (
    <div className={cn('h-full flex flex-col bg-white dark:bg-gray-900', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-1">
          {zoomButtons.map(({ level, label }) => (
            <button
              key={level}
              className={cn(
                'px-3 py-1 text-sm rounded transition-colors',
                zoom === level
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              )}
              onClick={() => setZoom(level)}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          onClick={scrollToToday}
        >
          Today
        </button>
      </div>

      {/* Main timeline area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar with item names */}
        <div
          className="flex-shrink-0 border-r border-gray-200 dark:border-gray-700"
          style={{ width: SIDEBAR_WIDTH }}
        >
          {/* Sidebar header */}
          <div
            className="px-4 flex items-center font-medium text-sm text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700"
            style={{ height: HEADER_HEIGHT }}
          >
            Items
          </div>

          {/* Sidebar items */}
          <div className="overflow-y-auto" style={{ height: `calc(100% - ${HEADER_HEIGHT}px)` }}>
            {items.map((item) => (
              <div
                key={item.id}
                className="px-4 flex items-center text-sm text-gray-800 dark:text-gray-200 border-b border-gray-100 dark:border-gray-800 truncate hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                style={{ height: ROW_HEIGHT }}
                onClick={() => onItemClick?.(item.id)}
              >
                {item.title}
              </div>
            ))}
          </div>
        </div>

        {/* Scrollable timeline */}
        <div ref={scrollRef} className="flex-1 overflow-auto">
          <div style={{ width: totalWidth, minHeight: '100%' }}>
            {/* Header with date labels */}
            <div
              className="sticky top-0 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-10"
              style={{ height: HEADER_HEIGHT }}
            >
              <div className="relative h-full">
                {gridLines
                  .filter((line) => line.label)
                  .map((line, i) => (
                    <div
                      key={i}
                      className="absolute top-0 h-full flex items-center text-xs text-gray-600 dark:text-gray-400"
                      style={{ left: line.x }}
                    >
                      <span className="px-2">{line.label}</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Grid and bars */}
            <div className="relative" style={{ height: items.length * ROW_HEIGHT }}>
              {/* Grid lines */}
              {gridLines.map((line, i) => (
                <div
                  key={i}
                  className={cn(
                    'absolute top-0 w-px h-full',
                    line.isWeekend ? 'bg-gray-200 dark:bg-gray-700' : 'bg-gray-100 dark:bg-gray-800'
                  )}
                  style={{ left: line.x }}
                />
              ))}

              {/* Row backgrounds */}
              {items.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'absolute left-0 right-0 border-b border-gray-100 dark:border-gray-800',
                    i % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/30'
                  )}
                  style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT }}
                />
              ))}

              {/* Today marker */}
              {todayPosition !== null && (
                <div
                  className="absolute top-0 w-0.5 bg-red-500 z-20"
                  style={{ left: todayPosition, height: items.length * ROW_HEIGHT }}
                />
              )}

              {/* Timeline bars */}
              {items.map((item, index) => (
                <TimelineBar
                  key={item.id}
                  item={item}
                  range={range}
                  zoomConfig={zoomConfig}
                  rowIndex={index}
                  rowHeight={ROW_HEIGHT}
                  onClick={onItemClick}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-gray-500 dark:text-gray-400 text-sm">
            No items with dates to display
          </div>
        </div>
      )}
    </div>
  )
}
