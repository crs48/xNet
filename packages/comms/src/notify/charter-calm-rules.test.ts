/**
 * Charter §Calm regression: notifications are rule-based, not ML-ranked.
 * The notifier is a deterministic, first-match-wins priority list — same input
 * always yields the same result, your own changes never notify you, and there
 * is no engagement score that could reorder or amplify alerts.
 */

import type { NotifierContext, NotifierEvent } from './types'
import { describe, expect, it } from 'vitest'
import { evaluateChange } from './rules'

const me = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
const other = 'did:key:z6MkfDbvZkqwzPLs7BA1eMnaGyfXcb4ZUmaqYwhEbBPp7pTV'
const CHAT = 'xnet://xnet.fyi/ChatMessage@1.0.0'

const ctx: NotifierContext = { me, getChannelKind: () => 'dm' }

function event(node: Record<string, unknown> | null, authorDID = other): NotifierEvent {
  return { change: { authorDID, wallTime: 1234 }, node, previousNode: null }
}

describe('Charter §Calm — notifications are rule-based, deterministic', () => {
  it('is deterministic: identical input yields identical output', () => {
    const node = {
      id: 'm1',
      schemaId: CHAT,
      channel: 'c1',
      content: 'hi',
      mentions: { dids: [me] }
    }
    const a = evaluateChange(event(node), ctx)
    const b = evaluateChange(event(node), ctx)
    expect(a).toEqual(b)
    expect(a?.reason).toBe('mention')
  })

  it('never notifies you about your own change', () => {
    const node = {
      id: 'm1',
      schemaId: CHAT,
      channel: 'c1',
      content: 'hi',
      mentions: { dids: [me] }
    }
    expect(evaluateChange(event(node, me), ctx)).toBeNull()
  })

  it('resolves by fixed priority (first match wins), not by any score', () => {
    // A DM message that also mentions me matches both `dm` and `mention`;
    // mention is higher priority and must win regardless of content.
    const node = {
      id: 'm1',
      schemaId: CHAT,
      channel: 'dm-channel',
      content: 'urgent!!!',
      mentions: { dids: [me] }
    }
    expect(evaluateChange(event(node), ctx)?.reason).toBe('mention')
  })

  it('priority is content-independent — "louder" text does not change the reason', () => {
    const base = { id: 'm', schemaId: CHAT, channel: 'dm-channel', mentions: { dids: [me] } }
    const quiet = evaluateChange(event({ ...base, content: 'fyi' }), ctx)
    const loud = evaluateChange(event({ ...base, content: 'ACT NOW!!! 🔥🔥🔥' }), ctx)
    expect(quiet?.reason).toBe(loud?.reason)
  })
})
