import type { QueryFrameDefinitionLike } from './query-frame-adapter'
import { describe, expect, it } from 'vitest'
import { widgetInstanceFromQueryFrame } from './query-frame-adapter'

function frame(overrides: Partial<QueryFrameDefinitionLike> = {}): QueryFrameDefinitionLike {
  return {
    id: 'frame-1',
    source: 'schema',
    label: 'Open tasks',
    schemaId: 'xnet://xnet.fyi/Task@1.0.0',
    filters: [],
    sorts: [],
    limit: 25,
    refreshMode: 'live',
    ...overrides
  }
}

describe('widgetInstanceFromQueryFrame', () => {
  it('lowers a schema-source frame onto the saved-view widget', () => {
    const widget = widgetInstanceFromQueryFrame(
      frame({
        filters: [{ field: 'status', operator: 'equals', value: 'open' }],
        sorts: [{ field: 'updatedAt', direction: 'desc' }]
      })
    )

    expect(widget).toMatchObject({
      id: 'query-frame:frame-1',
      widgetType: 'view.saved',
      refresh: 'live',
      query: {
        title: 'Open tasks',
        query: {
          kind: 'node',
          schemaId: 'xnet://xnet.fyi/Task@1.0.0',
          predicate: { kind: 'comparison', field: 'status', op: 'eq', value: 'open' },
          orderBy: [{ field: 'updatedAt', direction: 'desc' }],
          page: { first: 25 }
        }
      }
    })
  })

  it('maps every supported filter operator', () => {
    const widget = widgetInstanceFromQueryFrame(
      frame({
        filters: [
          { field: 'a', operator: 'not-equals', value: 1 },
          { field: 'b', operator: 'contains', value: 'x' },
          { field: 'c', operator: 'greater-than', value: 2 },
          { field: 'd', operator: 'greater-than-or-equal', value: 3 },
          { field: 'e', operator: 'less-than', value: 4 },
          { field: 'f', operator: 'less-than-or-equal', value: 5 },
          { field: 'g', operator: 'in', value: [1, 2] },
          { field: 'h', operator: 'in', value: 3 },
          { field: 'i', operator: 'exists' }
        ]
      })
    )

    expect(widget?.query?.query).toMatchObject({
      predicate: {
        kind: 'and',
        predicates: [
          { field: 'a', op: 'neq', value: 1 },
          { field: 'b', op: 'contains', value: 'x' },
          { field: 'c', op: 'gt', value: 2 },
          { field: 'd', op: 'gte', value: 3 },
          { field: 'e', op: 'lt', value: 4 },
          { field: 'f', op: 'lte', value: 5 },
          { field: 'g', op: 'in', values: [1, 2] },
          { field: 'h', op: 'in', values: [3] },
          { field: 'i', op: 'isNotNull' }
        ]
      }
    })
  })

  it('maps non-live refresh modes to on-open', () => {
    expect(widgetInstanceFromQueryFrame(frame({ refreshMode: 'manual' }))?.refresh).toBe('on-open')
    expect(widgetInstanceFromQueryFrame(frame({ refreshMode: 'on-open' }))?.refresh).toBe('on-open')
  })

  it('returns null for sources without a widget-query equivalent', () => {
    expect(widgetInstanceFromQueryFrame(frame({ source: 'database' }))).toBeNull()
    expect(widgetInstanceFromQueryFrame(frame({ source: 'search' }))).toBeNull()
    expect(widgetInstanceFromQueryFrame(frame({ source: 'plugin' }))).toBeNull()
    expect(widgetInstanceFromQueryFrame(frame({ schemaId: undefined }))).toBeNull()
  })

  it('refuses to silently drop unmappable filters', () => {
    expect(
      widgetInstanceFromQueryFrame(
        frame({ filters: [{ field: 'a', operator: 'fuzzy-match', value: 1 }] })
      )
    ).toBeNull()
  })
})
