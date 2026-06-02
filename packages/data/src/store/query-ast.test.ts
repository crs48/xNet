/**
 * Tests for canonical query AST helpers.
 */

import { describe, expect, it } from 'vitest'
import { DatabaseSchema, PageSchema, SavedViewSchema, TaskSchema } from '../schema'
import {
  count,
  countDistinct,
  dashboardQuerySet,
  defineNodeQueryAST,
  defineSavedViewDescriptor,
  evaluateQueryASTPlannerGate,
  from,
  planQueryASTAggregates,
  queryOperators,
  querySetCount,
  validateQueryAST,
  validateSavedViewDescriptor
} from './query-ast'

describe('query AST', () => {
  it('builds and validates relation includes with typed predicates', () => {
    const task = queryOperators<(typeof TaskSchema)['_properties']>()
    const ast = defineNodeQueryAST(PageSchema, {
      include: {
        tasks: from(TaskSchema, 'page', {
          where: task.neq('status', 'done'),
          page: { first: 25, count: 'exact' },
          aggregates: [count(), countDistinct('assignee', 'assigneeCount')]
        })
      }
    })

    expect(validateQueryAST(ast)).toEqual({ valid: true, errors: [] })
    expect(planQueryASTAggregates(ast)).toEqual([
      {
        path: '$.include.tasks.query.aggregates.0',
        alias: 'count',
        function: 'count',
        strategy: 'node-count',
        requiredFields: [],
        groupBy: [],
        canUseScalarIndex: false
      },
      {
        path: '$.include.tasks.query.aggregates.1',
        alias: 'assigneeCount',
        function: 'countDistinct',
        strategy: 'distinct-scan',
        requiredFields: ['assignee'],
        groupBy: [],
        canUseScalarIndex: true
      }
    ])
    expect(evaluateQueryASTPlannerGate(ast)).toMatchObject({
      useFindReady: true,
      blockers: [],
      relationIndexRequirements: [
        {
          schemaId: TaskSchema.schema['@id'],
          property: 'page',
          direction: 'inbound',
          targetSchemaId: PageSchema.schema['@id'],
          reason: 'include'
        }
      ]
    })
  })

  it('supports dashboard query sets and saved view descriptors', () => {
    const task = queryOperators<(typeof TaskSchema)['_properties']>()
    const openTasks = defineNodeQueryAST(TaskSchema, {
      where: task.neq('status', 'done'),
      aggregates: [count('visibleTasks')]
    })
    const dashboard = dashboardQuerySet(
      {
        openTasks
      },
      [querySetCount('openTasks', 'openTaskCount')]
    )
    const descriptor = defineSavedViewDescriptor({
      title: 'Open task dashboard',
      scope: 'workspace',
      query: dashboard
    })

    expect(validateQueryAST(dashboard)).toEqual({ valid: true, errors: [] })
    expect(validateSavedViewDescriptor(descriptor)).toEqual({ valid: true, errors: [] })
    expect(planQueryASTAggregates(dashboard).map((plan) => plan.alias)).toEqual([
      'visibleTasks',
      'openTaskCount'
    ])
    expect(SavedViewSchema.schema['@id']).toBe('xnet://xnet.fyi/SavedView@1.0.0')
    expect(JSON.parse(JSON.stringify(descriptor))).toEqual(descriptor)
  })

  it('returns validation errors for unsafe persisted descriptors', () => {
    const invalid = {
      version: 1,
      kind: 'node',
      schemaId: DatabaseSchema.schema['@id'],
      predicate: { kind: 'and', predicates: [] },
      page: { first: 0 },
      aggregates: [{ kind: 'aggregate', alias: 'bad', function: 'sum' }]
    }

    const result = validateQueryAST(invalid)

    expect(result.valid).toBe(false)
    expect(result.errors.map((error) => error.code)).toEqual([
      'QUERY_AST_COMPOUND_PREDICATES',
      'QUERY_AST_PAGE_FIRST',
      'QUERY_AST_AGGREGATE_FIELD'
    ])
  })
})
