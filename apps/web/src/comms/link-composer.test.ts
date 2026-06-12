import { describe, expect, it } from 'vitest'
import {
  applyLinkPick,
  composerLinks,
  linkOptionsFor,
  linkQueryAt,
  nodeIdFromHref
} from './link-composer'

const TARGETS = [
  { href: 'p1', title: 'Launch Plan', kind: 'page' },
  { href: 'xnet://database/d1', title: 'Launch Tracker', kind: 'database' },
  { href: 'p2', title: 'Plan Archive', kind: 'page' }
]

describe('linkQueryAt', () => {
  it('finds an open [[ query at the caret', () => {
    expect(linkQueryAt('see [[lau', 9)).toEqual({ start: 4, query: 'lau' })
  })

  it('matches at the start of the text and with an empty query', () => {
    expect(linkQueryAt('[[', 2)).toEqual({ start: 0, query: '' })
  })

  it('returns null without a trigger, after closing, or mid-word', () => {
    expect(linkQueryAt('plain text', 10)).toBeNull()
    expect(linkQueryAt('see [[plan]] ', 13)).toBeNull()
    expect(linkQueryAt('a[[x', 4)).toBeNull()
  })
})

describe('applyLinkPick', () => {
  it('replaces the query with [[Title]] and moves the caret', () => {
    const result = applyLinkPick('see [[lau more', 9, 4, 'Launch Plan')
    expect(result.text).toBe('see [[Launch Plan]]  more')
    expect(result.caret).toBe(4 + '[[Launch Plan]] '.length)
  })
})

describe('nodeIdFromHref', () => {
  it('passes bare page ids through', () => {
    expect(nodeIdFromHref('p1')).toBe('p1')
  })

  it('extracts the id from xnet:// URIs', () => {
    expect(nodeIdFromHref('xnet://database/d1')).toBe('d1')
    expect(nodeIdFromHref('xnet://dashboard/dash-1')).toBe('dash-1')
  })
})

describe('composerLinks', () => {
  it('keeps ids whose [[Title]] text survives, deduped', () => {
    const picked = new Map([
      ['Launch Plan', 'p1'],
      ['Plan Archive', 'p2']
    ])
    expect(composerLinks('see [[Launch Plan]] and [[Launch Plan]]', picked)).toEqual(['p1'])
  })

  it('returns undefined when nothing survives or nothing was picked', () => {
    expect(composerLinks('no links here', new Map([['Launch Plan', 'p1']]))).toBeUndefined()
    expect(composerLinks('[[Launch Plan]]', new Map())).toBeUndefined()
  })

  it('ignores picks whose id never resolved', () => {
    expect(composerLinks('[[Launch Plan]]', new Map([['Launch Plan', '']]))).toBeUndefined()
  })
})

describe('linkOptionsFor', () => {
  it('returns nothing without an active query', () => {
    expect(linkOptionsFor('plain', 5, TARGETS)).toEqual([])
  })

  it('shows the head of the list for an empty query', () => {
    expect(linkOptionsFor('[[', 2, TARGETS)).toHaveLength(3)
  })

  it('ranks prefix matches before substring matches', () => {
    const titles = linkOptionsFor('see [[plan', 10, TARGETS).map((t) => t.title)
    expect(titles).toEqual(['Plan Archive', 'Launch Plan'])
  })

  it('caps at six options', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      href: `p${i}`,
      title: `Page ${i}`,
      kind: 'page'
    }))
    expect(linkOptionsFor('[[', 2, many)).toHaveLength(6)
  })
})
