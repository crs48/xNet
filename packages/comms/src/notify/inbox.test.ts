import type { InboxItem } from './types'
import { describe, expect, it } from 'vitest'
import {
  MAX_ACKED_MENTIONS,
  deriveBadges,
  isInDnd,
  isUnread,
  shouldAlert,
  unreadCount,
  withAckedMention,
  withTriage,
  withWatermark,
  type InboxStateData
} from './inbox'
import { createNotifier } from './notifier'

const me = 'did:key:zMe'

function item(overrides: Partial<InboxItem>): InboxItem {
  return {
    sourceId: 'src-1',
    reason: 'mention',
    actor: 'did:key:zOther',
    at: 1000,
    ...overrides
  }
}

describe('isUnread', () => {
  it('mentions stay unread past the watermark until acked', () => {
    const mention = item({ contextId: 'c1', at: 500 })
    const state: InboxStateData = { watermarks: { c1: { at: 1000 } } }
    expect(isUnread(mention, state, 2000)).toBe(true)
    expect(isUnread(mention, { ...state, ackedMentions: ['src-1'] }, 2000)).toBe(false)
  })

  it('non-mentions are read once the watermark passes them', () => {
    const reply = item({ reason: 'reply', contextId: 'c1', at: 500 })
    expect(isUnread(reply, { watermarks: { c1: { at: 1000 } } }, 2000)).toBe(false)
    expect(isUnread(reply, { watermarks: { c1: { at: 100 } } }, 2000)).toBe(true)
  })

  it('done items are closed; snoozed items reopen after expiry', () => {
    const done = { items: { 'src-1': { state: 'done' as const } } }
    expect(isUnread(item({}), done, 2000)).toBe(false)
    const snoozed = { items: { 'src-1': { snoozedUntil: 5000 } } }
    expect(isUnread(item({}), snoozed, 2000)).toBe(false)
    expect(isUnread(item({}), snoozed, 6000)).toBe(true)
  })
})

describe('deriveBadges', () => {
  it('counts high-signal reasons, dots the rest', () => {
    const items = [
      item({ sourceId: 'a', reason: 'mention' }),
      item({ sourceId: 'b', reason: 'dm' }),
      item({ sourceId: 'c', reason: 'reply' })
    ]
    expect(deriveBadges(items, {}, 2000)).toEqual({ mentions: 2, activity: true })
  })

  it('acked and done items disappear from badges', () => {
    const items = [item({ sourceId: 'a' }), item({ sourceId: 'b', reason: 'dm' })]
    const state: InboxStateData = {
      ackedMentions: ['a'],
      items: { b: { state: 'done' } }
    }
    expect(deriveBadges(items, state, 2000)).toEqual({ mentions: 0, activity: false })
  })
})

describe('unreadCount', () => {
  const messages = [
    { id: 'm1', createdAt: 100, createdBy: 'did:key:zOther' },
    { id: 'm2', createdAt: 200, createdBy: me },
    { id: 'm3', createdAt: 300, createdBy: 'did:key:zOther' }
  ]

  it('counts others’ messages past the watermark', () => {
    expect(unreadCount(messages, { at: 150 }, me)).toBe(1)
    expect(unreadCount(messages, undefined, me)).toBe(2)
    expect(unreadCount(messages, { at: 300 }, me)).toBe(0)
  })
})

describe('shouldAlert', () => {
  it('direct mentions and dms pierce mutes', () => {
    const prefs = { channels: { c1: 'muted' as const } }
    expect(shouldAlert(item({ contextId: 'c1', reason: 'mention' }), prefs)).toBe(true)
    expect(shouldAlert(item({ contextId: 'c1', reason: 'dm' }), prefs)).toBe(true)
    expect(shouldAlert(item({ contextId: 'c1', reason: 'reply' }), prefs)).toBe(false)
  })

  it('default tier alerts on high-signal reasons but not raw activity', () => {
    expect(shouldAlert(item({ contextId: 'c1', reason: 'assigned' }), undefined)).toBe(true)
    expect(shouldAlert(item({ contextId: 'c1', reason: 'keyword' }), undefined)).toBe(true)
  })

  it('tier all alerts on everything', () => {
    const prefs = { channels: { c1: 'all' as const } }
    expect(shouldAlert(item({ contextId: 'c1', reason: 'reply' }), prefs)).toBe(true)
  })
})

describe('isInDnd', () => {
  const at = (h: number, m = 0): Date => new Date(2026, 5, 12, h, m)

  it('handles a same-day window', () => {
    const prefs = { dnd: { start: '09:00', end: '17:00' } }
    expect(isInDnd(prefs, at(12))).toBe(true)
    expect(isInDnd(prefs, at(8))).toBe(false)
  })

  it('handles an overnight window', () => {
    const prefs = { dnd: { start: '22:00', end: '08:00' } }
    expect(isInDnd(prefs, at(23))).toBe(true)
    expect(isInDnd(prefs, at(3))).toBe(true)
    expect(isInDnd(prefs, at(12))).toBe(false)
  })

  it('no dnd config means never in dnd', () => {
    expect(isInDnd(undefined, at(3))).toBe(false)
  })
})

describe('triage transforms', () => {
  it('withTriage sets and clears item state', () => {
    const state: InboxStateData = {}
    const done = withTriage(state, 'src-1', { state: 'done' })
    expect(done.items?.['src-1']).toEqual({ state: 'done' })
    const cleared = withTriage(done, 'src-1', null)
    expect(cleared.items?.['src-1']).toBeUndefined()
  })

  it('withWatermark only advances forward', () => {
    const state: InboxStateData = { watermarks: { c1: { at: 1000, nodeId: 'm1' } } }
    expect(withWatermark(state, 'c1', 500).watermarks?.c1?.at).toBe(1000)
    expect(withWatermark(state, 'c1', 2000, 'm2').watermarks?.c1).toEqual({
      at: 2000,
      nodeId: 'm2'
    })
  })

  it('withAckedMention dedupes and stays bounded', () => {
    const state: InboxStateData = {
      ackedMentions: Array.from({ length: MAX_ACKED_MENTIONS }, (_, i) => `old-${i}`)
    }
    const next = withAckedMention(state, 'new-1')
    expect(next.ackedMentions).toHaveLength(MAX_ACKED_MENTIONS)
    expect(next.ackedMentions?.at(-1)).toBe('new-1')
    expect(next.ackedMentions?.[0]).toBe('old-1')
    expect(withAckedMention({ ackedMentions: ['a'] }, 'a').ackedMentions).toEqual(['a'])
  })
})

describe('createNotifier', () => {
  it('accumulates items newest-first, dedupes by source, notifies subscribers', () => {
    const notifier = createNotifier({ me })
    let notified = 0
    const unsubscribe = notifier.subscribe(() => (notified += 1))

    notifier.push(item({ sourceId: 'a', at: 1 }))
    notifier.push(item({ sourceId: 'b', at: 2 }))
    notifier.push(item({ sourceId: 'a', at: 3 }))

    const items = notifier.getItems()
    expect(items.map((i) => i.sourceId)).toEqual(['a', 'b'])
    expect(items[0]?.at).toBe(3)
    expect(notified).toBe(3)

    unsubscribe()
    notifier.push(item({ sourceId: 'c' }))
    expect(notified).toBe(3)
  })

  it('handleEvent derives items via the rules', () => {
    const notifier = createNotifier({ me })
    const produced = notifier.handleEvent({
      change: { authorDID: 'did:key:zOther', wallTime: 9 },
      node: {
        id: 'm1',
        schemaId: 'xnet://xnet.fyi/ChatMessage@1.0.0',
        channel: 'c1',
        content: 'hi',
        mentions: { dids: [me] }
      },
      previousNode: null
    })
    expect(produced?.reason).toBe('mention')
    expect(notifier.getItems()).toHaveLength(1)
  })
})
