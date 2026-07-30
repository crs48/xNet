/**
 * Query→SQL compiler for the SQLite node storage adapter.
 *
 * Turns a `NodeQueryDescriptor` into candidate-select SQL (and, for fully
 * pushed-down descriptors, a fused single-statement candidate+hydrate query —
 * exploration 0264, Wave 1). Extracted from `sqlite-adapter.ts` so compilation
 * is testable and evolvable independently of storage (exploration 0276).
 *
 * The compiler is pure: behaviour flags (adaptive indexing, aggregated
 * hydration) are explicit inputs read per-compile via the flags getter, never
 * ambient adapter state.
 */

import type { SQLValue } from '@xnetjs/sqlite'
import { withoutNodeQueryPagination, type NodeQueryDescriptor, type SortDirection } from './query'

// ─── Scalar index values ─────────────────────────────────────────────────────

export type ScalarValueType = 'text' | 'number' | 'boolean' | 'null'

export interface ScalarIndexValue {
  valueType: ScalarValueType
  valueText: string | null
  valueNumber: number | null
  valueBoolean: number | null
  valueHash: string
}

export interface AdaptiveIndexHint {
  propertyKey: string
  scalar: ScalarIndexValue
}

// ─── Accelerator plans ───────────────────────────────────────────────────────

export interface SpatialBoundingBox {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface SpatialQueryPlan {
  spatialKey: string
  bounds: SpatialBoundingBox
}

export interface FullTextSearchQueryPlan {
  matchExpression: string
}

// ─── Compiled output ─────────────────────────────────────────────────────────

export interface CompiledNodeQuery {
  sql: string
  params: SQLValue[]
  postFilterDescriptor: NodeQueryDescriptor
  postFilterReason: string
  sqlPagination: boolean
  adaptiveIndexHints: AdaptiveIndexHint[]
  spatialIndexKey?: string
  fullTextSearchQuery?: string
  /**
   * Single-statement candidate+hydrate query (exploration 0264, Wave 1).
   * Present only for fully-pushed-down descriptors (`sqlPagination`): the
   * candidate select becomes a CTE feeding the property hydrate join, so a
   * cold query costs ONE worker round-trip instead of id-select + hydrate.
   * When the descriptor asks for `count: 'exact'`, a `COUNT(*) OVER ()`
   * window inside the CTE folds the total in (no separate COUNT RPC).
   */
  fused?: {
    sql: string
    params: SQLValue[]
    includesExactCount: boolean
  }
}

/** Behaviour flags the compiler must not read from ambient adapter state. */
export interface QueryCompilerFlags {
  adaptiveIndexingEnabled: boolean
  aggregatedHydration: boolean
}

// ─── Pure helpers (shared with the adapter's indexing/telemetry paths) ──────

export function toScalarIndexValue(value: unknown): ScalarIndexValue | null {
  if (value === null) {
    return {
      valueType: 'null',
      valueText: null,
      valueNumber: null,
      valueBoolean: null,
      valueHash: 'null'
    }
  }

  if (typeof value === 'string') {
    return {
      valueType: 'text',
      valueText: value,
      valueNumber: null,
      valueBoolean: null,
      valueHash: hashScalarValue(value)
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return {
      valueType: 'number',
      valueText: null,
      valueNumber: value,
      valueBoolean: null,
      valueHash: hashScalarValue(String(value))
    }
  }

  if (typeof value === 'boolean') {
    return {
      valueType: 'boolean',
      valueText: null,
      valueNumber: null,
      valueBoolean: value ? 1 : 0,
      valueHash: value ? 'true' : 'false'
    }
  }

  return null
}

export function hashScalarValue(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function stringifyStable(value: unknown): string {
  if (value === undefined) {
    return 'null'
  }

  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stringifyStable(item)).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stringifyStable(entryValue)}`)
    .join(',')}}`
}

export function quoteSqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

export function buildSqlOrderBy(orderBy?: Partial<Record<string, SortDirection>>): string {
  const entries = Object.entries(orderBy ?? {}).filter(
    (entry): entry is [string, SortDirection] => entry[1] === 'asc' || entry[1] === 'desc'
  )
  if (entries.length === 0) {
    return 'n.updated_at DESC, n.id ASC'
  }

  const clauses = entries
    .filter(([key]) => key === 'createdAt' || key === 'updatedAt')
    .map(([key, direction]) => {
      const column = key === 'createdAt' ? 'n.created_at' : 'n.updated_at'
      return `${column} ${direction.toUpperCase()}`
    })

  return clauses.length > 0 ? [...clauses, 'n.id ASC'].join(', ') : 'n.updated_at DESC, n.id ASC'
}

function hasOnlySystemOrdering(orderBy?: Record<string, SortDirection>): boolean {
  return Object.keys(orderBy ?? {}).every((key) => key === 'createdAt' || key === 'updatedAt')
}

function appendScalarPredicate(
  where: string[],
  params: SQLValue[],
  alias: string,
  scalar: ScalarIndexValue
): void {
  switch (scalar.valueType) {
    case 'text':
      where.push(`${alias}.value_text = ?`)
      params.push(scalar.valueText)
      return
    case 'number':
      where.push(`${alias}.value_number = ?`)
      params.push(scalar.valueNumber)
      return
    case 'boolean':
      where.push(`${alias}.value_boolean = ?`)
      params.push(scalar.valueBoolean)
      return
    case 'null':
      return
  }
}

/**
 * ORDER BY for a pushed-down custom-property sort (0264). Mirrors the JS
 * comparator in `applyNodeQueryDescriptor`: missing properties sort last
 * ascending / first descending; typed value columns carry the order (for a
 * homogeneous property exactly one is non-NULL). `n.id` breaks ties so the
 * page boundary is a total order.
 */
function buildPropertySortOrderBy(direction: SortDirection): string {
  const dir = direction.toUpperCase()
  const nullsDir = direction === 'asc' ? 'ASC' : 'DESC'
  return (
    `(sortp.node_id IS NULL) ${nullsDir}, ` +
    `sortp.value_number ${dir}, sortp.value_boolean ${dir}, sortp.value_text ${dir}, ` +
    'n.id ASC'
  )
}

function getCompiledPostFilterReason(input: {
  useSqlPagination: boolean
  hasFullTextSearchPlan: boolean
  hasSpatialPlan: boolean
}): string {
  if (input.useSqlPagination) {
    return 'pagination-pushed-down'
  }

  if (input.hasFullTextSearchPlan && input.hasSpatialPlan) {
    return 'fts-rtree-verified-in-js'
  }

  if (input.hasFullTextSearchPlan) {
    return 'fts-verified-in-js'
  }

  if (input.hasSpatialPlan) {
    return 'spatial-rtree-verified-in-js'
  }

  return 'verified-in-js'
}

// ─── Compiler ────────────────────────────────────────────────────────────────

export class QueryCompiler {
  constructor(private readonly flags: () => QueryCompilerFlags) {}

  compile(
    descriptor: NodeQueryDescriptor,
    spatialPlan: SpatialQueryPlan | null = null,
    fullTextSearchPlan: FullTextSearchQueryPlan | null = null
  ): CompiledNodeQuery | null {
    if (descriptor.nodeId) {
      return this.compileSqlQuery(descriptor, {
        whereEntries: [],
        canUseSqlPagination: true,
        spatialPlan,
        fullTextSearchPlan
      })
    }

    const whereEntries = Object.entries(descriptor.where ?? {})
    const scalarWhere = whereEntries.map(([key, value]) => ({
      key,
      scalar: toScalarIndexValue(value)
    }))

    if (scalarWhere.some((entry) => entry.scalar === null)) {
      return null
    }

    const hasPropertySort = Object.keys(descriptor.orderBy ?? {}).some(
      (key) => key !== 'createdAt' && key !== 'updatedAt'
    )
    // Property-sort pushdown (exploration 0264, Wave 2; gated behind the
    // adaptive-indexing flag with the typed scalar indexes that serve it):
    // a SINGLE custom-property sort orders via a LEFT JOIN on the scalar
    // index instead of falling back to a full schema scan + JS sort.
    const propertySort = this.resolvePropertySortPushdown(descriptor, hasPropertySort)
    const hasSqlCandidateBenefit =
      scalarWhere.length > 0 ||
      spatialPlan !== null ||
      fullTextSearchPlan !== null ||
      !descriptor.spatial ||
      hasOnlySystemOrdering(descriptor.orderBy)

    if (!hasSqlCandidateBenefit && !propertySort) {
      return null
    }

    return this.compileSqlQuery(descriptor, {
      whereEntries: scalarWhere as Array<{ key: string; scalar: ScalarIndexValue }>,
      canUseSqlPagination:
        (!hasPropertySort || propertySort !== null) && !descriptor.spatial && !descriptor.search,
      spatialPlan,
      fullTextSearchPlan,
      propertySort
    })
  }

  /**
   * A custom-property sort can push down when it is the descriptor's ONLY
   * order key and no cursor/spatial/search accelerator is in play. Gated on
   * the adaptive-indexing flag: the typed partial indexes on
   * `node_property_scalars` make the join+order cheap, and the flag keeps
   * the behavioural change opt-in while it soaks (exploration 0264).
   */
  private resolvePropertySortPushdown(
    descriptor: NodeQueryDescriptor,
    hasPropertySort: boolean
  ): { key: string; direction: SortDirection } | null {
    if (!hasPropertySort || !this.flags().adaptiveIndexingEnabled) return null
    if (descriptor.spatial || descriptor.search || descriptor.after !== undefined) return null

    const entries = Object.entries(descriptor.orderBy ?? {}).filter(
      (entry): entry is [string, SortDirection] => entry[1] === 'asc' || entry[1] === 'desc'
    )
    if (entries.length !== 1) return null
    const [key, direction] = entries[0]
    if (key === 'createdAt' || key === 'updatedAt') return null
    return { key, direction }
  }

  private compileSqlQuery(
    descriptor: NodeQueryDescriptor,
    options: {
      whereEntries: Array<{ key: string; scalar: ScalarIndexValue }>
      canUseSqlPagination: boolean
      spatialPlan?: SpatialQueryPlan | null
      fullTextSearchPlan?: FullTextSearchQueryPlan | null
      propertySort?: { key: string; direction: SortDirection } | null
    }
  ): CompiledNodeQuery {
    const joins: string[] = []
    const where: string[] = ['n.schema_id = ?']
    const whereParams: SQLValue[] = [descriptor.schemaId]

    if (descriptor.nodeId) {
      where.push('n.id = ?')
      whereParams.push(descriptor.nodeId)
    }

    if (!descriptor.includeDeleted) {
      where.push('n.deleted_at IS NULL')
    }

    options.whereEntries.forEach((entry, index) => {
      const alias = `p${index}`
      const schemaId = quoteSqlLiteral(descriptor.schemaId)
      const propertyKey = quoteSqlLiteral(entry.key)
      const valueType = quoteSqlLiteral(entry.scalar.valueType)
      joins.push(
        `JOIN node_property_scalars ${alias}
          ON ${alias}.node_id = n.id
         AND ${alias}.schema_id = ${schemaId}
         AND ${alias}.property_key = ${propertyKey}
         AND ${alias}.value_type = ${valueType}`
      )
      appendScalarPredicate(where, whereParams, alias, entry.scalar)
    })

    if (options.fullTextSearchPlan) {
      joins.push('JOIN nodes_fts ON nodes_fts.node_id = n.id')
      where.push('nodes_fts MATCH ?')
      whereParams.push(options.fullTextSearchPlan.matchExpression)
    }

    if (options.spatialPlan) {
      joins.push(
        `JOIN node_spatial_ids spatial_ids
          ON spatial_ids.node_id = n.id
         AND spatial_ids.schema_id = n.schema_id
         AND spatial_ids.spatial_key = ${quoteSqlLiteral(options.spatialPlan.spatialKey)}`
      )
      joins.push(
        `JOIN node_spatial_rtree spatial_rtree
          ON spatial_rtree.spatial_id = spatial_ids.spatial_id`
      )
      where.push(
        `spatial_rtree.max_x >= ?`,
        `spatial_rtree.min_x <= ?`,
        `spatial_rtree.max_y >= ?`,
        `spatial_rtree.min_y <= ?`
      )
      whereParams.push(
        options.spatialPlan.bounds.minX,
        options.spatialPlan.bounds.maxX,
        options.spatialPlan.bounds.minY,
        options.spatialPlan.bounds.maxY
      )
    }

    // Property-sort pushdown (0264): LEFT JOIN the scalar row for the sort
    // key (nodes without the property must still appear) and order by the
    // typed value columns — for a homogeneous key exactly one column varies,
    // the others stay constant-NULL and are inert. Null placement mirrors the
    // JS comparator: nulls LAST ascending, FIRST descending.
    if (options.propertySort) {
      const schemaId = quoteSqlLiteral(descriptor.schemaId)
      const propertyKey = quoteSqlLiteral(options.propertySort.key)
      joins.push(
        `LEFT JOIN node_property_scalars sortp
          ON sortp.node_id = n.id
         AND sortp.schema_id = ${schemaId}
         AND sortp.property_key = ${propertyKey}`
      )
    }

    const orderBy = options.propertySort
      ? buildPropertySortOrderBy(options.propertySort.direction)
      : buildSqlOrderBy(descriptor.orderBy)
    const useSqlPagination =
      options.canUseSqlPagination &&
      descriptor.after === undefined &&
      (descriptor.limit !== undefined || (descriptor.offset ?? 0) > 0)

    let sql = `
      SELECT n.id
      FROM nodes n
      ${joins.join('\n')}
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderBy}
    `

    let fused: CompiledNodeQuery['fused']
    if (useSqlPagination) {
      sql += '\nLIMIT ? OFFSET ?'
      whereParams.push(descriptor.limit ?? -1, descriptor.offset ?? 0)

      // One-RPC fusion (exploration 0264): candidate select as a CTE feeding
      // the hydrate join. ROW_NUMBER preserves candidate order through the
      // property join; the optional COUNT window folds `count: 'exact'` in
      // (window functions evaluate before LIMIT, so it sees the full match
      // set). Only built for pushed-down descriptors — JS-verified FTS/
      // spatial paths keep the two-step shape.
      const includesExactCount = descriptor.count === 'exact'
      const countColumn = includesExactCount ? ',\n          COUNT(*) OVER () AS total_count' : ''
      const countSelect = includesExactCount ? 'c.total_count,' : ''
      const candidatesCte = `
      WITH candidates AS (
        SELECT
          n.id, n.schema_id, n.created_at, n.updated_at, n.created_by, n.deleted_at,
          ROW_NUMBER() OVER (ORDER BY ${orderBy}) AS ordinal${countColumn}
        FROM nodes n
        ${joins.join('\n')}
        WHERE ${where.join(' AND ')}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      )`
      // Aggregated fusion ships ONE row per node (0264 Wave 2 benchmark:
      // ~5× faster SQL + ~10× cheaper boundary clone than row-multiplied).
      const fusedSql = this.flags().aggregatedHydration
        ? `${candidatesCte}
      SELECT
        c.id, c.schema_id, c.created_at, c.updated_at, c.created_by, c.deleted_at,
        ${countSelect}
        c.ordinal,
        json_group_object(p.property_key, json(CAST(p.value AS TEXT)))
          FILTER (WHERE p.property_key IS NOT NULL) AS props_json,
        json_group_object(
          p.property_key,
          json_object('l', p.lamport_time, 'b', p.updated_by, 'w', p.updated_at)
        ) FILTER (WHERE p.property_key IS NOT NULL) AS meta_json
      FROM candidates c
      LEFT JOIN node_properties p ON p.node_id = c.id
      GROUP BY c.id
      ORDER BY c.ordinal ASC
    `
        : `${candidatesCte}
      SELECT
        c.id, c.schema_id, c.created_at, c.updated_at, c.created_by, c.deleted_at,
        ${countSelect}
        p.property_key, p.value, p.lamport_time, p.updated_by, p.updated_at AS prop_updated_at,
        c.ordinal
      FROM candidates c
      LEFT JOIN node_properties p ON p.node_id = c.id
      ORDER BY c.ordinal ASC, p.property_key ASC
    `
      fused = {
        sql: fusedSql,
        params: [...whereParams],
        includesExactCount
      }
    }

    return {
      sql,
      params: whereParams,
      fused,
      postFilterDescriptor: useSqlPagination ? withoutNodeQueryPagination(descriptor) : descriptor,
      postFilterReason: getCompiledPostFilterReason({
        useSqlPagination,
        hasFullTextSearchPlan:
          options.fullTextSearchPlan !== null && options.fullTextSearchPlan !== undefined,
        hasSpatialPlan: options.spatialPlan !== null && options.spatialPlan !== undefined
      }),
      sqlPagination: useSqlPagination,
      adaptiveIndexHints: options.whereEntries.map((entry) => ({
        propertyKey: entry.key,
        scalar: entry.scalar
      })),
      spatialIndexKey: options.spatialPlan?.spatialKey,
      fullTextSearchQuery: options.fullTextSearchPlan?.matchExpression
    }
  }
}
