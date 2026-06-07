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
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Columns3,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  Table,
  X
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

export type SavedViewFacetSelection = Record<string, readonly string[]>

export type SavedViewFacetValueSummary = {
  valueKey: string
  label: string
  count: number
}

export type SavedViewFacetSummary = {
  field: string
  values: SavedViewFacetValueSummary[]
  totalValues: number
}

export type SavedViewDateBucketInterval = 'day' | 'month' | 'year'

export type SavedViewDateBucketSummary = {
  bucketKey: string
  label: string
  startMs: number
  endMs: number
  count: number
}

export type SavedViewDateBucketFieldSummary = {
  field: string
  interval: SavedViewDateBucketInterval
  buckets: SavedViewDateBucketSummary[]
  minMs: number
  maxMs: number
  totalRows: number
}

export type SavedViewDateBrushSelection = {
  field: string | null
  bucketKeys: readonly string[]
}

type SortDirection = 'asc' | 'desc'

const DEFAULT_PAGE_SIZE = 25
const DEFAULT_PAGE_SIZES = [10, 25, 50, 100] as const
const MAX_FACET_FIELDS = 5
const MAX_FACET_VALUES = 8
const MAX_FACET_DISTINCT_VALUES = 16
const MAX_DATE_BUCKET_FIELDS = 4
const MAX_DATE_BUCKETS = 18
const DAY_MS = 86_400_000
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
const PREFERRED_FACET_COLUMNS = [
  'platform',
  'contentKind',
  'interactionKind',
  'messageKind',
  'collectionKind',
  'privacyClass',
  'visibility',
  'rowRole',
  'schemaName'
]
const PREFERRED_DATE_COLUMNS = [
  'publishedAt',
  'observedAt',
  'sentAt',
  'importedAt',
  'createdAt',
  'updatedAt'
]
const LOW_SIGNAL_FACET_COLUMNS = new Set([
  'id',
  'schemaId',
  'title',
  'body',
  'text',
  'content',
  'url',
  'uri',
  'sourceUrl',
  'externalId',
  'createdAt',
  'updatedAt',
  'publishedAt',
  'observedAt',
  'sentAt',
  'importedAt'
])

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

/**
 * Compute low-cardinality facets over loaded schema query rows.
 */
export function deriveSavedViewFacetSummaries(
  rows: readonly Record<string, unknown>[],
  columns: readonly string[]
): SavedViewFacetSummary[] {
  const candidateColumns = columns
    .filter((column) => !LOW_SIGNAL_FACET_COLUMNS.has(column))
    .map((column) => ({
      column,
      score: PREFERRED_FACET_COLUMNS.includes(column)
        ? PREFERRED_FACET_COLUMNS.indexOf(column)
        : PREFERRED_FACET_COLUMNS.length + column.length
    }))
    .sort((left, right) => left.score - right.score || left.column.localeCompare(right.column))
    .map((candidate) => candidate.column)

  return candidateColumns
    .flatMap((field) => {
      const counts = rows.reduce<Map<string, SavedViewFacetValueSummary>>((current, row) => {
        const value = row[field]
        if (!isFacetScalarValue(value)) return current

        const valueKey = facetValueKey(value)
        const previous = current.get(valueKey)
        current.set(valueKey, {
          valueKey,
          label: facetValueLabel(value),
          count: (previous?.count ?? 0) + 1
        })

        return current
      }, new Map())
      const values = [...counts.values()].sort(
        (left, right) => right.count - left.count || left.label.localeCompare(right.label)
      )

      if (values.length === 0 || values.length > MAX_FACET_DISTINCT_VALUES) return []

      return [
        {
          field,
          values: values.slice(0, MAX_FACET_VALUES),
          totalValues: values.length
        }
      ]
    })
    .slice(0, MAX_FACET_FIELDS)
}

/**
 * Filter loaded schema query rows by facet value keys.
 */
export function filterSavedViewRowsByFacets<T extends Record<string, unknown>>(
  rows: readonly T[],
  selection: SavedViewFacetSelection
): T[] {
  const activeEntries = Object.entries(selection).filter(([, values]) => values.length > 0)
  if (activeEntries.length === 0) return [...rows]

  return rows.filter((row) =>
    activeEntries.every(([field, values]) => values.includes(facetValueKey(row[field])))
  )
}

/**
 * Compute date buckets over loaded schema query rows.
 */
export function deriveSavedViewDateBucketSummaries(
  rows: readonly Record<string, unknown>[],
  columns: readonly string[]
): SavedViewDateBucketFieldSummary[] {
  const candidateColumns = columns
    .filter((column) => isDateColumnName(column))
    .map((column) => ({
      column,
      score: PREFERRED_DATE_COLUMNS.includes(column)
        ? PREFERRED_DATE_COLUMNS.indexOf(column)
        : PREFERRED_DATE_COLUMNS.length + column.length
    }))
    .sort((left, right) => left.score - right.score || left.column.localeCompare(right.column))
    .map((candidate) => candidate.column)

  return candidateColumns
    .flatMap((field) => {
      const timestamps = rows.flatMap((row) => {
        const timestamp = parseSavedViewDateValue(row[field])
        return timestamp === null ? [] : [timestamp]
      })

      if (timestamps.length === 0) return []

      const minMs = Math.min(...timestamps)
      const maxMs = Math.max(...timestamps)
      const interval = intervalForDateRange(minMs, maxMs)
      const counts = timestamps.reduce<Map<number, number>>((current, timestamp) => {
        const bucketStart = dateBucketStartMs(timestamp, interval)
        current.set(bucketStart, (current.get(bucketStart) ?? 0) + 1)
        return current
      }, new Map())
      const buckets = [...counts.entries()]
        .sort(([left], [right]) => left - right)
        .slice(0, MAX_DATE_BUCKETS)
        .map(([startMs, count]) => ({
          bucketKey: dateBucketKey(interval, startMs),
          label: dateBucketLabel(startMs, interval),
          startMs,
          endMs: dateBucketEndMs(startMs, interval),
          count
        }))

      if (buckets.length === 0) return []

      return [
        {
          field,
          interval,
          buckets,
          minMs,
          maxMs,
          totalRows: timestamps.length
        }
      ]
    })
    .slice(0, MAX_DATE_BUCKET_FIELDS)
}

/**
 * Filter loaded schema query rows by a selected date bucket brush.
 */
export function filterSavedViewRowsByDateBrush<T extends Record<string, unknown>>(
  rows: readonly T[],
  selection: SavedViewDateBrushSelection
): T[] {
  if (!selection.field || selection.bucketKeys.length === 0) return [...rows]

  const interval = intervalFromDateBucketKey(selection.bucketKeys[0])
  if (!interval) return [...rows]

  return rows.filter((row) => {
    const timestamp = parseSavedViewDateValue(row[selection.field ?? ''])
    if (timestamp === null) return false

    return selection.bucketKeys.includes(
      dateBucketKey(interval, dateBucketStartMs(timestamp, interval))
    )
  })
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
  const [facetSelection, setFacetSelection] = useState<Record<string, string[]>>({})
  const [dateBrushSelection, setDateBrushSelection] = useState<SavedViewDateBrushSelection>({
    field: null,
    bucketKeys: []
  })
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
  const facetSummaries = useMemo(
    () =>
      deriveSavedViewFacetSummaries(
        (activeQuery?.data ?? []) as Record<string, unknown>[],
        availableColumns
      ),
    [activeQuery?.data, availableColumns]
  )
  const facetFilteredRows = useMemo(
    () =>
      filterSavedViewRowsByFacets(
        (activeQuery?.data ?? []) as Record<string, unknown>[],
        facetSelection
      ),
    [activeQuery?.data, facetSelection]
  )
  const dateBucketSummaries = useMemo(
    () => deriveSavedViewDateBucketSummaries(facetFilteredRows, availableColumns),
    [availableColumns, facetFilteredRows]
  )
  const filteredRows = useMemo(
    () =>
      filterSavedViewRowsByDateBrush(
        facetFilteredRows,
        dateBrushSelection
      ) as SavedViewQueryResult['data'],
    [dateBrushSelection, facetFilteredRows]
  )
  const displayedQuery = useMemo<SavedViewQueryResult | null>(
    () => (activeQuery ? { ...activeQuery, data: filteredRows } : null),
    [activeQuery, filteredRows]
  )
  const activeFacetCount = useMemo(
    () => Object.values(facetSelection).reduce((sum, values) => sum + values.length, 0),
    [facetSelection]
  )
  const activeDateBucketCount = dateBrushSelection.bucketKeys.length
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
    setFacetSelection({})
    setDateBrushSelection({ field: null, bucketKeys: [] })
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
    setFacetSelection({})
    setDateBrushSelection({ field: null, bucketKeys: [] })
  }, [activeQueryId, searchText, sortDirection, sortField])

  useEffect(() => {
    setVisibleColumns((current) => {
      const kept = current.filter((column) => availableColumns.includes(column))
      if (kept.length > 0) return kept
      return availableColumns.slice(0, Math.min(8, availableColumns.length))
    })
  }, [availableColumns])

  useEffect(() => {
    setFacetSelection((current) => {
      const validFields = new Set(facetSummaries.map((facet) => facet.field))
      const validValues = new Map(
        facetSummaries.map((facet) => [
          facet.field,
          new Set(facet.values.map((value) => value.valueKey))
        ])
      )
      const nextEntries = Object.entries(current)
        .filter(([field]) => validFields.has(field))
        .flatMap(([field, values]) => {
          const allowedValues = validValues.get(field)
          const kept = allowedValues ? values.filter((valueKey) => allowedValues.has(valueKey)) : []
          return kept.length > 0 ? [[field, kept] as const] : []
        })
      const next = Object.fromEntries(nextEntries)

      return sameFacetSelection(current, next) ? current : next
    })
  }, [facetSummaries])

  useEffect(() => {
    setDateBrushSelection((current) => {
      if (!current.field) return current

      const summary = dateBucketSummaries.find((candidate) => candidate.field === current.field)
      if (!summary) return { field: null, bucketKeys: [] }

      const validBucketKeys = new Set(summary.buckets.map((bucket) => bucket.bucketKey))
      const nextBucketKeys = current.bucketKeys.filter((bucketKey) =>
        validBucketKeys.has(bucketKey)
      )
      const next = {
        field: nextBucketKeys.length > 0 ? current.field : null,
        bucketKeys: nextBucketKeys
      }

      return sameDateBrushSelection(current, next) ? current : next
    })
  }, [dateBucketSummaries])

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

      <SavedViewFacetShelf
        summaries={facetSummaries}
        selection={facetSelection}
        onToggleValue={(field, valueKey) =>
          setFacetSelection((current) => toggleFacetSelection(current, field, valueKey))
        }
        onClearField={(field) =>
          setFacetSelection((current) => omitFacetSelectionField(current, field))
        }
        onClearAll={() => setFacetSelection({})}
      />

      <SavedViewTimelineBrush
        summaries={dateBucketSummaries}
        selection={dateBrushSelection}
        onSelectField={(field) => setDateBrushSelection({ field, bucketKeys: [] })}
        onToggleBucket={(field, bucketKey) =>
          setDateBrushSelection((current) => toggleDateBrushSelection(current, field, bucketKey))
        }
        onClear={() => setDateBrushSelection({ field: null, bucketKeys: [] })}
      />

      <SavedViewResultTable
        query={displayedQuery}
        columns={visibleColumns}
        expandedRowId={expandedRowId}
        onToggleRow={(rowId) => setExpandedRowId((current) => (current === rowId ? null : rowId))}
      />

      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="text-muted-foreground">
          {activeQuery
            ? activeFacetCount + activeDateBucketCount > 0
              ? `${filteredRows.length.toLocaleString()} visible of ${activeQuery.data.length.toLocaleString()} loaded`
              : `${activeQuery.data.length.toLocaleString()} loaded`
            : '0 loaded'}
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

function SavedViewFacetShelf({
  summaries,
  selection,
  onToggleValue,
  onClearField,
  onClearAll
}: {
  summaries: SavedViewFacetSummary[]
  selection: SavedViewFacetSelection
  onToggleValue: (field: string, valueKey: string) => void
  onClearField: (field: string) => void
  onClearAll: () => void
}): JSX.Element | null {
  const activeCount = Object.values(selection).reduce((sum, values) => sum + values.length, 0)

  if (summaries.length === 0) return null

  return (
    <div className="rounded-md border border-border bg-secondary/20 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Filter size={14} className="text-muted-foreground" />
          <span>Facets</span>
          <span className="text-xs font-normal text-muted-foreground">loaded rows</span>
        </div>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={onClearAll}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X size={12} />
            Clear facets
          </button>
        ) : null}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {summaries.map((facet) => {
          const selectedValues = selection[facet.field] ?? []

          return (
            <div key={facet.field} className="min-w-0">
              <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate font-medium text-muted-foreground">
                  {facet.field}
                </span>
                {selectedValues.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => onClearField(facet.field)}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Clear
                  </button>
                ) : (
                  <span className="text-muted-foreground">{facet.totalValues} values</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {facet.values.map((value) => {
                  const selected = selectedValues.includes(value.valueKey)

                  return (
                    <button
                      key={value.valueKey}
                      type="button"
                      onClick={() => onToggleValue(facet.field, value.valueKey)}
                      className={classNames([
                        'max-w-full rounded-md border px-2 py-1 text-xs transition-colors',
                        selected
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-border bg-background hover:bg-accent'
                      ])}
                    >
                      <span className="inline-block max-w-40 truncate align-bottom">
                        {value.label}
                      </span>
                      <span className="ml-1 opacity-70">{value.count.toLocaleString()}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SavedViewTimelineBrush({
  summaries,
  selection,
  onSelectField,
  onToggleBucket,
  onClear
}: {
  summaries: SavedViewDateBucketFieldSummary[]
  selection: SavedViewDateBrushSelection
  onSelectField: (field: string) => void
  onToggleBucket: (field: string, bucketKey: string) => void
  onClear: () => void
}): JSX.Element | null {
  if (summaries.length === 0) return null

  const activeSummary =
    summaries.find((summary) => summary.field === selection.field) ?? summaries[0]
  const selectedBucketKeys = selection.field === activeSummary.field ? selection.bucketKeys : []
  const maxCount = Math.max(...activeSummary.buckets.map((bucket) => bucket.count), 1)

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <CalendarDays size={14} className="text-muted-foreground" />
          <span>Timeline</span>
          <span className="text-xs font-normal text-muted-foreground">
            {activeSummary.interval} buckets
          </span>
        </div>
        <div className="flex items-center gap-2">
          {summaries.length > 1 ? (
            <select
              value={activeSummary.field}
              onChange={(event) => onSelectField(event.currentTarget.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            >
              {summaries.map((summary) => (
                <option key={summary.field} value={summary.field}>
                  {summary.field}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-muted-foreground">{activeSummary.field}</span>
          )}
          {selectedBucketKeys.length > 0 ? (
            <button
              type="button"
              onClick={onClear}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X size={12} />
              Clear
            </button>
          ) : null}
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="flex min-h-[92px] items-end gap-2">
          {activeSummary.buckets.map((bucket) => {
            const selected = selectedBucketKeys.includes(bucket.bucketKey)
            const height = Math.max(10, Math.round((bucket.count / maxCount) * 56))

            return (
              <button
                key={bucket.bucketKey}
                type="button"
                onClick={() => onToggleBucket(activeSummary.field, bucket.bucketKey)}
                className={classNames([
                  'flex min-w-[72px] flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs transition-colors',
                  selected
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border hover:bg-accent'
                ])}
              >
                <span
                  className={classNames([
                    'block w-full rounded-sm',
                    selected ? 'bg-background/80' : 'bg-foreground/70'
                  ])}
                  style={{ height }}
                  aria-hidden="true"
                />
                <span className="w-full truncate text-center">{bucket.label}</span>
                <span className="opacity-70">{bucket.count.toLocaleString()}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
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

function isFacetScalarValue(value: unknown): value is string | number | boolean | null | undefined {
  return (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
}

function facetValueKey(value: unknown): string {
  if (value === null || value === undefined || value === '') return '__empty__'
  if (typeof value === 'number') return `number:${value}`
  if (typeof value === 'boolean') return `boolean:${value}`
  return `string:${String(value)}`
}

function facetValueLabel(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Empty'
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  return String(value)
}

function toggleFacetSelection(
  selection: Record<string, string[]>,
  field: string,
  valueKey: string
): Record<string, string[]> {
  const currentValues = selection[field] ?? []
  const nextValues = currentValues.includes(valueKey)
    ? currentValues.filter((current) => current !== valueKey)
    : [...currentValues, valueKey]

  if (nextValues.length === 0) {
    return omitFacetSelectionField(selection, field)
  }

  return { ...selection, [field]: nextValues }
}

function omitFacetSelectionField(
  selection: Record<string, string[]>,
  field: string
): Record<string, string[]> {
  return Object.fromEntries(Object.entries(selection).filter(([key]) => key !== field))
}

function sameFacetSelection(
  left: Record<string, string[]>,
  right: Record<string, string[]>
): boolean {
  const leftEntries = Object.entries(left)
  const rightEntries = Object.entries(right)
  if (leftEntries.length !== rightEntries.length) return false

  return leftEntries.every(([field, values]) => {
    const rightValues = right[field]
    return (
      rightValues !== undefined &&
      values.length === rightValues.length &&
      values.every((value, index) => value === rightValues[index])
    )
  })
}

function isDateColumnName(column: string): boolean {
  return PREFERRED_DATE_COLUMNS.includes(column) || column.endsWith('At') || column.endsWith('Date')
}

function parseSavedViewDateValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 1_000_000_000_000) return value
    if (value > 1_000_000_000) return value * 1000
    return null
  }

  if (typeof value !== 'string' || value.trim() === '') return null

  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function intervalForDateRange(minMs: number, maxMs: number): SavedViewDateBucketInterval {
  const range = Math.max(0, maxMs - minMs)
  if (range <= DAY_MS * 45) return 'day'
  if (range <= DAY_MS * 730) return 'month'
  return 'year'
}

function dateBucketStartMs(timestamp: number, interval: SavedViewDateBucketInterval): number {
  const date = new Date(timestamp)

  if (interval === 'year') {
    return Date.UTC(date.getUTCFullYear(), 0, 1)
  }

  if (interval === 'month') {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
  }

  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function dateBucketEndMs(startMs: number, interval: SavedViewDateBucketInterval): number {
  const date = new Date(startMs)

  if (interval === 'year') {
    return Date.UTC(date.getUTCFullYear() + 1, 0, 1)
  }

  if (interval === 'month') {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
  }

  return startMs + DAY_MS
}

function dateBucketKey(interval: SavedViewDateBucketInterval, startMs: number): string {
  return `${interval}:${startMs}`
}

function intervalFromDateBucketKey(value: string): SavedViewDateBucketInterval | null {
  const [interval] = value.split(':')
  return interval === 'day' || interval === 'month' || interval === 'year' ? interval : null
}

function dateBucketLabel(startMs: number, interval: SavedViewDateBucketInterval): string {
  const date = new Date(startMs)

  if (interval === 'year') {
    return String(date.getUTCFullYear())
  }

  if (interval === 'month') {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC'
    })
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  })
}

function toggleDateBrushSelection(
  selection: SavedViewDateBrushSelection,
  field: string,
  bucketKey: string
): SavedViewDateBrushSelection {
  const currentBucketKeys = selection.field === field ? selection.bucketKeys : []
  const nextBucketKeys = currentBucketKeys.includes(bucketKey)
    ? currentBucketKeys.filter((current) => current !== bucketKey)
    : [...currentBucketKeys, bucketKey]

  return {
    field: nextBucketKeys.length > 0 ? field : null,
    bucketKeys: nextBucketKeys
  }
}

function sameDateBrushSelection(
  left: SavedViewDateBrushSelection,
  right: SavedViewDateBrushSelection
): boolean {
  return (
    left.field === right.field &&
    left.bucketKeys.length === right.bucketKeys.length &&
    left.bucketKeys.every((bucketKey, index) => bucketKey === right.bucketKeys[index])
  )
}
