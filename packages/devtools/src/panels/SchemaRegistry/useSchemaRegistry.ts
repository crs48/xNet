/**
 * Hook for the Schema Registry panel
 */

import { schemaRegistry } from '@xnet/data'
import { useState, useEffect, useCallback } from 'react'
import { useDevTools } from '../../provider/useDevTools'

export interface PropertyInfo {
  name: string
  type: string
  required: boolean
  config?: Record<string, unknown>
}

export interface SchemaEntry {
  iri: string
  name: string
  namespace: string
  nodeCount: number
  propertyCount: number
  properties: PropertyInfo[]
  documentType?: string
  extendsSchema?: string
  isBuiltIn: boolean
}

export function useSchemaRegistry() {
  const { store } = useDevTools()
  const [schemas, setSchemas] = useState<SchemaEntry[]>([])
  const [selectedSchema, setSelectedSchema] = useState<SchemaEntry | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!store) {
      setIsLoading(false)
      return
    }

    const load = async () => {
      try {
        const nodes = await store.list()

        // Count nodes per schema
        const nodeCounts = new Map<string, number>()
        for (const node of nodes) {
          nodeCounts.set(node.schemaId, (nodeCounts.get(node.schemaId) || 0) + 1)
        }

        // Get all schema IRIs (both from nodes and registered)
        const allIris = new Set([...nodeCounts.keys(), ...schemaRegistry.getAllIRIs()])

        // Build entries with full schema details
        const entries: SchemaEntry[] = []

        for (const iri of allIris) {
          const parts = iri.split('/')
          const name = parts.pop() || iri
          const namespace = parts.join('/') + '/'
          const nodeCount = nodeCounts.get(iri) || 0
          const isBuiltIn = schemaRegistry.isBuiltIn(iri as any)

          // Try to get full schema definition
          let properties: PropertyInfo[] = []
          let documentType: string | undefined
          let extendsSchema: string | undefined

          try {
            const definedSchema = await schemaRegistry.get(iri as any)
            if (definedSchema) {
              properties = definedSchema.schema.properties.map((p) => ({
                name: p.name,
                type: p.type,
                required: p.required,
                config: p.config
              }))
              documentType = definedSchema.schema.document
              extendsSchema = definedSchema.schema.extends
            }
          } catch {
            // Schema not in registry, that's ok
          }

          entries.push({
            iri,
            name,
            namespace,
            nodeCount,
            propertyCount: properties.length,
            properties,
            documentType,
            extendsSchema,
            isBuiltIn
          })
        }

        setSchemas(entries.sort((a, b) => a.name.localeCompare(b.name)))
      } catch (e) {
        console.error('[DevTools] Failed to load schemas:', e)
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [store])

  const selectSchema = useCallback((schema: SchemaEntry | null) => {
    setSelectedSchema(schema)
  }, [])

  return {
    schemas,
    selectedSchema,
    setSelectedSchema: selectSchema,
    isLoading
  }
}
