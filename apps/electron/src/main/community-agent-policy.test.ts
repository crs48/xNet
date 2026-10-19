import { describe, expect, it } from 'vitest'
import {
  audienceKey,
  buildAgentPrompt,
  requireOwnedChannel,
  type AgentContextNode
} from './community-agent-policy'
const node = (
  id: string,
  type: string,
  properties: Record<string, unknown> = {}
): AgentContextNode => ({
  id,
  schemaId: `xnet://xnet.fyi/${type}@1.0.0`,
  createdBy: 'owner',
  createdAt: 1000,
  updatedAt: 1000,
  properties
})
const message = node('m', 'ChatMessage', { channel: 'c', content: 'Hello @Codex' })
const input = { message, context: [], channelId: 'c', owner: 'owner', now: 2000 }
describe('community agent context policy', () => {
  it('allows only an explicit fresh owner message', () => {
    expect(buildAgentPrompt(input)).toEqual({ prompt: 'User request:\nHello @Codex', count: 0 })
  })
  it.each([
    { createdBy: 'another-person' },
    { id: 'agent-reply-other' },
    { deleted: true },
    { properties: { ...message.properties, channel: 'other' } },
    { properties: { ...message.properties, edited: true } },
    { properties: { ...message.properties, redacted: true } }
  ])('rejects forged, agent-produced, edited, or unavailable invocation %j', (patch) => {
    expect(() => buildAgentPrompt({ ...input, message: { ...message, ...patch } })).toThrow()
  })
  it('rejects stale delivery but permits explicit retry', () => {
    expect(() => buildAgentPrompt({ ...input, now: 400000 })).toThrow('stale')
    expect(buildAgentPrompt({ ...input, now: 400000, retry: true }).count).toBe(0)
  })
  it('rejects cross-channel canaries instead of filtering them silently', () => {
    expect(() =>
      buildAgentPrompt({
        ...input,
        context: [node('secret', 'ChatMessage', { channel: 'finance', content: 'CANARY' })]
      })
    ).toThrow('another conversation')
  })
  it('bounds context and keeps attachments out', () => {
    const safe = node('context', 'ChatMessage', {
      channel: 'c',
      content: 'Film suggestion',
      attachments: [{ url: 'CANARY' }]
    })
    expect(buildAgentPrompt({ ...input, context: [safe] }).prompt).not.toContain('CANARY')
    expect(() => buildAgentPrompt({ ...input, context: Array(31).fill(safe) })).toThrow('30')
    expect(() =>
      buildAgentPrompt({
        ...input,
        context: [{ ...safe, properties: { channel: 'c', content: 'x'.repeat(25000) } }]
      })
    ).toThrow('24,000')
  })
  it('changes the session boundary with audience, visibility, runtime, or context policy', () => {
    const channel = node('c', 'Channel', { members: ['owner'], visibility: 'private' })
    const binding = {
      channelId: 'c',
      runtimeId: 'codex',
      provider: 'codex' as const,
      mode: 'mentions' as const,
      context: 'recent' as const,
      enabled: true
    }
    const key = audienceKey(channel, null, binding)
    expect(
      audienceKey(
        { ...channel, properties: { ...channel.properties, members: ['owner', 'guest'] } },
        null,
        binding
      )
    ).not.toBe(key)
    expect(audienceKey(channel, null, { ...binding, context: 'question' })).not.toBe(key)
    expect(audienceKey(channel, null, { ...binding, runtimeId: 'other' })).not.toBe(key)
    expect(() => requireOwnedChannel({ ...channel, createdBy: 'other' }, 'owner')).toThrow(
      'creator'
    )
  })
})
