/**
 * Hook for the Node Explorer panel
 *
 * Loads all nodes from the store, groups by schema, and provides
 * filtering/selection state.
 */

import { useState, useEffect, useCallback, useRef, useReducer } from 'react'
import { useDevTools } from '../../provider/useDevTools'
import type { DevToolsEvent } from '../../core/types'

export interface NodeEntry {
  id: string
  schemaId: string
  schemaLabel: string
  properties: Record<string, unknown>
  deleted: boolean
  createdAt: number
  updatedAt: number
  createdBy: string
}

export function useNodeExplorer() {
  const { store, eventBus } = useDevTools()
  const [nodes, setNodes] = useState<NodeEntry[]>([])
  const [selectedNode, setSelectedNode] = useState<NodeEntry | null>(null)
  const [schemaFilter, setSchemaFilter] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Load nodes from store
  const loadNodes = useCallback(async () => {
    if (!store) return
    try {
      const allNodes = await store.list()
      const entries: NodeEntry[] = allNodes.map((n) => ({
        id: n.id,
        schemaId: n.schemaId,
        schemaLabel: n.schemaId.split('/').pop() || n.schemaId,
        properties: n.properties,
        deleted: n.deleted,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        createdBy: n.createdBy
      }))
      setNodes(entries)
    } catch (e) {
      console.error('[DevTools] Failed to load nodes:', e)
    } finally {
      setIsLoading(false)
    }
  }, [store])

  // Poll store for nodes (handles race conditions with async init)
  useEffect(() => {
    if (!store) {
      // Keep loading state true while waiting for store to initialize
      return
    }

    loadNodes()
    const interval = setInterval(loadNodes, 2000)
    return () => clearInterval(interval)
  }, [store, loadNodes])

  // Subscribe to live store events to update the list
  useEffect(() => {
    const unsub = eventBus.subscribe((event: DevToolsEvent) => {
      if (
        event.type === 'store:create' ||
        event.type === 'store:update' ||
        event.type === 'store:delete' ||
        event.type === 'store:restore' ||
        event.type === 'store:remote-change'
      ) {
        // Reload from store on any change
        if (store) {
          store.list().then((allNodes) => {
            const entries: NodeEntry[] = allNodes.map((n) => ({
              id: n.id,
              schemaId: n.schemaId,
              schemaLabel: n.schemaId.split('/').pop() || n.schemaId,
              properties: n.properties,
              deleted: n.deleted,
              createdAt: n.createdAt,
              updatedAt: n.updatedAt,
              createdBy: n.createdBy
            }))
            setNodes(entries)
          })
        }
      }
    })

    return unsub
  }, [eventBus, store])

  // Derived: unique schemas
  const schemas = [...new Set(nodes.map((n) => n.schemaId))]

  // Derived: filtered nodes
  const filteredNodes = nodes.filter((node) => {
    if (!showDeleted && node.deleted) return false
    if (schemaFilter && node.schemaId !== schemaFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        node.id.toLowerCase().includes(q) ||
        node.schemaLabel.toLowerCase().includes(q) ||
        JSON.stringify(node.properties).toLowerCase().includes(q)
      )
    }
    return true
  })

  return {
    nodes: filteredNodes,
    allNodes: nodes,
    schemas,
    selectedNode,
    setSelectedNode,
    schemaFilter,
    setSchemaFilter,
    searchQuery,
    setSearchQuery,
    showDeleted,
    setShowDeleted,
    isLoading
  }
}
