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
  NodeChangeEvent,
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

/**
 * Whether a change can move a schema's entity count. Counts only shift when a
 * node appears/disappears (create / hard-delete) or its `deleted` flag flips
 * (soft-delete / restore). Plain property updates — the bulk of live traffic,
 * including every inline cell edit — leave every count untouched, so they must
 * NOT trigger the (per-schema) recount fan-out.
 */
export function changeAffectsCount(event: NodeChangeEvent): boolean {
  const existedBefore = event.previousNode != null
  const existsAfter = event.node != null
  if (existedBefore !== existsAfter) return true
  return (event.previousNode?.deleted ?? false) !== (event.node?.deleted ?? false)
}

/**
 * Only schemas that are IN USE belong in the picker. The global registry also
 * accumulates schemas registered as import side effects (plugins, labs,
 * conformance…) that the host app never touches — in a small host (the 0314
 * demos app) those outnumbered the real schemas ~20:1 and buried them. In
 * use = has rows (count > 0), appears in the current result window (covers
 * the beat between a first create and the next count pass), or is the
 * current selection (so a schema can't vanish out from under the user when
 * its last row is deleted).
 */
export function selectInUseSchemaOptions(
  candidates: readonly SchemaOption[],
  counts: ReadonlyMap<string, number>,
  observedSchemaIds: ReadonlySet<string>,
  selectedSchema: string | null
): SchemaOption[] {
  return candidates.filter(
    (option) =>
      (counts.get(option.iri) ?? 0) > 0 ||
      observedSchemaIds.has(option.iri) ||
      option.iri === selectedSchema
  )
}

export function useDataExplorer() {
  const { store } = useDevTools()

  const [registryIris, setRegistryIris] = useState<string[]>([])
  const [selectedSchema, setSelectedSchema] = useState<string | null>(null) // null = All schemas
  const [definedSchema, setDefinedSchema] = useState<Schema | null>(null)
  // Whether the selected schema's typed definition resolved. Drives the panel's
  // editability messaging: 'unresolved' means the schema isn't in the registry
  // (e.g. a plugin/app schema observed only as node data), so it stays read-only.
  const [schemaStatus, setSchemaStatus] = useState<'none' | 'loading' | 'ready' | 'unresolved'>(
    'none'
  )
  const [search, setSearch] = useState('')
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  // View prefs (sorts/filters/density/hidden columns), persisted per schema.
  const [prefs, setPrefs] = useState<DataViewPrefs>(() => loadViewPrefs(null))
  // Per-schema entity counts for the picker (keyed by option IRI). Empty until
  // the first count pass resolves. `dataVersion` bumps on each (debounced) live
  // change so the counts track creates/deletes without polling.
  const [schemaCounts, setSchemaCounts] = useState<ReadonlyMap<string, number>>(new Map())
  const [dataVersion, setDataVersion] = useState(0)
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
      setSchemaStatus('none')
      return
    }
    const candidates = Array.from(new Set([selectedSchema, baseSchemaIri(selectedSchema)]))
    setSchemaStatus('loading')
    void (async () => {
      for (const iri of candidates) {
        const sync = schemaRegistry.getSync(iri as SchemaIRI)
        if (sync) {
          if (!cancelled) {
            setDefinedSchema(sync.schema)
            setSchemaStatus('ready')
          }
          return
        }
      }
      for (const iri of candidates) {
        try {
          const defined = await schemaRegistry.get(iri as SchemaIRI)
          if (defined) {
            if (!cancelled) {
              setDefinedSchema(defined.schema)
              setSchemaStatus('ready')
            }
            return
          }
        } catch {
          // try the next candidate
        }
      }
      // Not in the registry — keep showing the (read-only, synthesized) columns
      // but let the panel explain why editing is unavailable.
      if (!cancelled) {
        setDefinedSchema(null)
        setSchemaStatus('unresolved')
      }
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
        // store.list gives no total — if we hit the limit the window is capped
        // and the true total is unknown (null), which the truncation flag uses.
        const capped = nodes.length >= DEFAULT_LIMIT
        setState({
          nodes,
          totalCount: capped ? null : nodes.length,
          plan: null,
          error: null,
          loading: false
        })
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
    // Tracks whether any change in the current debounce window could move a
    // count, so we only re-run the (N-schema) count fan-out on create/delete —
    // not on the far more frequent property updates.
    let countsDirty = false
    const unsub = store.subscribe((event) => {
      if (changeAffectsCount(event)) countsDirty = true
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        runQuery()
        if (countsDirty) {
          countsDirty = false
          setDataVersion((v) => v + 1)
        }
      }, LIVE_DEBOUNCE_MS)
    })
    return () => {
      if (timer) clearTimeout(timer)
      unsub()
    }
  }, [store, runQuery])

  // Candidate schemas: registered ∪ observed-in-results, deduped per schema
  // (the registry lists each schema under both a versioned IRI and a bare
  // alias, which would otherwise show every schema twice). Candidates feed
  // the count pass below — which doubles as usage discovery — but are NOT
  // what the picker shows; see `schemaOptions`.
  const candidateSchemaOptions = useMemo<SchemaOption[]>(
    () => buildSchemaOptions([...registryIris, ...state.nodes.map((n) => n.schemaId)]),
    [registryIris, state.nodes]
  )

  // Stable key of the IRIs we need counts for. Joining into one newline-
  // separated string (schema IRIs never contain newlines) keeps the count
  // effect from re-running when the candidate set is rebuilt with the same
  // schemas — its identity changes on every query as `state.nodes` updates.
  const countableIrisKey = useMemo(
    () => Array.from(new Set(candidateSchemaOptions.map((o) => o.iri))).join('\n'),
    [candidateSchemaOptions]
  )

  // Per-schema entity counts. We read each schema's exact total via
  // `store.query({ count: 'exact' })` — the same authorization-respecting path
  // the grid uses — so the picker counts match the rows the viewer can actually
  // see (the raw `countNodes` adapter would also count unreadable nodes). This
  // fans out to one COUNT per registered schema (dozens), so it runs only when
  // it can matter: on mount, when the schema set or `includeDeleted` changes,
  // and on a debounced *structural* change (create/delete — see `dataVersion`),
  // never on plain edits.
  useEffect(() => {
    if (!store || !countableIrisKey) {
      setSchemaCounts(new Map())
      return
    }
    let alive = true
    const iris = countableIrisKey.split('\n')
    void (async () => {
      const entries = await Promise.all(
        iris.map(async (iri): Promise<readonly [string, number] | null> => {
          try {
            const result = await store.query({
              schemaId: iri as SchemaIRI,
              includeDeleted,
              limit: 1,
              count: 'exact'
            })
            return [iri, result.totalCount ?? result.nodes.length]
          } catch {
            // A single schema's count failing shouldn't blank the others.
            return null
          }
        })
      )
      if (!alive) return
      const next = new Map<string, number>()
      for (const entry of entries) if (entry) next.set(entry[0], entry[1])
      setSchemaCounts(next)
    })()
    return () => {
      alive = false
    }
  }, [store, countableIrisKey, includeDeleted, dataVersion])

  // What the picker actually offers: only schemas that are IN USE — see
  // selectInUseSchemaOptions.
  const schemaOptions = useMemo<SchemaOption[]>(
    () =>
      selectInUseSchemaOptions(
        candidateSchemaOptions,
        schemaCounts,
        new Set<string>(state.nodes.map((n) => n.schemaId as string)),
        selectedSchema
      ),
    [candidateSchemaOptions, schemaCounts, state.nodes, selectedSchema]
  )

  // "All schemas" total = sum of the per-schema counts (i.e. across pickable
  // schemas). Null until the first count pass resolves, so the picker shows a
  // bare "All schemas" rather than a misleading 0 while counts load.
  const allCount = useMemo(() => {
    if (schemaCounts.size === 0) return null
    let sum = 0
    for (const n of schemaCounts.values()) sum += n
    return sum
  }, [schemaCounts])

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
    schemaCounts,
    allCount,
    selectedSchema,
    setSelectedSchema,
    definedSchema,
    schemaStatus,
    search,
    setSearch,
    includeDeleted,
    setIncludeDeleted,
    nodes: filteredNodes,
    totalCount: state.totalCount,
    loadedCount: state.nodes.length,
    // Window was capped: either an exact total exceeds what we loaded, or the
    // All-schemas list hit the limit (unknown total → totalCount null).
    truncated:
      state.totalCount != null
        ? state.totalCount > state.nodes.length
        : state.nodes.length >= DEFAULT_LIMIT,
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
