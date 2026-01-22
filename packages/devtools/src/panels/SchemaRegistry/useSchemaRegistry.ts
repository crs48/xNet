/**
 * Hook for the Schema Registry panel
 */

import { useState, useEffect } from 'react'
import { useDevTools } from '../../provider/useDevTools'

export interface SchemaEntry {
  iri: string
  name: string
  namespace: string
  propertyCount: number
}

export function useSchemaRegistry() {
  const { store } = useDevTools()
  const [schemas, setSchemas] = useState<SchemaEntry[]>([])
  const [selectedSchema, setSelectedSchema] = useState<SchemaEntry | null>(null)
  const [selectedSchemaDetail, setSelectedSchemaDetail] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // SchemaRegistry is available on the store or via direct import
    // For now, we derive schemas from the nodes in the store
    if (!store) {
      setIsLoading(false)
      return
    }

    const load = async () => {
      try {
        const nodes = await store.list()
        const schemaMap = new Map<string, { count: number }>()

        for (const node of nodes) {
          const existing = schemaMap.get(node.schemaId)
          if (existing) {
            existing.count++
          } else {
            schemaMap.set(node.schemaId, { count: 1 })
          }
        }

        const entries: SchemaEntry[] = [...schemaMap.entries()].map(([iri, { count }]) => {
          const parts = iri.split('/')
          const name = parts.pop() || iri
          const namespace = parts.join('/')
          return {
            iri,
            name,
            namespace,
            propertyCount: count // Using count as a proxy - real impl would read schema defs
          }
        })

        setSchemas(entries.sort((a, b) => a.name.localeCompare(b.name)))
      } catch (e) {
        console.error('[DevTools] Failed to load schemas:', e)
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [store])

  return {
    schemas,
    selectedSchema,
    setSelectedSchema,
    selectedSchemaDetail,
    isLoading
  }
}
