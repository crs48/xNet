/**
 * useDatabaseSchema - Hook for database-defined schema access
 *
 * Provides reactive access to a database's schema metadata and properties.
 * Works with the schema registry to resolve database-defined schemas.
 *
 * @example
 * ```tsx
 * const {
 *   schema,
 *   metadata,
 *   loading,
 *   error
 * } = useDatabaseSchema(databaseId)
 *
 * // Access schema version
 * console.log(metadata?.version) // "1.2.0"
 *
 * // Access schema properties
 * schema?.properties.forEach(prop => console.log(prop.name))
 * ```
 */

import type { Schema, DatabaseSchemaMetadata } from '@xnet/data'
import { extractSchemaFromDoc } from '@xnet/data'
import { useState, useEffect, useMemo, useRef } from 'react'
import * as Y from 'yjs'
import { useNodeStore } from './useNodeStore'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UseDatabaseSchemaResult {
  /** The resolved Schema object, or null if not loaded */
  schema: Schema | null

  /** The schema metadata from the database's Y.Doc */
  metadata: DatabaseSchemaMetadata | null

  /** The schema IRI for this database */
  schemaIRI: string | null

  /** Whether the schema is loading */
  loading: boolean

  /** Any error that occurred */
  error: Error | null

  /** Force refresh the schema */
  refresh: () => void
}

// ─── Hook Implementation ─────────────────────────────────────────────────────

/**
 * Hook for accessing a database's schema.
 *
 * Loads the database's Y.Doc, extracts schema metadata and columns,
 * builds the Schema object, and registers it with the schema registry.
 *
 * @param databaseId - The database node ID
 * @returns The schema, metadata, and loading state
 */
export function useDatabaseSchema(databaseId: string | undefined): UseDatabaseSchemaResult {
  const { store, isReady } = useNodeStore()

  const [schema, setSchema] = useState<Schema | null>(null)
  const [metadata, setMetadata] = useState<DatabaseSchemaMetadata | null>(null)
  const [schemaIRI, setSchemaIRI] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Keep doc ref for cleanup
  const docRef = useRef<Y.Doc | null>(null)

  // Load and subscribe to schema changes
  useEffect(() => {
    if (!store || !isReady || !databaseId) {
      setSchema(null)
      setMetadata(null)
      setSchemaIRI(null)
      setLoading(false)
      return
    }

    let mounted = true

    const loadSchema = async () => {
      try {
        setLoading(true)
        setError(null)

        // Create a Y.Doc for this database
        const ydoc = new Y.Doc({ guid: databaseId, gc: false })

        // Load stored content if any
        const storedContent = await store.getDocumentContent(databaseId)
        if (storedContent && storedContent.length > 0) {
          Y.applyUpdate(ydoc, storedContent)
        }

        if (!mounted) {
          ydoc.destroy()
          return
        }

        docRef.current = ydoc

        // Extract schema from doc
        const extractedSchema = extractSchemaFromDoc(databaseId, ydoc)
        if (!extractedSchema) {
          // Database might not have schema metadata yet
          setSchema(null)
          setMetadata(null)
          setSchemaIRI(null)
          return
        }

        // Get metadata from doc
        const dataMap = ydoc.getMap('data')
        const meta = dataMap.get('schema') as DatabaseSchemaMetadata | undefined

        if (!mounted) return

        setSchema(extractedSchema)
        setMetadata(meta ?? null)
        setSchemaIRI(extractedSchema['@id'])

        // Note: Schema registration is handled by the remote resolver
        // (createDatabaseSchemaResolver) when consumers call schemaRegistry.get()
      } catch (err) {
        if (!mounted) return
        setError(err instanceof Error ? err : new Error(String(err)))
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void loadSchema()

    return () => {
      mounted = false
      if (docRef.current) {
        docRef.current.destroy()
        docRef.current = null
      }
    }
  }, [store, isReady, databaseId, refreshKey])

  // Subscribe to schema metadata changes in Y.Doc
  useEffect(() => {
    const doc = docRef.current
    if (!doc || !databaseId) return

    const dataMap = doc.getMap('data')

    const handleSchemaChange = () => {
      const meta = dataMap.get('schema') as DatabaseSchemaMetadata | undefined
      if (!meta) return

      // Rebuild schema with updated metadata
      const extractedSchema = extractSchemaFromDoc(databaseId, doc)
      if (extractedSchema) {
        setSchema(extractedSchema)
        setMetadata(meta)
        setSchemaIRI(extractedSchema['@id'])
      }
    }

    // Observe the 'schema' key in the data map
    dataMap.observe(handleSchemaChange)

    return () => {
      dataMap.unobserve(handleSchemaChange)
    }
  }, [databaseId, schema])

  const refresh = useMemo(
    () => () => {
      setRefreshKey((k) => k + 1)
    },
    []
  )

  return useMemo(
    () => ({
      schema,
      metadata,
      schemaIRI,
      loading,
      error,
      refresh
    }),
    [schema, metadata, schemaIRI, loading, error, refresh]
  )
}
