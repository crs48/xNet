/**
 * Tests for the in-tab provider adapters (exploration 0174).
 *
 * Both run against injected fakes — no WebGPU, no Chrome, no `@mlc-ai/web-llm`.
 */

import type { AIStreamChunk } from '../providers'
import { describe, expect, it } from 'vitest'
import {
  createPromptApiProvider,
  downloadPromptApiModel,
  promptApiAvailability,
  PromptApiProvider,
  type LanguageModelLike,
  type LanguageModelSessionLike
} from './prompt-api-provider'
import { createWebLLMProvider, type WebLLMEngineLike } from './webllm-provider'

async function collect(stream: AsyncIterable<AIStreamChunk>): Promise<AIStreamChunk[]> {
  const out: AIStreamChunk[] = []
  for await (const chunk of stream) out.push(chunk)
  return out
}

// ─── WebLLM ──────────────────────────────────────────────────────────────────

function fakeEngine(): WebLLMEngineLike {
  return {
    chat: {
      completions: {
        // Overload: non-stream returns a response; stream returns an async iterable.
        create: (async (request: { stream?: boolean }) => {
          if (request.stream) {
            return (async function* () {
              yield { choices: [{ delta: { content: 'Hello' } }] }
              yield { choices: [{ delta: { content: ' world' } }] }
              yield { choices: [{ delta: {} }], usage: { total_tokens: 5 } }
            })()
          }
          return { choices: [{ message: { content: 'non-stream reply' } }] }
        }) as WebLLMEngineLike['chat']['completions']['create']
      }
    }
  }
}

describe('WebLLMProvider', () => {
  it('generates non-streaming text', async () => {
    const provider = createWebLLMProvider({ engine: fakeEngine(), model: 'Llama-3.2-3B' })
    expect(await provider.generate('hi')).toBe('non-stream reply')
  })

  it('streams text deltas and a usage chunk then done', async () => {
    const provider = createWebLLMProvider({ engine: fakeEngine(), model: 'Llama-3.2-3B' })
    const chunks = await collect(provider.stream({ messages: [{ role: 'user', content: 'hi' }] }))
    const text = chunks
      .filter((c) => c.type === 'text')
      .map((c) => (c.type === 'text' ? c.text : ''))
      .join('')
    expect(text).toBe('Hello world')
    expect(chunks.at(-1)?.type).toBe('done')
    expect(chunks.some((c) => c.type === 'usage')).toBe(true)
  })

  it('reports local, no-tools capabilities (drives propose-only writes)', () => {
    const provider = createWebLLMProvider({ engine: fakeEngine(), model: 'Llama-3.2-3B' })
    const caps = provider.getCapabilities()
    expect(caps.tools).toBe(false)
    expect(caps.local).toBe(true)
    expect(caps.privacy).toBe('local')
  })
})

// ─── Prompt API (Gemini Nano) ──────────────────────────────────────────────────

function fakeSession(): LanguageModelSessionLike {
  return {
    prompt: async (input: string) => `echo: ${input}`,
    promptStreaming: async function* () {
      yield 'partial'
      yield ' answer'
    }
  }
}

describe('PromptApiProvider', () => {
  it('generates via the session', async () => {
    const provider = new PromptApiProvider({ session: fakeSession() })
    expect(await provider.generate('ping')).toBe('echo: ping')
  })

  it('streams then emits done', async () => {
    const provider = new PromptApiProvider({ session: fakeSession() })
    const chunks = await collect(provider.stream({ prompt: 'hi' }))
    expect(chunks.filter((c) => c.type === 'text')).toHaveLength(2)
    expect(chunks.at(-1)?.type).toBe('done')
  })

  it('createPromptApiProvider returns null when the API is unavailable', async () => {
    const lm: LanguageModelLike = {
      availability: async () => 'unavailable',
      create: async () => fakeSession()
    }
    expect(await createPromptApiProvider(lm)).toBeNull()
  })

  it('createPromptApiProvider builds a provider when available', async () => {
    const lm: LanguageModelLike = {
      availability: async () => 'available',
      create: async () => fakeSession()
    }
    const provider = await createPromptApiProvider(lm)
    expect(provider).toBeInstanceOf(PromptApiProvider)
  })

  it('reports local, no-tools capabilities', () => {
    const provider = new PromptApiProvider({ session: fakeSession() })
    expect(provider.getCapabilities().tools).toBe(false)
  })

  it('promptApiAvailability surfaces the raw state (so the UI can offer a download)', async () => {
    const downloadable: LanguageModelLike = {
      availability: async () => 'downloadable',
      create: async () => fakeSession()
    }
    expect(await promptApiAvailability(downloadable)).toBe('downloadable')
  })

  it('promptApiAvailability reports unavailable when the probe throws', async () => {
    const broken: LanguageModelLike = {
      availability: async () => {
        throw new Error('no api')
      },
      create: async () => fakeSession()
    }
    expect(await promptApiAvailability(broken)).toBe('unavailable')
  })

  it('downloadPromptApiModel drives create({ monitor }) and reports progress', async () => {
    const progress: number[] = []
    const lm: LanguageModelLike = {
      availability: async () => 'downloadable',
      create: async (options) => {
        // Simulate Chrome firing downloadprogress events during the fetch.
        options?.monitor?.({
          addEventListener: (_type, listener) => {
            listener({ loaded: 0.5 })
            listener({ loaded: 1 })
          }
        })
        return fakeSession()
      }
    }
    expect(await downloadPromptApiModel((f) => progress.push(f), lm)).toBe(true)
    expect(progress).toEqual([0.5, 1])
  })

  it('downloadPromptApiModel returns false when the API is absent', async () => {
    const absent = { availability: async () => 'unavailable' } as unknown as LanguageModelLike
    // No global LanguageModel, explicit factory omitted → resolves to null internally.
    expect(await downloadPromptApiModel(undefined, undefined)).toBe(false)
    void absent
  })
})
