import { describe, expect, it } from 'vitest'
import { buildLinkTargets, wikilinkHref } from './link-targets'

describe('wikilinkHref', () => {
  it('links pages by bare node id', () => {
    expect(wikilinkHref('page', 'page-1')).toBe('page-1')
  })

  it('links other kinds via xnet:// URIs', () => {
    expect(wikilinkHref('database', 'db-1')).toBe('xnet://database/db-1')
    expect(wikilinkHref('dashboard', 'dash-1')).toBe('xnet://dashboard/dash-1')
  })
})

describe('buildLinkTargets', () => {
  const groups = [
    {
      kind: 'page',
      docs: [
        { id: 'p1', title: 'Launch Plan' },
        { id: 'p2', title: '  ' }
      ]
    },
    { kind: 'database', docs: [{ id: 'd1', title: 'Tracker' }] },
    { kind: 'canvas', docs: undefined }
  ]

  it('flattens groups with hrefs, kinds and Untitled fallback', () => {
    const targets = buildLinkTargets(groups, [])
    expect(targets).toEqual([
      { href: 'p1', title: 'Launch Plan', kind: 'page' },
      { href: 'p2', title: 'Untitled', kind: 'page' },
      { href: 'xnet://database/d1', title: 'Tracker', kind: 'database' }
    ])
  })

  it('floats recents to the head in recency order', () => {
    const targets = buildLinkTargets(groups, ['d1', 'p2'])
    expect(targets.map((t) => t.href)).toEqual(['xnet://database/d1', 'p2', 'p1'])
  })

  it('handles empty input', () => {
    expect(buildLinkTargets([], [])).toEqual([])
  })
})
