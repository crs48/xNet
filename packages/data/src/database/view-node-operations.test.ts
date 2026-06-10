/**
 * Tests for V2 view operations (views as nodes).
 */

import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { createDID } from '@xnetjs/identity'
import { describe, it, expect, beforeEach } from 'vitest'
import { DatabaseSchema } from '../schema/schemas/database'
import { MemoryNodeStorageAdapter } from '../store/memory-adapter'
import { NodeStore } from '../store/store'
import { setupDatabase } from './database-setup'
import { createField, getFields } from './field-operations'
import {
  createView,
  getView,
  getViews,
  updateView,
  deleteView,
  duplicateView,
  moveView,
  setViewFilters,
  setViewSorts,
  setViewGroupBy,
  toggleViewGroupCollapsed,
  setFieldHidden,
  setViewFieldWidth,
  setViewFieldOrder,
  effectiveFieldSortKey
} from './view-node-operations'

function createTestStore(): NodeStore {
  const keyPair = generateSigningKeyPair()
  const did = createDID(keyPair.publicKey) as DID
  return new NodeStore({
    storage: new MemoryNodeStorageAdapter(),
    authorDID: did,
    signingKey: keyPair.privateKey
  })
}

describe('view node operations (V2)', () => {
  let store: NodeStore
  let databaseId: string

  beforeEach(async () => {
    store = createTestStore()
    const db = await store.create({
      schemaId: DatabaseSchema.schema['@id'],
      properties: { title: 'Test Database', defaultView: 'table' }
    })
    databaseId = db.id
  })

  describe('createView / getViews', () => {
    it('creates views in tab order', async () => {
      await createView(store, { databaseId, name: 'Table', type: 'table' })
      await createView(store, { databaseId, name: 'Board', type: 'board' })

      const views = await getViews(store, databaseId)
      expect(views.map((v) => v.name)).toEqual(['Table', 'Board'])
      expect(views[0].type).toBe('table')
      expect(views[1].type).toBe('board')
    })

    it('scopes views to their database', async () => {
      const other = await store.create({
        schemaId: DatabaseSchema.schema['@id'],
        properties: { title: 'Other', defaultView: 'table' }
      })
      await createView(store, { databaseId, name: 'Mine', type: 'table' })
      await createView(store, { databaseId: other.id, name: 'Theirs', type: 'table' })

      const views = await getViews(store, databaseId)
      expect(views.map((v) => v.name)).toEqual(['Mine'])
    })
  })

  describe('updateView', () => {
    it('updates name and type-specific settings', async () => {
      const id = await createView(store, { databaseId, name: 'Gallery', type: 'gallery' })
      await updateView(store, id, { name: 'Photos', coverField: 'f1', cardSize: 'large' })

      const view = await getView(store, id)
      expect(view?.name).toBe('Photos')
      expect(view?.coverField).toBe('f1')
      expect(view?.cardSize).toBe('large')
    })
  })

  describe('filters / sorts / grouping', () => {
    let viewId: string

    beforeEach(async () => {
      viewId = await createView(store, { databaseId, name: 'Table', type: 'table' })
    })

    it('round-trips a filter tree', async () => {
      const filters = {
        operator: 'and' as const,
        conditions: [{ columnId: 'status', operator: 'equals' as const, value: 'done' }]
      }
      await setViewFilters(store, viewId, filters)
      expect((await getView(store, viewId))?.filters).toEqual(filters)

      await setViewFilters(store, viewId, null)
      expect((await getView(store, viewId))?.filters).toBeNull()
    })

    it('round-trips sorts', async () => {
      const sorts = [{ columnId: 'due', direction: 'desc' as const }]
      await setViewSorts(store, viewId, sorts)
      expect((await getView(store, viewId))?.sorts).toEqual(sorts)
    })

    it('sets groupBy and toggles collapsed groups', async () => {
      await setViewGroupBy(store, viewId, 'status', 'asc')
      let view = await getView(store, viewId)
      expect(view?.groupBy).toBe('status')
      expect(view?.groupSort).toBe('asc')

      await toggleViewGroupCollapsed(store, viewId, 'done')
      view = await getView(store, viewId)
      expect(view?.collapsedGroups).toEqual(['done'])

      await toggleViewGroupCollapsed(store, viewId, 'done')
      view = await getView(store, viewId)
      expect(view?.collapsedGroups).toEqual([])
    })
  })

  describe('per-view layout overrides', () => {
    let viewId: string

    beforeEach(async () => {
      viewId = await createView(store, { databaseId, name: 'Table', type: 'table' })
    })

    it('hides and shows fields per view', async () => {
      await setFieldHidden(store, viewId, 'f1', true)
      expect((await getView(store, viewId))?.hiddenFields).toEqual(['f1'])

      await setFieldHidden(store, viewId, 'f1', false)
      expect((await getView(store, viewId))?.hiddenFields).toEqual([])
    })

    it('stores width overrides per field', async () => {
      await setViewFieldWidth(store, viewId, 'f1', 320)
      await setViewFieldWidth(store, viewId, 'f2', 80)
      expect((await getView(store, viewId))?.fieldWidths).toEqual({ f1: 320, f2: 80 })
    })

    it('field order overrides beat field sortKeys', async () => {
      await setViewFieldOrder(store, viewId, 'f1', 'zz')
      const view = await getView(store, viewId)

      expect(effectiveFieldSortKey(view!, { id: 'f1', sortKey: 'a0' })).toBe('zz')
      expect(effectiveFieldSortKey(view!, { id: 'f2', sortKey: 'a1' })).toBe('a1')
    })
  })

  describe('duplicateView', () => {
    it('copies configuration and positions the copy after the source', async () => {
      const id = await createView(store, { databaseId, name: 'Tasks', type: 'table' })
      await createView(store, { databaseId, name: 'Last', type: 'list' })
      await setViewFilters(store, id, {
        operator: 'or',
        conditions: [{ columnId: 'p', operator: 'equals', value: 'high' }]
      })
      await setViewFieldWidth(store, id, 'f1', 200)

      const copyId = await duplicateView(store, id)
      const views = await getViews(store, databaseId)
      expect(views.map((v) => v.name)).toEqual(['Tasks', 'Tasks (Copy)', 'Last'])

      const copy = await getView(store, copyId!)
      expect(copy?.filters).toEqual({
        operator: 'or',
        conditions: [{ columnId: 'p', operator: 'equals', value: 'high' }]
      })
      expect(copy?.fieldWidths).toEqual({ f1: 200 })
    })
  })

  describe('moveView / deleteView', () => {
    it('reorders view tabs', async () => {
      await createView(store, { databaseId, name: 'A', type: 'table' })
      await createView(store, { databaseId, name: 'B', type: 'board' })
      await createView(store, { databaseId, name: 'C', type: 'list' })

      const [a, , c] = await getViews(store, databaseId)
      await moveView(store, c.id, { before: a.sortKey })

      const views = await getViews(store, databaseId)
      expect(views.map((v) => v.name)).toEqual(['C', 'A', 'B'])
    })

    it('deletes a view', async () => {
      const id = await createView(store, { databaseId, name: 'Gone', type: 'table' })
      await deleteView(store, id)
      expect(await getView(store, id)).toBeNull()
      expect(await getViews(store, databaseId)).toEqual([])
    })
  })

  describe('setupDatabase', () => {
    it('creates a title field and default table view', async () => {
      const result = await setupDatabase(store, databaseId)

      const fields = await getFields(store, databaseId)
      expect(fields).toHaveLength(1)
      expect(fields[0].name).toBe('Name')
      expect(fields[0].isTitle).toBe(true)
      expect(fields[0].id).toBe(result.titleFieldId)

      const views = await getViews(store, databaseId)
      expect(views).toHaveLength(1)
      expect(views[0].type).toBe('table')
      expect(views[0].id).toBe(result.defaultViewId)
    })

    it('is idempotent', async () => {
      const first = await setupDatabase(store, databaseId)
      const second = await setupDatabase(store, databaseId)

      expect(second.titleFieldId).toBe(first.titleFieldId)
      expect(second.defaultViewId).toBe(first.defaultViewId)
      expect(await getFields(store, databaseId)).toHaveLength(1)
      expect(await getViews(store, databaseId)).toHaveLength(1)
    })

    it('adds a default field to an existing view-only database', async () => {
      await createField(store, { databaseId, name: 'Name', type: 'text', isTitle: true })
      const result = await setupDatabase(store, databaseId)

      expect(await getFields(store, databaseId)).toHaveLength(1)
      expect(result.titleFieldId).toBeTruthy()
    })
  })
})
