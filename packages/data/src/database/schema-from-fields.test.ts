/**
 * Tests for database-defined schemas built from field nodes (V2).
 */

import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { createDID } from '@xnetjs/identity'
import { describe, it, expect, beforeEach } from 'vitest'
import { DatabaseSchema } from '../schema/schemas/database'
import { MemoryNodeStorageAdapter } from '../store/memory-adapter'
import { NodeStore } from '../store/store'
import { createField } from './field-operations'
import {
  buildSchemaFromFields,
  getDatabaseSchemaIRI,
  createNodeDatabaseSchemaResolver,
  fieldsToStoredColumns,
  DEFAULT_DATABASE_SCHEMA_VERSION
} from './schema-from-fields'

function createTestStore(): NodeStore {
  const keyPair = generateSigningKeyPair()
  const did = createDID(keyPair.publicKey) as DID
  return new NodeStore({
    storage: new MemoryNodeStorageAdapter(),
    authorDID: did,
    signingKey: keyPair.privateKey
  })
}

describe('schema-from-fields (V2)', () => {
  let store: NodeStore
  let databaseId: string

  beforeEach(async () => {
    store = createTestStore()
    const db = await store.create({
      schemaId: DatabaseSchema.schema['@id'],
      properties: { title: 'Projects', defaultView: 'table' }
    })
    databaseId = db.id
  })

  it('builds a schema with one property per field, in field order', async () => {
    await createField(store, { databaseId, name: 'Name', type: 'text', isTitle: true })
    await createField(store, { databaseId, name: 'Status', type: 'select' })

    const schema = await buildSchemaFromFields(store, databaseId)
    expect(schema).not.toBeNull()
    expect(schema!['@id']).toBe(`xnet://xnet.fyi/db/${databaseId}@1.0.0`)
    expect(schema!.name).toBe('Projects')
    expect(schema!.properties.map((p) => p.name)).toEqual(['Name', 'Status'])
    expect(schema!.properties.map((p) => p.type)).toEqual(['text', 'select'])
  })

  it('uses schemaVersion from the database node', async () => {
    await store.update(databaseId, { properties: { schemaVersion: '1.2.3' } })

    const iri = await getDatabaseSchemaIRI(store, databaseId)
    expect(iri).toBe(`xnet://xnet.fyi/db/${databaseId}@1.2.3`)
  })

  it('defaults to 1.0.0 when no schemaVersion set', async () => {
    const iri = await getDatabaseSchemaIRI(store, databaseId)
    expect(iri).toBe(`xnet://xnet.fyi/db/${databaseId}@${DEFAULT_DATABASE_SCHEMA_VERSION}`)
  })

  it('returns null for missing databases', async () => {
    expect(await buildSchemaFromFields(store, 'missing')).toBeNull()
    expect(await getDatabaseSchemaIRI(store, 'missing')).toBeNull()
  })

  describe('createNodeDatabaseSchemaResolver', () => {
    it('resolves the current version', async () => {
      await createField(store, { databaseId, name: 'Name', type: 'text' })
      const resolver = createNodeDatabaseSchemaResolver({ store })

      const schema = await resolver(`xnet://xnet.fyi/db/${databaseId}@1.0.0` as never)
      expect(schema?.properties.map((p) => p.name)).toEqual(['Name'])
    })

    it('returns null for version mismatches and foreign IRIs', async () => {
      const resolver = createNodeDatabaseSchemaResolver({ store })
      expect(await resolver(`xnet://xnet.fyi/db/${databaseId}@9.9.9` as never)).toBeNull()
      expect(await resolver('xnet://xnet.fyi/Task@1.0.0' as never)).toBeNull()
    })
  })

  it('fieldsToStoredColumns preserves ids and configs', async () => {
    const fieldId = await createField(store, {
      databaseId,
      name: 'Amount',
      type: 'number',
      config: { format: 'currency', currency: 'USD' }
    })

    const { getFields } = await import('./field-operations')
    const columns = fieldsToStoredColumns(await getFields(store, databaseId))
    expect(columns).toEqual([
      {
        id: fieldId,
        name: 'Amount',
        type: 'number',
        config: { format: 'currency', currency: 'USD' }
      }
    ])
  })
})
