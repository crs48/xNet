import { describe, expect, it } from 'vitest'
import { chatIsUnread, parseChatPreferences, sortChatIds, type ChatSummary } from './chat-inbox'

const summary = (id: string, createdAt: number, createdBy = 'other'): ChatSummary => ({
  id,
  createdAt,
  createdBy,
  text: 'Message',
  kind: 'message'
})

describe('personal chat inbox', () => {
  it('distinguishes missing preferences from corrupt or unsupported saved data', () => {
    expect(parseChatPreferences(null)).toEqual({})
    expect(() => parseChatPreferences('{')).toThrow()
    expect(() => parseChatPreferences('{"version":2,"chats":{}}')).toThrow()
    expect(() =>
      parseChatPreferences('{"version":1,"chats":{"a":{"pinnedAt":"yesterday"}}}')
    ).toThrow()
    expect(
      parseChatPreferences('{"version":1,"chats":{"a":{"pinnedAt":10,"seen":"m1","unread":false}}}')
    ).toEqual({ a: { pinnedAt: 10, seen: 'm1', unread: false } })
  })
  it('keeps pins ahead of recent activity without mutating the input order', () => {
    const ids = ['old', 'new', 'pin']
    expect(
      sortChatIds(
        ids,
        { old: summary('1', 1), new: summary('2', 50), pin: summary('3', 2) },
        { pin: { pinnedAt: 5 } }
      )
    ).toEqual(['pin', 'new', 'old'])
    expect(ids).toEqual(['old', 'new', 'pin'])
  })
  it('recognizes new incoming activity while preserving manual unread intent', () => {
    expect(chatIsUnread(summary('new', 1), { seen: 'old' }, 'me')).toBe(true)
    expect(chatIsUnread(summary('new', 1), { seen: 'new' }, 'me')).toBe(false)
    expect(chatIsUnread(summary('own', 2, 'me'), { seen: 'old' }, 'me')).toBe(false)
    expect(
      chatIsUnread({ ...summary('agent', 2, 'me'), agentReply: true }, { seen: 'old' }, 'me')
    ).toBe(true)
    expect(chatIsUnread(summary('own', 2, 'me'), { unread: true }, 'me')).toBe(true)
    expect(chatIsUnread(undefined, undefined, 'me')).toBe(false)
  })
})
