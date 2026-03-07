import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { initializeDatabaseDoc } from './database-doc'
import {
  createLegacyColumn,
  createLegacyRow,
  createLegacyView,
  deleteLegacyColumn,
  deleteLegacyRow,
  deleteLegacyView,
  getDatabaseDocumentModel,
  getLegacyColumns,
  getLegacyRows,
  getLegacyView,
  getLegacyViews,
  moveLegacyRow,
  updateLegacyColumn,
  updateLegacyRow,
  updateLegacyView
} from './legacy-model'

describe('legacy-model', () => {
  it('detects legacy database documents from the data map payload', () => {
    const doc = new Y.Doc()
    const data = doc.getMap('data')

    data.set('columns', [{ id: 'title', name: 'Title', type: 'text' }])

    expect(getDatabaseDocumentModel(doc)).toBe('legacy')
  })

  it('survives a Yjs encode and decode roundtrip', () => {
    const doc = new Y.Doc()
    const data = doc.getMap('data')

    data.set('columns', [{ id: 'title', name: 'Title', type: 'text' }])
    data.set('tableView', {
      id: 'legacy-table',
      name: 'Table View',
      type: 'table',
      visibleProperties: ['title']
    })

    const decoded = new Y.Doc()
    Y.applyUpdate(decoded, Y.encodeStateAsUpdate(doc))

    expect(getDatabaseDocumentModel(decoded)).toBe('legacy')
    expect(getLegacyColumns(decoded)).toHaveLength(1)
    expect(getLegacyViews(decoded)).toHaveLength(1)
  })

  it('does not treat schema metadata alone as legacy state', () => {
    const doc = new Y.Doc()
    initializeDatabaseDoc(doc)

    const data = doc.getMap('data')
    data.set('schema', {
      name: 'Projects',
      version: '1.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now()
    })

    expect(getDatabaseDocumentModel(doc)).toBe('canonical')
  })

  it('normalizes legacy columns and views into canonical database types', () => {
    const doc = new Y.Doc()
    const data = doc.getMap('data')

    data.set('columns', [
      {
        id: 'status',
        name: 'Status',
        type: 'select',
        config: {
          options: [
            { id: 'todo', label: 'To Do', color: 'gray' },
            { id: 'done', name: 'Done', color: 'green' }
          ]
        }
      }
    ])
    data.set('tableView', {
      id: 'legacy-table',
      name: 'Table View',
      type: 'table',
      visibleProperties: ['status'],
      propertyWidths: { status: 220 },
      sorts: [{ propertyId: 'status', direction: 'asc' }],
      filter: {
        type: 'and',
        filters: [{ propertyId: 'status', operator: 'equals', value: 'todo' }]
      }
    })

    expect(getLegacyColumns(doc)).toEqual([
      {
        id: 'status',
        name: 'Status',
        type: 'select',
        config: {
          options: [
            { id: 'todo', name: 'To Do', color: 'gray' },
            { id: 'done', name: 'Done', color: 'green' }
          ]
        }
      }
    ])

    expect(getLegacyViews(doc)).toEqual([
      {
        id: 'legacy-table',
        name: 'Table View',
        type: 'table',
        visibleColumns: ['status'],
        columnWidths: { status: 220 },
        sorts: [{ columnId: 'status', direction: 'asc' }],
        filters: {
          operator: 'and',
          conditions: [{ columnId: 'status', operator: 'equals', value: 'todo' }]
        }
      }
    ])
  })

  it('keeps legacy column visibility in sync when mutating columns', () => {
    const doc = new Y.Doc()
    const data = doc.getMap('data')

    data.set('columns', [{ id: 'title', name: 'Title', type: 'text' }])
    data.set('tableView', {
      id: 'legacy-table',
      name: 'Table View',
      type: 'table',
      visibleProperties: ['title']
    })

    const columnId = createLegacyColumn(doc, {
      name: 'Priority',
      type: 'select',
      config: {
        options: [{ id: 'high', name: 'High', color: 'red' }]
      }
    })

    updateLegacyColumn(doc, columnId, { name: 'Severity' })

    expect(getLegacyColumns(doc).map((column) => column.name)).toEqual(['Title', 'Severity'])
    expect(getLegacyViews(doc)[0]?.visibleColumns).toEqual(['title', columnId])

    deleteLegacyColumn(doc, columnId)

    expect(getLegacyColumns(doc).map((column) => column.id)).toEqual(['title'])
    expect(getLegacyViews(doc)[0]?.visibleColumns).toEqual(['title'])
  })

  it('supports row creation, updates, reordering, and deletion in legacy docs', () => {
    const doc = new Y.Doc()

    const rowA = createLegacyRow(doc, { title: 'A' })
    const rowB = createLegacyRow(doc, { title: 'B' })
    const rowC = createLegacyRow(doc, { title: 'C' }, { beforeId: rowB })

    expect(getLegacyRows(doc).map((row) => [row.id, row.cells.title])).toEqual([
      [rowA, 'A'],
      [rowC, 'C'],
      [rowB, 'B']
    ])

    updateLegacyRow(doc, rowC, { title: 'C2', done: true })
    moveLegacyRow(doc, rowB, { beforeId: rowA })
    deleteLegacyRow(doc, rowA)

    expect(
      getLegacyRows(doc).map((row) => [row.id, row.cells.title, row.cells.done ?? false])
    ).toEqual([
      [rowB, 'B', false],
      [rowC, 'C2', true]
    ])
  })

  it('stores legacy views under their original keyed slots', () => {
    const doc = new Y.Doc()

    const tableViewId = createLegacyView(doc, {
      name: 'Table View',
      type: 'table',
      visibleColumns: ['title'],
      sorts: []
    })

    updateLegacyView(doc, tableViewId, {
      name: 'Main Table',
      columnWidths: { title: 300 }
    })

    expect(getLegacyView(doc, tableViewId)).toEqual({
      id: tableViewId,
      name: 'Main Table',
      type: 'table',
      visibleColumns: ['title'],
      columnWidths: { title: 300 },
      sorts: [],
      filters: null
    })

    deleteLegacyView(doc, tableViewId)

    expect(getLegacyViews(doc)).toEqual([])
  })
})
