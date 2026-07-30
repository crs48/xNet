import type { MeetingSegment } from '@xnetjs/data'
import type { AIGenerateRequest, AIProvider, AIStreamChunk } from '@xnetjs/plugins'
import { FakeDictationEngine } from '@xnetjs/dictation'
import { describe, expect, it } from 'vitest'
import { buildTranscriptChatMessages, streamTranscriptChat } from './chat'
import { buildEnhanceMessages, enhanceNotes, formatTranscript } from './enhance-notes'
import { polishTranscript } from './polish'
import { listTemplates, resolveTemplate } from './templates'

const segments: MeetingSegment[] = [
  { channel: 'me', text: 'Can we ship Friday?', startMs: 0, endMs: 1_500 },
  { channel: 'them', text: 'Yes, pending review.', startMs: 2_000, endMs: 3_500 }
]

/** A provider that streams a scripted answer and records requests. */
const fakeProvider = (reply = 'ENHANCED') => {
  const requests: AIGenerateRequest[] = []
  const provider: AIProvider = {
    name: 'fake',
    async generate() {
      return reply
    },
    async *stream(request): AsyncIterable<AIStreamChunk> {
      requests.push(request)
      for (const piece of [reply.slice(0, 3), reply.slice(3)]) {
        yield { type: 'text', text: piece, provider: 'fake', model: 'fake-1' }
      }
      yield { type: 'done', provider: 'fake', model: 'fake-1' }
    }
  }
  return { provider, requests }
}

describe('templates', () => {
  it('exposes the five built-ins and falls back to generic', () => {
    expect(listTemplates().map((t) => t.id)).toEqual([
      'generic',
      '1on1',
      'standup',
      'sales',
      'interview'
    ])
    expect(resolveTemplate('standup').id).toBe('standup')
    expect(resolveTemplate('my-custom-thing').id).toBe('generic')
    expect(resolveTemplate(undefined).id).toBe('generic')
  })
})

describe('buildEnhanceMessages', () => {
  it('labels channels, keeps the user notes on top, and injects calendar context', () => {
    const { template, messages } = buildEnhanceMessages({
      roughNotes: '- ship date?',
      segments,
      templateId: 'sales',
      calendar: { title: 'Acme sync', attendees: ['Ana', 'Bo'] }
    })

    expect(template.id).toBe('sales')
    expect(messages[0].role).toBe('system')
    const user = messages[1].content
    expect(user).toContain('Meeting title: Acme sync')
    expect(user).toContain('Attendees: Ana, Bo')
    expect(user).toContain('- ship date?')
    expect(user).toContain('[me] Can we ship Friday?')
    expect(user).toContain('[them] Yes, pending review.')
  })

  it('says so when there are no rough notes (transcript-only summary)', () => {
    const { messages } = buildEnhanceMessages({ roughNotes: '  ', segments })
    expect(messages[1].content).toContain('(none — summarize from the transcript alone)')
  })

  it('prefers named speakers over channel labels once diarization fills them', () => {
    expect(
      formatTranscript([{ channel: 'them', text: 'Hi', startMs: 0, endMs: 500, speaker: 'Ana' }])
    ).toBe('[Ana] Hi')
  })
})

describe('enhanceNotes', () => {
  it('streams through provider.stream and reassembles the text', async () => {
    const { provider, requests } = fakeProvider('ENHANCED')
    const text = await enhanceNotes(provider, { roughNotes: 'x', segments })
    expect(text).toBe('ENHANCED')
    expect(requests[0].stream).toBe(true)
    expect(requests[0].messages?.[0].role).toBe('system')
  })

  it('falls back to generate() for stream-less providers', async () => {
    const provider: AIProvider = { name: 'bare', generate: async () => 'ONE-SHOT' }
    expect(await enhanceNotes(provider, { roughNotes: '', segments })).toBe('ONE-SHOT')
  })
})

describe('transcript chat', () => {
  it('grounds the system message in the transcript and keeps history', () => {
    const messages = buildTranscriptChatMessages(
      { segments, title: 'Acme sync', notes: 'shipped?' },
      [
        { role: 'user', content: 'earlier question' },
        { role: 'assistant', content: 'earlier answer' },
        { role: 'system', content: 'should be stripped' }
      ],
      'What were the action items?'
    )

    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain('[me] Can we ship Friday?')
    expect(messages[0].content).toContain('Meeting: Acme sync')
    expect(messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(messages[messages.length - 1].content).toBe('What were the action items?')
  })

  it('streams an answer', async () => {
    const { provider } = fakeProvider('42')
    let answer = ''
    for await (const delta of streamTranscriptChat(provider, { segments }, [], 'meaning?')) {
      answer += delta
    }
    expect(answer).toBe('42')
  })
})

describe('polishTranscript', () => {
  it('re-runs retained channel audio and rebuilds attribution', async () => {
    const engine = new FakeDictationEngine({
      id: 'byo',
      script: () => 'polished text',
      modelId: 'whisper-large-v3-turbo'
    })

    const result = await polishTranscript(engine, [
      {
        channel: 'me',
        audio: { kind: 'pcm', samples: new Float32Array(16_000), sampleRate: 16_000 }
      },
      {
        channel: 'them',
        audio: { kind: 'pcm', samples: new Float32Array(16_000), sampleRate: 16_000 }
      }
    ])

    expect(result.segments.map((s) => s.channel).sort()).toEqual(['me', 'them'])
    expect(result.modelId).toBe('whisper-large-v3-turbo')
    expect(result.fullText).toContain('polished text')
  })

  it('refuses loudly when no audio was retained', async () => {
    const engine = new FakeDictationEngine({})
    await expect(polishTranscript(engine, [])).rejects.toThrow(/retained audio/)
  })
})
