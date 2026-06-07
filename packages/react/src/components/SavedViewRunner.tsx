/**
 * @xnetjs/react - Generic saved view execution surface.
 */

import type {
  SavedViewQueryResult,
  SavedViewSchemaRegistry,
  UseSavedViewOptions,
  UseSavedViewResult
} from '../hooks/useSavedView'
import type { QueryASTOrderBy, SavedViewDescriptor } from '@xnetjs/data'
import type { ReactNode, JSX } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Columns3,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  Table
} from 'lucide-react'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useSavedView } from '../hooks/useSavedView'

export type SavedViewRunnerProps = {
  descriptor?: SavedViewDescriptor | string | null
  registry: SavedViewSchemaRegistry
  title?: string | null
  description?: string | null
  fallbackId?: string | null
  resetKey?: string | null
  className?: string
  emptyLabel?: string
  pageSizes?: readonly number[]
  initialPageSize?: number
  options?: Omit<UseSavedViewOptions, 'queryOverrides' | 'search'>
}

export type SavedViewResultTableProps = {
  query: SavedViewQueryResult | null
  columns: readonly string[]
  expandedRowId: string | null
  onToggleRow: (rowId: string) => void
  loadingLabel?: string
  emptyLabel?: string
  formatValue?: (input: {
    column: string
    value: unknown
    row: Record<string, unknown>
  }) => ReactNode
}

type SortDirection = 'asc' | 'desc'

const DEFAULT_PAGE_SIZE = 25
const DEFAULT_PAGE_SIZES = [10, 25, 50, 100] as const
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

function classNames(values: readonly (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ')
}

function queryRowCount(query: SavedViewQueryResult | null): string {
  if (!query) return '-'
  return metricValueLabel(query.totalCount ?? query.data.length)
}

function metricValueLabel(value: number | null): string {
  return value === null ? '-' : value.toLocaleString()
}

function descriptorKeyFor(descriptor: SavedViewDescriptor | string | null | undefined): string {
  if (!descriptor) return ''
  return typeof descriptor === 'string' ? descriptor : JSON.stringify(descriptor)
}

/**
 * Derive a stable display column list from flattened schema query rows.
 */
export function deriveSavedViewColumns(rows: readonly Record<string, unknown>[]): string[] {
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

/**
 * Format primitive and structured cell values for read-only schema query tables.
 */
export function formatSavedViewCellValue(column: string, value: unknown): string {
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

export function SavedViewRunner({
  descriptor,
  registry,
  title,
  description,
  fallbackId,
  resetKey,
  className,
  emptyLabel = 'No saved view selected.',
  pageSizes = DEFAULT_PAGE_SIZES,
  initialPageSize = DEFAULT_PAGE_SIZE,
  options: baseOptions
}: SavedViewRunnerProps): JSX.Element {
  const [activeQueryId, setActiveQueryId] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [sortField, setSortField] = useState('')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [pageOffset, setPageOffset] = useState(0)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const [visibleColumns, setVisibleColumns] = useState<string[]>([])
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  const descriptorKey = useMemo(() => descriptorKeyFor(descriptor), [descriptor])
  const orderBy = useMemo<QueryASTOrderBy[] | undefined>(
    () => (sortField ? [{ field: sortField, direction: sortDirection }] : undefined),
    [sortDirection, sortField]
  )
  const options = useMemo<UseSavedViewOptions>(
    () => ({
      ...baseOptions,
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
    [activeQueryId, baseOptions, orderBy, pageOffset, pageSize, searchText]
  )
  const result = useSavedView(descriptor, registry, options)
  const resolvedActiveQueryId =
    activeQueryId && result.queries[activeQueryId] ? activeQueryId : result.primaryQueryId
  const activeQuery = resolvedActiveQueryId ? result.queries[resolvedActiveQueryId] : null
  const availableColumns = useMemo(
    () => deriveSavedViewColumns((activeQuery?.data ?? []) as Record<string, unknown>[]),
    [activeQuery?.data]
  )
  const resetIdentity = resetKey ?? descriptorKey

  useEffect(() => {
    setActiveQueryId(null)
    setSearchText('')
    setSortField('')
    setSortDirection('asc')
    setPageOffset(0)
    setPageSize(initialPageSize)
    setExpandedRowId(null)
    setVisibleColumns([])
  }, [initialPageSize, resetIdentity])

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

  if (!descriptor) {
    return (
      <section
        className={classNames([
          'mt-6 rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground',
          className
        ])}
      >
        {emptyLabel}
      </section>
    )
  }

  return (
    <section
      className={classNames(['mt-6 space-y-3 rounded-md border border-border p-4', className])}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Table size={14} />
            <span>{result.kind === 'query-set' ? 'Query set' : 'Query'}</span>
          </div>
          <h2 className="mt-1 truncate text-base font-semibold">
            {title ?? result.title ?? 'Untitled view'}
          </h2>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {description ?? result.description ?? fallbackId ?? descriptorKey}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <SavedViewPrivacyChips query={activeQuery} />
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

      <SavedViewDiagnostics result={result} query={activeQuery} />

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
                className={classNames([
                  'rounded-md border px-3 py-1.5 text-sm transition-colors',
                  active
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border hover:bg-accent'
                ])}
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
          {pageSizes.map((size) => (
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

      <SavedViewResultTable
        query={activeQuery}
        columns={visibleColumns}
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

export function SavedViewResultTable({
  query,
  columns,
  expandedRowId,
  onToggleRow,
  loadingLabel = 'Loading',
  emptyLabel = 'No rows.',
  formatValue
}: SavedViewResultTableProps): JSX.Element {
  if (!query || query.loading) {
    return (
      <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
        <Loader2 size={16} className="mr-2 animate-spin" />
        {loadingLabel}
      </div>
    )
  }

  if (query.data.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {emptyLabel}
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
              {columns.map((column) => (
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
                    {columns.map((column) => (
                      <td key={column} className="max-w-[260px] px-3 py-2 align-top">
                        <div className="truncate">
                          {formatValue
                            ? formatValue({ column, value: record[column], row: record })
                            : formatSavedViewCellValue(column, record[column])}
                        </div>
                      </td>
                    ))}
                  </tr>
                  {expanded ? (
                    <tr className="border-t border-border bg-secondary/30">
                      <td colSpan={columns.length + 1} className="px-3 py-3">
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{shortSchemaId(row.schemaId)}</span>
                          <span>{row.id}</span>
                        </div>
                        <pre className="max-h-80 overflow-auto rounded-md bg-background p-3 text-xs">
                          {JSON.stringify(record, null, 2)}
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

function SavedViewDiagnostics({
  result,
  query
}: {
  result: UseSavedViewResult
  query: SavedViewQueryResult | null
}): JSX.Element | null {
  const blockers = [...new Set([...result.blockers, ...(query?.blockers ?? [])])]
  const warnings = [...new Set([...result.warnings, ...(query?.warnings ?? [])])]

  if (blockers.length === 0 && warnings.length === 0 && !result.error && !query?.error) {
    return null
  }

  return (
    <div className="space-y-2">
      {result.error || query?.error ? (
        <SavedViewStatusBanner
          tone="error"
          message={(query?.error ?? result.error)?.message ?? 'Error'}
        />
      ) : null}
      {blockers.map((blocker) => (
        <SavedViewStatusBanner key={blocker} tone="error" message={blocker} />
      ))}
      {warnings.map((warning) => (
        <SavedViewStatusBanner key={warning} tone="warning" message={warning} />
      ))}
    </div>
  )
}

function SavedViewPrivacyChips({
  query
}: {
  query: SavedViewQueryResult | null
}): JSX.Element | null {
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

function SavedViewStatusBanner({
  message,
  tone
}: {
  message: string
  tone: 'error' | 'warning'
}): JSX.Element {
  const toneClassName = {
    error: 'border-destructive/40 bg-destructive/10 text-destructive',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  }[tone]

  return (
    <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${toneClassName}`}>
      <Shield size={15} />
      <span className="min-w-0 truncate">{message}</span>
    </div>
  )
}

function shortSchemaId(schemaId: string): string {
  return schemaId.split('/').at(-1) ?? schemaId
}
