/**
 * TimelineView — V2 roadmap (exploration 0339).
 *
 * GitHub-Projects/Linear-style: one item per row, bars positioned by the
 * start/end date fields, month/quarter/year zoom, swimlanes from the
 * group-by field (shared group-model), drag to move and edge-drag to
 * resize (one node write each). Rows virtualize with TanStack Virtual; a
 * "today" rule anchors the eye.
 */

import { useVirtualizer } from '@tanstack/react-virtual'
import { addDays } from 'date-fns'
import type { CellValue } from '@xnetjs/data'
import { cn } from '@xnetjs/ui'
import React, { useCallback, useMemo, useRef, useState } from 'react'
import { optionChipStyle } from '../properties/optionColors.js'
import { WindowFootnote } from './card-bits.js'
import {
  resolveDateField,
  resolveEndDateField,
  resolveGroupField,
  rowTitle,
  type DatabaseViewProps
} from './contract.js'
import { toDateCell } from './date-model.js'
import { UNGROUPED_KEY, buildGroups } from './group-model.js'
import {
  ZOOMS,
  barGeometry,
  dayOffsetPx,
  deltaDays,
  majorTicks,
  minorTicks,
  timelineItems,
  timelineRange,
  type TimelineItem,
  type TimelineZoom
} from './timeline-model.js'

const ROW_HEIGHT = 32
const HEADER_HEIGHT = 40
const LABEL_WIDTH = 220

type VirtualEntry =
  | { kind: 'group'; key: string; name: string; color?: string; count: number }
  | { kind: 'item'; item: TimelineItem; groupKey: string }

interface DragState {
  rowId: string
  mode: 'move' | 'resize-start' | 'resize-end'
  originX: number
  delta: number
}

export function TimelineView(props: DatabaseViewProps): React.JSX.Element {
  const { fields, rows, window: viewWindow, config, className, onMoveCard, onOpenRow } = props

  const [zoom, setZoom] = useState<TimelineZoom>('quarter')
  const [drag, setDrag] = useState<DragState | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const dateField = resolveDateField(fields, config)
  const endField = resolveEndDateField(fields, config, dateField)
  const groupField = config.groupBy ? resolveGroupField(fields, config) : undefined
  const colorField = config.colorBy ? fields.find((f) => f.id === config.colorBy) : undefined

  const items = useMemo(
    () => (dateField ? timelineItems(rows, dateField, { endDateField: endField?.id ?? null }) : []),
    [rows, dateField, endField]
  )
  const itemsByRow = useMemo(() => new Map(items.map((i) => [i.row.id, i])), [items])
  const range = useMemo(() => timelineRange(items, zoom), [items, zoom])
  const undated = rows.length - items.length

  // Swimlanes: group headers + item rows, flattened for the virtualizer
  const entries = useMemo<VirtualEntry[]>(() => {
    const datedRows = items.map((i) => i.row)
    const groups = buildGroups(datedRows, groupField, config)
    const result: VirtualEntry[] = []
    for (const group of groups) {
      if (groupField) {
        result.push({
          kind: 'group',
          key: group.key,
          name: group.name,
          color: group.color,
          count: group.rows.length
        })
      }
      if (group.collapsed) continue
      for (const row of group.rows) {
        const item = itemsByRow.get(row.id)
        if (item) result.push({ kind: 'item', item, groupKey: group.key })
      }
    }
    return result
  }, [items, itemsByRow, groupField, config])

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  })

  const commitDrag = useCallback(
    (state: DragState) => {
      const item = itemsByRow.get(state.rowId)
      if (!item || !dateField || !onMoveCard || state.delta === 0) return
      let start = item.start
      let end = item.end
      if (state.mode === 'move') {
        start = addDays(start, state.delta)
        end = addDays(end, state.delta)
      } else if (state.mode === 'resize-start') {
        start = addDays(start, state.delta)
        if (start > end) start = end
      } else {
        end = addDays(end, state.delta)
        if (end < start) end = start
      }
      const cells: Record<string, CellValue> = {}
      if (dateField.type === 'dateRange') {
        cells[dateField.id] = { start: toDateCell(start), end: toDateCell(end) } as CellValue
      } else {
        cells[dateField.id] = toDateCell(start)
        if (endField) cells[endField.id] = toDateCell(end)
      }
      onMoveCard(state.rowId, cells)
    },
    [itemsByRow, dateField, endField, onMoveCard]
  )

  const beginDrag = useCallback(
    (e: React.PointerEvent, rowId: string, mode: DragState['mode']) => {
      if (!onMoveCard) return
      e.preventDefault()
      e.stopPropagation()
      const originX = e.clientX
      setDrag({ rowId, mode, originX, delta: 0 })
      const onMove = (ev: PointerEvent) => {
        setDrag((d) => (d ? { ...d, delta: deltaDays(ev.clientX - originX, zoom) } : d))
      }
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        setDrag((d) => {
          if (d) commitDrag({ ...d, delta: deltaDays(ev.clientX - originX, zoom) })
          return null
        })
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [onMoveCard, zoom, commitDrag]
  )

  if (!dateField) {
    return (
      <div
        className={cn('flex h-full items-center justify-center p-8 text-sm text-ink-3', className)}
      >
        Add a date (or date range) field to draw the roadmap.
      </div>
    )
  }

  const majors = majorTicks(range, zoom)
  const minors = minorTicks(range, zoom)
  const todayLeft = dayOffsetPx(range, zoom, new Date())

  return (
    <div
      className={cn('flex h-full flex-col overflow-hidden', className)}
      data-testid="timeline-view"
    >
      {/* Zoom control */}
      <div className="flex items-center gap-1 border-b border-border px-3 py-1.5">
        <span className="text-[11px] text-ink-3">Zoom</span>
        {ZOOMS.map((z) => (
          <button
            key={z.id}
            type="button"
            className={cn(
              'rounded px-2 py-0.5 text-xs',
              zoom === z.id
                ? 'bg-surface-1 font-medium text-ink-1'
                : 'text-ink-3 hover:bg-surface-1'
            )}
            onClick={() => setZoom(z.id)}
          >
            {z.label}
          </button>
        ))}
        <span className="flex-1" />
        {undated > 0 && (
          <span className="text-[11px] text-ink-3">{undated} rows without dates hidden</span>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div style={{ width: LABEL_WIDTH + range.width, position: 'relative' }}>
          {/* Time scale header */}
          <div
            className="sticky top-0 z-20 border-b border-border bg-surface-0"
            style={{ height: HEADER_HEIGHT, marginLeft: LABEL_WIDTH, position: 'relative' }}
          >
            {majors.map((tick) => (
              <span
                key={tick.date.getTime()}
                className="absolute top-1 whitespace-nowrap border-l border-border pl-1 text-[11px] font-medium text-ink-2"
                style={{ left: tick.left }}
              >
                {tick.label}
              </span>
            ))}
            {zoom !== 'month' &&
              minors.map((tick) => (
                <span
                  key={tick.date.getTime()}
                  className="absolute bottom-0 whitespace-nowrap pl-0.5 text-[10px] text-ink-3"
                  style={{ left: tick.left }}
                >
                  {tick.label}
                </span>
              ))}
          </div>

          {/* Rows */}
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {/* Today rule */}
            <div
              className="absolute bottom-0 top-0 z-10 w-px bg-red-400/70"
              style={{ left: LABEL_WIDTH + todayLeft }}
              data-testid="timeline-today"
            />
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const entry = entries[virtualRow.index]
              const top = virtualRow.start
              if (entry.kind === 'group') {
                return (
                  <div
                    key={virtualRow.key}
                    className="absolute inset-x-0 flex items-center gap-2 border-b border-border bg-surface-1/60 px-3"
                    style={{ top, height: virtualRow.size }}
                  >
                    <span
                      className="rounded px-1.5 py-px text-[11px] font-medium leading-4"
                      style={entry.key === UNGROUPED_KEY ? undefined : optionChipStyle(entry.color)}
                    >
                      {entry.name}
                    </span>
                    <span className="text-[11px] text-ink-3">{entry.count}</span>
                  </div>
                )
              }
              const { item } = entry
              const preview =
                drag && drag.rowId === item.row.id
                  ? {
                      start:
                        drag.mode === 'resize-end' ? item.start : addDays(item.start, drag.delta),
                      end: drag.mode === 'resize-start' ? item.end : addDays(item.end, drag.delta)
                    }
                  : item
              const geometry = barGeometry(range, zoom, preview)
              const style = colorField
                ? (() => {
                    const value = item.row.cells[colorField.id]
                    const optionId =
                      typeof value === 'string' ? value : Array.isArray(value) ? value[0] : null
                    const option =
                      typeof optionId === 'string'
                        ? colorField.options?.find((o) => o.id === optionId)
                        : undefined
                    return optionChipStyle(option?.color ?? 'blue')
                  })()
                : optionChipStyle('blue')
              return (
                <div
                  key={virtualRow.key}
                  className="absolute inset-x-0 border-b border-border/50"
                  style={{ top, height: virtualRow.size }}
                  data-testid="timeline-row"
                >
                  <button
                    type="button"
                    className="absolute inset-y-0 left-0 truncate px-3 text-left text-xs leading-8 text-ink-2 hover:text-ink-1"
                    style={{ width: LABEL_WIDTH }}
                    onClick={() => onOpenRow?.(item.row.id)}
                  >
                    {rowTitle(item.row, fields)}
                  </button>
                  <div
                    role="button"
                    tabIndex={0}
                    className="group/bar absolute flex cursor-grab items-center rounded px-1.5 text-[11px] leading-5 active:cursor-grabbing"
                    style={{
                      ...style,
                      left: LABEL_WIDTH + geometry.left,
                      width: geometry.width,
                      top: 5,
                      height: ROW_HEIGHT - 10
                    }}
                    data-testid="timeline-bar"
                    data-row-id={item.row.id}
                    onPointerDown={(e) => beginDrag(e, item.row.id, 'move')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onOpenRow?.(item.row.id)
                    }}
                    onClick={() => {
                      if (!drag) onOpenRow?.(item.row.id)
                    }}
                  >
                    <span
                      className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize rounded-l opacity-0 group-hover/bar:opacity-100 group-hover/bar:bg-black/20"
                      onPointerDown={(e) => beginDrag(e, item.row.id, 'resize-start')}
                    />
                    <span className="truncate">{rowTitle(item.row, fields)}</span>
                    <span
                      className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize rounded-r opacity-0 group-hover/bar:opacity-100 group-hover/bar:bg-black/20"
                      onPointerDown={(e) => beginDrag(e, item.row.id, 'resize-end')}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <WindowFootnote shown={rows.length} window={viewWindow} />
    </div>
  )
}
