import type { AiContextPack, AiContextPackResource } from '@xnetjs/plugins'
import { describe, expect, it } from 'vitest'
import { AI_SYSTEM_PROMPT, formatContextMessages } from './ai-context'

const resource = (over: Partial<AiContextPackResource> = {}): AiContextPackResource => ({
  uri: 'xnet://node/n1',
  mimeType: 'text/plain',
  text: 'Hello body',
  trust: { level: 'workspace', instructionBoundary: '' },
  citation: { kind: 'node', id: 'n1' },
  ...over
})

const pack = (resources: AiContextPackResource[]): AiContextPack => ({
  id: 'ctx_1',
  seeds: [],
  resources,
  createdAt: '2026-06-17T00:00:00.000Z',
  limits: { maxResources: 6, maxCharactersPerResource: 2000 }
})

describe('AI_SYSTEM_PROMPT', () => {
  it('is a non-empty grounding instruction', () => {
    expect(AI_SYSTEM_PROMPT.length).toBeGreaterThan(0)
    expect(AI_SYSTEM_PROMPT).toMatch(/workspace/i)
  })
})

describe('formatContextMessages', () => {
  it('returns [] for an absent or empty pack', () => {
    expect(formatContextMessages(null)).toEqual([])
    expect(formatContextMessages(undefined)).toEqual([])
    expect(formatContextMessages(pack([]))).toEqual([])
  })

  it('formats resources into one system message with citations and bodies', () => {
    const messages = formatContextMessages(
      pack([
        resource({ text: 'Roadmap notes', citation: { kind: 'page', id: 'p1' } }),
        resource({ text: 'Task list', citation: { kind: 'node', id: 'n2' } })
      ])
    )
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain('page · p1')
    expect(messages[0].content).toContain('Roadmap notes')
    expect(messages[0].content).toContain('node · n2')
    expect(messages[0].content).toContain('Task list')
  })

  it('truncates very long resource text', () => {
    const long = 'x'.repeat(5000)
    const messages = formatContextMessages(pack([resource({ text: long })]))
    expect(messages[0].content).toContain('…')
    expect(messages[0].content.length).toBeLessThan(long.length)
  })
})
