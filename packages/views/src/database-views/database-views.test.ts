/**
 * Pure-model tests for the V2 database views (exploration 0337):
 * grouping (option-id keying, rename safety), card-move write shape,
 * calendar lane packing, timeline geometry, map GeoJSON, and the
 * floating-date invariant.
 */

import { compareSortKeys } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import type { GridField } from '../grid/model.js'
import { buildMonthGrid, eventsInRange, overflowByDay, packWeekSegments } from './calendar-model.js'
import type { DatabaseViewRow } from './contract.js'
import { parseDateCell, parseDateRangeCell, rowDateSpan, toDateCell } from './date-model.js'
import {
  UNGROUPED_KEY,
  buildGroups,
  dropCardSortKey,
  moveCellValue,
  orderRowsBySortKey
} from './group-model.js'
import { MAX_MAP_PINS, defaultViewportFor, rowsToGeoJSON } from './map-model.js'
import { barGeometry, deltaDays, timelineItems, timelineRange } from './timeline-model.js'

const statusField: GridField = {
  id: 'f-status',
  name: 'Status',
  type: 'select',
  config: {},
  width: 120,
  options: [
    { id: 'opt-todo', name: 'To Do', color: 'gray' },
    { id: 'opt-doing', name: 'In Progress', color: 'blue' },
    { id: 'opt-done', name: 'Done', color: 'green' }
  ]
}

const labelsField: GridField = {
  id: 'f-labels',
  name: 'Labels',
  type: 'multiSelect',
  config: {},
  width: 120,
  options: [
    { id: 'opt-bug', name: 'bug', color: 'red' },
    { id: 'opt-feat', name: 'feature', color: 'green' }
  ]
}

function row(id: string, sortKey: string, cells: Record<string, unknown>): DatabaseViewRow {
  return { id, sortKey, cells: cells as DatabaseViewRow['cells'] }
}

const emptyGroupConfig = { collapsedGroups: [] as string[], groupMeta: {} }

describe('group-model', () => {
  it('keys stacks by option id, in option order, with a null stack first', () => {
    const rows = [
      row('r1', 'a1', { 'f-status': 'opt-done' }),
      row('r2', 'a2', { 'f-status': 'opt-todo' }),
      row('r3', 'a3', {}),
      row('r4', 'a4', { 'f-status': 'opt-deleted-option' })
    ]
    const groups = buildGroups(rows, statusField, emptyGroupConfig)
    expect(groups.map((g) => g.key)).toEqual([UNGROUPED_KEY, 'opt-todo', 'opt-doing', 'opt-done'])
    expect(groups[0].rows.map((r) => r.id)).toEqual(['r3', 'r4'])
    expect(groups[0].name).toBe('No Status')
    expect(groups[1].rows.map((r) => r.id)).toEqual(['r2'])
    expect(groups[3].rows.map((r) => r.id)).toEqual(['r1'])
  })

  it('survives option renames: stacks track option ids, not labels', () => {
    const rows = [row('r1', 'a1', { 'f-status': 'opt-todo' })]
    const renamed: GridField = {
      ...statusField,
      options: statusField.options!.map((o) =>
        o.id === 'opt-todo' ? { ...o, name: 'Backlog' } : o
      )
    }
    const groups = buildGroups(rows, renamed, emptyGroupConfig)
    const stack = groups.find((g) => g.key === 'opt-todo')!
    expect(stack.name).toBe('Backlog')
    expect(stack.rows.map((r) => r.id)).toEqual(['r1'])
  })

  it('hides the null stack when empty and applies groupMeta order/hidden', () => {
    const rows = [
      row('r1', 'a1', { 'f-status': 'opt-todo' }),
      row('r2', 'a2', { 'f-status': 'opt-done' })
    ]
    const groups = buildGroups(rows, statusField, {
      collapsedGroups: [],
      groupMeta: {
        'opt-done': { sortKey: 'a0' }, // before todo's fallback key
        'opt-doing': { hidden: true }
      }
    })
    expect(groups.map((g) => g.key)).toEqual(['opt-done', 'opt-todo'])
  })

  it('places multiSelect rows in every referenced stack', () => {
    const rows = [row('r1', 'a1', { 'f-labels': ['opt-bug', 'opt-feat'] })]
    const groups = buildGroups(rows, labelsField, emptyGroupConfig)
    expect(groups.find((g) => g.key === 'opt-bug')!.rows).toHaveLength(1)
    expect(groups.find((g) => g.key === 'opt-feat')!.rows).toHaveLength(1)
  })

  it('orders cards by fractional sortKey and drops between neighbours', () => {
    const rows = [row('r2', 'a2', {}), row('r1', 'a1', {}), row('r3', 'a3', {})]
    const ordered = orderRowsBySortKey(rows)
    expect(ordered.map((r) => r.id)).toEqual(['r1', 'r2', 'r3'])

    const key = dropCardSortKey(ordered, 'r3', 1)!
    expect(compareSortKeys(key, 'a1')).toBeGreaterThan(0)
    expect(compareSortKeys(key, 'a2')).toBeLessThan(0)
  })

  it('drop into an empty group needs no sortKey (unconstrained)', () => {
    expect(dropCardSortKey([], 'r1', 0)).toBeUndefined()
  })

  it('moveCellValue writes exactly the group cell: id, null, or array swap', () => {
    const single = row('r1', 'a1', { 'f-status': 'opt-todo' })
    expect(moveCellValue(single, statusField, 'opt-todo', 'opt-done')).toBe('opt-done')
    expect(moveCellValue(single, statusField, 'opt-todo', UNGROUPED_KEY)).toBeNull()

    const multi = row('r2', 'a2', { 'f-labels': ['opt-bug'] })
    expect(moveCellValue(multi, labelsField, 'opt-bug', 'opt-feat')).toEqual(['opt-feat'])
    expect(moveCellValue(multi, labelsField, 'opt-bug', UNGROUPED_KEY)).toEqual([])
  })

  it('concurrent double-move converges to a single-cell write per author (LWW-safe shape)', () => {
    // Two authors move the same card to different stacks: each produces a
    // one-key cells object — the store's LWW resolves the winner without
    // conflict floods (0296: conflict = cross-author divergence only).
    const r = row('r1', 'a1', { 'f-status': 'opt-todo' })
    const authorA = { [statusField.id]: moveCellValue(r, statusField, 'opt-todo', 'opt-doing') }
    const authorB = { [statusField.id]: moveCellValue(r, statusField, 'opt-todo', 'opt-done') }
    expect(Object.keys(authorA)).toEqual(['f-status'])
    expect(Object.keys(authorB)).toEqual(['f-status'])
  })
})

describe('date-model (floating local dates)', () => {
  it('parses YYYY-MM-DD as a LOCAL date — never the UTC off-by-one', () => {
    const date = parseDateCell('2026-03-14')!
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(2)
    expect(date.getDate()).toBe(14)
    expect(toDateCell(date)).toBe('2026-03-14')
  })

  it('normalizes inverted ranges and tolerates time suffixes', () => {
    const range = parseDateRangeCell({ start: '2026-05-10T09:00:00Z', end: '2026-05-08' })!
    expect(toDateCell(range.start)).toBe('2026-05-08')
    expect(toDateCell(range.end)).toBe('2026-05-10')
  })

  it('rowDateSpan reads single dates, date+end pairs, and dateRange cells', () => {
    const single = rowDateSpan({ d: '2026-01-05' } as never, 'd', 'date')!
    expect(toDateCell(single.start)).toBe('2026-01-05')
    expect(toDateCell(single.end)).toBe('2026-01-05')

    const pair = rowDateSpan({ d: '2026-01-05', e: '2026-01-08' } as never, 'd', 'date', 'e')!
    expect(toDateCell(pair.end)).toBe('2026-01-08')

    const range = rowDateSpan(
      { d: { start: '2026-01-05', end: '2026-01-08' } } as never,
      'd',
      'dateRange'
    )!
    expect(toDateCell(range.end)).toBe('2026-01-08')
  })
})

describe('calendar-model', () => {
  const dateField: GridField = { id: 'f-due', name: 'Due', type: 'date', config: {}, width: 100 }

  it('builds whole-week month grids', () => {
    const grid = buildMonthGrid(parseDateCell('2026-07-17')!)
    expect(grid.weeks.length).toBeGreaterThanOrEqual(4)
    for (const week of grid.weeks) expect(week).toHaveLength(7)
    expect(grid.weeks[0][0].getDay()).toBe(0) // Sunday start
  })

  it('clips events to the grid range', () => {
    const grid = buildMonthGrid(parseDateCell('2026-07-17')!)
    const rows = [
      row('in', 'a1', { 'f-due': '2026-07-10' }),
      row('out', 'a2', { 'f-due': '2026-01-01' })
    ]
    const events = eventsInRange(
      rows,
      dateField,
      { endDateField: null },
      grid.gridStart,
      grid.gridEnd
    )
    expect(events.map((e) => e.row.id)).toEqual(['in'])
  })

  it('packs overlapping events into distinct lanes and counts overflow', () => {
    const weekStart = parseDateCell('2026-07-12')! // a Sunday
    const events = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({
      row: row(id, `a${i}`, {}),
      start: parseDateCell('2026-07-13')!,
      end: parseDateCell('2026-07-15')!
    }))
    const segments = packWeekSegments(events, weekStart)
    const lanes = new Set(segments.map((s) => s.lane))
    expect(lanes.size).toBe(5) // all overlap → five distinct lanes
    const overflow = overflowByDay(segments, 3)
    expect(overflow[1]).toBe(2) // Monday: lanes 3 and 4 hidden
    expect(overflow[0]).toBe(0) // Sunday: nothing
  })
})

describe('timeline-model', () => {
  const dateField: GridField = {
    id: 'f-span',
    name: 'Window',
    type: 'dateRange',
    config: {},
    width: 100
  }

  it('derives items, a padded month range, and bar geometry', () => {
    const rows = [
      row('r1', 'a1', { 'f-span': { start: '2026-03-10', end: '2026-03-20' } }),
      row('undated', 'a2', {})
    ]
    const items = timelineItems(rows, dateField, { endDateField: null })
    expect(items).toHaveLength(1)

    const range = timelineRange(items, 'quarter')
    expect(range.start <= items[0].start).toBe(true)
    expect(range.end >= items[0].end).toBe(true)

    const geometry = barGeometry(range, 'quarter', items[0])
    expect(geometry.left).toBeGreaterThan(0)
    expect(geometry.width).toBeCloseTo(11 * 8, 5) // 11 days × 8 px/day
  })

  it('snaps pixel deltas to whole days per zoom', () => {
    expect(deltaDays(25, 'month')).toBe(1) // 24 px/day
    expect(deltaDays(-17, 'quarter')).toBe(-2) // 8 px/day
  })
})

describe('map-model', () => {
  const latField: GridField = { id: 'f-lat', name: 'lat', type: 'number', config: {}, width: 80 }
  const lngField: GridField = { id: 'f-lng', name: 'lng', type: 'number', config: {}, width: 80 }
  const titleField: GridField = {
    id: 'f-title',
    name: 'Name',
    type: 'text',
    config: {},
    width: 200,
    isTitle: true
  }

  it('converts rows to GeoJSON, skipping bad coordinates', () => {
    const rows = [
      row('r1', 'a1', { 'f-lat': 52.52, 'f-lng': 13.405, 'f-title': 'Berlin' }),
      row('r2', 'a2', { 'f-lat': 999, 'f-lng': 0 }),
      row('r3', 'a3', {})
    ]
    const result = rowsToGeoJSON(rows, [titleField, latField, lngField], latField, lngField)
    expect(result.plotted).toBe(1)
    expect(result.skipped).toBe(2)
    const feature = result.geojson.features[0]
    expect(feature.properties).toMatchObject({ rowId: 'r1', title: 'Berlin' })
    expect((feature.geometry as GeoJSON.Point).coordinates).toEqual([13.405, 52.52])
  })

  it('caps pins at MAX_MAP_PINS', () => {
    const rows = Array.from({ length: MAX_MAP_PINS + 5 }, (_, i) =>
      row(`r${i}`, `a${i}`, { 'f-lat': 10, 'f-lng': 10 })
    )
    const result = rowsToGeoJSON(rows, [latField, lngField], latField, lngField)
    expect(result.plotted).toBe(MAX_MAP_PINS)
    expect(result.skipped).toBe(5)
  })

  it('fits the default viewport to the points', () => {
    const result = rowsToGeoJSON(
      [row('r1', 'a1', { 'f-lat': 52.52, 'f-lng': 13.405 })],
      [latField, lngField],
      latField,
      lngField
    )
    const viewport = defaultViewportFor(result.geojson)
    expect(viewport.latitude).toBeCloseTo(52.52, 3)
    expect(viewport.longitude).toBeCloseTo(13.405, 3)
    expect(viewport.zoom).toBeGreaterThan(5)

    const empty = defaultViewportFor({ type: 'FeatureCollection', features: [] })
    expect(empty.zoom).toBeLessThan(3)
  })
})
