/**
 * Shared helpers for built-in widgets: stub descriptor builders and
 * formatting utilities for tile-constrained rendering.
 */

import type {
  QueryASTAggregateFunction,
  QueryASTNodeQuery,
  QueryASTOrderBy,
  SavedViewDescriptor,
  SchemaIRI
} from '@xnetjs/data'

export const TASK_SCHEMA_IRI = 'xnet://xnet.fyi/Task@1.0.0'
export const PAGE_SCHEMA_IRI = 'xnet://xnet.fyi/Page@1.0.0'
export const CANVAS_SCHEMA_IRI = 'xnet://xnet.fyi/Canvas@1.0.0'
export const DATABASE_SCHEMA_IRI = 'xnet://xnet.fyi/Database@2.0.0'

export function nodeQuery(
  schemaId: string,
  options: {
    orderBy?: QueryASTOrderBy[]
    first?: number
    aggregates?: { alias: string; function: QueryASTAggregateFunction; field?: string }[]
  } = {}
): QueryASTNodeQuery {
  return {
    version: 1,
    kind: 'node',
    schemaId: schemaId as SchemaIRI,
    ...(options.orderBy ? { orderBy: options.orderBy } : {}),
    ...(options.first ? { page: { first: options.first } } : {}),
    ...(options.aggregates
      ? { aggregates: options.aggregates.map((agg) => ({ kind: 'aggregate' as const, ...agg })) }
      : {})
  }
}

export function stubDescriptor(
  title: string,
  query: SavedViewDescriptor['query']
): SavedViewDescriptor {
  return { version: 1, title, query }
}

/** Pick the preferred stub schema from the runtime's available schemas. */
export function preferredSchema(available: string[], preferred: string[]): string | null {
  for (const candidate of preferred) {
    if (available.includes(candidate)) return candidate
  }
  return available[0] ?? null
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000]
]

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const delta = timestamp - now
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(delta) >= ms) {
      return relativeFormatter.format(Math.round(delta / ms), unit)
    }
  }
  return 'just now'
}

/** Best-effort display title for an arbitrary row. */
export function rowTitle(row: Record<string, unknown>): string {
  for (const key of ['title', 'name', 'label']) {
    const value = row[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return 'Untitled'
}
