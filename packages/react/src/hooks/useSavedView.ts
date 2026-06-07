/**
 * useSavedView - Execute persisted SavedView descriptors.
 */

import type { QueryFilter, QueryPlanSummary, QueryStatus } from './useQuery'
import type {
  DefinedSchema,
  InferCreateProps,
  NodeState,
  PropertyBuilder,
  QueryAST,
  QueryASTAggregateExecution,
  QueryASTNodeQuery,
  QueryASTOrderBy,
  QueryASTPage,
  QueryASTPlannerGate,
  QueryASTPredicate,
  QueryASTValidationResult,
  SavedViewDescriptor
} from '@xnetjs/data'
import type {
  QueryExecutionMode,
  QueryMetadata,
  QueryPageInfo,
  QuerySearchFilter,
  QuerySourcePreference
} from '@xnetjs/data-bridge'
import {
  evaluateQueryASTPlannerGate,
  executeQueryASTLoadedAggregates,
  validateSavedViewDescriptor
} from '@xnetjs/data'
import { createQueryDescriptor, serializeQueryDescriptor } from '@xnetjs/data-bridge'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDataBridge } from '../context'
import { flattenNodes, type FlatNode } from '../utils/flattenNode'

type RegistrySchema = DefinedSchema<Record<string, PropertyBuilder>>

type CompiledSavedViewQuery = {
  queryId: string
  schema: RegistrySchema | null
  ast: QueryASTNodeQuery
  filter: QueryFilter<Record<string, PropertyBuilder>>
  plannerGate: QueryASTPlannerGate
  blockers: string[]
  warnings: string[]
  canExecute: boolean
}

type QuerySnapshotState = {
  raw: NodeState[] | null
  metadata: QueryMetadata | null
}

export type SavedViewSchemaRegistry = readonly RegistrySchema[]

export type SavedViewPrivacySummary = {
  counts: Record<string, number>
  sensitiveCount: number
}

export type SavedViewQueryOverride = {
  search?: string | QuerySearchFilter
  orderBy?: QueryASTOrderBy[]
  page?: QueryASTPage
}

export type UseSavedViewOptions = Pick<
  QueryFilter<Record<string, PropertyBuilder>>,
  'includeDeleted' | 'materializedView'
> & {
  mode?: QueryExecutionMode
  source?: QuerySourcePreference
  search?: string | QuerySearchFilter
  includePolicy?: 'ignore' | 'block'
  queryOverrides?: Record<string, SavedViewQueryOverride>
}

export type SavedViewQueryResult = {
  queryId: string
  schemaId: string
  schemaName: string
  data: FlatNode<Record<string, PropertyBuilder>>[]
  status: QueryStatus
  loading: boolean
  error: Error | null
  pageInfo: QueryPageInfo
  totalCount: number | null
  hasMore: boolean
  plan: QueryPlanSummary | null
  metadata: QueryMetadata | null
  plannerGate: QueryASTPlannerGate
  blockers: string[]
  warnings: string[]
  canExecute: boolean
  aggregates: QueryASTAggregateExecution | null
  privacy: SavedViewPrivacySummary
}

export type UseSavedViewResult = {
  descriptor: SavedViewDescriptor | null
  validation: QueryASTValidationResult
  kind: 'node' | 'query-set' | 'invalid'
  status: QueryStatus
  loading: boolean
  error: Error | null
  title: string | null
  description: string | null
  primaryQueryId: string | null
  queryIds: string[]
  queries: Record<string, SavedViewQueryResult>
  primary: SavedViewQueryResult | null
  blockers: string[]
  warnings: string[]
  privacy: SavedViewPrivacySummary
  reload: () => void
}

const EMPTY_PAGE_INFO: QueryPageInfo = {
  totalCount: null,
  countMode: 'none',
  hasMore: false,
  hasNextPage: false,
  hasPreviousPage: false,
  loadedCount: 0
}

const EMPTY_VALIDATION: QueryASTValidationResult = { valid: false, errors: [] }
const EMPTY_SAVED_VIEW_OPTIONS: UseSavedViewOptions = {}

function addUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value)
  }
}

function parseDescriptor(input: SavedViewDescriptor | string | null | undefined): {
  descriptor: SavedViewDescriptor | null
  parseError: Error | null
} {
  if (!input) {
    return { descriptor: null, parseError: null }
  }

  if (typeof input !== 'string') {
    return { descriptor: input, parseError: null }
  }

  try {
    return { descriptor: JSON.parse(input) as SavedViewDescriptor, parseError: null }
  } catch (error) {
    return {
      descriptor: null,
      parseError: error instanceof Error ? error : new Error(String(error))
    }
  }
}

function schemaIdsFor(schema: RegistrySchema): string[] {
  return [...new Set([schema._schemaId, schema.schema['@id']].filter(Boolean))]
}

function resolveSchema(registry: SavedViewSchemaRegistry, schemaId: string): RegistrySchema | null {
  return registry.find((schema) => schemaIdsFor(schema).includes(schemaId)) ?? null
}

function predicateWhere(predicate: QueryASTPredicate | undefined): {
  where: Record<string, unknown>
  blockers: string[]
} {
  const where: Record<string, unknown> = {}
  const blockers: string[] = []

  const visit = (next: QueryASTPredicate): void => {
    if (next.kind === 'and') {
      next.predicates.forEach(visit)
      return
    }

    if (next.kind !== 'comparison' || next.op !== 'eq') {
      addUnique(blockers, 'usesavedview-predicate-not-lowerable')
      return
    }

    if (!Object.prototype.hasOwnProperty.call(next, 'value')) {
      addUnique(blockers, 'usesavedview-eq-value-required')
      return
    }

    if (
      Object.prototype.hasOwnProperty.call(where, next.field) &&
      where[next.field] !== next.value
    ) {
      addUnique(blockers, 'usesavedview-conflicting-field-equality')
      return
    }

    where[next.field] = next.value
  }

  if (predicate) {
    visit(predicate)
  }

  return { where, blockers }
}

function orderByFilter(
  orderBy: QueryASTOrderBy[] | undefined
): QueryFilter<Record<string, PropertyBuilder>>['orderBy'] | undefined {
  if (!orderBy || orderBy.length === 0) return undefined

  return Object.fromEntries(orderBy.map((entry) => [entry.field, entry.direction])) as QueryFilter<
    Record<string, PropertyBuilder>
  >['orderBy']
}

function applyPage(
  page: QueryASTPage | undefined,
  filter: QueryFilter<Record<string, PropertyBuilder>>,
  blockers: string[]
): void {
  if (!page) return

  if ((page.after || page.count) && page.first === undefined) {
    addUnique(blockers, 'usesavedview-cursor-page-first-required')
  }

  if (page.after && page.offset !== undefined) {
    addUnique(blockers, 'usesavedview-cursor-and-offset-pagination-not-supported')
  }

  if (page.first !== undefined) {
    filter.page = {
      first: page.first,
      ...(page.after ? { after: page.after } : {}),
      ...(page.count ? { count: page.count } : {})
    }
  }

  if (page.offset !== undefined) {
    filter.offset = page.offset
  }
}

function compileSavedViewQuery(input: {
  queryId: string
  ast: QueryASTNodeQuery
  registry: SavedViewSchemaRegistry
  options: UseSavedViewOptions
}): CompiledSavedViewQuery {
  const schema = resolveSchema(input.registry, input.ast.schemaId)
  const plannerGate = evaluateQueryASTPlannerGate(input.ast)
  const blockers = [...plannerGate.blockers]
  const warnings: string[] = []
  const override = input.options.queryOverrides?.[input.queryId]

  if (!schema) {
    addUnique(blockers, 'usesavedview-schema-not-registered')
  }

  if (input.ast.include && Object.keys(input.ast.include).length > 0) {
    if (input.options.includePolicy === 'block') {
      addUnique(blockers, 'usesavedview-relation-includes-not-executable')
    } else {
      addUnique(warnings, 'usesavedview-relation-includes-ignored')
    }
  }

  const predicate = predicateWhere(input.ast.predicate)
  predicate.blockers.forEach((blocker) => addUnique(blockers, blocker))

  const filter: QueryFilter<Record<string, PropertyBuilder>> = {
    ...(input.options.includeDeleted !== undefined
      ? { includeDeleted: input.options.includeDeleted }
      : {}),
    ...(input.options.materializedView ? { materializedView: input.options.materializedView } : {}),
    ...(input.options.mode ? { mode: input.options.mode } : {}),
    ...(input.options.source ? { source: input.options.source } : {}),
    ...(Object.keys(predicate.where).length > 0
      ? { where: predicate.where as Partial<InferCreateProps<Record<string, PropertyBuilder>>> }
      : {}),
    ...(orderByFilter(override?.orderBy ?? input.ast.orderBy)
      ? { orderBy: orderByFilter(override?.orderBy ?? input.ast.orderBy) }
      : {}),
    ...((override?.search ?? input.options.search)
      ? { search: override?.search ?? input.options.search }
      : {})
  }

  applyPage(override?.page ?? input.ast.page, filter, blockers)

  return {
    queryId: input.queryId,
    schema,
    ast: input.ast,
    filter,
    plannerGate,
    blockers,
    warnings,
    canExecute: plannerGate.validation.valid && blockers.length === 0 && Boolean(schema)
  }
}

function queryEntriesFor(ast: QueryAST | null): [string, QueryASTNodeQuery][] {
  if (!ast) return []
  if (ast.kind === 'node') return [['default', ast]]

  return Object.entries(ast.queries)
}

function fallbackPageInfo(input: {
  metadata: QueryMetadata | null
  loading: boolean
  data: unknown[]
  filter: QueryFilter<Record<string, PropertyBuilder>>
}): QueryPageInfo {
  if (input.metadata?.pageInfo) {
    return input.metadata.pageInfo
  }

  if (input.loading) {
    return EMPTY_PAGE_INFO
  }

  const loadedCount = input.data.length
  const offset = input.filter.offset ?? 0
  const limit = input.filter.limit ?? input.filter.page?.first
  const totalCount = limit === undefined && offset === 0 ? loadedCount : null
  const countMode = totalCount === null ? 'none' : 'exact'
  const hasMore =
    limit !== undefined
      ? totalCount === null
        ? loadedCount >= limit
        : offset + loadedCount < totalCount
      : false

  return {
    totalCount,
    countMode,
    hasMore,
    hasNextPage: hasMore,
    hasPreviousPage: offset > 0,
    loadedCount
  }
}

function summarizePlan(metadata: QueryMetadata | null): QueryPlanSummary | null {
  const plan = metadata?.plan
  if (!plan) return null

  return {
    strategy: plan.strategy,
    candidateNodeCount: plan.candidateNodeCount,
    hydratedNodeCount: plan.hydratedNodeCount,
    returnedNodeCount: plan.returnedNodeCount,
    durationMs: plan.durationMs,
    descriptorHash: plan.descriptorHash,
    candidateAccelerators: plan.candidateAccelerators,
    materializedViewId: plan.materializedViewId,
    materializedCacheHit: plan.materializedCacheHit,
    materializedRefreshReason: plan.materializedRefreshReason
  }
}

function privacySummaryForRows(rows: readonly Record<string, unknown>[]): SavedViewPrivacySummary {
  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    const privacyClass = typeof row.privacyClass === 'string' ? row.privacyClass : 'unknown'
    return {
      ...acc,
      [privacyClass]: (acc[privacyClass] ?? 0) + 1
    }
  }, {})
  const sensitiveCount = Object.entries(counts)
    .filter(([privacyClass]) => privacyClass !== 'public' && privacyClass !== 'unknown')
    .reduce((total, [, count]) => total + count, 0)

  return { counts, sensitiveCount }
}

function mergePrivacySummaries(
  summaries: readonly SavedViewPrivacySummary[]
): SavedViewPrivacySummary {
  const counts = summaries.reduce<Record<string, number>>(
    (acc, summary) =>
      Object.entries(summary.counts).reduce<Record<string, number>>(
        (next, [privacyClass, count]) => ({
          ...next,
          [privacyClass]: (next[privacyClass] ?? 0) + count
        }),
        acc
      ),
    {}
  )

  return {
    counts,
    sensitiveCount: Object.entries(counts)
      .filter(([privacyClass]) => privacyClass !== 'public' && privacyClass !== 'unknown')
      .reduce((total, [, count]) => total + count, 0)
  }
}

function statusForQueries(queries: readonly SavedViewQueryResult[]): QueryStatus {
  if (queries.some((query) => query.status === 'error')) return 'error'
  if (queries.some((query) => query.loading)) return 'loading'
  return 'success'
}

function errorForQueries(
  parseError: Error | null,
  validation: QueryASTValidationResult,
  queries: readonly SavedViewQueryResult[]
): Error | null {
  if (parseError) return parseError
  if (!validation.valid) return new Error('Saved view descriptor validation failed')
  return queries.find((query) => query.error)?.error ?? null
}

export function useSavedView(
  input: SavedViewDescriptor | string | null | undefined,
  registry: SavedViewSchemaRegistry,
  options?: UseSavedViewOptions
): UseSavedViewResult {
  const bridge = useDataBridge()
  const resolvedOptions = options ?? EMPTY_SAVED_VIEW_OPTIONS
  const { descriptor, parseError } = useMemo(() => parseDescriptor(input), [input])
  const validation = useMemo(
    () => (descriptor ? validateSavedViewDescriptor(descriptor) : EMPTY_VALIDATION),
    [descriptor]
  )
  const compiledQueries = useMemo(
    () =>
      descriptor && validation.valid
        ? queryEntriesFor(descriptor.query).map(([queryId, ast]) =>
            compileSavedViewQuery({ queryId, ast, registry, options: resolvedOptions })
          )
        : [],
    [descriptor, registry, resolvedOptions, validation.valid]
  )
  const [queryStates, setQueryStates] = useState<Record<string, QuerySnapshotState>>({})
  const executableQueries = useMemo(
    () => compiledQueries.filter((query) => query.canExecute && query.schema),
    [compiledQueries]
  )
  const executableQueryKey = useMemo(
    () =>
      executableQueries
        .map((query) =>
          query.schema
            ? serializeQueryDescriptor(createQueryDescriptor(query.schema._schemaId, query.filter))
            : query.queryId
        )
        .join('|'),
    [executableQueries]
  )

  useEffect(() => {
    setQueryStates(
      Object.fromEntries(
        compiledQueries.map((query) => [query.queryId, { raw: null, metadata: null }])
      )
    )

    if (!bridge) return

    const cleanups = executableQueries.map((query) => {
      if (!query.schema) return () => {}

      const subscription = bridge.query(query.schema, query.filter)
      const update = () => {
        setQueryStates((current) => ({
          ...current,
          [query.queryId]: {
            raw: subscription.getSnapshot(),
            metadata: subscription.getMetadata?.() ?? null
          }
        }))
      }

      update()
      return subscription.subscribe(update)
    })

    return () => {
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [bridge, compiledQueries, executableQueries, executableQueryKey])

  const queryResults = useMemo(() => {
    return Object.fromEntries(
      compiledQueries.map((query): [string, SavedViewQueryResult] => {
        const state = queryStates[query.queryId]
        const raw = state?.raw ?? null
        const metadata = state?.metadata ?? null
        const data =
          query.canExecute && raw
            ? flattenNodes<Record<string, PropertyBuilder>>(raw)
            : ([] as FlatNode<Record<string, PropertyBuilder>>[])
        const loading = Boolean(bridge && query.canExecute && raw === null)
        const metadataError = metadata?.error ? new Error(metadata.error) : null
        const blockedError =
          query.canExecute || query.blockers.length === 0
            ? null
            : new Error(`Saved view query blocked: ${query.blockers.join(', ')}`)
        const error = metadataError ?? blockedError
        const pageInfo = fallbackPageInfo({
          metadata,
          loading,
          data,
          filter: query.filter
        })

        return [
          query.queryId,
          {
            queryId: query.queryId,
            schemaId: query.ast.schemaId,
            schemaName: query.schema?.schema.name ?? query.ast.schemaId,
            data,
            status: error ? 'error' : loading ? 'loading' : 'success',
            loading,
            error,
            pageInfo,
            totalCount: pageInfo.totalCount,
            hasMore: pageInfo.hasMore,
            plan: summarizePlan(metadata),
            metadata,
            plannerGate: query.plannerGate,
            blockers: query.blockers,
            warnings: query.warnings,
            canExecute: query.canExecute,
            aggregates:
              query.canExecute && query.ast.aggregates && query.ast.aggregates.length > 0
                ? executeQueryASTLoadedAggregates(query.ast, data)
                : null,
            privacy: privacySummaryForRows(data)
          }
        ]
      })
    )
  }, [bridge, compiledQueries, queryStates])

  const queryIds = useMemo(() => Object.keys(queryResults), [queryResults])
  const queryList = useMemo(() => Object.values(queryResults), [queryResults])
  const primaryQueryId = useMemo(() => {
    if (!descriptor || !validation.valid) return null
    if (descriptor.query.kind === 'node') return 'default'
    return queryIds[0] ?? null
  }, [descriptor, queryIds, validation.valid])
  const primary = primaryQueryId ? (queryResults[primaryQueryId] ?? null) : null
  const status = validation.valid ? statusForQueries(queryList) : 'error'
  const error = errorForQueries(parseError, validation, queryList)
  const blockers = useMemo(
    () => [...new Set(queryList.flatMap((query) => query.blockers))],
    [queryList]
  )
  const warnings = useMemo(
    () => [...new Set(queryList.flatMap((query) => query.warnings))],
    [queryList]
  )
  const privacy = useMemo(
    () => mergePrivacySummaries(queryList.map((query) => query.privacy)),
    [queryList]
  )
  const reload = useCallback(() => {
    if (!bridge) return

    executableQueries.forEach((query) => {
      if (!query.schema) return
      void bridge.reloadQuery?.(createQueryDescriptor(query.schema._schemaId, query.filter))
    })
  }, [bridge, executableQueries])

  return {
    descriptor,
    validation,
    kind: descriptor && validation.valid ? descriptor.query.kind : 'invalid',
    status,
    loading: queryList.some((query) => query.loading),
    error,
    title: descriptor?.title ?? null,
    description: descriptor?.description ?? null,
    primaryQueryId,
    queryIds,
    queries: queryResults,
    primary,
    blockers,
    warnings,
    privacy,
    reload
  }
}
