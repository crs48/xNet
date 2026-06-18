import { describe, expect, it, vi } from 'vitest'
import { GatewayError } from './gateway'
import { OpenRouterGatewayClient } from './openrouter-gateway'

const orResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })

describe('OpenRouterGatewayClient', () => {
  it('requests usage accounting and surfaces usage.cost as providerCostUsd', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://openrouter.ai/api/v1/chat/completions')
      const headers = init?.headers as Record<string, string>
      expect(headers.authorization).toBe('Bearer sk-or-tenant-1')
      expect(headers['http-referer']).toBe('https://xnet.fyi')
      expect(headers['x-title']).toBe('xNet Cloud')
      const body = JSON.parse(String(init?.body))
      expect(body.model).toBe('anthropic/claude-sonnet-4-6')
      expect(body.usage).toEqual({ include: true }) // ask OpenRouter for cost
      return orResponse({
        choices: [{ message: { content: 'hi there' } }],
        model: 'anthropic/claude-sonnet-4-6',
        usage: { prompt_tokens: 30, completion_tokens: 12, total_tokens: 42, cost: 0.000123 }
      })
    }) as unknown as typeof fetch

    const client = new OpenRouterGatewayClient({
      baseUrl: 'https://openrouter.ai/api/v1/',
      fetchImpl,
      referer: 'https://xnet.fyi',
      title: 'xNet Cloud'
    })
    const res = await client.chat({
      virtualKey: 'sk-or-tenant-1',
      model: 'anthropic/claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }]
    })
    expect(res.text).toBe('hi there')
    expect(res.usage).toEqual({ inputTokens: 30, outputTokens: 12, totalTokens: 42 })
    expect(res.providerCostUsd).toBeCloseTo(0.000123, 8)
  })

  it('omits providerCostUsd when the upstream does not report a cost', async () => {
    const fetchImpl = vi.fn(async () =>
      orResponse({
        choices: [{ message: { content: 'ok' } }],
        model: 'openai/gpt-4o',
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 }
      })
    ) as unknown as typeof fetch
    const client = new OpenRouterGatewayClient({ baseUrl: 'https://openrouter.ai/api/v1', fetchImpl })
    const res = await client.chat({ virtualKey: 'k', model: 'openai/gpt-4o', messages: [] })
    expect(res.providerCostUsd).toBeUndefined()
  })

  it('throws a GatewayError with the status when a key is over its spend limit', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('insufficient credits', { status: 402 })
    ) as unknown as typeof fetch
    const client = new OpenRouterGatewayClient({ baseUrl: 'https://openrouter.ai/api/v1', fetchImpl })
    await expect(
      client.chat({ virtualKey: 'k', model: 'openai/gpt-4o', messages: [] })
    ).rejects.toMatchObject({ name: 'GatewayError', status: 402 })
    await expect(
      client.chat({ virtualKey: 'k', model: 'openai/gpt-4o', messages: [] })
    ).rejects.toBeInstanceOf(GatewayError)
  })
})
