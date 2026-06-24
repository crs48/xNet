/**
 * Data panel hook — drives the queryable node browser.
 *
 * Replaces the old NodeExplorer's `store.list()` + 2s poll with the real
 * query engine (`store.query`) plus storage-pushdown plan metadata, and live
 * `store.subscribe` updates (debounced) instead of polling. The "All schemas"
 * view falls back to `store.list()` since `store.query` needs a schemaId.
 */

import type {
  CellValue,
  FieldType,
  FilterGroup,
  NodeId,
  NodeQueryResult,
  NodeState,
  RowHeight,
  Schema,
  SchemaIRI
} from '@xnetjs/data'
import { schemaRegistry } from '@xnetjs/data'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDevTools } from '../../provider/useDevTools'
import {
  baseSchemaIri,
  buildSchemaOptions,
  coerceCellValueForType,
  type SchemaOption
} from './grid-adapter'
import { cycleSort, loadViewPrefs, saveViewPrefs, type DataViewPrefs } from './view-prefs'

export type { SchemaOption }

// A generous window so client-side filter/sort over the loaded page is
// meaningful (we slice in memory like the main database UI does).
const DEFAULT_LIMIT = 500
const LIVE_DEBOUNCE_MS = 250

type PlanMeta = NonNullable<NodeQueryResult['plan']>

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
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  // View prefs (sorts/filters/density/hidden columns), persisted per schema.
  const [prefs, setPrefs] = useState<DataViewPrefs>(() => loadViewPrefs(null))
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

  // Resolve the selected schema's definition. Built-ins are keyed by versioned
  // IRI while some registered schemas live under the bare IRI, so try both the
  // selected IRI and its version-stripped base (sync first, then lazy get()).
  useEffect(() => {
    let cancelled = false
    if (!selectedSchema) {
      setDefinedSchema(null)
      return
    }
    const candidates = Array.from(new Set([selectedSchema, baseSchemaIri(selectedSchema)]))
    void (async () => {
      for (const iri of candidates) {
        const sync = schemaRegistry.getSync(iri as SchemaIRI)
        if (sync) {
          if (!cancelled) setDefinedSchema(sync.schema)
          return
        }
      }
      for (const iri of candidates) {
        try {
          const defined = await schemaRegistry.get(iri as SchemaIRI)
          if (defined) {
            if (!cancelled) setDefinedSchema(defined.schema)
            return
          }
        } catch {
          // try the next candidate
        }
      }
      if (!cancelled) setDefinedSchema(null)
    })()
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
          // 'exact' is what actually populates totalCount under storage pushdown;
          // 'estimate'/'none' leave it undefined, so the "/ Y" total never shows.
          count: 'exact'
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
    if (!store) {
      // No store yet (disconnected / pre-init): land on a terminal empty state
      // rather than a perpetual loading spinner.
      setState({ nodes: [], totalCount: null, plan: null, error: null, loading: false })
      return
    }
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

  // Schema dropdown options: registered ∪ observed-in-results, deduped per
  // schema (the registry lists each schema under both a versioned IRI and a
  // bare alias, which would otherwise show every schema twice).
  const schemaOptions = useMemo<SchemaOption[]>(
    () => buildSchemaOptions([...registryIris, ...state.nodes.map((n) => n.schemaId)]),
    [registryIris, state.nodes]
  )

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

  // Re-hydrate view prefs whenever the selected schema changes (per-schema).
  useEffect(() => {
    setPrefs(loadViewPrefs(selectedSchema))
  }, [selectedSchema])

  // Mutate + persist prefs in one place so every change survives reload.
  const mutatePrefs = useCallback(
    (next: (prev: DataViewPrefs) => DataViewPrefs) => {
      setPrefs((prev) => {
        const merged = next(prev)
        saveViewPrefs(selectedSchema, merged)
        return merged
      })
    },
    [selectedSchema]
  )

  const toggleSort = useCallback(
    (columnId: string) => mutatePrefs((p) => ({ ...p, sorts: cycleSort(p.sorts, columnId) })),
    [mutatePrefs]
  )
  const clearSorts = useCallback(() => mutatePrefs((p) => ({ ...p, sorts: [] })), [mutatePrefs])
  const setFilters = useCallback(
    (filters: FilterGroup | null) => mutatePrefs((p) => ({ ...p, filters })),
    [mutatePrefs]
  )
  const setRowHeight = useCallback(
    (rowHeight: RowHeight) => mutatePrefs((p) => ({ ...p, rowHeight })),
    [mutatePrefs]
  )
  const toggleFieldVisible = useCallback(
    (fieldId: string, hidden: boolean) =>
      mutatePrefs((p) => ({
        ...p,
        hiddenFieldIds: hidden
          ? [...p.hiddenFieldIds, fieldId]
          : p.hiddenFieldIds.filter((id) => id !== fieldId)
      })),
    [mutatePrefs]
  )

  // Write a single edited cell back to the store. The live subscribe above
  // refreshes the grid; system columns (@@…) are never editable.
  const updateCell = useCallback(
    async (rowId: string, fieldId: string, fieldType: FieldType, value: CellValue) => {
      if (!store || fieldId.startsWith('@@')) return
      setEditError(null)
      try {
        await store.update(rowId as NodeId, {
          properties: { [fieldId]: coerceCellValueForType(value, fieldType) }
        })
      } catch (e) {
        setEditError(e instanceof Error ? e.message : String(e))
      }
    },
    [store]
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
    loadedCount: state.nodes.length,
    plan: state.plan,
    error: state.error,
    loading: state.loading,
    refresh: runQuery,
    selectedNode,
    selectedNodeId,
    setSelectedNodeId,
    editing,
    setEditing,
    editError,
    updateCell,
    // View prefs + handlers (sorts/filters/density/hidden columns)
    sorts: prefs.sorts,
    filters: prefs.filters,
    rowHeight: prefs.rowHeight,
    hiddenFieldIds: prefs.hiddenFieldIds,
    toggleSort,
    clearSorts,
    setFilters,
    setRowHeight,
    toggleFieldVisible
  }
}
