import type { QueryASTOrderBy, SavedViewDescriptor } from '@xnetjs/data'
import { SavedViewSchema, validateSavedViewDescriptor } from '@xnetjs/data'
import {
  useMutate,
  useQuery,
  useSavedView,
  type SavedViewQueryResult,
  type SavedViewSchemaRegistry,
  type UseSavedViewOptions
} from '@xnetjs/react'
import {
  SocialActorSchema,
  SocialCollectionSchema,
  SocialContentSchema,
  SocialConversationSchema,
  SocialImportRunSchema,
  SocialInteractionSchema,
  SocialMessageSchema,
  socialSchemas
} from '@xnetjs/social/schemas'
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Columns3,
  Database,
  GitBranch,
  Import,
  Loader2,
  MessageSquare,
  Network,
  RefreshCw,
  Search,
  Shield,
  Table,
  UserRound,
  X
} from 'lucide-react'
import React, { Fragment, useEffect, useMemo, useState } from 'react'
import {
  getDefaultSocialWorkspaceSeeds,
  upsertDefaultSocialWorkspace,
  type SocialWorkspaceSeedSummary
} from '../lib/social-workspace'

type DataWorkspaceViewProps = {
  onClose: () => void
}

type SavedViewRow = {
  id: string
  title?: string
  description?: string
  descriptor?: string
  scope?: string
}

type ParsedDescriptor = {
  valid: boolean
  queryKind: string
  queryMode: string | null
  primarySchemaId: string | null
}

type WorkspaceMetric = {
  id: string
  label: string
  value: number | null
  icon: typeof UserRound
}

type SortDirection = 'asc' | 'desc'

const SOCIAL_SCHEMA_REGISTRY = socialSchemas as unknown as SavedViewSchemaRegistry
const DEFAULT_PAGE_SIZE = 25
const SYSTEM_COLUMNS = new Set([
  'deleted',
  'createdBy',
  'updatedBy',
  '_migrationInfo',
  '_migratedFrom',
  '_unknown',
  '_unknownSchema',
  '_schemaVersion'
])
const PREFERRED_COLUMNS = [
  'title',
  'displayName',
  'handle',
  'platform',
  'contentKind',
  'interactionKind',
  'messageKind',
  'collectionKind',
  'privacyClass',
  'visibility',
  'publishedAt',
  'observedAt',
  'sentAt',
  'importedAt',
  'createdAt',
  'updatedAt',
  'id'
]

function getCount(input: { totalCount: number | null; data: unknown[] }): number | null {
  return input.totalCount ?? (input.data.length > 0 ? input.data.length : null)
}

function parseSavedViewDescriptor(value: string | undefined): ParsedDescriptor {
  if (!value) {
    return {
      valid: false,
      queryKind: 'unknown',
      queryMode: null,
      primarySchemaId: null
    }
  }

  try {
    const descriptor = JSON.parse(value) as SavedViewDescriptor
    const validation = validateSavedViewDescriptor(descriptor)
    const query = descriptor.query as Record<string, unknown>
    const queryKind = typeof query.kind === 'string' ? query.kind : 'unknown'
    const queryMode = typeof query.mode === 'string' ? query.mode : null
    const primarySchemaId =
      queryKind === 'query-set' ? primarySchemaIdForQuerySet(query) : primarySchemaIdForQuery(query)

    return {
      valid: validation.valid,
      queryKind,
      queryMode,
      primarySchemaId
    }
  } catch {
    return {
      valid: false,
      queryKind: 'invalid-json',
      queryMode: null,
      primarySchemaId: null
    }
  }
}

function primarySchemaIdForQuery(query: Record<string, unknown>): string | null {
  const schema = query.schema as Record<string, unknown> | undefined
  return typeof schema?.id === 'string'
    ? schema.id
    : typeof schema?.['@id'] === 'string'
      ? schema['@id']
      : typeof query.schemaId === 'string'
        ? query.schemaId
        : null
}

function primarySchemaIdForQuerySet(query: Record<string, unknown>): string | null {
  const queries = query.queries as Record<string, Record<string, unknown>> | undefined
  const firstQuery = queries ? Object.values(queries)[0] : null
  return firstQuery ? primarySchemaIdForQuery(firstQuery) : null
}

function metricValueLabel(value: number | null): string {
  return value === null ? '-' : value.toLocaleString()
}

function descriptorKindLabel(descriptor: ParsedDescriptor): string {
  if (!descriptor.valid) return 'Invalid'
  if (descriptor.queryKind === 'query-set') return descriptor.queryMode ?? 'query set'
  return descriptor.queryKind
}

function deriveColumns(rows: readonly Record<string, unknown>[]): string[] {
  const discovered = rows
    .flatMap((row) => Object.keys(row))
    .filter((key) => !SYSTEM_COLUMNS.has(key))
  const unique = [...new Set(discovered)]
  const preferred = PREFERRED_COLUMNS.filter((column) => unique.includes(column))
  const rest = unique
    .filter((column) => !preferred.includes(column))
    .sort((left, right) => left.localeCompare(right))

  return [...preferred, ...rest]
}

function formatCellValue(column: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'number' && column.endsWith('At') && value > 1_000_000_000_000) {
    return new Date(value).toLocaleString()
  }
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `${value.length} items`
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function shortSchemaId(schemaId: string): string {
  return schemaId.split('/').at(-1) ?? schemaId
}

function rowJson(row: Record<string, unknown>): string {
  return JSON.stringify(row, null, 2)
}

function queryRowCount(query: SavedViewQueryResult | null): string {
  if (!query) return '-'
  return metricValueLabel(query.totalCount ?? query.data.length)
}

export function DataWorkspaceView({ onClose }: DataWorkspaceViewProps): React.ReactElement {
  const { mutate } = useMutate()
  const [seedSummary, setSeedSummary] = useState<SocialWorkspaceSeedSummary | null>(null)
  const [seeding, setSeeding] = useState(false)
  const [seedError, setSeedError] = useState<string | null>(null)
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null)
  const { data: savedViews, loading: savedViewsLoading } = useQuery(SavedViewSchema, {
    orderBy: { title: 'asc' },
    limit: 200
  })
  const actorQuery = useQuery(SocialActorSchema, { page: { first: 1, count: 'estimate' } })
  const contentQuery = useQuery(SocialContentSchema, { page: { first: 1, count: 'estimate' } })
  const interactionQuery = useQuery(SocialInteractionSchema, {
    page: { first: 1, count: 'estimate' }
  })
  const messageQuery = useQuery(SocialMessageSchema, { page: { first: 1, count: 'estimate' } })
  const conversationQuery = useQuery(SocialConversationSchema, {
    page: { first: 1, count: 'estimate' }
  })
  const collectionQuery = useQuery(SocialCollectionSchema, {
    page: { first: 1, count: 'estimate' }
  })
  const importRunQuery = useQuery(SocialImportRunSchema, { page: { first: 1, count: 'estimate' } })

  const defaultSeeds = useMemo(() => getDefaultSocialWorkspaceSeeds(), [])
  const defaultSeedIds = useMemo(
    () => new Set(defaultSeeds.map((seed) => seed.deterministicId)),
    [defaultSeeds]
  )
  const socialWorkspaceViews = useMemo(
    () => (savedViews as SavedViewRow[]).filter((view) => defaultSeedIds.has(view.id)),
    [defaultSeedIds, savedViews]
  )
  const otherSavedViews = useMemo(
    () => (savedViews as SavedViewRow[]).filter((view) => !defaultSeedIds.has(view.id)),
    [defaultSeedIds, savedViews]
  )
  const allSavedViews = useMemo(
    () => [...socialWorkspaceViews, ...otherSavedViews],
    [otherSavedViews, socialWorkspaceViews]
  )
  const selectedView = useMemo(
    () =>
      allSavedViews.find((view) => view.id === selectedViewId) ??
      socialWorkspaceViews[0] ??
      allSavedViews[0] ??
      null,
    [allSavedViews, selectedViewId, socialWorkspaceViews]
  )
  const metrics: WorkspaceMetric[] = [
    {
      id: 'actors',
      label: 'People',
      value: getCount(actorQuery),
      icon: UserRound
    },
    {
      id: 'content',
      label: 'Content',
      value: getCount(contentQuery),
      icon: Table
    },
    {
      id: 'interactions',
      label: 'Interactions',
      value: getCount(interactionQuery),
      icon: Network
    },
    {
      id: 'messages',
      label: 'Messages',
      value: getCount(messageQuery),
      icon: MessageSquare
    },
    {
      id: 'conversations',
      label: 'Conversations',
      value: getCount(conversationQuery),
      icon: GitBranch
    },
    {
      id: 'collections',
      label: 'Collections',
      value: getCount(collectionQuery),
      icon: Database
    },
    {
      id: 'import-runs',
      label: 'Import Runs',
      value: getCount(importRunQuery),
      icon: Import
    }
  ]

  useEffect(() => {
    if (!selectedViewId && selectedView) {
      setSelectedViewId(selectedView.id)
      return
    }

    if (selectedViewId && !allSavedViews.some((view) => view.id === selectedViewId)) {
      setSelectedViewId(selectedView?.id ?? null)
    }
  }, [allSavedViews, selectedView, selectedViewId])

  async function handleSeedWorkspace(): Promise<void> {
    setSeeding(true)
    setSeedError(null)

    try {
      const summary = await upsertDefaultSocialWorkspace({
        mutate,
        getExisting: (id) => window.xnetNodes.getNode(id)
      })
      setSeedSummary(summary)
    } catch (error) {
      setSeedError(error instanceof Error ? error.message : String(error))
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Database size={15} />
            <span>Imported data</span>
          </div>
          <h1 className="mt-1 truncate text-lg font-semibold">Data Workspace</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={seeding}
            onClick={() => void handleSeedWorkspace()}
            className="flex items-center gap-2 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {seeding ? <Loader2 size={15} className="animate-spin" /> : <Import size={15} />}
            Seed Social Views
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Close data workspace"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
          <div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Saved views and starter graph lenses over typed xNet data, seeded by social imports.
            </p>
          </div>

          {seedSummary ? (
            <StatusBanner
              tone="success"
              message={`Workspace views ready: ${seedSummary.created} created, ${seedSummary.updated} updated.`}
            />
          ) : null}
          {seedError ? <StatusBanner tone="error" message={seedError} /> : null}

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => {
              const Icon = metric.icon

              return (
                <div key={metric.id} className="rounded-md border border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">{metric.label}</span>
                    <Icon size={16} className="text-muted-foreground" />
                  </div>
                  <div className="mt-2 text-2xl font-semibold">
                    {metricValueLabel(metric.value)}
                  </div>
                </div>
              )
            })}
          </section>

          <div className="grid min-h-[820px] grid-cols-1 overflow-hidden rounded-md border border-border lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="border-b border-border bg-secondary/40 p-4 lg:border-b-0 lg:border-r">
              <div className="space-y-4">
                <div>
                  <SectionLabel label="Sources" />
                  <div className="mt-2 space-y-2">
                    <SourceRow
                      label="Social archive imports"
                      value={metricValueLabel(getCount(importRunQuery))}
                    />
                    <SourceRow label="Saved views" value={String(savedViews.length)} />
                    <SourceRow
                      label="Starter views"
                      value={`${socialWorkspaceViews.length}/${defaultSeeds.length}`}
                    />
                  </div>
                </div>
                <div>
                  <SectionLabel label="Patterns" />
                  <div className="mt-2 space-y-2">
                    <PatternRow icon={BarChart3} label="Repeated creators" />
                    <PatternRow icon={Search} label="Cross-source overlap" />
                    <PatternRow icon={Shield} label="Privacy hotspots" />
                  </div>
                </div>
              </div>
            </aside>

            <main className="min-w-0 overflow-auto p-5">
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">Social Starter Lenses</h2>
                    <p className="text-sm text-muted-foreground">
                      Schema views and graph-lens query sets persisted as saved views.
                    </p>
                  </div>
                  {savedViewsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 size={14} className="animate-spin" />
                      Loading
                    </div>
                  ) : null}
                </div>
                <SavedViewTable
                  views={socialWorkspaceViews}
                  selectedViewId={selectedView?.id ?? null}
                  emptyLabel="No social workspace views yet."
                  onSelect={setSelectedViewId}
                />
              </section>

              <SavedViewRunner view={selectedView} />

              <section className="mt-6 space-y-3">
                <div>
                  <h2 className="text-base font-semibold">Other Saved Views</h2>
                  <p className="text-sm text-muted-foreground">
                    General saved views will use the same workspace surface as more importers land.
                  </p>
                </div>
                <SavedViewTable
                  views={otherSavedViews}
                  selectedViewId={selectedView?.id ?? null}
                  emptyLabel="No other saved views."
                  onSelect={setSelectedViewId}
                />
              </section>
            </main>
          </div>
        </div>
      </div>
    </div>
  )
}

function SavedViewRunner({ view }: { view: SavedViewRow | null }): React.ReactElement {
  const [activeQueryId, setActiveQueryId] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [sortField, setSortField] = useState('')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [pageOffset, setPageOffset] = useState(0)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [visibleColumns, setVisibleColumns] = useState<string[]>([])
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  const orderBy = useMemo<QueryASTOrderBy[] | undefined>(
    () => (sortField ? [{ field: sortField, direction: sortDirection }] : undefined),
    [sortDirection, sortField]
  )
  const options = useMemo<UseSavedViewOptions>(
    () => ({
      search: searchText.trim() || undefined,
      queryOverrides: activeQueryId
        ? {
            [activeQueryId]: {
              orderBy,
              page: {
                first: pageSize,
                offset: pageOffset,
                count: 'estimate'
              }
            }
          }
        : undefined
    }),
    [activeQueryId, orderBy, pageOffset, pageSize, searchText]
  )
  const result = useSavedView(view?.descriptor, SOCIAL_SCHEMA_REGISTRY, options)
  const resolvedActiveQueryId =
    activeQueryId && result.queries[activeQueryId] ? activeQueryId : result.primaryQueryId
  const activeQuery = resolvedActiveQueryId ? result.queries[resolvedActiveQueryId] : null
  const availableColumns = useMemo(
    () => deriveColumns((activeQuery?.data ?? []) as Record<string, unknown>[]),
    [activeQuery?.data]
  )

  useEffect(() => {
    setActiveQueryId(null)
    setSearchText('')
    setSortField('')
    setSortDirection('asc')
    setPageOffset(0)
    setExpandedRowId(null)
    setVisibleColumns([])
  }, [view?.id])

  useEffect(() => {
    if (!result.primaryQueryId) return
    if (!activeQueryId || !result.queryIds.includes(activeQueryId)) {
      setActiveQueryId(result.primaryQueryId)
    }
  }, [activeQueryId, result.primaryQueryId, result.queryIds])

  useEffect(() => {
    setPageOffset(0)
    setExpandedRowId(null)
  }, [activeQueryId, pageSize, searchText, sortDirection, sortField])

  useEffect(() => {
    setVisibleColumns((current) => {
      const kept = current.filter((column) => availableColumns.includes(column))
      if (kept.length > 0) return kept
      return availableColumns.slice(0, Math.min(8, availableColumns.length))
    })
  }, [availableColumns])

  if (!view) {
    return (
      <section className="mt-6 rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No saved view selected.
      </section>
    )
  }

  return (
    <section className="mt-6 space-y-3 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Table size={14} />
            <span>{result.kind === 'query-set' ? 'Query set' : 'Query'}</span>
          </div>
          <h2 className="mt-1 truncate text-base font-semibold">{view.title ?? result.title}</h2>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {view.description ?? result.description ?? view.id}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <PrivacyChips query={activeQuery} />
          <button
            type="button"
            onClick={result.reload}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 transition-colors hover:bg-accent"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </div>

      <Diagnostics result={result} query={activeQuery} />

      {result.queryIds.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {result.queryIds.map((queryId) => {
            const query = result.queries[queryId]
            const active = queryId === resolvedActiveQueryId

            return (
              <button
                key={queryId}
                type="button"
                onClick={() => setActiveQueryId(queryId)}
                className={[
                  'rounded-md border px-3 py-1.5 text-sm transition-colors',
                  active
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border hover:bg-accent'
                ].join(' ')}
              >
                {queryId}
                <span className="ml-2 opacity-70">{queryRowCount(query)}</span>
              </button>
            )
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <Search size={14} className="text-muted-foreground" />
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.currentTarget.value)}
            className="min-w-0 flex-1 bg-transparent outline-none"
            placeholder="Search"
          />
        </label>
        <select
          value={sortField}
          onChange={(event) => setSortField(event.currentTarget.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">Sort</option>
          {availableColumns.map((column) => (
            <option key={column} value={column}>
              {column}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))}
          className="rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-accent"
        >
          {sortDirection}
        </button>
        <select
          value={pageSize}
          onChange={(event) => setPageSize(Number(event.currentTarget.value))}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {[10, 25, 50, 100].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <details className="relative">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-accent">
            <Columns3 size={14} />
            Columns
          </summary>
          <div className="absolute right-0 z-10 mt-2 max-h-72 w-64 overflow-auto rounded-md border border-border bg-background p-2 shadow-lg">
            {availableColumns.map((column) => (
              <label key={column} className="flex items-center gap-2 rounded px-2 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={visibleColumns.includes(column)}
                  onChange={(event) => {
                    setVisibleColumns((current) =>
                      event.currentTarget.checked
                        ? [...new Set([...current, column])]
                        : current.filter((item) => item !== column)
                    )
                  }}
                />
                <span className="min-w-0 truncate">{column}</span>
              </label>
            ))}
          </div>
        </details>
      </div>

      <ResultTable
        query={activeQuery}
        visibleColumns={visibleColumns}
        expandedRowId={expandedRowId}
        onToggleRow={(rowId) => setExpandedRowId((current) => (current === rowId ? null : rowId))}
      />

      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="text-muted-foreground">
          {activeQuery ? `${activeQuery.data.length.toLocaleString()} loaded` : '0 loaded'}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pageOffset === 0}
            onClick={() => setPageOffset((current) => Math.max(0, current - pageSize))}
            className="rounded-md border border-border px-3 py-1.5 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
          >
            Previous
          </button>
          <span className="text-muted-foreground">{pageOffset + 1}</span>
          <button
            type="button"
            disabled={!activeQuery?.hasMore}
            onClick={() => setPageOffset((current) => current + pageSize)}
            className="rounded-md border border-border px-3 py-1.5 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  )
}

function Diagnostics({
  result,
  query
}: {
  result: ReturnType<typeof useSavedView>
  query: SavedViewQueryResult | null
}): React.ReactElement | null {
  const blockers = [...new Set([...result.blockers, ...(query?.blockers ?? [])])]
  const warnings = [...new Set([...result.warnings, ...(query?.warnings ?? [])])]

  if (blockers.length === 0 && warnings.length === 0 && !result.error && !query?.error) {
    return null
  }

  return (
    <div className="space-y-2">
      {result.error || query?.error ? (
        <StatusBanner tone="error" message={(query?.error ?? result.error)?.message ?? 'Error'} />
      ) : null}
      {blockers.map((blocker) => (
        <StatusBanner key={blocker} tone="error" message={blocker} />
      ))}
      {warnings.map((warning) => (
        <StatusBanner key={warning} tone="warning" message={warning} />
      ))}
    </div>
  )
}

function PrivacyChips({
  query
}: {
  query: SavedViewQueryResult | null
}): React.ReactElement | null {
  if (!query || Object.keys(query.privacy.counts).length === 0) return null

  return (
    <>
      {Object.entries(query.privacy.counts).map(([privacyClass, count]) => (
        <span key={privacyClass} className="rounded-md border border-border px-2 py-1">
          {privacyClass}: {count.toLocaleString()}
        </span>
      ))}
    </>
  )
}

function ResultTable({
  query,
  visibleColumns,
  expandedRowId,
  onToggleRow
}: {
  query: SavedViewQueryResult | null
  visibleColumns: string[]
  expandedRowId: string | null
  onToggleRow: (rowId: string) => void
}): React.ReactElement {
  if (!query || query.loading) {
    return (
      <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
        <Loader2 size={16} className="mr-2 animate-spin" />
        Loading
      </div>
    )
  }

  if (query.data.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No rows.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-9 px-3 py-2 font-medium" />
              {visibleColumns.map((column) => (
                <th key={column} className="min-w-[140px] px-3 py-2 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {query.data.map((row) => {
              const record = row as Record<string, unknown>
              const expanded = expandedRowId === row.id

              return (
                <Fragment key={row.id}>
                  <tr className="border-t border-border">
                    <td className="px-3 py-2 align-top">
                      <button
                        type="button"
                        onClick={() => onToggleRow(row.id)}
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        aria-label={expanded ? 'Collapse row' : 'Expand row'}
                      >
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </td>
                    {visibleColumns.map((column) => (
                      <td key={column} className="max-w-[260px] px-3 py-2 align-top">
                        <div className="truncate">{formatCellValue(column, record[column])}</div>
                      </td>
                    ))}
                  </tr>
                  {expanded ? (
                    <tr className="border-t border-border bg-secondary/30">
                      <td colSpan={visibleColumns.length + 1} className="px-3 py-3">
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{shortSchemaId(row.schemaId)}</span>
                          <span>{row.id}</span>
                        </div>
                        <pre className="max-h-80 overflow-auto rounded-md bg-background p-3 text-xs">
                          {rowJson(record)}
                        </pre>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SavedViewTable({
  views,
  selectedViewId,
  emptyLabel,
  onSelect
}: {
  views: SavedViewRow[]
  selectedViewId: string | null
  emptyLabel: string
  onSelect: (viewId: string) => void
}): React.ReactElement {
  if (views.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">View</th>
            <th className="px-3 py-2 font-medium">Kind</th>
            <th className="px-3 py-2 font-medium">Scope</th>
            <th className="px-3 py-2 font-medium">Schema</th>
          </tr>
        </thead>
        <tbody>
          {views.map((view) => {
            const descriptor = parseSavedViewDescriptor(view.descriptor)
            const selected = view.id === selectedViewId

            return (
              <tr
                key={view.id}
                className={['border-t border-border', selected ? 'bg-accent/40' : ''].join(' ')}
              >
                <td className="min-w-0 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onSelect(view.id)}
                    className="block w-full min-w-0 text-left"
                  >
                    <span className="block truncate font-medium">
                      {view.title ?? 'Untitled view'}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {view.description ?? view.id}
                    </span>
                  </button>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {descriptorKindLabel(descriptor)}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{view.scope ?? '-'}</td>
                <td className="max-w-[280px] truncate px-3 py-2 font-mono text-xs text-muted-foreground">
                  {descriptor.primarySchemaId ?? '-'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SectionLabel({ label }: { label: string }): React.ReactElement {
  return (
    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
  )
}

function SourceRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
      <span className="min-w-0 truncate text-sm">{label}</span>
      <span className="text-xs text-muted-foreground">{value}</span>
    </div>
  )
}

function PatternRow({
  icon: Icon,
  label
}: {
  icon: typeof BarChart3
  label: string
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
      <Icon size={14} className="text-muted-foreground" />
      <span className="min-w-0 truncate">{label}</span>
    </div>
  )
}

function StatusBanner({
  message,
  tone
}: {
  message: string
  tone: 'error' | 'success' | 'warning'
}): React.ReactElement {
  const toneClassName = {
    error: 'border-destructive/40 bg-destructive/10 text-destructive',
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  }[tone]

  const Icon = tone === 'success' ? Shield : AlertTriangle

  return (
    <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${toneClassName}`}>
      <Icon size={15} />
      <span className="min-w-0 truncate">{message}</span>
    </div>
  )
}
