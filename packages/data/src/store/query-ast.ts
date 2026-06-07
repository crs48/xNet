/**
 * Canonical query AST for advanced Node reads.
 *
 * This module is intentionally storage-agnostic. It provides serializable query
 * shapes, typed helper constructors, and validation/planning metadata for the
 * future relation, aggregate, query-set, and pattern-query surfaces.
 */

import type { NodeQueryPageCountMode, SortDirection, SystemOrderField } from './query'
import type { SchemaIRI } from '../schema/node'
import type { DefinedSchema, InferCreateProps, PropertyBuilder } from '../schema/types'

export const QUERY_AST_VERSION = 1 as const

export type QueryASTVersion = typeof QUERY_AST_VERSION

export type QueryASTField<
  P extends Record<string, PropertyBuilder> = Record<string, PropertyBuilder>
> = Extract<keyof InferCreateProps<P>, string>

export type QueryASTSchemaInput<
  P extends Record<string, PropertyBuilder> = Record<string, PropertyBuilder>
> = SchemaIRI | DefinedSchema<P>

export type QueryASTOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'in'
  | 'contains'
  | 'startsWith'
  | 'isNull'
  | 'isNotNull'

export type QueryASTComparisonPredicate = {
  kind: 'comparison'
  field: string
  op: QueryASTOperator
  value?: unknown
  values?: unknown[]
}

export type QueryASTCompoundPredicate = {
  kind: 'and' | 'or'
  predicates: QueryASTPredicate[]
}

export type QueryASTNotPredicate = {
  kind: 'not'
  predicate: QueryASTPredicate
}

export type QueryASTPredicate =
  | QueryASTComparisonPredicate
  | QueryASTCompoundPredicate
  | QueryASTNotPredicate

export type QueryASTOrderBy = {
  field: string
  direction: SortDirection
}

export type QueryASTPage = {
  first?: number
  after?: string
  offset?: number
  count?: NodeQueryPageCountMode
}

export type QueryASTRelationDirection = 'outbound' | 'inbound'

export type QueryASTRelationInclude = {
  kind: 'relation-include'
  direction: QueryASTRelationDirection
  field: string
  targetSchemaId: SchemaIRI
  query: QueryASTNodeQuery
  cardinality: 'one' | 'many'
  required?: boolean
}

export type QueryASTIncludes = Record<string, QueryASTRelationInclude>

export type QueryASTAggregateFunction = 'count' | 'countDistinct' | 'sum' | 'avg' | 'min' | 'max'

export type QueryASTAggregate = {
  kind: 'aggregate'
  alias: string
  function: QueryASTAggregateFunction
  field?: string
  groupBy?: string[]
  having?: QueryASTPredicate
}

export type QueryASTQuerySetAggregate = {
  kind: 'query-set-aggregate'
  alias: string
  query: string
  function: QueryASTAggregateFunction
  field?: string
}

export type QueryASTNodeQuery = {
  version: QueryASTVersion
  kind: 'node'
  schemaId: SchemaIRI
  predicate?: QueryASTPredicate
  orderBy?: QueryASTOrderBy[]
  page?: QueryASTPage
  include?: QueryASTIncludes
  aggregates?: QueryASTAggregate[]
}

export type QueryASTQuerySet = {
  version: QueryASTVersion
  kind: 'query-set'
  mode: 'batch' | 'dashboard'
  queries: Record<string, QueryASTNodeQuery>
  aggregates?: QueryASTQuerySetAggregate[]
}

export type QueryAST = QueryASTNodeQuery | QueryASTQuerySet

export type QueryASTNodeQueryOptions<
  P extends Record<string, PropertyBuilder> = Record<string, PropertyBuilder>
> = {
  where?: QueryASTPredicate | QueryASTPredicate[]
  orderBy?: Partial<Record<QueryASTField<P> | SystemOrderField, SortDirection>>
  page?: QueryASTPage
  include?: QueryASTIncludes
  aggregates?: QueryASTAggregate[]
}

export type QueryASTRelationIncludeOptions<
  P extends Record<string, PropertyBuilder> = Record<string, PropertyBuilder>
> = QueryASTNodeQueryOptions<P> & {
  cardinality?: 'one' | 'many'
  required?: boolean
}

export type QueryASTValidationError = {
  path: string
  code: string
  message: string
  value?: unknown
}

export type QueryASTValidationResult = {
  valid: boolean
  errors: QueryASTValidationError[]
}

export type QueryASTRelationIndexRequirement = {
  schemaId: SchemaIRI
  property: string
  direction: QueryASTRelationDirection
  targetSchemaId: SchemaIRI
  reason: 'include'
}

export type QueryASTAggregatePlan = {
  path: string
  alias: string
  function: QueryASTAggregateFunction
  strategy: 'node-count' | 'scalar-scan' | 'distinct-scan'
  requiredFields: string[]
  groupBy: string[]
  canUseScalarIndex: boolean
}

export type QueryASTAggregateGroup = {
  key: Record<string, unknown>
  rowCount: number
  value: unknown
}

export type QueryASTAggregateResult = {
  alias: string
  function: QueryASTAggregateFunction
  field?: string
  groupBy: string[]
  rowCount: number
  value: unknown
  groups?: QueryASTAggregateGroup[]
}

export type QueryASTAggregateExecution = {
  scope: 'loaded-snapshot'
  rowCount: number
  results: Record<string, QueryASTAggregateResult>
}

export type QueryASTPlannerGate = {
  validation: QueryASTValidationResult
  relationIndexRequirements: QueryASTRelationIndexRequirement[]
  aggregatePlans: QueryASTAggregatePlan[]
  useFindReady: boolean
  blockers: string[]
}

export type SavedViewDescriptor = {
  version: QueryASTVersion
  title: string
  query: QueryAST
  description?: string
  scope?: 'user' | 'workspace' | 'database'
}

function schemaIdFor<P extends Record<string, PropertyBuilder>>(
  schema: QueryASTSchemaInput<P>
): SchemaIRI {
  return typeof schema === 'string' ? schema : schema.schema['@id']
}

function comparison(field: string, op: QueryASTOperator, value?: unknown): QueryASTPredicate {
  if (op === 'isNull' || op === 'isNotNull') {
    return { kind: 'comparison', field, op }
  }

  return { kind: 'comparison', field, op, value }
}

export function eq<
  P extends Record<string, PropertyBuilder>,
  K extends QueryASTField<P> = QueryASTField<P>
>(field: K, value: InferCreateProps<P>[K]): QueryASTPredicate {
  return comparison(field, 'eq', value)
}

export function neq<
  P extends Record<string, PropertyBuilder>,
  K extends QueryASTField<P> = QueryASTField<P>
>(field: K, value: InferCreateProps<P>[K]): QueryASTPredicate {
  return comparison(field, 'neq', value)
}

export function gt<
  P extends Record<string, PropertyBuilder>,
  K extends QueryASTField<P> = QueryASTField<P>
>(field: K, value: InferCreateProps<P>[K]): QueryASTPredicate {
  return comparison(field, 'gt', value)
}

export function gte<
  P extends Record<string, PropertyBuilder>,
  K extends QueryASTField<P> = QueryASTField<P>
>(field: K, value: InferCreateProps<P>[K]): QueryASTPredicate {
  return comparison(field, 'gte', value)
}

export function lt<
  P extends Record<string, PropertyBuilder>,
  K extends QueryASTField<P> = QueryASTField<P>
>(field: K, value: InferCreateProps<P>[K]): QueryASTPredicate {
  return comparison(field, 'lt', value)
}

export function lte<
  P extends Record<string, PropertyBuilder>,
  K extends QueryASTField<P> = QueryASTField<P>
>(field: K, value: InferCreateProps<P>[K]): QueryASTPredicate {
  return comparison(field, 'lte', value)
}

export function between<
  P extends Record<string, PropertyBuilder>,
  K extends QueryASTField<P> = QueryASTField<P>
>(field: K, from: InferCreateProps<P>[K], to: InferCreateProps<P>[K]): QueryASTPredicate {
  return { kind: 'comparison', field, op: 'between', values: [from, to] }
}

export function includesAny<
  P extends Record<string, PropertyBuilder>,
  K extends QueryASTField<P> = QueryASTField<P>
>(field: K, values: InferCreateProps<P>[K][]): QueryASTPredicate {
  return { kind: 'comparison', field, op: 'in', values }
}

export function contains<
  P extends Record<string, PropertyBuilder>,
  K extends QueryASTField<P> = QueryASTField<P>
>(field: K, value: string): QueryASTPredicate {
  return comparison(field, 'contains', value)
}

export function startsWith<
  P extends Record<string, PropertyBuilder>,
  K extends QueryASTField<P> = QueryASTField<P>
>(field: K, value: string): QueryASTPredicate {
  return comparison(field, 'startsWith', value)
}

export function isNull<
  P extends Record<string, PropertyBuilder>,
  K extends QueryASTField<P> = QueryASTField<P>
>(field: K): QueryASTPredicate {
  return comparison(field, 'isNull')
}

export function isNotNull<
  P extends Record<string, PropertyBuilder>,
  K extends QueryASTField<P> = QueryASTField<P>
>(field: K): QueryASTPredicate {
  return comparison(field, 'isNotNull')
}

export function and(...predicates: QueryASTPredicate[]): QueryASTPredicate {
  return { kind: 'and', predicates }
}

export function or(...predicates: QueryASTPredicate[]): QueryASTPredicate {
  return { kind: 'or', predicates }
}

export function not(predicate: QueryASTPredicate): QueryASTPredicate {
  return { kind: 'not', predicate }
}

export function queryOperators<P extends Record<string, PropertyBuilder>>() {
  return {
    eq: <K extends QueryASTField<P>>(field: K, value: InferCreateProps<P>[K]) =>
      eq<P, K>(field, value),
    neq: <K extends QueryASTField<P>>(field: K, value: InferCreateProps<P>[K]) =>
      neq<P, K>(field, value),
    gt: <K extends QueryASTField<P>>(field: K, value: InferCreateProps<P>[K]) =>
      gt<P, K>(field, value),
    gte: <K extends QueryASTField<P>>(field: K, value: InferCreateProps<P>[K]) =>
      gte<P, K>(field, value),
    lt: <K extends QueryASTField<P>>(field: K, value: InferCreateProps<P>[K]) =>
      lt<P, K>(field, value),
    lte: <K extends QueryASTField<P>>(field: K, value: InferCreateProps<P>[K]) =>
      lte<P, K>(field, value),
    between: <K extends QueryASTField<P>>(
      field: K,
      from: InferCreateProps<P>[K],
      to: InferCreateProps<P>[K]
    ) => between<P, K>(field, from, to),
    includesAny: <K extends QueryASTField<P>>(field: K, values: InferCreateProps<P>[K][]) =>
      includesAny<P, K>(field, values),
    contains: <K extends QueryASTField<P>>(field: K, value: string) => contains<P, K>(field, value),
    startsWith: <K extends QueryASTField<P>>(field: K, value: string) =>
      startsWith<P, K>(field, value),
    isNull: <K extends QueryASTField<P>>(field: K) => isNull<P, K>(field),
    isNotNull: <K extends QueryASTField<P>>(field: K) => isNotNull<P, K>(field)
  }
}

function normalizePredicate(
  predicate?: QueryASTPredicate | QueryASTPredicate[]
): QueryASTPredicate | undefined {
  if (!predicate) return undefined
  return Array.isArray(predicate) ? and(...predicate) : predicate
}

function normalizeOrderBy(
  orderBy?: Partial<Record<string, SortDirection>>
): QueryASTOrderBy[] | undefined {
  const entries = Object.entries(orderBy ?? {})
    .filter((entry): entry is [string, SortDirection] => isSortDirection(entry[1]))
    .sort(([left], [right]) => left.localeCompare(right))
  return entries.length > 0
    ? entries.map(([field, direction]) => ({ field, direction }))
    : undefined
}

export function defineNodeQueryAST<
  P extends Record<string, PropertyBuilder> = Record<string, PropertyBuilder>
>(schema: QueryASTSchemaInput<P>, options: QueryASTNodeQueryOptions<P> = {}): QueryASTNodeQuery {
  const predicate = normalizePredicate(options.where)
  const orderBy = normalizeOrderBy(options.orderBy)

  return {
    version: QUERY_AST_VERSION,
    kind: 'node',
    schemaId: schemaIdFor(schema),
    ...(predicate ? { predicate } : {}),
    ...(orderBy ? { orderBy } : {}),
    ...(options.page ? { page: { ...options.page } } : {}),
    ...(options.include ? { include: options.include } : {}),
    ...(options.aggregates && options.aggregates.length > 0
      ? { aggregates: options.aggregates }
      : {})
  }
}

export function follow<P extends Record<string, PropertyBuilder> = Record<string, PropertyBuilder>>(
  schema: QueryASTSchemaInput<P>,
  field: QueryASTField<P>,
  options: QueryASTRelationIncludeOptions<P> = {}
): QueryASTRelationInclude {
  return {
    kind: 'relation-include',
    direction: 'outbound',
    field,
    targetSchemaId: schemaIdFor(schema),
    query: defineNodeQueryAST(schema, options),
    cardinality: options.cardinality ?? 'one',
    ...(options.required ? { required: true } : {})
  }
}

export function from<P extends Record<string, PropertyBuilder> = Record<string, PropertyBuilder>>(
  schema: QueryASTSchemaInput<P>,
  field: QueryASTField<P>,
  options: QueryASTRelationIncludeOptions<P> = {}
): QueryASTRelationInclude {
  return {
    kind: 'relation-include',
    direction: 'inbound',
    field,
    targetSchemaId: schemaIdFor(schema),
    query: defineNodeQueryAST(schema, options),
    cardinality: options.cardinality ?? 'many',
    ...(options.required ? { required: true } : {})
  }
}

export function count(alias = 'count'): QueryASTAggregate {
  return { kind: 'aggregate', alias, function: 'count' }
}

export function countDistinct(field: string, alias = `${field}Count`): QueryASTAggregate {
  return { kind: 'aggregate', alias, function: 'countDistinct', field }
}

export function sum(field: string, alias = `${field}Sum`): QueryASTAggregate {
  return { kind: 'aggregate', alias, function: 'sum', field }
}

export function avg(field: string, alias = `${field}Avg`): QueryASTAggregate {
  return { kind: 'aggregate', alias, function: 'avg', field }
}

export function min(field: string, alias = `${field}Min`): QueryASTAggregate {
  return { kind: 'aggregate', alias, function: 'min', field }
}

export function max(field: string, alias = `${field}Max`): QueryASTAggregate {
  return { kind: 'aggregate', alias, function: 'max', field }
}

export function groupBy(aggregate: QueryASTAggregate, ...fields: string[]): QueryASTAggregate {
  return { ...aggregate, groupBy: fields }
}

export function having(
  aggregate: QueryASTAggregate,
  predicate: QueryASTPredicate
): QueryASTAggregate {
  return { ...aggregate, having: predicate }
}

export function defineQuerySetAST(
  queries: Record<string, QueryASTNodeQuery>,
  options: {
    mode?: QueryASTQuerySet['mode']
    aggregates?: QueryASTQuerySetAggregate[]
  } = {}
): QueryASTQuerySet {
  return {
    version: QUERY_AST_VERSION,
    kind: 'query-set',
    mode: options.mode ?? 'batch',
    queries,
    ...(options.aggregates && options.aggregates.length > 0
      ? { aggregates: options.aggregates }
      : {})
  }
}

export function dashboardQuerySet(
  queries: Record<string, QueryASTNodeQuery>,
  aggregates: QueryASTQuerySetAggregate[] = []
): QueryASTQuerySet {
  return defineQuerySetAST(queries, { mode: 'dashboard', aggregates })
}

export function querySetCount(query: string, alias = `${query}Count`): QueryASTQuerySetAggregate {
  return { kind: 'query-set-aggregate', query, alias, function: 'count' }
}

export function defineSavedViewDescriptor(
  descriptor: Omit<SavedViewDescriptor, 'version'>
): SavedViewDescriptor {
  return {
    version: QUERY_AST_VERSION,
    ...descriptor
  }
}

function getQueryASTRowValue(row: unknown, field: string): unknown {
  const record = objectValue(row)
  if (!record) return undefined

  if (Object.prototype.hasOwnProperty.call(record, field)) {
    return record[field]
  }

  return objectValue(record.properties)?.[field]
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function stableValueKey(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value !== 'object') return `${typeof value}:${String(value)}`
  if (Array.isArray(value)) return `[${value.map(stableValueKey).join(',')}]`

  const record = objectValue(value)
  if (!record) return String(value)

  return `{${Object.entries(record)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, next]) => `${key}:${stableValueKey(next)}`)
    .join(',')}}`
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return stableValueKey(left) === stableValueKey(right)
}

function compareValues(left: unknown, right: unknown): number | null {
  const leftNumber = toFiniteNumber(left)
  const rightNumber = toFiniteNumber(right)

  if (leftNumber !== null && rightNumber !== null) {
    return leftNumber - rightNumber
  }

  if (typeof left === 'string' && typeof right === 'string') {
    return left.localeCompare(right)
  }

  return null
}

export function matchesQueryASTLoadedRow(row: unknown, predicate: QueryASTPredicate): boolean {
  if (predicate.kind === 'and') {
    return predicate.predicates.every((next) => matchesQueryASTLoadedRow(row, next))
  }

  if (predicate.kind === 'or') {
    return predicate.predicates.some((next) => matchesQueryASTLoadedRow(row, next))
  }

  if (predicate.kind === 'not') {
    return !matchesQueryASTLoadedRow(row, predicate.predicate)
  }

  if (predicate.kind !== 'comparison') {
    return false
  }

  const value = getQueryASTRowValue(row, predicate.field)

  if (predicate.op === 'eq') return valuesEqual(value, predicate.value)
  if (predicate.op === 'neq') return !valuesEqual(value, predicate.value)
  if (predicate.op === 'isNull') return value === null || value === undefined
  if (predicate.op === 'isNotNull') return value !== null && value !== undefined
  if (predicate.op === 'in') {
    return (predicate.values ?? []).some((next) => valuesEqual(value, next))
  }
  if (predicate.op === 'contains') {
    if (typeof value === 'string') return value.includes(String(predicate.value ?? ''))
    if (Array.isArray(value)) return value.some((next) => valuesEqual(next, predicate.value))
    return false
  }
  if (predicate.op === 'startsWith') {
    return typeof value === 'string' && value.startsWith(String(predicate.value ?? ''))
  }

  if (predicate.op === 'between') {
    const [from, to] = predicate.values ?? []
    const fromComparison = compareValues(value, from)
    const toComparison = compareValues(value, to)
    return (
      fromComparison !== null && toComparison !== null && fromComparison >= 0 && toComparison <= 0
    )
  }

  const comparison = compareValues(value, predicate.value)
  if (comparison === null) return false
  if (predicate.op === 'gt') return comparison > 0
  if (predicate.op === 'gte') return comparison >= 0
  if (predicate.op === 'lt') return comparison < 0
  if (predicate.op === 'lte') return comparison <= 0

  return false
}

export function filterQueryASTLoadedRows<T>(
  rows: readonly T[],
  predicate: QueryASTPredicate | undefined
): T[] {
  if (!predicate) return [...rows]

  return rows.filter((row) => matchesQueryASTLoadedRow(row, predicate))
}

function aggregateValue(aggregate: QueryASTAggregate, rows: readonly unknown[]): unknown {
  if (aggregate.function === 'count') {
    return rows.length
  }

  const values = rows
    .map((row) => (aggregate.field ? getQueryASTRowValue(row, aggregate.field) : undefined))
    .filter((value) => value !== null && value !== undefined)

  if (aggregate.function === 'countDistinct') {
    return new Set(values.map(stableValueKey)).size
  }

  const numbers = values.flatMap((value) => {
    const numberValue = toFiniteNumber(value)
    return numberValue === null ? [] : [numberValue]
  })

  if (aggregate.function === 'sum') {
    return numbers.reduce((total, next) => total + next, 0)
  }

  if (numbers.length === 0) {
    return null
  }

  if (aggregate.function === 'avg') {
    return numbers.reduce((total, next) => total + next, 0) / numbers.length
  }

  if (aggregate.function === 'min') {
    return Math.min(...numbers)
  }

  if (aggregate.function === 'max') {
    return Math.max(...numbers)
  }

  return null
}

function aggregateGroups(
  aggregate: QueryASTAggregate,
  rows: readonly unknown[]
): QueryASTAggregateGroup[] | undefined {
  const groupByFields = aggregate.groupBy ?? []
  if (groupByFields.length === 0) return undefined

  const groups = rows.reduce<Map<string, { key: Record<string, unknown>; rows: unknown[] }>>(
    (map, row) => {
      const key = Object.fromEntries(
        groupByFields.map((field) => [field, getQueryASTRowValue(row, field)])
      )
      const groupKey = stableValueKey(key)
      const group = map.get(groupKey) ?? { key, rows: [] }
      group.rows.push(row)
      map.set(groupKey, group)
      return map
    },
    new Map()
  )

  const results = [...groups.values()].map<QueryASTAggregateGroup>((group) => ({
    key: group.key,
    rowCount: group.rows.length,
    value: aggregateValue(aggregate, group.rows)
  }))

  if (!aggregate.having) {
    return results
  }

  const havingPredicate = aggregate.having
  return results.filter((group) =>
    matchesQueryASTLoadedRow({ ...group.key, [aggregate.alias]: group.value }, havingPredicate)
  )
}

function executeLoadedAggregate(
  aggregate: QueryASTAggregate,
  rows: readonly unknown[]
): QueryASTAggregateResult {
  const groups = aggregateGroups(aggregate, rows)

  return {
    alias: aggregate.alias,
    function: aggregate.function,
    ...(aggregate.field ? { field: aggregate.field } : {}),
    groupBy: aggregate.groupBy ?? [],
    rowCount: rows.length,
    value: aggregateValue(aggregate, rows),
    ...(groups ? { groups } : {})
  }
}

export function executeQueryASTLoadedAggregates(
  query: QueryASTNodeQuery,
  rows: readonly unknown[]
): QueryASTAggregateExecution {
  return {
    scope: 'loaded-snapshot',
    rowCount: rows.length,
    results: Object.fromEntries(
      (query.aggregates ?? []).map((aggregate) => [
        aggregate.alias,
        executeLoadedAggregate(aggregate, rows)
      ])
    )
  }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isSortDirection(value: unknown): value is SortDirection {
  return value === 'asc' || value === 'desc'
}

function isCountMode(value: unknown): value is NodeQueryPageCountMode {
  return value === 'exact' || value === 'estimate' || value === 'none'
}

function isAggregateFunction(value: unknown): value is QueryASTAggregateFunction {
  return (
    value === 'count' ||
    value === 'countDistinct' ||
    value === 'sum' ||
    value === 'avg' ||
    value === 'min' ||
    value === 'max'
  )
}

function isOperator(value: unknown): value is QueryASTOperator {
  return (
    value === 'eq' ||
    value === 'neq' ||
    value === 'gt' ||
    value === 'gte' ||
    value === 'lt' ||
    value === 'lte' ||
    value === 'between' ||
    value === 'in' ||
    value === 'contains' ||
    value === 'startsWith' ||
    value === 'isNull' ||
    value === 'isNotNull'
  )
}

function pushError(
  errors: QueryASTValidationError[],
  path: string,
  code: string,
  message: string,
  value?: unknown
): void {
  errors.push({
    path,
    code,
    message,
    ...(value !== undefined ? { value } : {})
  })
}

function validatePredicate(value: unknown, path: string, errors: QueryASTValidationError[]): void {
  const predicate = objectValue(value)
  if (!predicate) {
    pushError(errors, path, 'QUERY_AST_PREDICATE_OBJECT', 'Predicate must be an object', value)
    return
  }

  if (predicate.kind === 'comparison') {
    if (!isNonEmptyString(predicate.field)) {
      pushError(errors, `${path}.field`, 'QUERY_AST_FIELD', 'Comparison field is required')
    }
    if (!isOperator(predicate.op)) {
      pushError(errors, `${path}.op`, 'QUERY_AST_OPERATOR', 'Unsupported comparison operator')
      return
    }
    if (predicate.op === 'between') {
      if (!Array.isArray(predicate.values) || predicate.values.length !== 2) {
        pushError(
          errors,
          `${path}.values`,
          'QUERY_AST_BETWEEN_VALUES',
          'between requires exactly two values'
        )
      }
      return
    }
    if (predicate.op === 'in') {
      if (!Array.isArray(predicate.values) || predicate.values.length === 0) {
        pushError(errors, `${path}.values`, 'QUERY_AST_IN_VALUES', 'in requires values')
      }
      return
    }
    return
  }

  if (predicate.kind === 'and' || predicate.kind === 'or') {
    if (!Array.isArray(predicate.predicates) || predicate.predicates.length === 0) {
      pushError(
        errors,
        `${path}.predicates`,
        'QUERY_AST_COMPOUND_PREDICATES',
        `${predicate.kind} requires at least one predicate`
      )
      return
    }
    predicate.predicates.forEach((child, index) => {
      validatePredicate(child, `${path}.predicates.${index}`, errors)
    })
    return
  }

  if (predicate.kind === 'not') {
    validatePredicate(predicate.predicate, `${path}.predicate`, errors)
    return
  }

  pushError(errors, `${path}.kind`, 'QUERY_AST_PREDICATE_KIND', 'Unsupported predicate kind')
}

function validatePage(value: unknown, path: string, errors: QueryASTValidationError[]): void {
  const page = objectValue(value)
  if (!page) {
    pushError(errors, path, 'QUERY_AST_PAGE_OBJECT', 'Page options must be an object', value)
    return
  }

  if (page.first !== undefined) {
    const first = page.first
    if (typeof first !== 'number' || !Number.isInteger(first) || first <= 0) {
      pushError(errors, `${path}.first`, 'QUERY_AST_PAGE_FIRST', 'first must be a positive integer')
    }
  }
  if (page.offset !== undefined) {
    const offset = page.offset
    if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
      pushError(
        errors,
        `${path}.offset`,
        'QUERY_AST_PAGE_OFFSET',
        'offset must be a non-negative integer'
      )
    }
  }
  if (page.after !== undefined && !isNonEmptyString(page.after)) {
    pushError(errors, `${path}.after`, 'QUERY_AST_PAGE_AFTER', 'after must be a cursor string')
  }
  if (page.count !== undefined && !isCountMode(page.count)) {
    pushError(errors, `${path}.count`, 'QUERY_AST_PAGE_COUNT', 'Unsupported count mode')
  }
}

function validateAggregate(value: unknown, path: string, errors: QueryASTValidationError[]): void {
  const aggregate = objectValue(value)
  if (!aggregate) {
    pushError(errors, path, 'QUERY_AST_AGGREGATE_OBJECT', 'Aggregate must be an object', value)
    return
  }
  if (aggregate.kind !== 'aggregate') {
    pushError(errors, `${path}.kind`, 'QUERY_AST_AGGREGATE_KIND', 'Aggregate kind is required')
  }
  if (!isNonEmptyString(aggregate.alias)) {
    pushError(errors, `${path}.alias`, 'QUERY_AST_AGGREGATE_ALIAS', 'Aggregate alias is required')
  }
  if (!isAggregateFunction(aggregate.function)) {
    pushError(
      errors,
      `${path}.function`,
      'QUERY_AST_AGGREGATE_FUNCTION',
      'Unsupported aggregate function'
    )
  }
  if (aggregate.function !== 'count' && !isNonEmptyString(aggregate.field)) {
    pushError(
      errors,
      `${path}.field`,
      'QUERY_AST_AGGREGATE_FIELD',
      'Non-count aggregates require a field'
    )
  }
  if (
    aggregate.groupBy !== undefined &&
    (!Array.isArray(aggregate.groupBy) || !aggregate.groupBy.every(isNonEmptyString))
  ) {
    pushError(errors, `${path}.groupBy`, 'QUERY_AST_GROUP_BY', 'groupBy must be field names')
  }
  if (aggregate.having !== undefined) {
    validatePredicate(aggregate.having, `${path}.having`, errors)
  }
}

function validateInclude(value: unknown, path: string, errors: QueryASTValidationError[]): void {
  const include = objectValue(value)
  if (!include) {
    pushError(errors, path, 'QUERY_AST_INCLUDE_OBJECT', 'Include must be an object', value)
    return
  }
  if (include.kind !== 'relation-include') {
    pushError(errors, `${path}.kind`, 'QUERY_AST_INCLUDE_KIND', 'Include kind is required')
  }
  if (include.direction !== 'outbound' && include.direction !== 'inbound') {
    pushError(
      errors,
      `${path}.direction`,
      'QUERY_AST_INCLUDE_DIRECTION',
      'Include direction must be outbound or inbound'
    )
  }
  if (!isNonEmptyString(include.field)) {
    pushError(errors, `${path}.field`, 'QUERY_AST_INCLUDE_FIELD', 'Relation field is required')
  }
  if (!isNonEmptyString(include.targetSchemaId)) {
    pushError(
      errors,
      `${path}.targetSchemaId`,
      'QUERY_AST_INCLUDE_SCHEMA',
      'Target schema is required'
    )
  }
  if (include.cardinality !== 'one' && include.cardinality !== 'many') {
    pushError(
      errors,
      `${path}.cardinality`,
      'QUERY_AST_INCLUDE_CARDINALITY',
      'Include cardinality must be one or many'
    )
  }
  validateNodeQuery(include.query, `${path}.query`, errors)
}

function validateNodeQuery(value: unknown, path: string, errors: QueryASTValidationError[]): void {
  const query = objectValue(value)
  if (!query) {
    pushError(errors, path, 'QUERY_AST_QUERY_OBJECT', 'Node query must be an object', value)
    return
  }

  if (query.version !== QUERY_AST_VERSION) {
    pushError(errors, `${path}.version`, 'QUERY_AST_VERSION', 'Unsupported query AST version')
  }
  if (query.kind !== 'node') {
    pushError(errors, `${path}.kind`, 'QUERY_AST_KIND', 'Expected node query')
  }
  if (!isNonEmptyString(query.schemaId)) {
    pushError(errors, `${path}.schemaId`, 'QUERY_AST_SCHEMA', 'schemaId is required')
  }
  if (query.predicate !== undefined) {
    validatePredicate(query.predicate, `${path}.predicate`, errors)
  }
  if (
    query.orderBy !== undefined &&
    (!Array.isArray(query.orderBy) ||
      !query.orderBy.every((entry, index) => {
        const order = objectValue(entry)
        if (!order) {
          pushError(
            errors,
            `${path}.orderBy.${index}`,
            'QUERY_AST_ORDER_OBJECT',
            'orderBy entries must be objects'
          )
          return false
        }
        if (!isNonEmptyString(order.field)) {
          pushError(
            errors,
            `${path}.orderBy.${index}.field`,
            'QUERY_AST_ORDER_FIELD',
            'Field is required'
          )
        }
        if (!isSortDirection(order.direction)) {
          pushError(
            errors,
            `${path}.orderBy.${index}.direction`,
            'QUERY_AST_ORDER_DIRECTION',
            'Direction must be asc or desc'
          )
        }
        return true
      }))
  ) {
    pushError(errors, `${path}.orderBy`, 'QUERY_AST_ORDER_BY', 'orderBy must be an array')
  }
  if (query.page !== undefined) {
    validatePage(query.page, `${path}.page`, errors)
  }
  if (query.include !== undefined) {
    const include = objectValue(query.include)
    if (!include) {
      pushError(errors, `${path}.include`, 'QUERY_AST_INCLUDE_MAP', 'include must be an object')
    } else {
      Object.entries(include).forEach(([alias, child]) => {
        if (!isNonEmptyString(alias)) {
          pushError(
            errors,
            `${path}.include`,
            'QUERY_AST_INCLUDE_ALIAS',
            'Include alias is required'
          )
        }
        validateInclude(child, `${path}.include.${alias}`, errors)
      })
    }
  }
  if (query.aggregates !== undefined) {
    if (!Array.isArray(query.aggregates)) {
      pushError(errors, `${path}.aggregates`, 'QUERY_AST_AGGREGATES', 'aggregates must be an array')
    } else {
      query.aggregates.forEach((aggregate, index) => {
        validateAggregate(aggregate, `${path}.aggregates.${index}`, errors)
      })
    }
  }
}

function validateQuerySetAggregate(
  value: unknown,
  path: string,
  errors: QueryASTValidationError[]
): void {
  const aggregate = objectValue(value)
  if (!aggregate) {
    pushError(errors, path, 'QUERY_AST_QUERY_SET_AGGREGATE_OBJECT', 'Aggregate must be an object')
    return
  }
  if (aggregate.kind !== 'query-set-aggregate') {
    pushError(
      errors,
      `${path}.kind`,
      'QUERY_AST_QUERY_SET_AGGREGATE_KIND',
      'Query-set aggregate kind is required'
    )
  }
  if (!isNonEmptyString(aggregate.alias)) {
    pushError(errors, `${path}.alias`, 'QUERY_AST_QUERY_SET_AGGREGATE_ALIAS', 'Alias is required')
  }
  if (!isNonEmptyString(aggregate.query)) {
    pushError(
      errors,
      `${path}.query`,
      'QUERY_AST_QUERY_SET_AGGREGATE_QUERY',
      'Query key is required'
    )
  }
  if (!isAggregateFunction(aggregate.function)) {
    pushError(
      errors,
      `${path}.function`,
      'QUERY_AST_QUERY_SET_AGGREGATE_FUNCTION',
      'Unsupported aggregate function'
    )
  }
}

function validateQuerySet(value: unknown, path: string, errors: QueryASTValidationError[]): void {
  const querySet = objectValue(value)
  if (!querySet) {
    pushError(errors, path, 'QUERY_AST_QUERY_SET_OBJECT', 'Query set must be an object', value)
    return
  }
  if (querySet.version !== QUERY_AST_VERSION) {
    pushError(errors, `${path}.version`, 'QUERY_AST_VERSION', 'Unsupported query AST version')
  }
  if (querySet.kind !== 'query-set') {
    pushError(errors, `${path}.kind`, 'QUERY_AST_KIND', 'Expected query-set')
  }
  if (querySet.mode !== 'batch' && querySet.mode !== 'dashboard') {
    pushError(errors, `${path}.mode`, 'QUERY_AST_QUERY_SET_MODE', 'mode must be batch or dashboard')
  }

  const queries = objectValue(querySet.queries)
  if (!queries || Object.keys(queries).length === 0) {
    pushError(errors, `${path}.queries`, 'QUERY_AST_QUERY_SET_QUERIES', 'queries are required')
  } else {
    Object.entries(queries).forEach(([key, query]) => {
      validateNodeQuery(query, `${path}.queries.${key}`, errors)
    })
  }

  if (querySet.aggregates !== undefined) {
    if (!Array.isArray(querySet.aggregates)) {
      pushError(
        errors,
        `${path}.aggregates`,
        'QUERY_AST_QUERY_SET_AGGREGATES',
        'aggregates must be an array'
      )
    } else {
      querySet.aggregates.forEach((aggregate, index) => {
        validateQuerySetAggregate(aggregate, `${path}.aggregates.${index}`, errors)
      })
    }
  }
}

export function validateQueryAST(value: unknown): QueryASTValidationResult {
  const errors: QueryASTValidationError[] = []
  const ast = objectValue(value)

  if (!ast) {
    return {
      valid: false,
      errors: [
        {
          path: '$',
          code: 'QUERY_AST_OBJECT',
          message: 'Query AST must be an object',
          value
        }
      ]
    }
  }

  if (ast.kind === 'node') {
    validateNodeQuery(value, '$', errors)
  } else if (ast.kind === 'query-set') {
    validateQuerySet(value, '$', errors)
  } else {
    pushError(errors, '$.kind', 'QUERY_AST_KIND', 'Unsupported query AST kind')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

export function validateSavedViewDescriptor(value: unknown): QueryASTValidationResult {
  const descriptor = objectValue(value)
  const errors: QueryASTValidationError[] = []

  if (!descriptor) {
    return {
      valid: false,
      errors: [
        {
          path: '$',
          code: 'SAVED_VIEW_DESCRIPTOR_OBJECT',
          message: 'Saved view descriptor must be an object',
          value
        }
      ]
    }
  }

  if (descriptor.version !== QUERY_AST_VERSION) {
    pushError(
      errors,
      '$.version',
      'SAVED_VIEW_DESCRIPTOR_VERSION',
      'Unsupported descriptor version'
    )
  }
  if (!isNonEmptyString(descriptor.title)) {
    pushError(errors, '$.title', 'SAVED_VIEW_DESCRIPTOR_TITLE', 'Title is required')
  }
  if (
    descriptor.scope !== undefined &&
    descriptor.scope !== 'user' &&
    descriptor.scope !== 'workspace' &&
    descriptor.scope !== 'database'
  ) {
    pushError(errors, '$.scope', 'SAVED_VIEW_DESCRIPTOR_SCOPE', 'Unsupported saved view scope')
  }

  const queryResult = validateQueryAST(descriptor.query)
  queryResult.errors.forEach((error) => {
    errors.push({
      ...error,
      path: `$.query${error.path.slice(1)}`
    })
  })

  return {
    valid: errors.length === 0,
    errors
  }
}

function predicateFields(predicate: QueryASTPredicate | undefined): string[] {
  if (!predicate) return []
  if (predicate.kind === 'comparison') return [predicate.field]
  if (predicate.kind === 'not') return predicateFields(predicate.predicate)

  return predicate.predicates.flatMap(predicateFields)
}

function aggregatePlanFor(aggregate: QueryASTAggregate, path: string): QueryASTAggregatePlan {
  const groupByFields = aggregate.groupBy ?? []
  const havingFields = predicateFields(aggregate.having)
  const aggregateField = aggregate.field ? [aggregate.field] : []
  const requiredFields = [...new Set([...aggregateField, ...groupByFields, ...havingFields])]
  const strategy =
    aggregate.function === 'count' && requiredFields.length === 0
      ? 'node-count'
      : aggregate.function === 'countDistinct'
        ? 'distinct-scan'
        : 'scalar-scan'

  return {
    path,
    alias: aggregate.alias,
    function: aggregate.function,
    strategy,
    requiredFields,
    groupBy: groupByFields,
    canUseScalarIndex: requiredFields.length > 0
  }
}

function nodeAggregatePlans(query: QueryASTNodeQuery, path: string): QueryASTAggregatePlan[] {
  const ownPlans = (query.aggregates ?? []).map((aggregate, index) =>
    aggregatePlanFor(aggregate, `${path}.aggregates.${index}`)
  )
  const includePlans = Object.entries(query.include ?? {}).flatMap(([alias, include]) =>
    nodeAggregatePlans(include.query, `${path}.include.${alias}.query`)
  )

  return [...ownPlans, ...includePlans]
}

export function planQueryASTAggregates(ast: QueryAST): QueryASTAggregatePlan[] {
  if (ast.kind === 'node') {
    return nodeAggregatePlans(ast, '$')
  }

  const queryPlans = Object.entries(ast.queries).flatMap(([key, query]) =>
    nodeAggregatePlans(query, `$.queries.${key}`)
  )
  const aggregatePlans = (ast.aggregates ?? []).map<QueryASTAggregatePlan>((aggregate, index) => ({
    path: `$.aggregates.${index}`,
    alias: aggregate.alias,
    function: aggregate.function,
    strategy:
      aggregate.function === 'count'
        ? 'node-count'
        : aggregate.function === 'countDistinct'
          ? 'distinct-scan'
          : 'scalar-scan',
    requiredFields: aggregate.field ? [aggregate.field] : [],
    groupBy: [],
    canUseScalarIndex: aggregate.field !== undefined
  }))

  return [...queryPlans, ...aggregatePlans]
}

function relationIndexRequirementsForNode(
  query: QueryASTNodeQuery
): QueryASTRelationIndexRequirement[] {
  return Object.values(query.include ?? {}).flatMap((include) => {
    const ownRequirement =
      include.direction === 'inbound'
        ? [
            {
              schemaId: include.targetSchemaId,
              property: include.field,
              direction: include.direction,
              targetSchemaId: query.schemaId,
              reason: 'include' as const
            }
          ]
        : []

    return [...ownRequirement, ...relationIndexRequirementsForNode(include.query)]
  })
}

export function getQueryASTRelationIndexRequirements(
  ast: QueryAST
): QueryASTRelationIndexRequirement[] {
  if (ast.kind === 'node') {
    return relationIndexRequirementsForNode(ast)
  }

  return Object.values(ast.queries).flatMap(relationIndexRequirementsForNode)
}

export function evaluateQueryASTPlannerGate(value: unknown): QueryASTPlannerGate {
  const validation = validateQueryAST(value)
  if (!validation.valid) {
    return {
      validation,
      relationIndexRequirements: [],
      aggregatePlans: [],
      useFindReady: false,
      blockers: ['query-ast-validation-failed']
    }
  }

  const ast = value as QueryAST
  return {
    validation,
    relationIndexRequirements: getQueryASTRelationIndexRequirements(ast),
    aggregatePlans: planQueryASTAggregates(ast),
    useFindReady: true,
    blockers: []
  }
}
