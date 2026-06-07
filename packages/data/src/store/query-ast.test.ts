/**
 * Tests for canonical query AST helpers.
 */

import { describe, expect, it } from 'vitest'
import { DatabaseSchema, PageSchema, SavedViewSchema, TaskSchema } from '../schema'
import {
  and,
  count,
  countDistinct,
  dashboardQuerySet,
  defineNodeQueryAST,
  defineSavedViewDescriptor,
  executeQueryASTLoadedAggregates,
  evaluateQueryASTPlannerGate,
  filterQueryASTLoadedRows,
  from,
  avg,
  groupBy,
  having,
  max,
  min,
  planQueryASTAggregates,
  queryOperators,
  querySetCount,
  sum,
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

  it('executes loaded aggregate snapshots with grouping and having predicates', () => {
    const ast = defineNodeQueryAST(TaskSchema, {
      aggregates: [
        count('visibleTasks'),
        countDistinct('status', 'statusKinds'),
        sum('estimate', 'estimateSum'),
        avg('estimate', 'estimateAvg'),
        min('estimate', 'estimateMin'),
        max('estimate', 'estimateMax'),
        having(groupBy(count('statusCount'), 'status'), {
          kind: 'comparison',
          field: 'statusCount',
          op: 'gt',
          value: 1
        })
      ]
    })

    const execution = executeQueryASTLoadedAggregates(ast, [
      { properties: { status: 'todo', estimate: 2 } },
      { properties: { status: 'todo', estimate: 3 } },
      { properties: { status: 'done', estimate: '5' } },
      { properties: { status: null, estimate: 'not numeric' } }
    ])

    expect(execution.scope).toBe('loaded-snapshot')
    expect(execution.rowCount).toBe(4)
    expect(execution.results.visibleTasks.value).toBe(4)
    expect(execution.results.statusKinds.value).toBe(2)
    expect(execution.results.estimateSum.value).toBe(10)
    expect(execution.results.estimateAvg.value).toBe(10 / 3)
    expect(execution.results.estimateMin.value).toBe(2)
    expect(execution.results.estimateMax.value).toBe(5)
    expect(execution.results.statusCount.groups).toEqual([
      {
        key: { status: 'todo' },
        rowCount: 2,
        value: 2
      }
    ])
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

  it('filters loaded row snapshots with non-equality predicates', () => {
    const task = queryOperators<(typeof TaskSchema)['_properties']>()
    const rows = [
      { id: 'task-1', properties: { title: 'Alpha launch', estimate: 2, status: 'todo' } },
      { id: 'task-2', properties: { title: 'Beta cleanup', estimate: 8, status: 'todo' } },
      { id: 'task-3', properties: { title: 'Alpha done', estimate: 3, status: 'done' } },
      { id: 'task-4', properties: { title: 'Alpha review', estimate: 5, status: 'todo' } }
    ]

    const filtered = filterQueryASTLoadedRows(
      rows,
      and(
        task.includesAny('status', ['todo']),
        {
          kind: 'comparison',
          field: 'estimate',
          op: 'between',
          values: [2, 5]
        },
        {
          kind: 'comparison',
          field: 'title',
          op: 'contains',
          value: 'Alpha'
        }
      )
    )

    expect(filtered.map((row) => row.id)).toEqual(['task-1', 'task-4'])
  })
})
