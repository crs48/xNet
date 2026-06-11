import type { SavedViewDescriptor } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import { interpolateDescriptor, resolveTimeRange, resolveVariables } from './variables'

const NOW = 1_750_000_000_000
const DAY_MS = 24 * 60 * 60 * 1000

function descriptorWith(
  predicate?: SavedViewDescriptor['query'] extends { predicate?: infer P } ? P : never
): SavedViewDescriptor {
  return {
    version: 1,
    title: 'Test',
    query: {
      version: 1,
      kind: 'node',
      schemaId: 'xnet://xnet.fyi/Task@1.0.0',
      ...(predicate ? { predicate } : {})
    }
  }
}

describe('resolveTimeRange', () => {
  it('resolves presets relative to now', () => {
    expect(resolveTimeRange({ kind: 'preset', preset: '7d' }, NOW)).toEqual({
      start: NOW - 7 * DAY_MS,
      end: NOW
    })
  })

  it('passes absolute ranges through', () => {
    expect(resolveTimeRange({ kind: 'absolute', start: 1, end: 2 }, NOW)).toEqual({
      start: 1,
      end: 2
    })
  })

  it("treats 'all' and missing ranges as unbounded", () => {
    expect(resolveTimeRange({ kind: 'preset', preset: 'all' }, NOW)).toBeNull()
    expect(resolveTimeRange(undefined, NOW)).toBeNull()
  })
})

describe('resolveVariables', () => {
  it('flattens time range and custom variables', () => {
    expect(
      resolveVariables(
        { timeRange: { kind: 'absolute', start: 10, end: 20 }, custom: { project: 'p1' } },
        NOW
      )
    ).toEqual({ 'timeRange.start': 10, 'timeRange.end': 20, project: 'p1' })
  })
})

describe('interpolateDescriptor', () => {
  it('returns the same reference when nothing is bound', () => {
    const descriptor = descriptorWith()
    expect(interpolateDescriptor(descriptor, undefined)).toBe(descriptor)
    expect(
      interpolateDescriptor(descriptor, { timeRange: { kind: 'preset', preset: 'all' } })
    ).toBe(descriptor)
  })

  it('replaces $name placeholders in predicate values', () => {
    const descriptor = descriptorWith({
      kind: 'comparison',
      field: 'project',
      op: 'eq',
      value: '$project'
    })
    const result = interpolateDescriptor(descriptor, { custom: { project: 'p42' } }, undefined, NOW)

    expect(result.query).toMatchObject({
      predicate: { kind: 'comparison', field: 'project', op: 'eq', value: 'p42' }
    })
  })

  it('replaces $timeRange placeholders inside compound predicates and values arrays', () => {
    const descriptor = descriptorWith({
      kind: 'and',
      predicates: [
        { kind: 'comparison', field: 'status', op: 'eq', value: 'open' },
        {
          kind: 'comparison',
          field: 'createdAt',
          op: 'between',
          values: ['$timeRange.start', '$timeRange.end']
        }
      ]
    })
    const result = interpolateDescriptor(
      descriptor,
      { timeRange: { kind: 'absolute', start: 100, end: 200 } },
      undefined,
      NOW
    )

    expect(result.query).toMatchObject({
      predicate: {
        kind: 'and',
        predicates: [
          { field: 'status', value: 'open' },
          { field: 'createdAt', values: [100, 200] }
        ]
      }
    })
  })

  it('leaves unknown placeholders untouched', () => {
    const descriptor = descriptorWith({
      kind: 'comparison',
      field: 'project',
      op: 'eq',
      value: '$missing'
    })
    const result = interpolateDescriptor(descriptor, { custom: { other: 1 } }, undefined, NOW)

    expect(result.query).toMatchObject({ predicate: { value: '$missing' } })
  })

  it('injects a between predicate for declarative timeField bindings', () => {
    const descriptor = descriptorWith({
      kind: 'comparison',
      field: 'status',
      op: 'eq',
      value: 'open'
    })
    const result = interpolateDescriptor(
      descriptor,
      { timeRange: { kind: 'absolute', start: 5, end: 9 } },
      'dueDate',
      NOW
    )

    expect(result.query).toMatchObject({
      predicate: {
        kind: 'and',
        predicates: [
          { field: 'status', value: 'open' },
          { kind: 'comparison', field: 'dueDate', op: 'between', values: [5, 9] }
        ]
      }
    })
  })

  it('applies timeField bindings to every query of a query set', () => {
    const descriptor: SavedViewDescriptor = {
      version: 1,
      title: 'Set',
      query: {
        version: 1,
        kind: 'query-set',
        mode: 'dashboard',
        queries: {
          a: { version: 1, kind: 'node', schemaId: 'xnet://xnet.fyi/Task@1.0.0' },
          b: { version: 1, kind: 'node', schemaId: 'xnet://xnet.fyi/Page@1.0.0' }
        }
      }
    }
    const result = interpolateDescriptor(
      descriptor,
      { timeRange: { kind: 'absolute', start: 1, end: 2 } },
      'updatedAt',
      NOW
    )

    expect(result.query).toMatchObject({
      queries: {
        a: { predicate: { field: 'updatedAt', op: 'between', values: [1, 2] } },
        b: { predicate: { field: 'updatedAt', op: 'between', values: [1, 2] } }
      }
    })
  })
})
