import { describe, expect, it } from 'vitest'
import { filterTagged, mergeTagOps, rankTagsByUsage } from './tag-view-data'

describe('filterTagged', () => {
  it('keeps only nodes whose tags include the id', () => {
    const nodes = [{ id: 'a', tags: ['t1', 't2'] }, { id: 'b', tags: ['t2'] }, { id: 'c' }]
    expect(filterTagged(nodes, 't1').map((node) => node.id)).toEqual(['a'])
    expect(filterTagged(null, 't1')).toEqual([])
  })
})

describe('mergeTagOps', () => {
  const nodes = [
    { id: 'a', tags: ['src', 'other'] },
    { id: 'b', tags: ['src', 'dst'] },
    { id: 'c', tags: ['other'] }
  ]

  it('re-points tagged nodes and archives the source', () => {
    const ops = mergeTagOps('src', 'dst', nodes)
    expect(ops).toHaveLength(3)
    expect(ops[0]).toEqual({ type: 'update', id: 'a', data: { tags: ['dst', 'other'] } })
    // b already carries dst — dedupe instead of duplicating
    expect(ops[1]).toEqual({ type: 'update', id: 'b', data: { tags: ['dst'] } })
    expect(ops[2]).toEqual({ type: 'update', id: 'src', data: { archived: true } })
  })

  it('is a no-op when source and target match', () => {
    expect(mergeTagOps('t', 't', nodes)).toEqual([])
  })
})

describe('rankTagsByUsage', () => {
  it('orders by usage desc, then name', () => {
    const tags = [
      { id: 't1', name: 'zeta' },
      { id: 't2', name: 'alpha' },
      { id: 't3', name: 'mid' }
    ]
    const nodes = [
      { id: 'a', tags: ['t3'] },
      { id: 'b', tags: ['t3', 't1'] },
      { id: 'c', tags: ['t1'] }
    ]
    // t1 and t3 tie at 2 → name order; t2 unused last
    expect(rankTagsByUsage(tags, nodes).map((tag) => tag.id)).toEqual(['t3', 't1', 't2'])
  })
})
