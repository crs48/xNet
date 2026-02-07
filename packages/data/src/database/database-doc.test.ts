import { describe, it, expect, beforeEach } from 'vitest'
import * as Y from 'yjs'
import { getColumns, getColumn } from './column-operations'
import {
  initializeDatabaseDoc,
  isDatabaseDocInitialized,
  addDefaultTitleColumn,
  addDefaultTableView,
  setupNewDatabase,
  getMeta,
  setMeta,
  deleteMeta
} from './database-doc'
import { getViews, getView } from './view-operations'

describe('Database Doc Initialization', () => {
  let doc: Y.Doc

  beforeEach(() => {
    doc = new Y.Doc()
  })

  describe('initializeDatabaseDoc', () => {
    it('creates columns array', () => {
      initializeDatabaseDoc(doc)

      expect(doc.share.has('columns')).toBe(true)
      const columns = doc.getArray('columns')
      expect(columns.length).toBe(0)
    })

    it('creates views map', () => {
      initializeDatabaseDoc(doc)

      expect(doc.share.has('views')).toBe(true)
      const views = doc.getMap('views')
      expect(views.size).toBe(0)
    })

    it('creates meta map', () => {
      initializeDatabaseDoc(doc)

      expect(doc.share.has('meta')).toBe(true)
      const meta = doc.getMap('meta')
      expect(meta.size).toBe(0)
    })

    it('is idempotent', () => {
      initializeDatabaseDoc(doc)
      const columns1 = doc.getArray('columns')
      columns1.push([new Y.Map()])

      initializeDatabaseDoc(doc)
      const columns2 = doc.getArray('columns')

      expect(columns2.length).toBe(1)
    })
  })

  describe('isDatabaseDocInitialized', () => {
    it('returns false for empty doc', () => {
      expect(isDatabaseDocInitialized(doc)).toBe(false)
    })

    it('returns true after initialization', () => {
      initializeDatabaseDoc(doc)
      expect(isDatabaseDocInitialized(doc)).toBe(true)
    })

    it('returns false if only partially initialized', () => {
      doc.getArray('columns')
      expect(isDatabaseDocInitialized(doc)).toBe(false)
    })
  })

  describe('addDefaultTitleColumn', () => {
    it('adds title column', () => {
      initializeDatabaseDoc(doc)

      const columnId = addDefaultTitleColumn(doc)

      const columns = getColumns(doc)
      expect(columns).toHaveLength(1)
      expect(columns[0].id).toBe(columnId)
      expect(columns[0].name).toBe('Title')
      expect(columns[0].type).toBe('text')
      expect(columns[0].isTitle).toBe(true)
      expect(columns[0].width).toBe(300)
    })
  })

  describe('addDefaultTableView', () => {
    it('adds table view', () => {
      initializeDatabaseDoc(doc)
      addDefaultTitleColumn(doc)

      const viewId = addDefaultTableView(doc)

      const views = getViews(doc)
      expect(views).toHaveLength(1)
      expect(views[0].id).toBe(viewId)
      expect(views[0].name).toBe('Default View')
      expect(views[0].type).toBe('table')
    })

    it('includes all columns in visibility', () => {
      initializeDatabaseDoc(doc)
      const colId = addDefaultTitleColumn(doc)

      const viewId = addDefaultTableView(doc)

      const view = getView(doc, viewId)
      expect(view?.visibleColumns).toContain(colId)
    })
  })

  describe('setupNewDatabase', () => {
    it('initializes doc with column and view', () => {
      const { columnId, viewId } = setupNewDatabase(doc)

      expect(isDatabaseDocInitialized(doc)).toBe(true)

      const column = getColumn(doc, columnId)
      expect(column?.name).toBe('Title')
      expect(column?.isTitle).toBe(true)

      const view = getView(doc, viewId)
      expect(view?.name).toBe('Default View')
      expect(view?.visibleColumns).toContain(columnId)
    })
  })
})

describe('Meta Operations', () => {
  let doc: Y.Doc

  beforeEach(() => {
    doc = new Y.Doc()
    initializeDatabaseDoc(doc)
  })

  describe('getMeta', () => {
    it('returns undefined for non-existent key', () => {
      const value = getMeta(doc, 'nonexistent')
      expect(value).toBeUndefined()
    })

    it('returns stored value', () => {
      setMeta(doc, 'rowCount', 42)

      const value = getMeta<number>(doc, 'rowCount')
      expect(value).toBe(42)
    })
  })

  describe('setMeta', () => {
    it('stores primitive values', () => {
      setMeta(doc, 'count', 100)
      setMeta(doc, 'name', 'test')
      setMeta(doc, 'active', true)

      expect(getMeta(doc, 'count')).toBe(100)
      expect(getMeta(doc, 'name')).toBe('test')
      expect(getMeta(doc, 'active')).toBe(true)
    })

    it('stores object values', () => {
      setMeta(doc, 'config', { a: 1, b: 'two' })

      const config = getMeta<{ a: number; b: string }>(doc, 'config')
      expect(config?.a).toBe(1)
      expect(config?.b).toBe('two')
    })

    it('overwrites existing values', () => {
      setMeta(doc, 'count', 1)
      setMeta(doc, 'count', 2)

      expect(getMeta(doc, 'count')).toBe(2)
    })
  })

  describe('deleteMeta', () => {
    it('removes value', () => {
      setMeta(doc, 'count', 42)

      deleteMeta(doc, 'count')

      expect(getMeta(doc, 'count')).toBeUndefined()
    })

    it('handles non-existent key', () => {
      // Should not throw
      deleteMeta(doc, 'nonexistent')
    })
  })
})
