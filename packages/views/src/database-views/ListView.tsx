/**
 * ListView — V2 stacked list, optionally grouped (exploration 0337).
 *
 * Also serves as the compact fallback for board/gallery on narrow shells
 * (`useIsCompact` in the app layer): every view's data renders legibly as
 * a list on a phone.
 */

import { cn } from '@xnetjs/ui'
import { ChevronRight } from 'lucide-react'
import React, { useMemo } from 'react'
import { FieldValueChip, WindowFootnote } from './card-bits.js'
import { resolveGroupField, rowTitle, type DatabaseViewProps } from './contract.js'
import { UNGROUPED_KEY, buildGroups, orderRowsBySortKey } from './group-model.js'
import { optionChipStyle } from '../properties/optionColors.js'

export function ListView(props: DatabaseViewProps): React.JSX.Element {
  const {
    fields,
    visibleFields,
    rows,
    window: viewWindow,
    config,
    sorted,
    className,
    onOpenRow,
    onToggleGroupCollapsed
  } = props

  const groupField = config.groupBy ? resolveGroupField(fields, config) : undefined
  const orderedRows = useMemo(() => (sorted ? rows : orderRowsBySortKey(rows)), [rows, sorted])
  const groups = useMemo(
    () => buildGroups(orderedRows, groupField, config),
    [orderedRows, groupField, config]
  )
  const itemFields = useMemo(
    () => visibleFields.filter((f) => !f.isTitle && f.id !== groupField?.id).slice(0, 3),
    [visibleFields, groupField]
  )

  return (
    <div className={cn('flex h-full flex-col overflow-hidden', className)} data-testid="list-view">
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {groups.map((group) => (
          <div key={group.key} className="mb-3">
            {groupField && (
              <button
                type="button"
                className="mb-1 flex items-center gap-1.5 px-1 py-0.5"
                onClick={() => onToggleGroupCollapsed?.(group.key, !group.collapsed)}
              >
                <ChevronRight
                  className={cn('h-3 w-3 text-ink-3 transition-transform', !group.collapsed && 'rotate-90')}
                />
                <span
                  className="rounded px-1.5 py-px text-[11px] font-medium leading-4"
                  style={group.key === UNGROUPED_KEY ? undefined : optionChipStyle(group.color)}
                >
                  {group.name}
                </span>
                <span className="text-[11px] text-ink-3">{group.rows.length}</span>
              </button>
            )}
            {!group.collapsed &&
              group.rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-surface-1"
                  data-testid="list-row"
                  data-row-id={row.id}
                  onClick={() => onOpenRow?.(row.id)}
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink-1">
                    {rowTitle(row, fields)}
                  </span>
                  {itemFields.map((field) => (
                    <span key={field.id} className="shrink-0">
                      <FieldValueChip field={field} value={row.cells[field.id]} />
                    </span>
                  ))}
                </button>
              ))}
          </div>
        ))}
        {rows.length === 0 && (
          <div className="flex h-32 items-center justify-center text-sm text-ink-3">
            No rows match this view.
          </div>
        )}
      </div>
      <WindowFootnote shown={rows.length} window={viewWindow} />
    </div>
  )
}
