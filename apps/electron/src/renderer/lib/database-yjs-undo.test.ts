import type { PropertyType } from '@xnet/data'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

type StoredColumn = {
  id: string
  name: string
  type: PropertyType
  config?: Record<string, unknown>
}

type TableRow = {
  id: string
  [key: string]: unknown
}

function createDatabaseDoc() {
  const doc = new Y.Doc()
  const data = doc.getMap('data')
  data.set('columns', [
    { id: 'title', name: 'Title', type: 'text' },
    { id: 'tags', name: 'Tags', type: 'multiSelect', config: { options: [] } },
    { id: 'status', name: 'Status', type: 'select', config: { options: [] } }
  ] satisfies StoredColumn[])
  data.set('rows', [{ id: 'row-1', title: 'Initial', tags: [], status: '' }] satisfies TableRow[])
  data.set('tableView', {
    id: 'view-table',
    name: 'Table',
    type: 'table',
    visibleProperties: ['title', 'tags', 'status'],
    sorts: []
  })
  data.set('boardView', {
    id: 'view-board',
    name: 'Board',
    type: 'board',
    visibleProperties: ['title', 'tags', 'status'],
    sorts: [],
    groupByProperty: 'status'
  })

  const undo = new Y.UndoManager([data], { captureTimeout: 0 })
  return { doc, data, undo }
}

function getRows(data: Y.Map<unknown>): TableRow[] {
  return ((data.get('rows') as TableRow[] | undefined) ?? []).map((row) => ({ ...row }))
}

function getColumns(data: Y.Map<unknown>): StoredColumn[] {
  return ((data.get('columns') as StoredColumn[] | undefined) ?? []).map((col) => ({ ...col }))
}

describe('database yjs undo/redo behavior', () => {
  it('undoes/redoes text and multiselect cell edits', () => {
    const { data, undo } = createDatabaseDoc()

    const rowsAfterTextEdit = getRows(data).map((row) =>
      row.id === 'row-1' ? { ...row, title: 'Edited title' } : row
    )
    data.set('rows', rowsAfterTextEdit)

    const rowsAfterTagEdit = getRows(data).map((row) =>
      row.id === 'row-1' ? { ...row, tags: ['opt-a', 'opt-b'] } : row
    )
    data.set('rows', rowsAfterTagEdit)

    expect((getRows(data)[0].title as string) ?? '').toBe('Edited title')
    expect((getRows(data)[0].tags as string[]) ?? []).toEqual(['opt-a', 'opt-b'])

    undo.undo()
    expect((getRows(data)[0].tags as string[]) ?? []).toEqual([])
    expect((getRows(data)[0].title as string) ?? '').toBe('Edited title')

    undo.undo()
    expect((getRows(data)[0].title as string) ?? '').toBe('Initial')

    undo.redo()
    expect((getRows(data)[0].title as string) ?? '').toBe('Edited title')

    undo.redo()
    expect((getRows(data)[0].tags as string[]) ?? []).toEqual(['opt-a', 'opt-b'])
  })

  it('undoes/redoes row creation and deletion', () => {
    const { data, undo } = createDatabaseDoc()

    const createdRow: TableRow = { id: 'row-2', title: 'Second', tags: [], status: '' }
    data.set('rows', [...getRows(data), createdRow])
    expect(getRows(data)).toHaveLength(2)

    data.set(
      'rows',
      getRows(data).filter((row) => row.id !== 'row-2')
    )
    expect(getRows(data)).toHaveLength(1)

    undo.undo()
    expect(getRows(data)).toHaveLength(2)
    expect(getRows(data).some((row) => row.id === 'row-2')).toBe(true)

    undo.undo()
    expect(getRows(data)).toHaveLength(1)
    expect(getRows(data).some((row) => row.id === 'row-2')).toBe(false)

    undo.redo()
    expect(getRows(data)).toHaveLength(2)

    undo.redo()
    expect(getRows(data)).toHaveLength(1)
  })

  it('undoes/redoes column type changes and board grouping updates', () => {
    const { data, undo } = createDatabaseDoc()

    const columns = getColumns(data)
    data.set(
      'columns',
      columns.map((col) =>
        col.id === 'status'
          ? {
              ...col,
              type: 'multiSelect',
              config: {
                options: [
                  { id: 'todo', name: 'To Do', color: '#9ca3af' },
                  { id: 'done', name: 'Done', color: '#22c55e' }
                ],
                allowCreate: true
              }
            }
          : col
      )
    )

    data.set('boardView', {
      ...(data.get('boardView') as Record<string, unknown>),
      groupByProperty: 'status'
    })

    const statusColumnAfter = getColumns(data).find((col) => col.id === 'status')
    expect(statusColumnAfter?.type).toBe('multiSelect')

    undo.undo()
    expect((data.get('boardView') as { groupByProperty?: string }).groupByProperty).toBe('status')

    undo.undo()
    const statusColumnUndone = getColumns(data).find((col) => col.id === 'status')
    expect(statusColumnUndone?.type).toBe('select')

    undo.redo()
    const statusColumnRedone = getColumns(data).find((col) => col.id === 'status')
    expect(statusColumnRedone?.type).toBe('multiSelect')
  })

  it('supports long local undo/redo chains', () => {
    const { data, undo } = createDatabaseDoc()

    for (let i = 0; i < 20; i += 1) {
      data.set(
        'rows',
        getRows(data).map((row) => (row.id === 'row-1' ? { ...row, title: `Title ${i}` } : row))
      )
    }

    expect((getRows(data)[0].title as string) ?? '').toBe('Title 19')

    for (let i = 0; i < 20; i += 1) {
      undo.undo()
    }
    expect((getRows(data)[0].title as string) ?? '').toBe('Initial')

    for (let i = 0; i < 20; i += 1) {
      undo.redo()
    }
    expect((getRows(data)[0].title as string) ?? '').toBe('Title 19')
  })
})
