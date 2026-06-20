import { describe, expect, it, vi } from 'vitest'
import {
  AiBudgetError,
  AIGenerationError,
  createManagedProvider,
  type ManagedBudgetSnapshot
} from './providers'

/** A fetch stub returning a managed `/ai/chat` body with the given status. */
const stubFetch = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

const okBody = {
  text: 'hello from cloud',
  model: 'anthropic/claude-sonnet-4-6',
  usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 },
  spendThisPeriodUsd: 0.5,
  includedUsd: 2,
  budgetUsd: 25,
  budgetState: 'included' as const
}

describe('ManagedProvider', () => {
  it('posts model + messages to /ai/chat and returns the text', async () => {
    const fetchImpl = stubFetch(200, okBody)
    const provider = createManagedProvider({
      baseUrl: 'https://hub.example',
      model: 'anthropic/claude-sonnet-4-6',
      fetchImpl
    })
    const text = await provider.generate('hi there')
    expect(text).toBe('hello from cloud')
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://hub.example/ai/chat')
    const sent = JSON.parse((init as RequestInit).body as string)
    expect(sent.model).toBe('anthropic/claude-sonnet-4-6')
    expect(sent.messages).toEqual([{ role: 'user', content: 'hi there' }])
  })

  it('carries no API key (no authorization header)', async () => {
    const fetchImpl = stubFetch(200, okBody)
    const provider = createManagedProvider({ baseUrl: '', fetchImpl })
    await provider.generate('hi')
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('authorization')
  })

  it('defaults to the auto-router when no model is configured', async () => {
    const fetchImpl = stubFetch(200, okBody)
    const provider = createManagedProvider({ fetchImpl })
    await provider.generate('hi')
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(JSON.parse((init as RequestInit).body as string).model).toBe('openrouter/auto')
  })

  it('returns model + usage from generateWithTools', async () => {
    const provider = createManagedProvider({ fetchImpl: stubFetch(200, okBody) })
    const res = await provider.generateWithTools({ messages: [{ role: 'user', content: 'hi' }] })
    expect(res.model).toBe('anthropic/claude-sonnet-4-6')
    expect(res.usage).toEqual({ inputTokens: 12, outputTokens: 8, totalTokens: 20 })
  })

  it('reports the live budget via onBudget', async () => {
    const snapshots: ManagedBudgetSnapshot[] = []
    const provider = createManagedProvider({
      fetchImpl: stubFetch(200, okBody),
      onBudget: (s) => snapshots.push(s)
    })
    await provider.generate('hi')
    expect(snapshots).toEqual([
      { spendThisPeriodUsd: 0.5, includedUsd: 2, budgetUsd: 25, budgetState: 'included' }
    ])
  })

  it('throws a typed AiBudgetError on 402', async () => {
    const provider = createManagedProvider({
      fetchImpl: stubFetch(402, { error: 'ai_budget_exceeded', spentUsd: 25.1, budgetUsd: 25 })
    })
    await expect(provider.generate('hi')).rejects.toBeInstanceOf(AiBudgetError)
    await expect(provider.generate('hi')).rejects.toMatchObject({ spentUsd: 25.1, budgetUsd: 25 })
  })

  it('throws AIGenerationError on other failures', async () => {
    const provider = createManagedProvider({
      fetchImpl: stubFetch(502, { error: 'gateway_error' })
    })
    await expect(provider.generate('hi')).rejects.toBeInstanceOf(AIGenerationError)
  })
})
