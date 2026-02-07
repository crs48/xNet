import { describe, it, expect, beforeEach } from 'vitest'
import * as Y from 'yjs'
import {
  getColumns,
  getColumn,
  getColumnIndex,
  getTitleColumn,
  createColumn,
  updateColumn,
  deleteColumn,
  reorderColumn,
  duplicateColumn
} from './column-operations'
import { initializeDatabaseDoc, addDefaultTitleColumn, addDefaultTableView } from './database-doc'
import { getViews } from './view-operations'

describe('Column Operations', () => {
  let doc: Y.Doc

  beforeEach(() => {
    doc = new Y.Doc()
    initializeDatabaseDoc(doc)
  })

  describe('createColumn', () => {
    it('adds column to array', () => {
      const id = createColumn(doc, {
        name: 'Status',
        type: 'select',
        config: {
          options: [
            { id: 'todo', name: 'To Do', color: 'gray' },
            { id: 'done', name: 'Done', color: 'green' }
          ]
        }
      })

      const columns = getColumns(doc)
      expect(columns).toHaveLength(1)
      expect(columns[0].id).toBe(id)
      expect(columns[0].name).toBe('Status')
      expect(columns[0].type).toBe('select')
    })

    it('adds column to all views', () => {
      addDefaultTableView(doc)

      const id = createColumn(doc, {
        name: 'New Column',
        type: 'text',
        config: {}
      })

      const views = getViews(doc)
      expect(views[0].visibleColumns).toContain(id)
    })

    it('creates column with width', () => {
      const id = createColumn(doc, {
        name: 'Wide Column',
        type: 'text',
        config: {},
        width: 400
      })

      const column = getColumn(doc, id)
      expect(column?.width).toBe(400)
    })

    it('creates title column', () => {
      const id = createColumn(doc, {
        name: 'Title',
        type: 'text',
        config: {},
        isTitle: true
      })

      const column = getColumn(doc, id)
      expect(column?.isTitle).toBe(true)
    })
  })

  describe('getColumn', () => {
    it('returns column by ID', () => {
      const id = createColumn(doc, {
        name: 'Status',
        type: 'select',
        config: { options: [] }
      })

      const column = getColumn(doc, id)
      expect(column).not.toBeNull()
      expect(column?.name).toBe('Status')
    })

    it('returns null for non-existent column', () => {
      const column = getColumn(doc, 'non-existent')
      expect(column).toBeNull()
    })
  })

  describe('getColumnIndex', () => {
    it('returns correct index', () => {
      const id1 = createColumn(doc, { name: 'A', type: 'text', config: {} })
      const id2 = createColumn(doc, { name: 'B', type: 'text', config: {} })
      const id3 = createColumn(doc, { name: 'C', type: 'text', config: {} })

      expect(getColumnIndex(doc, id1)).toBe(0)
      expect(getColumnIndex(doc, id2)).toBe(1)
      expect(getColumnIndex(doc, id3)).toBe(2)
    })

    it('returns -1 for non-existent column', () => {
      expect(getColumnIndex(doc, 'non-existent')).toBe(-1)
    })
  })

  describe('getTitleColumn', () => {
    it('returns title column', () => {
      addDefaultTitleColumn(doc)

      const titleColumn = getTitleColumn(doc)
      expect(titleColumn).not.toBeNull()
      expect(titleColumn?.isTitle).toBe(true)
      expect(titleColumn?.name).toBe('Title')
    })

    it('returns null when no title column', () => {
      createColumn(doc, { name: 'Not Title', type: 'text', config: {} })

      const titleColumn = getTitleColumn(doc)
      expect(titleColumn).toBeNull()
    })
  })

  describe('updateColumn', () => {
    it('updates column name', () => {
      const id = createColumn(doc, {
        name: 'Status',
        type: 'select',
        config: { options: [] }
      })

      updateColumn(doc, id, { name: 'Project Status' })

      const column = getColumn(doc, id)
      expect(column?.name).toBe('Project Status')
    })

    it('updates column type', () => {
      const id = createColumn(doc, {
        name: 'Field',
        type: 'text',
        config: {}
      })

      updateColumn(doc, id, { type: 'number' })

      const column = getColumn(doc, id)
      expect(column?.type).toBe('number')
    })

    it('updates column config', () => {
      const id = createColumn(doc, {
        name: 'Status',
        type: 'select',
        config: { options: [] }
      })

      updateColumn(doc, id, {
        config: {
          options: [{ id: 'new', name: 'New Option', color: 'blue' }]
        }
      })

      const column = getColumn(doc, id)
      expect((column?.config as { options: unknown[] }).options).toHaveLength(1)
    })

    it('updates column width', () => {
      const id = createColumn(doc, {
        name: 'Field',
        type: 'text',
        config: {}
      })

      updateColumn(doc, id, { width: 250 })

      const column = getColumn(doc, id)
      expect(column?.width).toBe(250)
    })

    it('does nothing for non-existent column', () => {
      // Should not throw
      updateColumn(doc, 'non-existent', { name: 'New Name' })
    })
  })

  describe('deleteColumn', () => {
    it('removes column from array', () => {
      const id = createColumn(doc, {
        name: 'Status',
        type: 'text',
        config: {}
      })

      deleteColumn(doc, id)

      const columns = getColumns(doc)
      expect(columns).toHaveLength(0)
    })

    it('removes from view visibility', () => {
      addDefaultTableView(doc)
      const id = createColumn(doc, {
        name: 'Status',
        type: 'text',
        config: {}
      })

      deleteColumn(doc, id)

      const views = getViews(doc)
      expect(views[0].visibleColumns).not.toContain(id)
    })

    it('handles deleting non-existent column', () => {
      // Should not throw
      deleteColumn(doc, 'non-existent')
    })
  })

  describe('reorderColumn', () => {
    it('moves column to new position', () => {
      const id1 = createColumn(doc, { name: 'A', type: 'text', config: {} })
      const id2 = createColumn(doc, { name: 'B', type: 'text', config: {} })
      const id3 = createColumn(doc, { name: 'C', type: 'text', config: {} })

      reorderColumn(doc, id3, 0)

      const columns = getColumns(doc)
      expect(columns.map((c) => c.id)).toEqual([id3, id1, id2])
    })

    it('moves column to end', () => {
      const id1 = createColumn(doc, { name: 'A', type: 'text', config: {} })
      const id2 = createColumn(doc, { name: 'B', type: 'text', config: {} })
      const id3 = createColumn(doc, { name: 'C', type: 'text', config: {} })

      reorderColumn(doc, id1, 2)

      const columns = getColumns(doc)
      expect(columns.map((c) => c.id)).toEqual([id2, id3, id1])
    })

    it('handles same position', () => {
      const id1 = createColumn(doc, { name: 'A', type: 'text', config: {} })
      const id2 = createColumn(doc, { name: 'B', type: 'text', config: {} })

      reorderColumn(doc, id1, 0)

      const columns = getColumns(doc)
      expect(columns.map((c) => c.id)).toEqual([id1, id2])
    })

    it('handles non-existent column', () => {
      createColumn(doc, { name: 'A', type: 'text', config: {} })

      // Should not throw
      reorderColumn(doc, 'non-existent', 0)
    })

    it('clamps index to valid range', () => {
      const id1 = createColumn(doc, { name: 'A', type: 'text', config: {} })
      const id2 = createColumn(doc, { name: 'B', type: 'text', config: {} })

      reorderColumn(doc, id1, 100)

      const columns = getColumns(doc)
      expect(columns.map((c) => c.id)).toEqual([id2, id1])
    })
  })

  describe('duplicateColumn', () => {
    it('creates copy with new name', () => {
      const id = createColumn(doc, {
        name: 'Status',
        type: 'select',
        config: { options: [{ id: 'a', name: 'A' }] },
        width: 200
      })

      const copyId = duplicateColumn(doc, id, 'Status Copy')

      expect(copyId).not.toBeNull()
      const copy = getColumn(doc, copyId!)
      expect(copy?.name).toBe('Status Copy')
      expect(copy?.type).toBe('select')
      expect(copy?.width).toBe(200)
    })

    it('uses default name if not provided', () => {
      const id = createColumn(doc, {
        name: 'Status',
        type: 'text',
        config: {}
      })

      const copyId = duplicateColumn(doc, id)

      const copy = getColumn(doc, copyId!)
      expect(copy?.name).toBe('Status (Copy)')
    })

    it('does not copy isTitle', () => {
      const id = createColumn(doc, {
        name: 'Title',
        type: 'text',
        config: {},
        isTitle: true
      })

      const copyId = duplicateColumn(doc, id)

      const copy = getColumn(doc, copyId!)
      expect(copy?.isTitle).toBeUndefined()
    })

    it('returns null for non-existent column', () => {
      const copyId = duplicateColumn(doc, 'non-existent')
      expect(copyId).toBeNull()
    })
  })
})

describe('CRDT Behavior', () => {
  it('merges concurrent column renames', () => {
    const doc1 = new Y.Doc()
    const doc2 = new Y.Doc()

    initializeDatabaseDoc(doc1)
    const colId = createColumn(doc1, { name: 'Status', type: 'text', config: {} })

    // Sync doc1 -> doc2
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))

    // Concurrent updates
    updateColumn(doc1, colId, { name: 'Project Status' })
    updateColumn(doc2, colId, { width: 200 })

    // Sync both ways
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
    Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))

    // Both changes should merge
    const col1 = getColumn(doc1, colId)
    const col2 = getColumn(doc2, colId)

    expect(col1?.name).toBe('Project Status')
    expect(col1?.width).toBe(200)
    expect(col2?.name).toBe('Project Status')
    expect(col2?.width).toBe(200)
  })

  it('syncs column order across devices', () => {
    const doc1 = new Y.Doc()
    const doc2 = new Y.Doc()

    initializeDatabaseDoc(doc1)
    const id1 = createColumn(doc1, { name: 'A', type: 'text', config: {} })
    const id2 = createColumn(doc1, { name: 'B', type: 'text', config: {} })
    const id3 = createColumn(doc1, { name: 'C', type: 'text', config: {} })

    // Sync doc1 -> doc2
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))

    // Reorder on doc1
    reorderColumn(doc1, id3, 0)

    // Sync doc1 -> doc2
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))

    // Both should have same order
    const cols1 = getColumns(doc1).map((c) => c.id)
    const cols2 = getColumns(doc2).map((c) => c.id)

    expect(cols1).toEqual([id3, id1, id2])
    expect(cols2).toEqual([id3, id1, id2])
  })
})
