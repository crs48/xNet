/**
 * Per-schema view preferences for the Data panel (sorts / filters / density /
 * hidden columns) and their localStorage persistence.
 *
 * Dev-tool state only — persisted to localStorage keyed by schema IRI, never
 * written into the user's synced data (unlike the app's DatabaseView nodes).
 */

import type { FilterGroup, RowHeight, SortConfig } from '@xnetjs/data'
import { ROW_HEIGHTS } from '@xnetjs/data'
import { SYSTEM_FIELD } from './grid-adapter'

export interface DataViewPrefs {
  sorts: SortConfig[]
  filters: FilterGroup | null
  rowHeight: RowHeight
  hiddenFieldIds: string[]
}

export const DEFAULT_VIEW_PREFS: DataViewPrefs = {
  sorts: [{ columnId: SYSTEM_FIELD.updated, direction: 'desc' }],
  filters: null,
  rowHeight: 'short',
  hiddenFieldIds: []
}

const KEY_PREFIX = 'xnet:devtools:data:'

/** A minimal shape guard so a corrupt/forward-incompatible stored filter can't
 *  reach filterRows (which dereferences `.conditions.length`) and crash the
 *  panel. We only check the top level — the engine tolerates odd conditions. */
function isValidFilterGroup(value: unknown): value is FilterGroup {
  return (
    typeof value === 'object' &&
    value !== null &&
    'operator' in value &&
    Array.isArray((value as { conditions?: unknown }).conditions)
  )
}

function keyFor(schema: string | null): string {
  return `${KEY_PREFIX}${schema ?? '@@all'}`
}

/** Load a schema's saved prefs, falling back to defaults on miss/parse error. */
export function loadViewPrefs(schema: string | null): DataViewPrefs {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_VIEW_PREFS }
  try {
    const raw = localStorage.getItem(keyFor(schema))
    if (!raw) return { ...DEFAULT_VIEW_PREFS }
    const parsed = JSON.parse(raw) as Partial<DataViewPrefs>
    return {
      sorts: Array.isArray(parsed.sorts) ? parsed.sorts : DEFAULT_VIEW_PREFS.sorts,
      filters: isValidFilterGroup(parsed.filters) ? parsed.filters : null,
      rowHeight:
        typeof parsed.rowHeight === 'string' && ROW_HEIGHTS.includes(parsed.rowHeight)
          ? parsed.rowHeight
          : DEFAULT_VIEW_PREFS.rowHeight,
      hiddenFieldIds: Array.isArray(parsed.hiddenFieldIds) ? parsed.hiddenFieldIds : []
    }
  } catch {
    return { ...DEFAULT_VIEW_PREFS }
  }
}

export function saveViewPrefs(schema: string | null, prefs: DataViewPrefs): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(keyFor(schema), JSON.stringify(prefs))
  } catch {
    // ignore quota / serialization errors — view prefs are best-effort
  }
}

/**
 * Cycle a column's sort: none → asc → desc → none. Single-column (clicking a
 * new column replaces the sort), matching the main database UI's header click.
 */
export function cycleSort(sorts: SortConfig[], columnId: string): SortConfig[] {
  const current = sorts.find((s) => s.columnId === columnId)
  if (!current) return [{ columnId, direction: 'asc' }]
  if (current.direction === 'asc') return [{ columnId, direction: 'desc' }]
  return sorts.filter((s) => s.columnId !== columnId)
}
