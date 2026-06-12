/**
 * Query-frame → widget adapter (0162 phase 3): canvas query frames and
 * dashboard widget instances are the same concept (query + presentation +
 * refresh policy) on different layout substrates. This maps a
 * CanvasQueryFrameDefinition onto a saved-view widget instance so frame
 * results can render through the shared widget renderers.
 *
 * Schema- and search-backed frames lower cleanly; database- and
 * plugin-backed frames need their own data paths and return null.
 */

import type {
  DashboardWidgetInstance,
  QueryASTOrderBy,
  QueryASTPredicate,
  SavedViewDescriptor,
  SchemaIRI
} from '@xnetjs/data'

/** Structural mirror of CanvasQueryFrameDefinition (no canvas dependency). */
export interface QueryFrameDefinitionLike {
  id: string
  source: 'database' | 'schema' | 'search' | 'plugin' | 'custom'
  label: string
  schemaId?: string
  queryText?: string
  filters: ReadonlyArray<{ field: string; operator: string; value?: unknown }>
  sorts: ReadonlyArray<{ field: string; direction: 'asc' | 'desc' }>
  limit: number
  refreshMode: 'manual' | 'on-open' | 'live'
}

const FILTER_OPERATORS: Record<string, string> = {
  equals: 'eq',
  'not-equals': 'neq',
  contains: 'contains',
  'greater-than': 'gt',
  'greater-than-or-equal': 'gte',
  'less-than': 'lt',
  'less-than-or-equal': 'lte',
  in: 'in',
  exists: 'isNotNull'
}

function framePredicate(
  filters: QueryFrameDefinitionLike['filters']
): QueryASTPredicate | undefined {
  const predicates: QueryASTPredicate[] = []

  for (const filter of filters) {
    const op = FILTER_OPERATORS[filter.operator]
    if (!op) return undefined // unmappable filter: don't silently drop it

    predicates.push({
      kind: 'comparison',
      field: filter.field,
      op: op as never,
      ...(op === 'in'
        ? { values: Array.isArray(filter.value) ? filter.value : [filter.value] }
        : op === 'isNotNull'
          ? {}
          : { value: filter.value })
    })
  }

  if (predicates.length === 0) return undefined
  if (predicates.length === 1) return predicates[0]
  return { kind: 'and', predicates }
}

/**
 * Map a query frame onto a saved-view widget instance, or null when the
 * frame's source/filters have no widget-query equivalent yet.
 */
export function widgetInstanceFromQueryFrame(
  frame: QueryFrameDefinitionLike
): DashboardWidgetInstance | null {
  // Search frames need the bridge's full-text path (not in QueryAST yet);
  // database/plugin frames have their own data paths.
  if (frame.source !== 'schema') return null
  if (!frame.schemaId) return null

  const predicate = framePredicate(frame.filters)
  if (!predicate && frame.filters.length > 0) return null

  const descriptor: SavedViewDescriptor = {
    version: 1,
    title: frame.label,
    query: {
      version: 1,
      kind: 'node',
      schemaId: frame.schemaId as SchemaIRI,
      ...(predicate ? { predicate } : {}),
      ...(frame.sorts.length > 0
        ? { orderBy: frame.sorts.map((sort): QueryASTOrderBy => ({ ...sort })) }
        : {}),
      page: { first: frame.limit }
    }
  }

  return {
    id: `query-frame:${frame.id}`,
    widgetType: 'view.saved',
    config: { title: frame.label },
    query: descriptor,
    refresh: frame.refreshMode === 'live' ? 'live' : 'on-open'
  }
}
