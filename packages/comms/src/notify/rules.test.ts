import type { NotifierContext, NotifierEvent } from './types'
import { describe, expect, it } from 'vitest'
import { dmChannelId } from '../chat/dm'
import { evaluateChange } from './rules'

const me = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
const other = 'did:key:z6MkfDbvZkqwzPLs7BA1eMnaGyfXcb4ZUmaqYwhEbBPp7pTV'

const CHAT = 'xnet://xnet.fyi/ChatMessage@1.0.0'
const COMMENT = 'xnet://xnet.fyi/Comment@1.0.0'
const TASK = 'xnet://xnet.fyi/Task@1.0.0'

const ctx: NotifierContext = { me }

function event(
  node: Record<string, unknown> | null,
  previousNode: Record<string, unknown> | null = null,
  authorDID = other
): NotifierEvent {
  return { change: { authorDID, wallTime: 1234 }, node, previousNode }
}

describe('evaluateChange', () => {
  it('never notifies for my own changes', () => {
    const node = { id: 'm1', schemaId: CHAT, channel: 'c1', mentions: { dids: [me] } }
    expect(evaluateChange(event(node, null, me), ctx)).toBeNull()
  })

  it('mention: fires when my DID is newly mentioned', () => {
    const node = {
      id: 'm1',
      schemaId: CHAT,
      channel: 'c1',
      content: 'hey',
      mentions: { dids: [me] }
    }
    const item = evaluateChange(event(node), ctx)
    expect(item).toMatchObject({
      reason: 'mention',
      sourceId: 'm1',
      contextId: 'c1',
      actor: other,
      at: 1234
    })
  })

  it('mention: does not re-fire when the mention already existed', () => {
    const node = {
      id: 'm1',
      schemaId: CHAT,
      channel: 'c1',
      content: 'edit',
      mentions: { dids: [me] }
    }
    const previous = { ...node, content: 'orig' }
    expect(evaluateChange(event(node, previous), ctx)).toBeNull()
  })

  it('mention: fires on comments too', () => {
    const node = {
      id: 'cm1',
      schemaId: COMMENT,
      target: 'page-1',
      content: 'cc',
      mentions: { dids: [me] }
    }
    expect(evaluateChange(event(node), ctx)?.reason).toBe('mention')
  })

  it('dm: fires for new messages in deterministic DM channels', () => {
    const node = { id: 'm2', schemaId: CHAT, channel: dmChannelId([me, other]), content: 'yo' }
    expect(evaluateChange(event(node), ctx)?.reason).toBe('dm')
  })

  it('dm: fires via channel-kind lookup', () => {
    const lookupCtx: NotifierContext = { me, getChannelKind: () => 'dm' }
    const node = { id: 'm3', schemaId: CHAT, channel: 'chan-x', content: 'yo' }
    expect(evaluateChange(event(node), lookupCtx)?.reason).toBe('dm')
  })

  it('dm: does not fire for edits', () => {
    const node = { id: 'm2', schemaId: CHAT, channel: dmChannelId([me, other]), content: 'edited' }
    expect(evaluateChange(event(node, { ...node, content: 'orig' }), ctx)).toBeNull()
  })

  it('assigned: fires only on the assignment edge', () => {
    const before = { id: 't1', schemaId: TASK, title: 'Fix', assignees: [] }
    const after = { ...before, assignees: [me] }
    expect(evaluateChange(event(after, before), ctx)?.reason).toBe('assigned')
    // Re-sync of already-assigned state: no edge, no item.
    expect(evaluateChange(event(after, after), ctx)).toBeNull()
    // Unrelated edit while assigned: no item.
    expect(evaluateChange(event({ ...after, title: 'Fix now' }, after), ctx)).toBeNull()
  })

  it('assigned: legacy single assignee field also counts', () => {
    const after = { id: 't2', schemaId: TASK, title: 'Fix', assignee: me }
    expect(
      evaluateChange(event(after, { id: 't2', schemaId: TASK, title: 'Fix' }), ctx)?.reason
    ).toBe('assigned')
  })

  it('reply: fires for replies to my threads', () => {
    const threadCtx: NotifierContext = { me, isMyThread: (id) => id === 'root-1' }
    const node = { id: 'm4', schemaId: CHAT, channel: 'c1', content: 're', inReplyTo: 'root-1' }
    expect(evaluateChange(event(node), threadCtx)?.reason).toBe('reply')
    const elsewhere = { ...node, id: 'm5', inReplyTo: 'root-2' }
    expect(evaluateChange(event(elsewhere), threadCtx)).toBeNull()
  })

  it('comment: fires for comments on my nodes', () => {
    const nodeCtx: NotifierContext = { me, isMyNode: (id) => id === 'page-1' }
    const node = { id: 'cm2', schemaId: COMMENT, target: 'page-1', content: 'nice' }
    const item = evaluateChange(event(node), nodeCtx)
    expect(item).toMatchObject({ reason: 'comment', contextId: 'page-1' })
  })

  it('room-mention: fires for @room messages', () => {
    const node = {
      id: 'm6',
      schemaId: CHAT,
      channel: 'c1',
      content: 'all',
      mentions: { dids: [], room: true }
    }
    expect(evaluateChange(event(node), ctx)?.reason).toBe('room-mention')
  })

  it('keyword: fires case-insensitively', () => {
    const kwCtx: NotifierContext = { me, keywords: ['Outage'] }
    const node = { id: 'm7', schemaId: CHAT, channel: 'c1', content: 'big OUTAGE in prod' }
    expect(evaluateChange(event(node), kwCtx)?.reason).toBe('keyword')
  })

  it('redacted and deleted nodes never notify', () => {
    const node = {
      id: 'm8',
      schemaId: CHAT,
      channel: 'c1',
      redacted: true,
      mentions: { dids: [me] }
    }
    expect(evaluateChange(event(node), ctx)).toBeNull()
  })

  it('direct mention outranks dm and room-mention', () => {
    const node = {
      id: 'm9',
      schemaId: CHAT,
      channel: dmChannelId([me, other]),
      content: 'hi',
      mentions: { dids: [me], room: true }
    }
    expect(evaluateChange(event(node), ctx)?.reason).toBe('mention')
  })
})
