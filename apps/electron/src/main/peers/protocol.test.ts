import { randomBytes, randomUUID } from 'node:crypto'
import { ChatMessageSchema } from '@xnetjs/data'
import { createUnsignedChange, signChange } from '@xnetjs/sync'
import { peerMessagePrefix } from '@xnetjs/workbench/peer-chat'
import { describe, expect, it } from 'vitest'
import {
  createBinding,
  validateBinding,
  validateChange,
  encodeInvite,
  decodeInvite,
  equalSecret,
  relayUrl,
  signPeerProfile,
  validatePeerProfile,
  encodeWebInvite
} from './protocol'
const seed = randomBytes(32)
const binding = createBinding(seed, randomBytes(32).toString('hex'))
const channel = `iroh-${randomUUID()}`
function message(
  properties: Record<string, unknown> = {
    channel,
    content: 'Hello',
    edited: false,
    redacted: false
  }
) {
  const change = signChange(
    createUnsignedChange({
      id: randomUUID(),
      type: 'node-change',
      payload: {
        nodeId: peerMessagePrefix(channel, binding.did) + randomUUID(),
        schemaId: ChatMessageSchema._schemaId,
        properties
      },
      parentHash: null,
      authorDID: binding.did,
      lamport: 1
    }),
    seed
  )
  return { ...change, signature: Array.from(change.signature) }
}
describe('peer chat boundaries', () => {
  it('binds display names to their author and rejects changed, cross-author and future profiles', () => {
    const signed = signPeerProfile(seed, 'Alice')
    expect(validatePeerProfile(signed, binding.did).name).toBe('Alice')
    expect(() => validatePeerProfile({ ...signed, name: 'Mallory' }, binding.did)).toThrow()
    expect(() =>
      validatePeerProfile(signed, createBinding(randomBytes(32), binding.endpoint).did)
    ).toThrow()
    expect(() =>
      validatePeerProfile(signPeerProfile(seed, 'Future', Date.now() + 120_000), binding.did)
    ).toThrow()
  })
  it('pins the xNet identity to the authenticated transport key', () => {
    expect(validateBinding(binding, binding.endpoint)).toEqual(binding)
    expect(() => validateBinding(binding, 'a'.repeat(64))).toThrow()
    expect(() =>
      validateBinding({ ...binding, did: createBinding(randomBytes(32), binding.endpoint).did })
    ).toThrow()
  })
  it('accepts signed text and rejects tampering, cross-channel writes and other schemas', () => {
    const change = message()
    expect(validateChange(change, channel, binding.did).hash).toBe(change.hash)
    expect(() =>
      validateChange(
        { ...change, payload: { ...change.payload, properties: { channel, content: 'forged' } } },
        channel,
        binding.did
      )
    ).toThrow()
    expect(() => validateChange(change, `iroh-${randomUUID()}`, binding.did)).toThrow()
    expect(() =>
      validateChange(
        { ...change, payload: { ...change.payload, schemaId: 'xnet://Admin' } },
        channel,
        binding.did
      )
    ).toThrow()
  })
  it('does not grant permission to files, agents, membership or unbounded content', () => {
    for (const properties of [
      { channel, content: 'a'.repeat(4001) },
      { channel, content: 'hello', attachments: [] },
      { channel, members: [binding.did] },
      { channel, content: 'hello', development: {} }
    ])
      expect(() => validateChange(message(properties), channel, binding.did)).toThrow()
  })
  it('bounds and expires invitations and compares the full secret', () => {
    const invite = {
      version: 1 as const,
      channel,
      name: 'Friends',
      secret: randomBytes(32).toString('hex'),
      expires: Date.now() + 60000,
      binding,
      ticket: 'ticket'
    }
    expect(decodeInvite(encodeInvite(invite))).toEqual(invite)
    expect(decodeInvite(encodeWebInvite(invite))).toEqual(invite)
    for (const origin of [
      'http://xnet.fyi',
      'https://xnet.fyi.evil.test',
      'https://user@xnet.fyi',
      'https://xnet.fyi:444'
    ])
      expect(() =>
        decodeInvite(encodeWebInvite(invite).replace('https://xnet.fyi', origin))
      ).toThrow()
    expect(() => decodeInvite(encodeInvite(invite), invite.expires)).toThrow()
    expect(() => decodeInvite('xnet://peer#' + 'a'.repeat(12001))).toThrow()
    expect(equalSecret(invite.secret, invite.secret)).toBe(true)
    expect(equalSecret(invite.secret, 'x')).toBe(false)
    expect(() => relayUrl('http://example.com/')).toThrow()
    expect(() => relayUrl('https://user:secret@example.com/')).toThrow()
  })
})

it('authenticates reusable link policy and gives each requester a separate conversation', async () => {
  const { signInvite, inviteChannel } = await import('./protocol')
  const seed = randomBytes(32)
  const binding = createBinding(seed, 'a'.repeat(64))
  const invite = signInvite(
    {
      version: 3,
      access: 'contact',
      channel: `iroh-${randomUUID()}`,
      name: 'Alice',
      binding,
      ticket: 'test-ticket',
      secret: 'a'.repeat(64),
      expires: Date.now() + 60000
    },
    seed
  )
  expect(decodeInvite(encodeInvite(invite))).toEqual(invite)
  expect(() => decodeInvite(encodeInvite({ ...invite, access: 'public' }))).toThrow()
  expect(inviteChannel(invite, 'alice')).not.toBe(inviteChannel(invite, 'bob'))
  expect(inviteChannel(invite, 'alice')).toBe(inviteChannel(invite, 'alice'))
})
