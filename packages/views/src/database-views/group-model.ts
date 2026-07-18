/**
 * Group model — pure grouping engine shared by board stacks, timeline
 * swimlanes, and grouped lists (exploration 0337).
 *
 * Groups are keyed by select option ID (never label — renames must not
 * orphan stacks), with a `__none__` group for rows whose group cell is
 * empty or references a deleted option. Group order = option sortKey
 * order, overridable per view through `groupMeta[optionId].sortKey`
 * (code-unit collation, same invariant as row sortKeys).
 */

import { compareSortKeys, generateSortKeyWithJitter } from '@xnetjs/data'
import type { GridField, GridFieldOption } from '../grid/model.js'
import type { DatabaseViewConfig, DatabaseViewRow } from './contract.js'

export const UNGROUPED_KEY = '__none__'

export interface ViewGroup {
  /** Select option ID, or UNGROUPED_KEY for the null group */
  key: string
  name: string
  /** Named SelectColor token or hex (see optionChipStyle) */
  color?: string
  rows: DatabaseViewRow[]
  collapsed: boolean
  hidden: boolean
}

/** Rows ordered by their fractional sortKey (manual card order). */
export function orderRowsBySortKey(rows: DatabaseViewRow[]): DatabaseViewRow[] {
  return [...rows].sort((a, b) => compareSortKeys(a.sortKey, b.sortKey))
}

/**
 * Group rows by a select/multiSelect field. multiSelect rows appear in
 * every group they reference. Rows keep their incoming order (the view's
 * sorted order); pass them through `orderRowsBySortKey` first when manual
 * order should win.
 */
export function buildGroups(
  rows: DatabaseViewRow[],
  groupField: GridField | undefined,
  config: Pick<DatabaseViewConfig, 'collapsedGroups' | 'groupMeta'>
): ViewGroup[] {
  if (!groupField || (groupField.type !== 'select' && groupField.type !== 'multiSelect')) {
    return [
      {
        key: UNGROUPED_KEY,
        name: 'All items',
        rows,
        collapsed: config.collapsedGroups.includes(UNGROUPED_KEY),
        hidden: false
      }
    ]
  }

  const options: GridFieldOption[] = groupField.options ?? []
  const byKey = new Map<string, DatabaseViewRow[]>()
  byKey.set(UNGROUPED_KEY, [])
  for (const option of options) byKey.set(option.id, [])

  for (const row of rows) {
    const value = row.cells[groupField.id]
    if (groupField.type === 'multiSelect' && Array.isArray(value)) {
      const known = value.filter((v): v is string => typeof v === 'string' && byKey.has(v))
      if (known.length === 0) byKey.get(UNGROUPED_KEY)!.push(row)
      else for (const v of known) byKey.get(v)!.push(row)
    } else if (typeof value === 'string' && byKey.has(value)) {
      byKey.get(value)!.push(row)
    } else {
      byKey.get(UNGROUPED_KEY)!.push(row)
    }
  }

  const meta = config.groupMeta
  const collapsed = new Set(config.collapsedGroups)
  const groups: ViewGroup[] = options.map((option) => ({
    key: option.id,
    name: option.name,
    color: option.color,
    rows: byKey.get(option.id)!,
    collapsed: collapsed.has(option.id),
    hidden: meta[option.id]?.hidden ?? false
  }))

  // Manual stack order: groupMeta sortKey wins over option order
  const orderKey = (key: string, index: number) => meta[key]?.sortKey ?? `~${String(index).padStart(6, '0')}`
  groups.sort((a, b) =>
    compareSortKeys(
      orderKey(a.key, options.findIndex((o) => o.id === a.key)),
      orderKey(b.key, options.findIndex((o) => o.id === b.key))
    )
  )

  const none = byKey.get(UNGROUPED_KEY)!
  const result: ViewGroup[] = [
    {
      key: UNGROUPED_KEY,
      name: `No ${groupField.name}`,
      rows: none,
      collapsed: collapsed.has(UNGROUPED_KEY),
      hidden: (meta[UNGROUPED_KEY]?.hidden ?? false) || none.length === 0
    },
    ...groups
  ]
  return result.filter((g) => !g.hidden)
}

/**
 * Fractional sortKey for dropping a card at `targetIndex` within a
 * group's rows (moved card removed first — Notion drop semantics).
 * Returns undefined when the position is unconstrained (empty group,
 * append with no neighbours to order against).
 */
export function dropCardSortKey(
  groupRows: DatabaseViewRow[],
  movedRowId: string,
  targetIndex: number
): string | undefined {
  const without = groupRows.filter((r) => r.id !== movedRowId)
  if (without.length === 0) return undefined
  const clamped = Math.max(0, Math.min(targetIndex, without.length))
  const before = without[clamped - 1]?.sortKey
  const after = without[clamped]?.sortKey
  return generateSortKeyWithJitter(before, after)
}

/**
 * The cell write for moving a row into a group: option id for select,
 * array membership swap for multiSelect, null for the ungrouped stack.
 */
export function moveCellValue(
  row: DatabaseViewRow,
  groupField: GridField,
  fromKey: string,
  toKey: string
): unknown {
  if (groupField.type === 'multiSelect') {
    const current = row.cells[groupField.id]
    const values = Array.isArray(current)
      ? current.filter((v): v is string => typeof v === 'string')
      : []
    const withoutSource = values.filter((v) => v !== fromKey)
    if (toKey === UNGROUPED_KEY) return withoutSource
    return withoutSource.includes(toKey) ? withoutSource : [...withoutSource, toKey]
  }
  return toKey === UNGROUPED_KEY ? null : toKey
}
