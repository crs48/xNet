/**
 * Analytics-cache strategy recommendations for large imported data workspaces.
 */

export type SocialAnalyticsCacheStrategy =
  | 'materialized-facet-cache'
  | 'columnar-worker-cache'
  | 'duckdb-wasm-candidate'

export type SocialAnalyticsCacheRecommendation = {
  strategy: SocialAnalyticsCacheStrategy
  label: string
  reason: string
  estimatedRows: number
  estimatedCells: number
  actions: string[]
}

export type SocialAnalyticsCacheInput = {
  rowCount: number
  columnCount?: number
  relationCount?: number
  archiveByteSize?: number
}

const DEFAULT_COLUMN_COUNT = 12
const COLUMNAR_ROW_THRESHOLD = 50_000
const COLUMNAR_CELL_THRESHOLD = 600_000
const DUCKDB_ROW_THRESHOLD = 500_000
const DUCKDB_CELL_THRESHOLD = 6_000_000
const DUCKDB_RELATION_THRESHOLD = 1_000_000
const DUCKDB_ARCHIVE_BYTE_THRESHOLD = 2 * 1024 * 1024 * 1024

function normalizedCount(value: number | undefined): number {
  return Number.isFinite(value) && value !== undefined ? Math.max(0, Math.floor(value)) : 0
}

export function recommendSocialAnalyticsCache(
  input: SocialAnalyticsCacheInput
): SocialAnalyticsCacheRecommendation {
  const estimatedRows = normalizedCount(input.rowCount)
  const estimatedColumns = normalizedCount(input.columnCount) || DEFAULT_COLUMN_COUNT
  const estimatedCells = estimatedRows * estimatedColumns
  const relationCount = normalizedCount(input.relationCount)
  const archiveByteSize = normalizedCount(input.archiveByteSize)

  if (
    estimatedRows >= DUCKDB_ROW_THRESHOLD ||
    estimatedCells >= DUCKDB_CELL_THRESHOLD ||
    relationCount >= DUCKDB_RELATION_THRESHOLD ||
    archiveByteSize >= DUCKDB_ARCHIVE_BYTE_THRESHOLD
  ) {
    return {
      strategy: 'duckdb-wasm-candidate',
      label: 'Evaluate DuckDB-Wasm',
      reason:
        'The workspace is large enough that SQL-style joins, grouped aggregates, and column scans may justify a derived DuckDB-Wasm cache.',
      estimatedRows,
      estimatedCells,
      actions: [
        'Keep NodeStore as source of truth.',
        'Build a derived local analytics cache from committed records.',
        'Invalidate by import run, schema ID, and row version fingerprints.'
      ]
    }
  }

  if (estimatedRows >= COLUMNAR_ROW_THRESHOLD || estimatedCells >= COLUMNAR_CELL_THRESHOLD) {
    return {
      strategy: 'columnar-worker-cache',
      label: 'Use worker columnar cache',
      reason:
        'The workspace is beyond cheap row scans, but still small enough for typed arrays or Arrow-like column batches in a browser worker.',
      estimatedRows,
      estimatedCells,
      actions: [
        'Materialize hot facets and date buckets off the main thread.',
        'Store compact columns by schema and field.',
        'Promote to DuckDB-Wasm only when joins or grouped aggregates dominate.'
      ]
    }
  }

  return {
    strategy: 'materialized-facet-cache',
    label: 'Use materialized facet cache',
    reason:
      'The workspace should stay responsive with bounded saved-view facet and date-bucket caches over loaded rows.',
    estimatedRows,
    estimatedCells,
    actions: [
      'Reuse SavedViewRunner aggregation caches.',
      'Avoid adding a heavy analytics runtime for this data volume.',
      'Reassess when imports cross the columnar-cache thresholds.'
    ]
  }
}
