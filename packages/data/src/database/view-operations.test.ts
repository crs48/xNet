import { describe, it, expect, beforeEach } from 'vitest'
import * as Y from 'yjs'
import { createColumn, getColumns } from './column-operations'
import { initializeDatabaseDoc, addDefaultTableView } from './database-doc'
import {
  getView,
  getViewByType,
  createView,
  updateView,
  deleteView,
  duplicateView,
  setViewFilters,
  clearViewFilters,
  setViewSorts,
  addViewSort,
  removeViewSort,
  clearViewSorts,
  setViewGroupBy,
  toggleGroupCollapsed,
  setVisibleColumns,
  showColumn,
  hideColumn,
  reorderViewColumns,
  setColumnWidth
} from './view-operations'

describe('View Operations', () => {
  let doc: Y.Doc

  beforeEach(() => {
    doc = new Y.Doc()
    initializeDatabaseDoc(doc)
    createColumn(doc, { name: 'Title', type: 'text', config: {}, isTitle: true })
  })

  describe('createView', () => {
    it('creates view with config', () => {
      const columns = getColumns(doc)

      const id = createView(doc, {
        name: 'Board View',
        type: 'board',
        visibleColumns: columns.map((c) => c.id),
        groupBy: columns[0].id
      })

      const view = getView(doc, id)
      expect(view?.name).toBe('Board View')
      expect(view?.type).toBe('board')
      expect(view?.groupBy).toBe(columns[0].id)
    })

    it('creates view with filters', () => {
      const columns = getColumns(doc)

      const id = createView(doc, {
        name: 'Filtered View',
        type: 'table',
        visibleColumns: columns.map((c) => c.id),
        filters: {
          operator: 'and',
          conditions: [{ columnId: columns[0].id, operator: 'isNotEmpty', value: null }]
        }
      })

      const view = getView(doc, id)
      expect(view?.filters?.operator).toBe('and')
      expect(view?.filters?.conditions).toHaveLength(1)
    })

    it('creates view with sorts', () => {
      const columns = getColumns(doc)

      const id = createView(doc, {
        name: 'Sorted View',
        type: 'table',
        visibleColumns: columns.map((c) => c.id),
        sorts: [{ columnId: columns[0].id, direction: 'desc' }]
      })

      const view = getView(doc, id)
      expect(view?.sorts).toHaveLength(1)
      expect(view?.sorts?.[0].direction).toBe('desc')
    })

    it('creates calendar view with date columns', () => {
      const dateColId = createColumn(doc, { name: 'Date', type: 'date', config: {} })
      const endDateColId = createColumn(doc, { name: 'End Date', type: 'date', config: {} })
      const columns = getColumns(doc)

      const id = createView(doc, {
        name: 'Calendar',
        type: 'calendar',
        visibleColumns: columns.map((c) => c.id),
        dateColumn: dateColId,
        endDateColumn: endDateColId
      })

      const view = getView(doc, id)
      expect(view?.type).toBe('calendar')
      expect(view?.dateColumn).toBe(dateColId)
      expect(view?.endDateColumn).toBe(endDateColId)
    })
  })

  describe('getView', () => {
    it('returns view by ID', () => {
      const viewId = addDefaultTableView(doc)

      const view = getView(doc, viewId)
      expect(view).not.toBeNull()
      expect(view?.name).toBe('Default View')
    })

    it('returns null for non-existent view', () => {
      const view = getView(doc, 'non-existent')
      expect(view).toBeNull()
    })
  })

  describe('getViewByType', () => {
    it('returns first view of type', () => {
      const columns = getColumns(doc)
      createView(doc, {
        name: 'Table 1',
        type: 'table',
        visibleColumns: columns.map((c) => c.id)
      })
      createView(doc, {
        name: 'Board 1',
        type: 'board',
        visibleColumns: columns.map((c) => c.id)
      })

      const tableView = getViewByType(doc, 'table')
      expect(tableView?.name).toBe('Table 1')

      const boardView = getViewByType(doc, 'board')
      expect(boardView?.name).toBe('Board 1')
    })

    it('returns null if no view of type exists', () => {
      const view = getViewByType(doc, 'calendar')
      expect(view).toBeNull()
    })
  })

  describe('updateView', () => {
    it('updates view name', () => {
      const viewId = addDefaultTableView(doc)

      updateView(doc, viewId, { name: 'My Table' })

      const view = getView(doc, viewId)
      expect(view?.name).toBe('My Table')
    })

    it('updates filters', () => {
      const viewId = addDefaultTableView(doc)

      updateView(doc, viewId, {
        filters: {
          operator: 'and',
          conditions: [{ columnId: 'col1', operator: 'isNotEmpty', value: null }]
        }
      })

      const view = getView(doc, viewId)
      expect(view?.filters?.operator).toBe('and')
    })

    it('does nothing for non-existent view', () => {
      // Should not throw
      updateView(doc, 'non-existent', { name: 'New Name' })
    })
  })

  describe('deleteView', () => {
    it('removes view from map', () => {
      const viewId = addDefaultTableView(doc)

      deleteView(doc, viewId)

      const view = getView(doc, viewId)
      expect(view).toBeNull()
    })
  })

  describe('duplicateView', () => {
    it('creates copy with new name', () => {
      const viewId = addDefaultTableView(doc)

      const copyId = duplicateView(doc, viewId, 'My Copy')

      const copy = getView(doc, copyId)
      expect(copy?.name).toBe('My Copy')
      expect(copy?.type).toBe('table')
    })

    it('uses default name if not provided', () => {
      const viewId = addDefaultTableView(doc)

      const copyId = duplicateView(doc, viewId)

      const copy = getView(doc, copyId)
      expect(copy?.name).toBe('Default View (Copy)')
    })

    it('throws for non-existent view', () => {
      expect(() => duplicateView(doc, 'non-existent')).toThrow('View non-existent not found')
    })
  })

  describe('Filter Operations', () => {
    it('setViewFilters sets filters', () => {
      const viewId = addDefaultTableView(doc)

      setViewFilters(doc, viewId, {
        operator: 'or',
        conditions: [{ columnId: 'col1', operator: 'isEmpty', value: null }]
      })

      const view = getView(doc, viewId)
      expect(view?.filters?.operator).toBe('or')
    })

    it('clearViewFilters removes filters', () => {
      const viewId = addDefaultTableView(doc)
      setViewFilters(doc, viewId, {
        operator: 'and',
        conditions: []
      })

      clearViewFilters(doc, viewId)

      const view = getView(doc, viewId)
      expect(view?.filters).toBeNull()
    })
  })

  describe('Sort Operations', () => {
    it('setViewSorts sets sorts', () => {
      const viewId = addDefaultTableView(doc)

      setViewSorts(doc, viewId, [
        { columnId: 'col1', direction: 'asc' },
        { columnId: 'col2', direction: 'desc' }
      ])

      const view = getView(doc, viewId)
      expect(view?.sorts).toHaveLength(2)
    })

    it('addViewSort adds a sort', () => {
      const viewId = addDefaultTableView(doc)

      addViewSort(doc, viewId, { columnId: 'col1', direction: 'asc' })

      const view = getView(doc, viewId)
      expect(view?.sorts).toHaveLength(1)
    })

    it('removeViewSort removes a sort', () => {
      const viewId = addDefaultTableView(doc)
      setViewSorts(doc, viewId, [
        { columnId: 'col1', direction: 'asc' },
        { columnId: 'col2', direction: 'desc' }
      ])

      removeViewSort(doc, viewId, 'col1')

      const view = getView(doc, viewId)
      expect(view?.sorts).toHaveLength(1)
      expect(view?.sorts?.[0].columnId).toBe('col2')
    })

    it('clearViewSorts removes all sorts', () => {
      const viewId = addDefaultTableView(doc)
      setViewSorts(doc, viewId, [{ columnId: 'col1', direction: 'asc' }])

      clearViewSorts(doc, viewId)

      const view = getView(doc, viewId)
      expect(view?.sorts).toHaveLength(0)
    })
  })

  describe('Group Operations', () => {
    it('setViewGroupBy sets group column', () => {
      const viewId = addDefaultTableView(doc)
      const columns = getColumns(doc)

      setViewGroupBy(doc, viewId, columns[0].id)

      const view = getView(doc, viewId)
      expect(view?.groupBy).toBe(columns[0].id)
    })

    it('setViewGroupBy clears group column', () => {
      const viewId = addDefaultTableView(doc)
      const columns = getColumns(doc)
      setViewGroupBy(doc, viewId, columns[0].id)

      setViewGroupBy(doc, viewId, null)

      const view = getView(doc, viewId)
      expect(view?.groupBy).toBeNull()
    })

    it('toggleGroupCollapsed toggles group state', () => {
      const viewId = addDefaultTableView(doc)

      toggleGroupCollapsed(doc, viewId, 'group1')

      let view = getView(doc, viewId)
      expect(view?.collapsedGroups).toContain('group1')

      toggleGroupCollapsed(doc, viewId, 'group1')

      view = getView(doc, viewId)
      expect(view?.collapsedGroups).not.toContain('group1')
    })
  })

  describe('Column Visibility', () => {
    it('setVisibleColumns sets visible columns', () => {
      const viewId = addDefaultTableView(doc)
      const col2 = createColumn(doc, { name: 'Col2', type: 'text', config: {} })

      setVisibleColumns(doc, viewId, [col2])

      const view = getView(doc, viewId)
      expect(view?.visibleColumns).toEqual([col2])
    })

    it('showColumn adds column to visibility', () => {
      const viewId = addDefaultTableView(doc)
      const columns = getColumns(doc)
      setVisibleColumns(doc, viewId, [])

      showColumn(doc, viewId, columns[0].id)

      const view = getView(doc, viewId)
      expect(view?.visibleColumns).toContain(columns[0].id)
    })

    it('showColumn does not duplicate', () => {
      const viewId = addDefaultTableView(doc)
      const columns = getColumns(doc)

      showColumn(doc, viewId, columns[0].id)
      showColumn(doc, viewId, columns[0].id)

      const view = getView(doc, viewId)
      expect(view?.visibleColumns.filter((id) => id === columns[0].id)).toHaveLength(1)
    })

    it('hideColumn removes column from visibility', () => {
      const viewId = addDefaultTableView(doc)
      const columns = getColumns(doc)

      hideColumn(doc, viewId, columns[0].id)

      const view = getView(doc, viewId)
      expect(view?.visibleColumns).not.toContain(columns[0].id)
    })

    it('reorderViewColumns reorders columns', () => {
      createColumn(doc, { name: 'Col1', type: 'text', config: {} })
      const col2 = createColumn(doc, { name: 'Col2', type: 'text', config: {} })
      const columns = getColumns(doc)
      const viewId = createView(doc, {
        name: 'Test',
        type: 'table',
        visibleColumns: columns.map((c) => c.id)
      })

      // Move col2 to position 0
      reorderViewColumns(doc, viewId, col2, 0)

      const view = getView(doc, viewId)
      expect(view?.visibleColumns[0]).toBe(col2)
    })

    it('setColumnWidth sets column width', () => {
      const viewId = addDefaultTableView(doc)
      const columns = getColumns(doc)

      setColumnWidth(doc, viewId, columns[0].id, 350)

      const view = getView(doc, viewId)
      expect(view?.columnWidths?.[columns[0].id]).toBe(350)
    })
  })
})

describe('View CRDT Behavior', () => {
  it('merges concurrent view updates', () => {
    const doc1 = new Y.Doc()
    const doc2 = new Y.Doc()

    initializeDatabaseDoc(doc1)
    createColumn(doc1, { name: 'Title', type: 'text', config: {} })
    const viewId = addDefaultTableView(doc1)

    // Sync doc1 -> doc2
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))

    // Concurrent updates
    updateView(doc1, viewId, { name: 'View A' })
    updateView(doc2, viewId, { groupBy: 'col1' })

    // Sync both ways
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
    Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))

    // Both changes should merge
    const view1 = getView(doc1, viewId)
    const view2 = getView(doc2, viewId)

    expect(view1?.name).toBe('View A')
    expect(view1?.groupBy).toBe('col1')
    expect(view2?.name).toBe('View A')
    expect(view2?.groupBy).toBe('col1')
  })
})
