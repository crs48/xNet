/**
 * Tests for database schema clone utilities.
 */

import type { StoredColumn } from './schema-utils'
import type { ViewConfig, FilterGroup } from './view-types'
import { describe, it, expect } from 'vitest'
import {
  cloneSchema,
  cloneColumns,
  cloneSampleRows,
  generateColumnIdMap,
  remapViewColumnIds,
  type CloneSourceData
} from './clone'

// ─── Test Data ──────────────────────────────────────────────────────────────────

const testColumns: StoredColumn[] = [
  { id: 'col_title', name: 'Title', type: 'text' },
  {
    id: 'col_status',
    name: 'Status',
    type: 'select',
    config: { options: [{ id: 'opt1', name: 'Todo' }] }
  },
  { id: 'col_priority', name: 'Priority', type: 'number' }
]

const testTableView: ViewConfig = {
  id: 'view_table',
  name: 'Table View',
  type: 'table',
  visibleColumns: ['col_title', 'col_status', 'col_priority'],
  columnWidths: { col_title: 200, col_status: 150 },
  groupBy: 'col_status',
  sorts: [{ columnId: 'col_priority', direction: 'desc' }],
  filters: {
    operator: 'and',
    conditions: [{ columnId: 'col_status', operator: 'equals', value: 'opt1' }]
  }
}

const testBoardView: ViewConfig = {
  id: 'view_board',
  name: 'Board View',
  type: 'board',
  visibleColumns: ['col_title', 'col_priority'],
  groupBy: 'col_status',
  coverColumn: 'col_title'
}

const testRows = [
  { id: 'row1', col_title: 'Task 1', col_status: 'opt1', col_priority: 1 },
  { id: 'row2', col_title: 'Task 2', col_status: 'opt1', col_priority: 2 },
  { id: 'row3', col_title: 'Task 3', col_status: 'opt1', col_priority: 3 }
]

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('generateColumnIdMap', () => {
  it('generates new IDs for all columns', () => {
    const idMap = generateColumnIdMap(testColumns)

    expect(idMap.size).toBe(3)
    expect(idMap.has('col_title')).toBe(true)
    expect(idMap.has('col_status')).toBe(true)
    expect(idMap.has('col_priority')).toBe(true)

    // New IDs should be different from old ones
    expect(idMap.get('col_title')).not.toBe('col_title')
    expect(idMap.get('col_status')).not.toBe('col_status')
    expect(idMap.get('col_priority')).not.toBe('col_priority')

    // New IDs should have correct format
    expect(idMap.get('col_title')).toMatch(/^col_[a-zA-Z0-9_-]+$/)
  })

  it('returns empty map for empty columns', () => {
    const idMap = generateColumnIdMap([])
    expect(idMap.size).toBe(0)
  })
})

describe('cloneColumns', () => {
  it('clones columns with new IDs', () => {
    const idMap = generateColumnIdMap(testColumns)
    const cloned = cloneColumns(testColumns, idMap)

    expect(cloned.length).toBe(3)

    // New IDs should be used
    expect(cloned[0].id).toBe(idMap.get('col_title'))
    expect(cloned[1].id).toBe(idMap.get('col_status'))
    expect(cloned[2].id).toBe(idMap.get('col_priority'))

    // Other properties should be preserved
    expect(cloned[0].name).toBe('Title')
    expect(cloned[0].type).toBe('text')
    expect(cloned[1].config).toEqual({ options: [{ id: 'opt1', name: 'Todo' }] })
  })

  it('deep clones config to prevent mutations', () => {
    const idMap = generateColumnIdMap(testColumns)
    const cloned = cloneColumns(testColumns, idMap)

    // Mutating original should not affect clone
    if (testColumns[1].config?.options) {
      ;(testColumns[1].config.options as Array<{ id: string; name: string }>)[0].name = 'Changed'
    }

    // Clone should still have original value
    expect(cloned[1].config?.options).toEqual([{ id: 'opt1', name: 'Todo' }])

    // Reset for other tests
    if (testColumns[1].config?.options) {
      ;(testColumns[1].config.options as Array<{ id: string; name: string }>)[0].name = 'Todo'
    }
  })
})

describe('remapViewColumnIds', () => {
  it('remaps visible columns', () => {
    const idMap = generateColumnIdMap(testColumns)
    const remapped = remapViewColumnIds(testTableView, idMap)

    expect(remapped.visibleColumns).toEqual([
      idMap.get('col_title'),
      idMap.get('col_status'),
      idMap.get('col_priority')
    ])
  })

  it('remaps column widths', () => {
    const idMap = generateColumnIdMap(testColumns)
    const remapped = remapViewColumnIds(testTableView, idMap)

    const newTitleId = idMap.get('col_title')!
    const newStatusId = idMap.get('col_status')!

    expect(remapped.columnWidths?.[newTitleId]).toBe(200)
    expect(remapped.columnWidths?.[newStatusId]).toBe(150)
  })

  it('remaps groupBy', () => {
    const idMap = generateColumnIdMap(testColumns)
    const remapped = remapViewColumnIds(testTableView, idMap)

    expect(remapped.groupBy).toBe(idMap.get('col_status'))
  })

  it('remaps sorts', () => {
    const idMap = generateColumnIdMap(testColumns)
    const remapped = remapViewColumnIds(testTableView, idMap)

    expect(remapped.sorts).toEqual([{ columnId: idMap.get('col_priority'), direction: 'desc' }])
  })

  it('remaps filters', () => {
    const idMap = generateColumnIdMap(testColumns)
    const remapped = remapViewColumnIds(testTableView, idMap)

    const filters = remapped.filters as FilterGroup
    expect(filters.operator).toBe('and')
    expect(filters.conditions).toHaveLength(1)
    expect((filters.conditions[0] as { columnId: string }).columnId).toBe(idMap.get('col_status'))
  })

  it('remaps cover column', () => {
    const idMap = generateColumnIdMap(testColumns)
    const remapped = remapViewColumnIds(testBoardView, idMap)

    expect(remapped.coverColumn).toBe(idMap.get('col_title'))
  })

  it('generates new view ID', () => {
    const idMap = generateColumnIdMap(testColumns)
    const remapped = remapViewColumnIds(testTableView, idMap)

    expect(remapped.id).not.toBe('view_table')
    expect(remapped.id).toMatch(/^view_[a-zA-Z0-9_-]+$/)
  })

  it('handles nested filter groups', () => {
    const viewWithNestedFilters: ViewConfig = {
      id: 'view_nested',
      name: 'Nested Filters',
      type: 'table',
      visibleColumns: ['col_title'],
      filters: {
        operator: 'or',
        conditions: [
          { columnId: 'col_title', operator: 'contains', value: 'test' },
          {
            operator: 'and',
            conditions: [
              { columnId: 'col_status', operator: 'equals', value: 'opt1' },
              { columnId: 'col_priority', operator: 'greaterThan', value: 5 }
            ]
          }
        ]
      }
    }

    const idMap = generateColumnIdMap(testColumns)
    const remapped = remapViewColumnIds(viewWithNestedFilters, idMap)

    const filters = remapped.filters as FilterGroup
    expect(filters.operator).toBe('or')
    expect(filters.conditions).toHaveLength(2)

    // First condition
    expect((filters.conditions[0] as { columnId: string }).columnId).toBe(idMap.get('col_title'))

    // Nested group
    const nestedGroup = filters.conditions[1] as FilterGroup
    expect(nestedGroup.operator).toBe('and')
    expect((nestedGroup.conditions[0] as { columnId: string }).columnId).toBe(
      idMap.get('col_status')
    )
    expect((nestedGroup.conditions[1] as { columnId: string }).columnId).toBe(
      idMap.get('col_priority')
    )
  })
})

describe('cloneSampleRows', () => {
  it('clones rows with new IDs', () => {
    const idMap = generateColumnIdMap(testColumns)
    const cloned = cloneSampleRows(testRows, idMap)

    expect(cloned.length).toBe(3)

    // Row IDs should be new
    expect(cloned[0].id).not.toBe('row1')
    expect(cloned[0].id).toMatch(/^row_[a-zA-Z0-9_-]+$/)
  })

  it('remaps column IDs in row data', () => {
    const idMap = generateColumnIdMap(testColumns)
    const cloned = cloneSampleRows(testRows, idMap)

    const newTitleId = idMap.get('col_title')!
    const newStatusId = idMap.get('col_status')!
    const newPriorityId = idMap.get('col_priority')!

    expect(cloned[0][newTitleId]).toBe('Task 1')
    expect(cloned[0][newStatusId]).toBe('opt1')
    expect(cloned[0][newPriorityId]).toBe(1)
  })

  it('respects maxRows limit', () => {
    const idMap = generateColumnIdMap(testColumns)
    const cloned = cloneSampleRows(testRows, idMap, 2)

    expect(cloned.length).toBe(2)
  })

  it('returns empty array for empty rows', () => {
    const idMap = generateColumnIdMap(testColumns)
    const cloned = cloneSampleRows([], idMap)

    expect(cloned).toEqual([])
  })
})

describe('cloneSchema', () => {
  const sourceData: CloneSourceData = {
    columns: testColumns,
    metadata: {
      name: 'Project Tracker',
      description: 'Track all projects',
      version: '1.2.3',
      createdAt: 1000000,
      updatedAt: 2000000
    },
    tableView: testTableView,
    boardView: testBoardView,
    rows: testRows
  }

  it('clones columns with new IDs', () => {
    const result = cloneSchema(sourceData)

    expect(result.columns.length).toBe(3)
    expect(result.columnIdMap.size).toBe(3)

    // Verify new IDs are used
    for (const col of result.columns) {
      expect(col.id).toMatch(/^col_[a-zA-Z0-9_-]+$/)
    }
  })

  it('creates fresh metadata with version 1.0.0', () => {
    const result = cloneSchema(sourceData)

    expect(result.metadata.name).toBe('Project Tracker (Copy)')
    expect(result.metadata.version).toBe('1.0.0')
    expect(result.metadata.createdAt).toBeGreaterThan(0)
    expect(result.metadata.updatedAt).toBeGreaterThan(0)
  })

  it('uses custom name when provided', () => {
    const result = cloneSchema(sourceData, { name: 'My New Project' })

    expect(result.metadata.name).toBe('My New Project')
  })

  it('uses custom description when provided', () => {
    const result = cloneSchema(sourceData, { description: 'Custom description' })

    expect(result.metadata.description).toBe('Custom description')
  })

  it('remaps view configurations', () => {
    const result = cloneSchema(sourceData)

    expect(result.views.tableView).toBeDefined()
    expect(result.views.boardView).toBeDefined()

    // Check that column IDs are remapped
    const newTitleId = result.columnIdMap.get('col_title')!
    expect(result.views.tableView?.visibleColumns).toContain(newTitleId)
  })

  it('does not include rows by default', () => {
    const result = cloneSchema(sourceData)

    expect(result.sampleRows).toBeUndefined()
  })

  it('includes sample rows when requested', () => {
    const result = cloneSchema(sourceData, { includeRows: true })

    expect(result.sampleRows).toBeDefined()
    expect(result.sampleRows?.length).toBe(3)
  })

  it('limits sample rows to maxSampleRows', () => {
    const result = cloneSchema(sourceData, { includeRows: true, maxSampleRows: 2 })

    expect(result.sampleRows?.length).toBe(2)
  })

  it('handles missing views gracefully', () => {
    const sourceWithoutViews: CloneSourceData = {
      columns: testColumns,
      metadata: sourceData.metadata
    }

    const result = cloneSchema(sourceWithoutViews)

    expect(result.views.tableView).toBeUndefined()
    expect(result.views.boardView).toBeUndefined()
  })

  it('handles missing rows gracefully', () => {
    const sourceWithoutRows: CloneSourceData = {
      columns: testColumns,
      metadata: sourceData.metadata
    }

    const result = cloneSchema(sourceWithoutRows, { includeRows: true })

    expect(result.sampleRows).toBeUndefined()
  })
})
