import { describe, expect, it } from 'vitest'
import { readConversationResponse, streamedConversationReply } from './community-agent-response'

const extension = {
  title: 'Watchlist',
  summary: 'Films in this chat',
  source: 'export default () => ({type:"text",text:"Films"})'
}

describe('conversational agent output', () => {
  it('keeps ordinary replies separate from optional extension source', () => {
    expect(readConversationResponse(JSON.stringify({ reply: 'Hello!', extension: null }))).toEqual({
      reply: 'Hello!'
    })
    expect(
      readConversationResponse(JSON.stringify({ reply: 'Ready for preview.', extension }))
    ).toEqual({ reply: 'Ready for preview.', extension })
  })

  it.each([
    '{"reply":"unfinished',
    '{}',
    '[]',
    JSON.stringify({ reply: '', extension: null }),
    JSON.stringify({ reply: 'Hello!' }),
    JSON.stringify({ reply: 'Hello!', extension: null, execute: 'command' }),
    JSON.stringify({ reply: 'Ready', extension: { ...extension, permissions: ['network'] } }),
    JSON.stringify({ reply: 'Ready', extension: { ...extension, source: 'x'.repeat(24_001) } }),
    JSON.stringify({ reply: 'Ready', extension: { ...extension, title: 'x'.repeat(121) } }),
    JSON.stringify({ reply: 'Ready', extension: { ...extension, summary: 'x'.repeat(2001) } })
  ])('rejects malformed, truncated, or overprivileged output %#', (text) => {
    expect(() => readConversationResponse(text)).toThrow()
  })

  it('streams only the reply through every possible JSON chunk boundary', () => {
    const reply = 'A "quoted" title, a backslash \\, a newline\n and 👋.'
    const text = JSON.stringify({ reply, extension })
    for (let index = 0; index <= text.length; index++) {
      const partial = streamedConversationReply(text.slice(0, index))
      expect(reply.startsWith(partial)).toBe(true)
      expect(partial).not.toContain('export default')
    }
    expect(streamedConversationReply(text)).toBe(reply)
  })

  it('withholds incomplete unicode escapes and surrogate pairs', () => {
    const text = '{"reply":"Hi \\uD83D\\uDC4B", "extension": null}'
    for (let index = 0; index <= text.length; index++)
      expect('Hi 👋'.startsWith(streamedConversationReply(text.slice(0, index)))).toBe(true)
    expect(streamedConversationReply(text)).toBe('Hi 👋')
  })

  it('does not expose source if the provider emits fields in a different order', () => {
    expect(streamedConversationReply(JSON.stringify({ extension, reply: 'Ready' }))).toBe('')
    expect(readConversationResponse(JSON.stringify({ extension, reply: 'Ready' })).reply).toBe(
      'Ready'
    )
  })
})
