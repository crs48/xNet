/**
 * Database Schema Resolver
 *
 * Factory for creating a remote resolver that can fetch database-defined schemas
 * from their Y.Doc storage.
 */

import type { SchemaIRI } from '../schema/node'
import type { Schema } from '../schema/types'
import type * as Y from 'yjs'
import {
  parseDatabaseSchemaIRI,
  buildDatabaseSchema,
  type DatabaseSchemaMetadata,
  type StoredColumn
} from './schema-utils'

// ─── Types ──────────────────────────────────────────────────────────────────────

/**
 * Interface for fetching Y.Doc by document ID.
 * This allows the resolver to work with any sync mechanism.
 */
export interface DocFetcher {
  /**
   * Fetch a Y.Doc by its document ID.
   * @returns The Y.Doc, or null if not found
   */
  getDoc(docId: string): Promise<Y.Doc | null>
}

/**
 * Options for creating a database schema resolver.
 */
export interface CreateDatabaseSchemaResolverOptions {
  /** The doc fetcher to use for retrieving Y.Doc instances */
  docFetcher: DocFetcher
}

// ─── Resolver Factory ───────────────────────────────────────────────────────────

/**
 * Create a remote resolver for database-defined schemas.
 *
 * The resolver:
 * 1. Parses the IRI to extract database ID and version
 * 2. Fetches the database's Y.Doc
 * 3. Extracts schema metadata and columns
 * 4. Builds and returns the Schema object
 *
 * @example
 * const resolver = createDatabaseSchemaResolver({
 *   docFetcher: syncManager
 * })
 * schemaRegistry.setRemoteResolver(resolver)
 */
export function createDatabaseSchemaResolver(
  options: CreateDatabaseSchemaResolverOptions
): (iri: SchemaIRI) => Promise<Schema | null> {
  const { docFetcher } = options

  return async (iri: SchemaIRI): Promise<Schema | null> => {
    // Only handle database schema IRIs
    const parsed = parseDatabaseSchemaIRI(iri)
    if (!parsed) {
      return null
    }

    const { databaseId, version } = parsed

    try {
      // Fetch the database's Y.Doc
      const doc = await docFetcher.getDoc(databaseId)
      if (!doc) {
        return null
      }

      // Extract schema data from Y.Doc
      const dataMap = doc.getMap('data')
      const metadata = dataMap.get('schema') as DatabaseSchemaMetadata | undefined
      const columns = dataMap.get('columns') as StoredColumn[] | undefined

      if (!metadata || !columns) {
        return null
      }

      // Check if version matches
      if (metadata.version !== version) {
        // TODO: Could look up in schemaHistory for historical versions
        // For now, return null if version doesn't match current
        return null
      }

      // Build and return the schema
      return buildDatabaseSchema(databaseId, metadata, columns)
    } catch (error) {
      console.error(`Failed to resolve database schema ${iri}:`, error)
      return null
    }
  }
}

// ─── Schema Extraction Utilities ────────────────────────────────────────────────

/**
 * Extract schema from a loaded Y.Doc.
 * Useful for direct access without going through the resolver.
 *
 * @param databaseId - The database node ID
 * @param doc - The database's Y.Doc
 * @returns The Schema object, or null if data is missing
 */
export function extractSchemaFromDoc(databaseId: string, doc: Y.Doc): Schema | null {
  const dataMap = doc.getMap('data')
  const metadata = dataMap.get('schema') as DatabaseSchemaMetadata | undefined
  const columns = dataMap.get('columns') as StoredColumn[] | undefined

  if (!metadata || !columns) {
    return null
  }

  return buildDatabaseSchema(databaseId, metadata, columns)
}

/**
 * Get the current schema IRI for a database from its Y.Doc.
 *
 * @param databaseId - The database node ID
 * @param doc - The database's Y.Doc
 * @returns The schema IRI, or null if metadata is missing
 */
export function getSchemaIRIFromDoc(databaseId: string, doc: Y.Doc): SchemaIRI | null {
  const dataMap = doc.getMap('data')
  const metadata = dataMap.get('schema') as DatabaseSchemaMetadata | undefined

  if (!metadata) {
    return null
  }

  return `xnet://xnet.fyi/db/${databaseId}@${metadata.version}` as SchemaIRI
}
