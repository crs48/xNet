/**
 * useFind - guarded AST query hook for advanced Node reads.
 */

import type {
  DefinedSchema,
  InferCreateProps,
  PropertyBuilder,
  QueryAST,
  QueryASTNodeQuery,
  QueryASTPage,
  QueryASTPlannerGate,
  QueryASTPredicate
} from '@xnetjs/data'
import { evaluateQueryASTPlannerGate } from '@xnetjs/data'
import { useMemo } from 'react'
import { useQuery, type QueryFilter, type QueryListResult } from './useQuery'

type CompiledFindQuery<P extends Record<string, PropertyBuilder>> = {
  filter: QueryFilter<P>
  blockers: string[]
}

export type UseFindOptions<
  P extends Record<string, PropertyBuilder> = Record<string, PropertyBuilder>
> = Pick<QueryFilter<P>, 'includeDeleted' | 'materializedView' | 'mode' | 'search' | 'source'>

export type UseFindResult<P extends Record<string, PropertyBuilder>> = QueryListResult<P> & {
  /** Canonical planner gate for the supplied AST. */
  plannerGate: QueryASTPlannerGate
  /** Runtime blockers that prevented this hook from executing the AST. */
  blockers: string[]
  /** Whether the AST was compiled and subscribed through the current query runtime. */
  canExecute: boolean
}

const EMPTY_FIND_OPTIONS: UseFindOptions = {}

function addBlocker(blockers: string[], blocker: string): void {
  if (!blockers.includes(blocker)) {
    blockers.push(blocker)
  }
}

function schemaIdsFor<P extends Record<string, PropertyBuilder>>(
  schema: DefinedSchema<P>
): string[] {
  return [...new Set([schema._schemaId, schema.schema['@id']].filter(Boolean))]
}

function compilePredicate(predicate: QueryASTPredicate | undefined): {
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
      addBlocker(blockers, 'usefind-predicate-not-lowerable')
      return
    }

    if (!Object.prototype.hasOwnProperty.call(next, 'value')) {
      addBlocker(blockers, 'usefind-eq-value-required')
      return
    }

    if (
      Object.prototype.hasOwnProperty.call(where, next.field) &&
      where[next.field] !== next.value
    ) {
      addBlocker(blockers, 'usefind-conflicting-field-equality')
      return
    }

    where[next.field] = next.value
  }

  if (predicate) {
    visit(predicate)
  }

  return { where, blockers }
}

function compilePage<P extends Record<string, PropertyBuilder>>(
  page: QueryASTPage | undefined,
  filter: QueryFilter<P>,
  blockers: string[]
): void {
  if (!page) return

  if ((page.after || page.count) && page.first === undefined) {
    addBlocker(blockers, 'usefind-cursor-page-first-required')
  }

  if (page.after && page.offset !== undefined) {
    addBlocker(blockers, 'usefind-cursor-and-offset-pagination-not-supported')
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

function compileNodeQuery<P extends Record<string, PropertyBuilder>>(
  schema: DefinedSchema<P>,
  ast: QueryASTNodeQuery,
  options: UseFindOptions<P>
): CompiledFindQuery<P> {
  const blockers: string[] = []

  if (!schemaIdsFor(schema).includes(ast.schemaId)) {
    addBlocker(blockers, 'usefind-schema-mismatch')
  }

  if (ast.include && Object.keys(ast.include).length > 0) {
    addBlocker(blockers, 'usefind-relation-includes-not-executable')
  }

  if (ast.aggregates && ast.aggregates.length > 0) {
    addBlocker(blockers, 'usefind-aggregates-not-executable')
  }

  const compiledPredicate = compilePredicate(ast.predicate)
  compiledPredicate.blockers.forEach((blocker) => addBlocker(blockers, blocker))

  const filter: QueryFilter<P> = {
    ...options,
    ...(Object.keys(compiledPredicate.where).length > 0
      ? { where: compiledPredicate.where as Partial<InferCreateProps<P>> }
      : {}),
    ...(ast.orderBy && ast.orderBy.length > 0
      ? {
          orderBy: Object.fromEntries(
            ast.orderBy.map((entry) => [entry.field, entry.direction])
          ) as QueryFilter<P>['orderBy']
        }
      : {})
  }

  compilePage(ast.page, filter, blockers)

  return { filter, blockers }
}

function compileFindQuery<P extends Record<string, PropertyBuilder>>(
  schema: DefinedSchema<P>,
  ast: QueryAST,
  options: UseFindOptions<P>
): CompiledFindQuery<P> {
  if (ast.kind !== 'node') {
    return {
      filter: {},
      blockers: ['usefind-query-sets-not-executable']
    }
  }

  return compileNodeQuery(schema, ast, options)
}

function plannerError(blockers: string[]): Error {
  return new Error(`useFind planner blocked query execution: ${blockers.join(', ')}`)
}

export function useFind<P extends Record<string, PropertyBuilder>>(
  schema: DefinedSchema<P>,
  ast: QueryAST,
  options?: UseFindOptions<P>
): UseFindResult<P> {
  const resolvedOptions = options ?? (EMPTY_FIND_OPTIONS as UseFindOptions<P>)
  const plannerGate = useMemo(() => evaluateQueryASTPlannerGate(ast), [ast])
  const compiled = useMemo(
    () => compileFindQuery(schema, ast, resolvedOptions),
    [schema, ast, resolvedOptions]
  )
  const blockers = useMemo(
    () => [...new Set([...plannerGate.blockers, ...compiled.blockers])],
    [compiled.blockers, plannerGate.blockers]
  )
  const canExecute = plannerGate.validation.valid && blockers.length === 0
  const result = useQuery(schema, canExecute ? compiled.filter : { enabled: false })
  const error = useMemo(
    () => (canExecute ? result.error : plannerError(blockers)),
    [blockers, canExecute, result.error]
  )

  return {
    ...result,
    status: error ? 'error' : result.status,
    loading: canExecute ? result.loading : false,
    isLoading: canExecute ? result.isLoading : false,
    isFetching: canExecute ? result.isFetching : false,
    error,
    plannerGate,
    blockers,
    canExecute
  }
}
