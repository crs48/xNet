/**
 * Dashboard variables and query interpolation.
 *
 * Design note (0162 "Variable interpolation into QueryAST"):
 *
 * Placeholders live in comparison-predicate VALUES, never in fields or
 * structure: any string value (or element of `values`) of the form
 * `$timeRange.start`, `$timeRange.end`, or `$<customName>` is replaced with
 * the resolved variable at interpolation time. Interpolation happens in the
 * dashboard runtime BEFORE the descriptor reaches useSavedView/DataBridge,
 * so the bridge's query cache keys on the interpolated descriptor — two
 * widgets bound to the same query and the same variable values share one
 * cache entry; changing a variable produces a new canonical descriptor and a
 * clean re-subscription.
 *
 * The v1 time range additionally supports a declarative binding: a widget's
 * WidgetDataRequest.timeField names the date/number field the dashboard
 * time-range variable constrains. The runtime injects a
 * `field between [start, end]` predicate into every node query of the
 * descriptor — no hand-authored placeholders needed.
 */

import type {
  DashboardTimeRange,
  DashboardVariablesState,
  QueryAST,
  QueryASTNodeQuery,
  QueryASTPredicate,
  SavedViewDescriptor
} from '@xnetjs/data'

const DAY_MS = 24 * 60 * 60 * 1000

export interface ResolvedTimeRange {
  start: number
  end: number
}

/** Resolve a serialized time range to absolute epoch-ms bounds. */
export function resolveTimeRange(
  range: DashboardTimeRange | undefined,
  now: number = Date.now()
): ResolvedTimeRange | null {
  if (!range) return null

  if (range.kind === 'absolute') {
    return { start: range.start, end: range.end }
  }

  switch (range.preset) {
    case 'today': {
      const startOfDay = new Date(now)
      startOfDay.setHours(0, 0, 0, 0)
      return { start: startOfDay.getTime(), end: now }
    }
    case '7d':
      return { start: now - 7 * DAY_MS, end: now }
    case '30d':
      return { start: now - 30 * DAY_MS, end: now }
    case '90d':
      return { start: now - 90 * DAY_MS, end: now }
    case 'all':
      return null
  }
}

/**
 * Flatten the variable state into the lookup map used for `$name`
 * placeholder substitution and exposed to renderers as WidgetProps.variables.
 */
export function resolveVariables(
  state: DashboardVariablesState | undefined,
  now: number = Date.now()
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}
  const timeRange = resolveTimeRange(state?.timeRange, now)

  if (timeRange) {
    resolved['timeRange.start'] = timeRange.start
    resolved['timeRange.end'] = timeRange.end
  }

  for (const [name, value] of Object.entries(state?.custom ?? {})) {
    resolved[name] = value
  }

  return resolved
}

function interpolateScalar(value: unknown, variables: Record<string, unknown>): unknown {
  if (typeof value !== 'string' || !value.startsWith('$')) return value

  const name = value.slice(1)
  return Object.prototype.hasOwnProperty.call(variables, name) ? variables[name] : value
}

function interpolatePredicate(
  predicate: QueryASTPredicate,
  variables: Record<string, unknown>
): QueryASTPredicate {
  if (predicate.kind === 'comparison') {
    return {
      ...predicate,
      ...(Object.prototype.hasOwnProperty.call(predicate, 'value')
        ? { value: interpolateScalar(predicate.value, variables) }
        : {}),
      ...(predicate.values
        ? { values: predicate.values.map((value) => interpolateScalar(value, variables)) }
        : {})
    }
  }

  if (predicate.kind === 'not') {
    return { ...predicate, predicate: interpolatePredicate(predicate.predicate, variables) }
  }

  return {
    ...predicate,
    predicates: predicate.predicates.map((next) => interpolatePredicate(next, variables))
  }
}

function timeRangePredicate(field: string, range: ResolvedTimeRange): QueryASTPredicate {
  return { kind: 'comparison', field, op: 'between', values: [range.start, range.end] }
}

function interpolateNodeQuery(
  query: QueryASTNodeQuery,
  variables: Record<string, unknown>,
  timeField: string | undefined,
  timeRange: ResolvedTimeRange | null
): QueryASTNodeQuery {
  const interpolated = query.predicate
    ? interpolatePredicate(query.predicate, variables)
    : undefined
  const timeBound = timeField && timeRange ? timeRangePredicate(timeField, timeRange) : null

  const predicate =
    interpolated && timeBound
      ? ({ kind: 'and', predicates: [interpolated, timeBound] } as QueryASTPredicate)
      : (timeBound ?? interpolated)

  return {
    ...query,
    ...(predicate ? { predicate } : {})
  }
}

function interpolateQuery(
  query: QueryAST,
  variables: Record<string, unknown>,
  timeField: string | undefined,
  timeRange: ResolvedTimeRange | null
): QueryAST {
  if (query.kind === 'node') {
    return interpolateNodeQuery(query, variables, timeField, timeRange)
  }

  return {
    ...query,
    queries: Object.fromEntries(
      Object.entries(query.queries).map(([queryId, nodeQuery]) => [
        queryId,
        interpolateNodeQuery(nodeQuery, variables, timeField, timeRange)
      ])
    )
  }
}

/**
 * Interpolate dashboard variables into a widget's descriptor.
 *
 * Returns the input descriptor unchanged (same reference) when there is
 * nothing to interpolate, so descriptor identity — and therefore the
 * bridge's canonical query cache key — stays stable for unbound widgets.
 */
export function interpolateDescriptor(
  descriptor: SavedViewDescriptor,
  state: DashboardVariablesState | undefined,
  timeField?: string,
  now: number = Date.now()
): SavedViewDescriptor {
  const variables = resolveVariables(state, now)
  const timeRange = resolveTimeRange(state?.timeRange, now)

  if (Object.keys(variables).length === 0 && !(timeField && timeRange)) {
    return descriptor
  }

  return {
    ...descriptor,
    query: interpolateQuery(descriptor.query, variables, timeField, timeRange)
  }
}
