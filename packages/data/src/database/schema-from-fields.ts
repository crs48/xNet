/**
 * Database-defined schemas from DatabaseField nodes (V2).
 *
 * Replaces the Y.Doc extraction path (schema-resolver.ts): in the V2 model
 * the field list lives in DatabaseField nodes and the schema version lives
 * on the Database node's `schemaVersion` property.
 */

import type { FieldNode } from './field-types'
import type { SchemaIRI } from '../schema/node'
import type { Schema } from '../schema/types'
import type { NodeStore } from '../store/store'
import { getFields } from './field-operations'
import {
  buildDatabaseSchema,
  parseDatabaseSchemaIRI,
  type DatabaseSchemaMetadata,
  type StoredColumn
} from './schema-utils'

/** Default version for databases that have never bumped their schema. */
export const DEFAULT_DATABASE_SCHEMA_VERSION = '1.0.0'

/**
 * Convert field nodes to the StoredColumn shape used by schema building,
 * cloning, and templates.
 */
export function fieldsToStoredColumns(fields: FieldNode[]): StoredColumn[] {
  return fields.map((field) => ({
    id: field.id,
    name: field.name,
    // FieldType is a superset of PropertyType ('richText', 'updatedBy');
    // database-defined schemas carry those through unchanged.
    type: field.type as StoredColumn['type'],
    config: field.config as Record<string, unknown>
  }))
}

/**
 * Build the database-defined Schema for a database from its field nodes.
 * Returns null when the database doesn't exist.
 */
export async function buildSchemaFromFields(
  store: NodeStore,
  databaseId: string
): Promise<Schema | null> {
  const database = await store.get(databaseId)
  if (!database || database.deleted) return null

  const fields = await getFields(store, databaseId)
  const version =
    (database.properties.schemaVersion as string | undefined) ?? DEFAULT_DATABASE_SCHEMA_VERSION

  const metadata: DatabaseSchemaMetadata = {
    name: (database.properties.title as string | undefined) ?? 'Untitled Database',
    version,
    createdAt: database.createdAt,
    updatedAt: database.createdAt
  }

  return buildDatabaseSchema(databaseId, metadata, fieldsToStoredColumns(fields))
}

/**
 * Get the current database-defined schema IRI for a database.
 * Returns null when the database doesn't exist.
 */
export async function getDatabaseSchemaIRI(
  store: NodeStore,
  databaseId: string
): Promise<SchemaIRI | null> {
  const database = await store.get(databaseId)
  if (!database || database.deleted) return null
  const version =
    (database.properties.schemaVersion as string | undefined) ?? DEFAULT_DATABASE_SCHEMA_VERSION
  return `xnet://xnet.fyi/db/${databaseId}@${version}` as SchemaIRI
}

/**
 * Create a remote resolver for database-defined schemas backed by the
 * NodeStore (V2 replacement for createDatabaseSchemaResolver).
 *
 * @example
 * schemaRegistry.setRemoteResolver(createNodeDatabaseSchemaResolver({ store }))
 */
export function createNodeDatabaseSchemaResolver(options: {
  store: NodeStore
}): (iri: SchemaIRI) => Promise<Schema | null> {
  const { store } = options

  return async (iri: SchemaIRI): Promise<Schema | null> => {
    const parsed = parseDatabaseSchemaIRI(iri)
    if (!parsed) return null

    try {
      const schema = await buildSchemaFromFields(store, parsed.databaseId)
      if (!schema) return null
      // Only serve the current version (historical versions are not kept
      // as nodes; version history can layer on later if needed)
      if (schema.version !== parsed.version) return null
      return schema
    } catch (error) {
      console.error(`Failed to resolve database schema ${iri}:`, error)
      return null
    }
  }
}
