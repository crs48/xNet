/**
 * Data panel hook — drives the queryable node browser.
 *
 * Replaces the old NodeExplorer's `store.list()` + 2s poll with the real
 * query engine (`store.query`) plus storage-pushdown plan metadata, and live
 * `store.subscribe` updates (debounced) instead of polling. The "All schemas"
 * view falls back to `store.list()` since `store.query` needs a schemaId.
 */

import type { NodeQueryResult, NodeState, Schema, SchemaIRI } from '@xnetjs/data'
import { schemaRegistry } from '@xnetjs/data'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDevTools } from '../../provider/useDevTools'
import { schemaLabel } from './grid-adapter'

const DEFAULT_LIMIT = 200
const LIVE_DEBOUNCE_MS = 250

type PlanMeta = NonNullable<NodeQueryResult['plan']>

export interface SchemaOption {
  iri: string
  label: string
}

interface QueryState {
  nodes: NodeState[]
  totalCount: number | null
  plan: PlanMeta | null
  error: string | null
  loading: boolean
}

export function useDataExplorer() {
  const { store } = useDevTools()

  const [registryIris, setRegistryIris] = useState<string[]>([])
  const [selectedSchema, setSelectedSchema] = useState<string | null>(null) // null = All schemas
  const [definedSchema, setDefinedSchema] = useState<Schema | null>(null)
  const [search, setSearch] = useState('')
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [state, setState] = useState<QueryState>({
    nodes: [],
    totalCount: null,
    plan: null,
    error: null,
    loading: true
  })

  // Enumerate registered schemas once.
  useEffect(() => {
    try {
      setRegistryIris(schemaRegistry.getAllIRIs() as string[])
    } catch {
      setRegistryIris([])
    }
  }, [])

  // Resolve the selected schema's definition (built-ins lazy-load via get()).
  useEffect(() => {
    let cancelled = false
    if (!selectedSchema) {
      setDefinedSchema(null)
      return
    }
    schemaRegistry
      .get(selectedSchema as SchemaIRI)
      .then((defined) => {
        if (!cancelled) setDefinedSchema(defined?.schema ?? null)
      })
      .catch(() => {
        if (!cancelled) setDefinedSchema(null)
      })
    return () => {
      cancelled = true
    }
  }, [selectedSchema])

  const runQuery = useCallback(async () => {
    if (!store) return
    try {
      if (selectedSchema) {
        const result = await store.query({
          schemaId: selectedSchema as SchemaIRI,
          includeDeleted,
          limit: DEFAULT_LIMIT,
          orderBy: { updatedAt: 'desc' },
          count: 'estimate'
        })
        setState({
          nodes: result.nodes,
          totalCount: result.totalCount ?? result.nodes.length,
          plan: result.plan ?? null,
          error: null,
          loading: false
        })
      } else {
        const nodes = await store.list({
          includeDeleted,
          limit: DEFAULT_LIMIT,
          orderBy: { updatedAt: 'desc' }
        })
        setState({ nodes, totalCount: nodes.length, plan: null, error: null, loading: false })
      }
    } catch (e) {
      setState((prev) => ({
        ...prev,
        error: e instanceof Error ? e.message : String(e),
        loading: false
      }))
    }
  }, [store, selectedSchema, includeDeleted])

  // Initial load + live refresh (debounced) — no polling.
  useEffect(() => {
    if (!store) return
    runQuery()
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsub = store.subscribe(() => {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        runQuery()
      }, LIVE_DEBOUNCE_MS)
    })
    return () => {
      if (timer) clearTimeout(timer)
      unsub()
    }
  }, [store, runQuery])

  // Schema dropdown options: registered ∪ observed-in-results.
  const schemaOptions = useMemo<SchemaOption[]>(() => {
    const map = new Map<string, string>()
    for (const iri of registryIris) map.set(iri, schemaLabel(iri))
    for (const node of state.nodes) {
      if (!map.has(node.schemaId)) map.set(node.schemaId, schemaLabel(node.schemaId))
    }
    return Array.from(map, ([iri, label]) => ({ iri, label })).sort((a, b) =>
      a.label.localeCompare(b.label)
    )
  }, [registryIris, state.nodes])

  // Client-side free-text search over the loaded page.
  const filteredNodes = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return state.nodes
    return state.nodes.filter(
      (n) =>
        n.id.toLowerCase().includes(q) ||
        n.schemaId.toLowerCase().includes(q) ||
        JSON.stringify(n.properties).toLowerCase().includes(q)
    )
  }, [state.nodes, search])

  const selectedNode = useMemo(
    () => state.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [state.nodes, selectedNodeId]
  )

  return {
    store,
    schemaOptions,
    selectedSchema,
    setSelectedSchema,
    definedSchema,
    search,
    setSearch,
    includeDeleted,
    setIncludeDeleted,
    nodes: filteredNodes,
    totalCount: state.totalCount,
    plan: state.plan,
    error: state.error,
    loading: state.loading,
    refresh: runQuery,
    selectedNode,
    selectedNodeId,
    setSelectedNodeId
  }
}
