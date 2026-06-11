/**
 * Tests for V2 field operations (fields + select options as nodes).
 */

import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { createDID } from '@xnetjs/identity'
import { describe, it, expect, beforeEach } from 'vitest'
import { DatabaseSchema } from '../schema/schemas/database'
import { MemoryNodeStorageAdapter } from '../store/memory-adapter'
import { NodeStore } from '../store/store'
import {
  createField,
  getField,
  getFields,
  getTitleField,
  updateField,
  deleteField,
  moveField,
  duplicateField,
  createSelectOption,
  getSelectOptions,
  updateSelectOption,
  deleteSelectOption,
  moveSelectOption
} from './field-operations'
import { compareSortKeys } from './fractional-index'

function createTestStore(): NodeStore {
  const keyPair = generateSigningKeyPair()
  const did = createDID(keyPair.publicKey) as DID
  return new NodeStore({
    storage: new MemoryNodeStorageAdapter(),
    authorDID: did,
    signingKey: keyPair.privateKey
  })
}

async function createTestDatabase(store: NodeStore): Promise<string> {
  const db = await store.create({
    schemaId: DatabaseSchema.schema['@id'],
    properties: { title: 'Test Database', defaultView: 'table' }
  })
  return db.id
}

describe('field operations (V2)', () => {
  let store: NodeStore
  let databaseId: string

  beforeEach(async () => {
    store = createTestStore()
    databaseId = await createTestDatabase(store)
  })

  describe('createField / getFields', () => {
    it('creates fields ordered by creation when appended', async () => {
      await createField(store, { databaseId, name: 'Name', type: 'text', isTitle: true })
      await createField(store, { databaseId, name: 'Status', type: 'select' })
      await createField(store, { databaseId, name: 'Due', type: 'date' })

      const fields = await getFields(store, databaseId)
      expect(fields.map((f) => f.name)).toEqual(['Name', 'Status', 'Due'])
      expect(fields[0].isTitle).toBe(true)
      expect(fields.every((f) => typeof f.sortKey === 'string' && f.sortKey.length > 0)).toBe(true)
    })

    it('rejects invalid field types', async () => {
      await expect(
        createField(store, { databaseId, name: 'Bad', type: 'nope' as never })
      ).rejects.toThrow(/Invalid field type/)
    })

    it('inserts between two fields with before/after', async () => {
      const a = await createField(store, { databaseId, name: 'A', type: 'text' })
      const c = await createField(store, { databaseId, name: 'C', type: 'text' })
      const aNode = await getField(store, a)
      const cNode = await getField(store, c)

      await createField(store, {
        databaseId,
        name: 'B',
        type: 'text',
        after: aNode!.sortKey,
        before: cNode!.sortKey
      })

      const fields = await getFields(store, databaseId)
      expect(fields.map((f) => f.name)).toEqual(['A', 'B', 'C'])
    })

    it('does not return fields from other databases', async () => {
      const otherDb = await createTestDatabase(store)
      await createField(store, { databaseId, name: 'Mine', type: 'text' })
      await createField(store, { databaseId: otherDb, name: 'Theirs', type: 'text' })

      const fields = await getFields(store, databaseId)
      expect(fields.map((f) => f.name)).toEqual(['Mine'])
    })
  })

  describe('updateField', () => {
    it('updates only the provided properties', async () => {
      const id = await createField(store, {
        databaseId,
        name: 'Status',
        type: 'select',
        width: 120
      })

      await updateField(store, id, { name: 'Project Status' })

      const field = await getField(store, id)
      expect(field?.name).toBe('Project Status')
      expect(field?.type).toBe('select')
      expect(field?.width).toBe(120)
    })

    it('rejects invalid type changes', async () => {
      const id = await createField(store, { databaseId, name: 'X', type: 'text' })
      await expect(updateField(store, id, { type: 'bogus' as never })).rejects.toThrow(
        /Invalid field type/
      )
    })
  })

  describe('getTitleField', () => {
    it('returns the title field', async () => {
      await createField(store, { databaseId, name: 'Other', type: 'text' })
      await createField(store, { databaseId, name: 'Name', type: 'text', isTitle: true })

      const title = await getTitleField(store, databaseId)
      expect(title?.name).toBe('Name')
    })

    it('returns null when there is no title field', async () => {
      await createField(store, { databaseId, name: 'Other', type: 'text' })
      expect(await getTitleField(store, databaseId)).toBeNull()
    })
  })

  describe('moveField', () => {
    it('reorders a field between two others', async () => {
      await createField(store, { databaseId, name: 'A', type: 'text' })
      await createField(store, { databaseId, name: 'B', type: 'text' })
      await createField(store, { databaseId, name: 'C', type: 'text' })

      const [a, b, c] = await getFields(store, databaseId)
      // Move C between A and B
      await moveField(store, c.id, { after: a.sortKey, before: b.sortKey })

      const fields = await getFields(store, databaseId)
      expect(fields.map((f) => f.name)).toEqual(['A', 'C', 'B'])
    })

    it('moves a field to the start', async () => {
      await createField(store, { databaseId, name: 'A', type: 'text' })
      await createField(store, { databaseId, name: 'B', type: 'text' })

      const [a, b] = await getFields(store, databaseId)
      await moveField(store, b.id, { before: a.sortKey })

      const fields = await getFields(store, databaseId)
      expect(fields.map((f) => f.name)).toEqual(['B', 'A'])
    })
  })

  describe('deleteField', () => {
    it('deletes the field and its options', async () => {
      const id = await createField(store, { databaseId, name: 'Tags', type: 'multiSelect' })
      await createSelectOption(store, { fieldId: id, name: 'urgent' })
      await createSelectOption(store, { fieldId: id, name: 'later' })

      await deleteField(store, id)

      expect(await getField(store, id)).toBeNull()
      expect(await getSelectOptions(store, id)).toEqual([])
    })
  })

  describe('duplicateField', () => {
    it('copies config and options, positioned after the source', async () => {
      await createField(store, { databaseId, name: 'A', type: 'text' })
      const id = await createField(store, {
        databaseId,
        name: 'Status',
        type: 'select',
        width: 140
      })
      await createField(store, { databaseId, name: 'Z', type: 'text' })
      await createSelectOption(store, { fieldId: id, name: 'todo' })
      await createSelectOption(store, { fieldId: id, name: 'done' })

      const copyId = await duplicateField(store, id)
      expect(copyId).toBeTruthy()

      const fields = await getFields(store, databaseId)
      expect(fields.map((f) => f.name)).toEqual(['A', 'Status', 'Status (Copy)', 'Z'])

      const copy = await getField(store, copyId!)
      expect(copy?.type).toBe('select')
      expect(copy?.width).toBe(140)
      expect(copy?.isTitle).toBeFalsy()

      const copiedOptions = await getSelectOptions(store, copyId!)
      expect(copiedOptions.map((o) => o.name)).toEqual(['todo', 'done'])
    })

    it('returns null for unknown fields', async () => {
      expect(await duplicateField(store, 'missing')).toBeNull()
    })
  })

  describe('select options', () => {
    let fieldId: string

    beforeEach(async () => {
      fieldId = await createField(store, { databaseId, name: 'Tags', type: 'multiSelect' })
    })

    it('creates options in order with auto colors', async () => {
      await createSelectOption(store, { fieldId, name: 'urgent' })
      await createSelectOption(store, { fieldId, name: 'later' })

      const options = await getSelectOptions(store, fieldId)
      expect(options.map((o) => o.name)).toEqual(['urgent', 'later'])
      expect(options.every((o) => typeof o.color === 'string' && o.color.length > 0)).toBe(true)
      expect(compareSortKeys(options[0].sortKey, options[1].sortKey)).toBeLessThan(0)
    })

    it('auto color is deterministic by name', async () => {
      const a = await createSelectOption(store, { fieldId, name: 'same' })
      const b = await createSelectOption(store, { fieldId, name: 'same' })
      const options = await getSelectOptions(store, fieldId)
      const colorA = options.find((o) => o.id === a)?.color
      const colorB = options.find((o) => o.id === b)?.color
      expect(colorA).toBe(colorB)
    })

    it('rejects invalid colors', async () => {
      await expect(
        createSelectOption(store, { fieldId, name: 'x', color: 'magenta' as never })
      ).rejects.toThrow(/Invalid select color/)
    })

    it('renames and recolors options', async () => {
      const id = await createSelectOption(store, { fieldId, name: 'urgnt' })
      await updateSelectOption(store, id, { name: 'urgent', color: 'red' })

      const options = await getSelectOptions(store, fieldId)
      expect(options[0].name).toBe('urgent')
      expect(options[0].color).toBe('red')
    })

    it('deletes options', async () => {
      const id = await createSelectOption(store, { fieldId, name: 'gone' })
      await deleteSelectOption(store, id)
      expect(await getSelectOptions(store, fieldId)).toEqual([])
    })

    it('reorders options', async () => {
      await createSelectOption(store, { fieldId, name: 'a' })
      await createSelectOption(store, { fieldId, name: 'b' })
      await createSelectOption(store, { fieldId, name: 'c' })

      const [a, , c] = await getSelectOptions(store, fieldId)
      await moveSelectOption(store, c.id, { before: a.sortKey })

      const options = await getSelectOptions(store, fieldId)
      expect(options.map((o) => o.name)).toEqual(['c', 'a', 'b'])
    })

    it('keeps options scoped to their field', async () => {
      const other = await createField(store, { databaseId, name: 'Other', type: 'select' })
      await createSelectOption(store, { fieldId, name: 'mine' })
      await createSelectOption(store, { fieldId: other, name: 'theirs' })

      const options = await getSelectOptions(store, fieldId)
      expect(options.map((o) => o.name)).toEqual(['mine'])
    })
  })

  describe('concurrent option creation (two stores)', () => {
    it('merges cleanly — both options survive', async () => {
      // Two independent stores simulating two collaborators
      const storeA = createTestStore()
      const storeB = createTestStore()

      const dbA = await storeA.create({
        schemaId: DatabaseSchema.schema['@id'],
        properties: { title: 'Shared', defaultView: 'table' }
      })
      const fieldIdA = await createField(storeA, {
        databaseId: dbA.id,
        name: 'Tags',
        type: 'multiSelect'
      })

      // Sync A -> B (database + field)
      for (const change of await storeA.getAllChanges()) {
        await storeB.applyRemoteChange(change)
      }

      // Both create a tag concurrently
      await createSelectOption(storeA, { fieldId: fieldIdA, name: 'from-alice' })
      await createSelectOption(storeB, { fieldId: fieldIdA, name: 'from-bob' })

      // Cross-sync
      for (const change of await storeA.getAllChanges()) {
        await storeB.applyRemoteChange(change)
      }
      for (const change of await storeB.getAllChanges()) {
        await storeA.applyRemoteChange(change)
      }

      const optionsA = await getSelectOptions(storeA, fieldIdA)
      const optionsB = await getSelectOptions(storeB, fieldIdA)
      expect(optionsA.map((o) => o.name).sort()).toEqual(['from-alice', 'from-bob'])
      expect(optionsB.map((o) => o.name).sort()).toEqual(['from-alice', 'from-bob'])
    })
  })
})
