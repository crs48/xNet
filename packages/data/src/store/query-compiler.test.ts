import type { NodeQueryDescriptor } from './query'
import type { SchemaIRI } from '../schema/node'
import { describe, expect, it } from 'vitest'
import {
  QueryCompiler,
  buildSqlOrderBy,
  hashScalarValue,
  quoteSqlLiteral,
  stringifyStable,
  toScalarIndexValue,
  type QueryCompilerFlags
} from './query-compiler'

const SCHEMA = 'xnet://xnet.fyi/Task@1.0.0' as SchemaIRI

function compiler(flags: Partial<QueryCompilerFlags> = {}) {
  return new QueryCompiler(() => ({
    adaptiveIndexingEnabled: false,
    aggregatedHydration: true,
    ...flags
  }))
}

function descriptor(overrides: Partial<NodeQueryDescriptor> = {}): NodeQueryDescriptor {
  return { schemaId: SCHEMA, includeDeleted: false, ...overrides }
}

describe('toScalarIndexValue', () => {
  it('maps primitives to typed scalar values', () => {
    expect(toScalarIndexValue('todo')).toMatchObject({ valueType: 'text', valueText: 'todo' })
    expect(toScalarIndexValue(3)).toMatchObject({ valueType: 'number', valueNumber: 3 })
    expect(toScalarIndexValue(true)).toMatchObject({ valueType: 'boolean', valueBoolean: 1 })
    expect(toScalarIndexValue(null)).toMatchObject({ valueType: 'null', valueHash: 'null' })
  })

  it('rejects non-scalar values', () => {
    expect(toScalarIndexValue({ nested: true })).toBeNull()
    expect(toScalarIndexValue([1, 2])).toBeNull()
    expect(toScalarIndexValue(Number.NaN)).toBeNull()
    expect(toScalarIndexValue(undefined)).toBeNull()
  })
})

describe('pure SQL helpers', () => {
  it('quoteSqlLiteral escapes single quotes', () => {
    expect(quoteSqlLiteral("it's")).toBe("'it''s'")
  })

  it('hashScalarValue is stable', () => {
    expect(hashScalarValue('abc')).toBe(hashScalarValue('abc'))
    expect(hashScalarValue('abc')).not.toBe(hashScalarValue('abd'))
  })

  it('stringifyStable sorts keys and drops undefined', () => {
    expect(stringifyStable({ b: 1, a: 2, c: undefined })).toBe('{"a":2,"b":1}')
  })

  it('buildSqlOrderBy defaults and honours system keys only', () => {
    expect(buildSqlOrderBy()).toBe('n.updated_at DESC, n.id ASC')
    expect(buildSqlOrderBy({ createdAt: 'asc' })).toBe('n.created_at ASC, n.id ASC')
    expect(buildSqlOrderBy({ priority: 'asc' })).toBe('n.updated_at DESC, n.id ASC')
  })
})

describe('QueryCompiler.compile', () => {
  it('compiles a nodeId lookup with pushed-down pagination semantics', () => {
    const compiled = compiler().compile(descriptor({ nodeId: 'node-1' }))
    expect(compiled).not.toBeNull()
    expect(compiled?.sql).toContain('n.id = ?')
    expect(compiled?.params).toEqual([SCHEMA, 'node-1'])
    expect(compiled?.postFilterReason).toBe('verified-in-js')
  })

  it('returns null when a where value cannot be scalar-indexed', () => {
    expect(compiler().compile(descriptor({ where: { tags: ['a'] } }))).toBeNull()
  })

  it('joins node_property_scalars per scalar where entry', () => {
    const compiled = compiler().compile(descriptor({ where: { status: 'todo', priority: 2 } }))
    expect(compiled?.sql).toContain('JOIN node_property_scalars p0')
    expect(compiled?.sql).toContain('JOIN node_property_scalars p1')
    expect(compiled?.sql).toContain('p0.value_text = ?')
    expect(compiled?.sql).toContain('p1.value_number = ?')
    expect(compiled?.adaptiveIndexHints.map((hint) => hint.propertyKey)).toEqual([
      'status',
      'priority'
    ])
  })

  it('pushes pagination down and emits a fused query with exact count', () => {
    const compiled = compiler().compile(
      descriptor({ where: { status: 'todo' }, limit: 10, offset: 5, count: 'exact' })
    )
    expect(compiled?.sqlPagination).toBe(true)
    expect(compiled?.sql).toContain('LIMIT ? OFFSET ?')
    expect(compiled?.postFilterReason).toBe('pagination-pushed-down')
    expect(compiled?.postFilterDescriptor.limit).toBeUndefined()
    expect(compiled?.fused?.includesExactCount).toBe(true)
    expect(compiled?.fused?.sql).toContain('COUNT(*) OVER () AS total_count')
    expect(compiled?.fused?.sql).toContain('json_group_object')
  })

  it('emits row-multiplied fused SQL when aggregated hydration is off', () => {
    const compiled = compiler({ aggregatedHydration: false }).compile(
      descriptor({ where: { status: 'todo' }, limit: 10 })
    )
    expect(compiled?.fused?.sql).not.toContain('json_group_object')
    expect(compiled?.fused?.sql).toContain('p.property_key, p.value, p.lamport_time')
  })

  it('does not push pagination down for cursor reads', () => {
    const compiled = compiler().compile(
      descriptor({ where: { status: 'todo' }, limit: 10, after: 'node-9' })
    )
    expect(compiled?.sqlPagination).toBe(false)
    expect(compiled?.fused).toBeUndefined()
  })

  it('gates property-sort pushdown behind the adaptive-indexing flag', () => {
    const sorted = descriptor({ orderBy: { priority: 'asc' }, limit: 10 })
    const gated = compiler({ adaptiveIndexingEnabled: false }).compile(sorted)
    expect(gated?.sqlPagination).toBe(false)
    expect(gated?.sql).not.toContain('sortp')

    const pushed = compiler({ adaptiveIndexingEnabled: true }).compile(sorted)
    expect(pushed?.sqlPagination).toBe(true)
    expect(pushed?.sql).toContain('LEFT JOIN node_property_scalars sortp')
    expect(pushed?.sql).toContain('(sortp.node_id IS NULL) ASC')
  })

  it('labels FTS and spatial candidate plans as JS-verified', () => {
    const fts = compiler().compile(descriptor({ search: { text: 'hello' } }), null, {
      matchExpression: 'hello'
    })
    expect(fts?.sql).toContain('nodes_fts MATCH ?')
    expect(fts?.postFilterReason).toBe('fts-verified-in-js')

    const spatial = compiler().compile(
      descriptor({
        spatial: { viewport: { minX: 0, maxX: 1, minY: 0, maxY: 1 } } as never
      }),
      { spatialKey: 'position', bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 } },
      null
    )
    expect(spatial?.sql).toContain('node_spatial_rtree')
    expect(spatial?.postFilterReason).toBe('spatial-rtree-verified-in-js')
    expect(spatial?.spatialIndexKey).toBe('position')
  })
})
