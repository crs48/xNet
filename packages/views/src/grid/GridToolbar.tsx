/**
 * GridToolbar — view tabs, sort chips, filter popover, group selector,
 * field-visibility popover, and quick-find for the V2 grid.
 *
 * Store-agnostic like GridSurface: models in, callbacks out. The filter
 * popover reuses FilterBuilder (views dialect) through small adapters
 * until the dialect is retired.
 */

import type {
  Filter as SurfaceFilter,
  FilterGroup as SurfaceFilterGroup,
  FilterOperator as SurfaceFilterOperator
} from '../types.js'
import type { GridField } from './model.js'
import type {
  FilterGroup,
  FilterOperator as DataFilterOperator,
  RowHeight,
  SortConfig,
  ViewType,
  PropertyDefinition
} from '@xnetjs/data'
import { ROW_HEIGHTS, rowHeightLabel } from '@xnetjs/data'
import { cn } from '@xnetjs/ui'
import {
  ArrowDownUp,
  ArrowDown,
  ArrowUp,
  Download,
  Eye,
  EyeOff,
  FileUp,
  Filter as FilterIcon,
  Layers,
  MoreHorizontal,
  Plus,
  Rows3,
  Search,
  X
} from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FilterBuilder } from '../filter/FilterBuilder.js'

// ─── Filter dialect adapters (until the views dialect is retired) ───────────

export function toSurfaceFilter(filters: FilterGroup | null): SurfaceFilterGroup | null {
  if (!filters) return null
  const flat: SurfaceFilter[] = filters.conditions.flatMap((condition) =>
    'conditions' in condition
      ? []
      : [
          {
            id: `${condition.columnId}:${condition.operator}`,
            propertyId: condition.columnId,
            operator: condition.operator as SurfaceFilterOperator,
            value: condition.value
          }
        ]
  )
  return { type: filters.operator, filters: flat }
}

export function fromSurfaceFilter(filter: SurfaceFilterGroup | null): FilterGroup | null {
  if (!filter || filter.filters.length === 0) return null
  return {
    operator: filter.type,
    conditions: filter.filters.map((f) => ({
      columnId: f.propertyId,
      operator: f.operator as unknown as DataFilterOperator,
      value: f.value
    }))
  }
}

function fieldsToPropertyDefinitions(fields: GridField[]): PropertyDefinition[] {
  return fields.map((f) => ({
    '@id': `grid#${f.id}`,
    name: f.name,
    type: f.type as PropertyDefinition['type'],
    required: false,
    config: f.config
  }))
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────

export interface GridViewTab {
  id: string
  name: string
  type: ViewType
}

export interface GridToolbarProps {
  views: GridViewTab[]
  activeViewId?: string
  onSelectView?: (viewId: string) => void
  onAddView?: () => void
  /**
   * When provided, the add-view button opens a type picker with these
   * entries instead of calling `onAddView` directly (exploration 0278:
   * shells that support more than table views pass e.g. table + form).
   */
  addViewTypes?: Array<{ type: ViewType; label: string }>
  onAddViewOfType?: (type: ViewType) => void

  fields: GridField[]
  /** Fields hidden in the active view */
  hiddenFieldIds?: string[]
  onToggleFieldVisible?: (fieldId: string, hidden: boolean) => void

  sorts?: SortConfig[]
  onToggleSort?: (fieldId: string) => void
  onClearSorts?: () => void

  filters?: FilterGroup | null
  onChangeFilters?: (filters: FilterGroup | null) => void

  groupBy?: string | null
  onChangeGroupBy?: (fieldId: string | null) => void

  rowHeight?: RowHeight
  onChangeRowHeight?: (rowHeight: RowHeight) => void

  search?: string
  onSearchChange?: (search: string) => void

  /** Export the current view as CSV / JSON (engines live in the app layer) */
  onExportCsv?: () => void
  onExportJson?: () => void
  /** Import rows (and inferred fields) from a CSV file */
  onImportCsv?: (file: File) => void

  rowCount?: number
  className?: string
}

type Popover = 'filter' | 'visibility' | 'group' | 'rowHeight' | 'more' | 'addView' | null

/**
 * Add-view button (exploration 0278): with `addViewTypes` it opens a type
 * picker (Table / Form / …); without, it keeps the legacy direct-add
 * behaviour. Extracted so the toolbar shell stays flat.
 */
function AddViewButton({
  onAddView,
  addViewTypes,
  onAddViewOfType,
  open,
  popoverRef,
  onToggle,
  onClose
}: {
  onAddView?: () => void
  addViewTypes?: Array<{ type: ViewType; label: string }>
  onAddViewOfType?: (type: ViewType) => void
  open: boolean
  popoverRef: React.RefObject<HTMLDivElement>
  onToggle: () => void
  onClose: () => void
}): React.JSX.Element | null {
  const hasMenu = Boolean(addViewTypes && onAddViewOfType)
  if (!onAddView && !hasMenu) return null
  return (
    <span className="relative">
      <button
        type="button"
        aria-label="Add view"
        title="Add a view"
        className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50"
        onClick={hasMenu ? onToggle : onAddView}
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      {open && hasMenu && (
        <div
          ref={popoverRef}
          role="menu"
          aria-label="View type"
          className="absolute left-0 top-full z-50 mt-1 w-36 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl p-1"
        >
          {addViewTypes!.map((entry) => (
            <button
              key={entry.type}
              type="button"
              role="menuitem"
              className="w-full px-2 py-1 text-left text-xs rounded hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={() => {
                onClose()
                onAddViewOfType!(entry.type)
              }}
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}

export function GridToolbar({
  views,
  activeViewId,
  onSelectView,
  onAddView,
  addViewTypes,
  onAddViewOfType,
  fields,
  hiddenFieldIds = [],
  onToggleFieldVisible,
  sorts = [],
  onToggleSort,
  onClearSorts,
  filters = null,
  onChangeFilters,
  groupBy = null,
  onChangeGroupBy,
  rowHeight = 'short',
  onChangeRowHeight,
  search = '',
  onSearchChange,
  onExportCsv,
  onExportJson,
  onImportCsv,
  rowCount,
  className
}: GridToolbarProps): React.JSX.Element {
  const importInputRef = useRef<HTMLInputElement>(null)
  const [openPopover, setOpenPopover] = useState<Popover>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Close popovers on outside click / Escape
  useEffect(() => {
    if (!openPopover) return
    const onPointerDown = (e: PointerEvent): void => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpenPopover(null)
      }
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpenPopover(null)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [openPopover])

  /** Focus the quick-find box (wired to Cmd/Ctrl+F via GridSurface onFind) */
  const focusSearch = useCallback(() => searchRef.current?.focus(), [])

  const properties = useMemo(() => fieldsToPropertyDefinitions(fields), [fields])
  const filterCount = filters?.conditions.length ?? 0
  const fieldName = useCallback(
    (id: string) => fields.find((f) => f.id === id)?.name ?? id,
    [fields]
  )

  return (
    <div
      data-grid-toolbar
      className={cn(
        'flex items-center gap-1 px-2 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm',
        className
      )}
    >
      {/* View tabs */}
      <div role="tablist" aria-label="Views" className="flex items-center gap-0.5">
        {views.map((view) => (
          <button
            key={view.id}
            role="tab"
            aria-selected={view.id === (activeViewId ?? views[0]?.id)}
            className={cn(
              'px-2 py-1 rounded text-xs font-medium',
              view.id === (activeViewId ?? views[0]?.id)
                ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'
            )}
            onClick={() => onSelectView?.(view.id)}
          >
            {view.name}
          </button>
        ))}
        <AddViewButton
          onAddView={onAddView}
          addViewTypes={addViewTypes}
          onAddViewOfType={onAddViewOfType}
          open={openPopover === 'addView'}
          popoverRef={popoverRef}
          onToggle={() => setOpenPopover(openPopover === 'addView' ? null : 'addView')}
          onClose={() => setOpenPopover(null)}
        />
      </div>

      <div className="flex-1" />

      {/* Sort chips */}
      {sorts.map((sort) => (
        <button
          key={sort.columnId}
          type="button"
          title="Toggle sort direction"
          className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 text-xs"
          onClick={() => onToggleSort?.(sort.columnId)}
        >
          {sort.direction === 'asc' ? (
            <ArrowUp className="w-3 h-3" />
          ) : (
            <ArrowDown className="w-3 h-3" />
          )}
          {fieldName(sort.columnId)}
          {onClearSorts && (
            <X
              className="w-3 h-3 hover:text-orange-900"
              aria-label={`Clear sort on ${fieldName(sort.columnId)}`}
              onClick={(e) => {
                e.stopPropagation()
                onClearSorts()
              }}
            />
          )}
        </button>
      ))}
      {sorts.length === 0 && onToggleSort && (
        <span className="text-gray-300 dark:text-gray-600" title="Click a column header to sort">
          <ArrowDownUp className="w-3.5 h-3.5" />
        </span>
      )}

      {/* Filter */}
      {onChangeFilters && (
        <div className="relative">
          <button
            type="button"
            aria-label="Filter"
            title="Filter rows"
            aria-expanded={openPopover === 'filter'}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-xs',
              filterCount > 0
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'
            )}
            onClick={() => setOpenPopover(openPopover === 'filter' ? null : 'filter')}
          >
            <FilterIcon className="w-3.5 h-3.5" />
            {filterCount > 0 ? `${filterCount} filter${filterCount > 1 ? 's' : ''}` : 'Filter'}
          </button>
          {openPopover === 'filter' && (
            <div
              ref={popoverRef}
              className="absolute right-0 top-full mt-1 z-30 w-[420px] p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg"
            >
              <FilterBuilder
                properties={properties}
                value={toSurfaceFilter(filters)}
                onChange={(next) => onChangeFilters(fromSurfaceFilter(next))}
              />
            </div>
          )}
        </div>
      )}

      {/* Group by */}
      {onChangeGroupBy && (
        <div className="relative">
          <button
            type="button"
            aria-label="Group"
            title="Group rows by a field"
            aria-expanded={openPopover === 'group'}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-xs',
              groupBy
                ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'
            )}
            onClick={() => setOpenPopover(openPopover === 'group' ? null : 'group')}
          >
            <Layers className="w-3.5 h-3.5" />
            {groupBy ? `Grouped by ${fieldName(groupBy)}` : 'Group'}
          </button>
          {openPopover === 'group' && (
            <div
              ref={popoverRef}
              className="absolute right-0 top-full mt-1 z-30 w-56 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg"
            >
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => {
                  onChangeGroupBy(null)
                  setOpenPopover(null)
                }}
              >
                None
              </button>
              {fields
                .filter((f) => f.type === 'select' || f.type === 'person' || f.type === 'checkbox')
                .map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={cn(
                      'w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-800',
                      groupBy === f.id && 'text-purple-600 dark:text-purple-300 font-medium'
                    )}
                    onClick={() => {
                      onChangeGroupBy(f.id)
                      setOpenPopover(null)
                    }}
                  >
                    {f.name}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Row height */}
      {onChangeRowHeight && (
        <div className="relative">
          <button
            type="button"
            aria-label="Row height"
            title="Row height"
            aria-expanded={openPopover === 'rowHeight'}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-xs',
              rowHeight !== 'short'
                ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'
            )}
            onClick={() => setOpenPopover(openPopover === 'rowHeight' ? null : 'rowHeight')}
          >
            <Rows3 className="w-3.5 h-3.5" />
            Height
          </button>
          {openPopover === 'rowHeight' && (
            <div
              ref={popoverRef}
              className="absolute right-0 top-full mt-1 z-30 w-44 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg"
            >
              {ROW_HEIGHTS.map((height) => (
                <button
                  key={height}
                  type="button"
                  className={cn(
                    'w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-800',
                    rowHeight === height && 'text-gray-900 dark:text-gray-100 font-medium'
                  )}
                  onClick={() => {
                    onChangeRowHeight(height)
                    setOpenPopover(null)
                  }}
                >
                  {rowHeightLabel(height)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Field visibility */}
      {onToggleFieldVisible && (
        <div className="relative">
          <button
            type="button"
            aria-label="Fields"
            title="Show / hide fields"
            aria-expanded={openPopover === 'visibility'}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            onClick={() => setOpenPopover(openPopover === 'visibility' ? null : 'visibility')}
          >
            <Eye className="w-3.5 h-3.5" />
            Fields
          </button>
          {openPopover === 'visibility' && (
            <div
              ref={popoverRef}
              className="absolute right-0 top-full mt-1 z-30 w-56 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg"
            >
              {fields.map((f) => {
                const hidden = hiddenFieldIds.includes(f.id)
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-label={`${hidden ? 'Show' : 'Hide'} ${f.name}`}
                    className="w-full px-3 py-1.5 flex items-center justify-between text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-800"
                    onClick={() => onToggleFieldVisible(f.id, !hidden)}
                  >
                    <span className={cn(hidden && 'text-gray-400 line-through')}>{f.name}</span>
                    {hidden ? (
                      <EyeOff className="w-3.5 h-3.5 text-gray-400" />
                    ) : (
                      <Eye className="w-3.5 h-3.5 text-gray-500" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Import / export */}
      {(onExportCsv || onExportJson || onImportCsv) && (
        <div className="relative">
          <button
            type="button"
            aria-label="More actions"
            title="Import / export"
            aria-expanded={openPopover === 'more'}
            className="p-1 rounded text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            onClick={() => setOpenPopover(openPopover === 'more' ? null : 'more')}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {openPopover === 'more' && (
            <div
              ref={popoverRef}
              className="absolute right-0 top-full mt-1 z-30 w-48 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg"
            >
              {onExportCsv && (
                <button
                  type="button"
                  title="Cell values only — relations, comments, and edit history do not survive CSV. Settings → Export data has the full lossless bundle."
                  className="w-full px-3 py-1.5 flex items-center gap-2 text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => {
                    onExportCsv()
                    setOpenPopover(null)
                  }}
                >
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </button>
              )}
              {onExportJson && (
                <button
                  type="button"
                  title="Re-importable as new rows; edit history and authorship do not survive JSON. Settings → Export data has the full lossless bundle."
                  className="w-full px-3 py-1.5 flex items-center gap-2 text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => {
                    onExportJson()
                    setOpenPopover(null)
                  }}
                >
                  <Download className="w-3.5 h-3.5" /> Export JSON
                </button>
              )}
              {onImportCsv && (
                <>
                  <button
                    type="button"
                    className="w-full px-3 py-1.5 flex items-center gap-2 text-left text-xs hover:bg-gray-50 dark:hover:bg-gray-800"
                    onClick={() => importInputRef.current?.click()}
                  >
                    <FileUp className="w-3.5 h-3.5" /> Import CSV
                  </button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    data-testid="import-csv-input"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) onImportCsv(file)
                      e.target.value = ''
                      setOpenPopover(null)
                    }}
                  />
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Quick find */}
      {onSearchChange && (
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <input
            ref={searchRef}
            type="search"
            role="searchbox"
            aria-label="Search rows"
            placeholder="Search…  (⌘F)"
            title="Search rows (Cmd/Ctrl+F)"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              // Keep grid shortcuts out of the search box
              e.stopPropagation()
              if (e.key === 'Escape') {
                onSearchChange('')
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            className="w-44 pl-7 pr-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-transparent text-xs outline-none focus:border-blue-400"
          />
        </div>
      )}

      {rowCount !== undefined && (
        <span className="ml-1 text-xs text-gray-400 tabular-nums">{rowCount}</span>
      )}

      {/* Hidden hook for GridSurface onFind → focus search */}
      <button
        type="button"
        data-grid-toolbar-focus-search
        className="hidden"
        onClick={focusSearch}
      />
    </div>
  )
}
