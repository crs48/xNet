/**
 * One-tree ordering semantics (0353): type-scoped sort defaults and the
 * single mute flag. This is the correctness surface that makes chat and
 * documents coexist in one list without either feeling wrong.
 */
import { describe, expect, it } from 'vitest'
import { effectiveBadge, shouldBump, sortSidebarRows, type SidebarRowModel } from './contracts'

const doc = (id: string, sortKey: string, updatedAt = 0): SidebarRowModel => ({
  id,
  nodeType: 'page',
  title: id,
  sortPolicy: 'manual',
  sortKey,
  updatedAt
})

const chat = (
  id: string,
  updatedAt: number,
  extra: Partial<SidebarRowModel> = {}
): SidebarRowModel => ({
  id,
  nodeType: 'channel',
  title: id,
  sortPolicy: 'recency',
  updatedAt,
  ...extra
})

describe('mute is one flag', () => {
  it('suppresses the badge', () => {
    expect(effectiveBadge(chat('a', 0, { badge: 3 }))).toBe(3)
    expect(effectiveBadge(chat('a', 0, { badge: 3, muted: true }))).toBeNull()
  })

  it('suppresses the unread bump with the SAME flag', () => {
    expect(shouldBump(chat('a', 0, { badge: 3 }))).toBe(true)
    expect(shouldBump(chat('a', 0, { badge: 3, muted: true }))).toBe(false)
  })

  it('never bumps a manual row, unread or not', () => {
    expect(shouldBump({ ...doc('d', 'a'), badge: 5 })).toBe(false)
  })

  it('treats a zero badge as no badge', () => {
    expect(effectiveBadge(chat('a', 0, { badge: 0 }))).toBeNull()
  })
})

describe('type-scoped sort defaults', () => {
  it('orders documents by fractional sortKey in CODE UNITS (never locale)', () => {
    // 'B' (0x42) sorts before 'a' (0x61) in code units; localeCompare
    // would invert this and break the fractional-index invariant.
    const rows = sortSidebarRows([doc('lower', 'a'), doc('upper', 'B')])
    expect(rows.map((r) => r.id)).toEqual(['upper', 'lower'])
  })

  it('does NOT reshuffle documents when one is edited', () => {
    const before = sortSidebarRows([doc('a', 'a', 100), doc('b', 'b', 1)])
    // A peer edits 'b' — recency changes, order must not.
    const after = sortSidebarRows([doc('a', 'a', 100), doc('b', 'b', 999_999)])
    expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id))
  })

  it('orders chats by recency, and unread floats to the top', () => {
    const rows = sortSidebarRows([
      chat('old-unread', 1, { badge: 2 }),
      chat('newest', 100),
      chat('middle', 50)
    ])
    expect(rows.map((r) => r.id)).toEqual(['old-unread', 'newest', 'middle'])
  })

  it('a muted unread chat does not jump the queue', () => {
    const rows = sortSidebarRows([
      chat('muted-unread', 1, { badge: 9, muted: true }),
      chat('newest', 100)
    ])
    expect(rows.map((r) => r.id)).toEqual(['newest', 'muted-unread'])
  })

  it('mixed lens keeps active (chat) rows above calm (doc) rows', () => {
    const rows = sortSidebarRows([doc('doc-1', 'a'), chat('chat-1', 5)])
    expect(rows.map((r) => r.id)).toEqual(['chat-1', 'doc-1'])
  })

  it('a lens policy overrides the rows own policy', () => {
    // The Docs lens forces manual ordering even over a recency row.
    const rows = sortSidebarRows([chat('chat-1', 100), doc('doc-1', 'a')], {
      sortPolicy: 'manual'
    })
    expect(rows.map((r) => r.id)).toEqual(['chat-1', 'doc-1'])
  })
})
