import { describe, expect, it } from 'vitest'
import {
  conversationInstructions,
  readConversationResponse,
  streamedConversationReply,
  streamedConversationProgress
} from './community-agent-response'

const extension = {
  title: 'Watchlist',
  summary: 'Films in this chat',
  source: 'export default () => ({type:"text",text:"Films"})'
}
// The response validator must enforce the limit we actually advertise to the agent.
const advertisedSourceLimit = Number(
  /source at most ([\d,]+)/.exec(conversationInstructions)?.[1].replaceAll(',', '')
)

describe('conversational agent output', () => {
  it('accepts the advertised source limit and rejects the next character', () => {
    expect(Number.isSafeInteger(advertisedSourceLimit)).toBe(true)
    expect(advertisedSourceLimit).toBeGreaterThan(0)
    const source = 'x'.repeat(advertisedSourceLimit)
    expect(
      readConversationResponse(
        JSON.stringify({ reply: 'Ready', extension: { ...extension, source } })
      ).extension?.source
    ).toBe(source)
    expect(() =>
      readConversationResponse(
        JSON.stringify({ reply: 'Ready', extension: { ...extension, source: `${source}x` } })
      )
    ).toThrow('oversized extension draft')
  })
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

describe('observed response phases', () => {
  it('changes to extension generation only when the actual extension object starts', () => {
    const reply = 'Quoted field: "extension": { and escaped \\" text'
    const text = JSON.stringify({ reply, extension })
    const start = text.indexOf(',"extension":{') + ',"extension":{'.length
    for (let index = 0; index <= text.length; index++) {
      const progress = streamedConversationProgress(text.slice(0, index))
      expect(progress.phase === 'drafting').toBe(index >= start)
      expect(reply.startsWith(progress.reply)).toBe(true)
      expect(progress.reply).not.toContain('export default')
    }
  })
  it('does not invent extension work for ordinary answers or reordered output', () => {
    expect(streamedConversationProgress('{"reply":"Hi", "extension": null}').phase).toBe('replying')
    expect(streamedConversationProgress(JSON.stringify({ extension, reply: 'Ready' }))).toEqual({
      reply: ''
    })
  })
})
