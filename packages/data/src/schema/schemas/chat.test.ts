import type { DID } from '../node'
import { describe, it, expect } from 'vitest'
import { ChannelSchema } from './channel'
import { ChatMessageSchema } from './chat-message'
import { CommentSchema } from './comment'
import { MAX_MENTION_DIDS, isValidMentions, mentionsInclude, normalizeMentions } from './mentions'

const alice = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID
const bob = 'did:key:z6MkfDbvZkqwzPLs7BA1eMnaGyfXcb4ZUmaqYwhEbBPp7pTV' as DID

describe('ChannelSchema', () => {
  it('has the expected IRI and no Y.Doc', () => {
    expect(ChannelSchema.schema['@id']).toBe('xnet://xnet.fyi/Channel@1.0.0')
    expect(ChannelSchema.schema.document).toBeUndefined()
  })

  it('creates a named channel with defaults', () => {
    const channel = ChannelSchema.create({ name: 'general' }, { createdBy: alice })
    expect(channel.kind).toBe('channel')
    expect(channel.archived).toBe(false)
    expect(channel.name).toBe('general')
    expect(channel.createdBy).toBe(alice)
  })

  it('creates a DM with explicit members and a caller-provided id', () => {
    const dm = ChannelSchema.create(
      { kind: 'dm', members: [alice, bob] },
      { createdBy: alice, id: 'dm-deadbeef' }
    )
    expect(dm.id).toBe('dm-deadbeef')
    expect(dm.kind).toBe('dm')
    expect(dm.members).toEqual([alice, bob])
  })

  it('creates a voice room', () => {
    const room = ChannelSchema.create({ name: 'Lounge', kind: 'voice' }, { createdBy: alice })
    expect(room.kind).toBe('voice')
  })
})

describe('ChatMessageSchema', () => {
  it('has the expected IRI and required channel/content', () => {
    expect(ChatMessageSchema.schema['@id']).toBe('xnet://xnet.fyi/ChatMessage@1.0.0')
    const message = ChatMessageSchema.create(
      { channel: 'chan-1', content: 'hello world' },
      { createdBy: alice }
    )
    expect(message.channel).toBe('chan-1')
    expect(message.content).toBe('hello world')
    expect(message.edited).toBe(false)
    expect(message.redacted).toBe(false)
  })

  it('carries structured mentions', () => {
    const message = ChatMessageSchema.create(
      { channel: 'chan-1', content: 'hey @bob', mentions: { dids: [bob] } },
      { createdBy: alice }
    )
    expect(mentionsInclude(message.mentions, bob)).toBe(true)
    expect(mentionsInclude(message.mentions, alice)).toBe(false)
  })

  it('validates a thread reply', () => {
    const root = ChatMessageSchema.create(
      { channel: 'chan-1', content: 'root' },
      { createdBy: alice }
    )
    const reply = ChatMessageSchema.create(
      { channel: 'chan-1', content: 'reply', inReplyTo: root.id },
      { createdBy: bob }
    )
    expect(reply.inReplyTo).toBe(root.id)
    expect(ChatMessageSchema.validate(reply).valid).toBe(true)
  })
})

describe('Comment mentions field', () => {
  it('accepts structured mentions on comments', () => {
    const comment = CommentSchema.create(
      {
        target: 'page-1',
        anchorType: 'node',
        anchorData: '{}',
        content: 'cc @bob',
        mentions: { dids: [bob] }
      },
      { createdBy: alice }
    )
    expect(mentionsInclude(comment.mentions, bob)).toBe(true)
    expect(CommentSchema.validate(comment).valid).toBe(true)
  })
})

describe('mentions helpers', () => {
  it('normalizes: dedupes, drops invalid DIDs, caps length', () => {
    expect(normalizeMentions({ dids: [alice, alice, 'not-a-did'] })).toEqual({ dids: [alice] })
    const many = Array.from({ length: MAX_MENTION_DIDS + 10 }, (_, i) => `did:key:z${i}abc`)
    expect(normalizeMentions({ dids: many })?.dids).toHaveLength(MAX_MENTION_DIDS)
  })

  it('returns undefined when nothing remains', () => {
    expect(normalizeMentions({ dids: [] })).toBeUndefined()
    expect(normalizeMentions(undefined)).toBeUndefined()
    expect(normalizeMentions('junk')).toBeUndefined()
  })

  it('keeps room mentions', () => {
    expect(normalizeMentions({ dids: [], room: true })).toEqual({ dids: [], room: true })
  })

  it('isValidMentions accepts absent values and rejects malformed ones', () => {
    expect(isValidMentions(undefined)).toBe(true)
    expect(isValidMentions({ dids: [alice] })).toBe(true)
    expect(isValidMentions({ dids: [alice], room: true })).toBe(true)
    expect(isValidMentions({ dids: 'nope' })).toBe(false)
    expect(isValidMentions({ dids: ['nope'] })).toBe(false)
    expect(
      isValidMentions({ dids: Array.from({ length: MAX_MENTION_DIDS + 1 }, () => alice) })
    ).toBe(false)
  })
})
