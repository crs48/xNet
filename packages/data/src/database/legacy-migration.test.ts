import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { createDID } from '@xnetjs/identity'
import { beforeEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { DatabaseSchema } from '../schema/schemas/database'
import { MemoryNodeStorageAdapter } from '../store/memory-adapter'
import { NodeStore } from '../store/store'
import { getColumns } from './column-operations'
import { getLegacyDatabaseMigrationStatus, migrateLegacyDatabaseDocument } from './legacy-migration'
import { getDatabaseDocumentModel } from './legacy-model'
import { queryRows } from './row-operations'
import { getViews } from './view-operations'

function createTestStore(): { store: NodeStore; did: DID } {
  const keyPair = generateSigningKeyPair()
  const did = createDID(keyPair.publicKey) as DID
  const store = new NodeStore({
    storage: new MemoryNodeStorageAdapter(),
    authorDID: did,
    signingKey: keyPair.privateKey
  })

  return { store, did }
}

async function createTestDatabase(store: NodeStore): Promise<string> {
  const database = await store.create({
    schemaId: DatabaseSchema.schema['@id'],
    properties: {
      title: 'Legacy Database',
      defaultView: 'table'
    }
  })

  return database.id
}

function createLegacyDatabaseDoc(): Y.Doc {
  const doc = new Y.Doc({ guid: 'legacy-db', gc: false })
  const dataMap = doc.getMap('data')

  dataMap.set('columns', [
    {
      id: 'title',
      name: 'Title',
      type: 'text',
      config: {},
      isTitle: true,
      width: 280
    },
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

  dataMap.set('rows', [
    { id: 'row-1', title: 'Alpha', status: 'todo' },
    { id: 'row-2', title: 'Beta', status: 'done' }
  ])

  dataMap.set('tableView', {
    id: 'table-view',
    name: 'Table View',
    type: 'table',
    visibleProperties: ['title', 'status'],
    propertyWidths: { title: 280, status: 160 },
    sorts: []
  })

  dataMap.set('boardView', {
    id: 'board-view',
    name: 'Board View',
    type: 'board',
    visibleProperties: ['title', 'status'],
    sorts: [],
    groupByProperty: 'status'
  })

  return doc
}

describe('legacy database migration', () => {
  let store: NodeStore
  let databaseId: string

  beforeEach(async () => {
    const setup = createTestStore()
    store = setup.store
    await store.initialize()
    databaseId = await createTestDatabase(store)
  })

  it('derives a pending migration status for pure legacy docs', () => {
    const doc = createLegacyDatabaseDoc()

    expect(getDatabaseDocumentModel(doc)).toBe('legacy')
    expect(getLegacyDatabaseMigrationStatus(doc)).toMatchObject({
      state: 'pending',
      sourceModel: 'legacy',
      legacyColumns: 2,
      legacyViews: 2,
      legacyRows: 2,
      migratedColumns: 0,
      migratedViews: 0,
      migratedRows: 0
    })
  })

  it('materializes legacy schema and rows into the canonical model', async () => {
    const doc = createLegacyDatabaseDoc()

    const status = await migrateLegacyDatabaseDocument(store, databaseId, doc)
    const { rows } = await queryRows(store, databaseId, { limit: 10 })
    const database = await store.get(databaseId)

    expect(status).toMatchObject({
      state: 'completed',
      sourceModel: 'legacy',
      legacyColumns: 2,
      legacyViews: 2,
      legacyRows: 2,
      migratedColumns: 2,
      migratedViews: 2,
      migratedRows: 2
    })

    expect(getDatabaseDocumentModel(doc)).toBe('mixed')
    expect(getColumns(doc).map((column) => column.id)).toEqual(['title', 'status'])
    expect(
      getViews(doc)
        .map((view) => view.id)
        .sort()
    ).toEqual(['board-view', 'table-view'])
    expect(rows.map((row) => row.id)).toEqual(['row-1', 'row-2'])
    expect(rows[0].cells).toEqual({ title: 'Alpha', status: 'todo' })
    expect(rows[1].cells).toEqual({ title: 'Beta', status: 'done' })
    expect(database?.properties.rowCount).toBe(2)
    expect(getLegacyDatabaseMigrationStatus(doc)?.state).toBe('completed')
  })

  it('is idempotent when rerun after completion', async () => {
    const doc = createLegacyDatabaseDoc()

    await migrateLegacyDatabaseDocument(store, databaseId, doc)
    const second = await migrateLegacyDatabaseDocument(store, databaseId, doc)
    const { rows } = await queryRows(store, databaseId, { limit: 10 })

    expect(second.state).toBe('completed')
    expect(rows.map((row) => row.id)).toEqual(['row-1', 'row-2'])
  })
})
