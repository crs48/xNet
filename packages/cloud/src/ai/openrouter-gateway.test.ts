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
      // usage.cost is always returned now — the deprecated `usage:{include:true}` is gone.
      expect(body.usage).toBeUndefined()
      expect(body.models).toBeUndefined() // no fallback requested
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

  it('sends a models[] array (primary first) when fallbacks are given', async () => {
    let sentBody: Record<string, unknown> = {}
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body))
      return orResponse({
        choices: [{ message: { content: 'ok' } }],
        model: 'openai/gpt-4o', // a fallback actually served
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost: 0.0001 }
      })
    }) as unknown as typeof fetch
    const client = new OpenRouterGatewayClient({
      baseUrl: 'https://openrouter.ai/api/v1',
      fetchImpl
    })
    const res = await client.chat({
      virtualKey: 'k',
      model: 'anthropic/claude-sonnet-4-6',
      fallbackModels: ['openai/gpt-4o'],
      messages: [{ role: 'user', content: 'hi' }]
    })
    expect(sentBody.models).toEqual(['anthropic/claude-sonnet-4-6', 'openai/gpt-4o'])
    expect(res.model).toBe('openai/gpt-4o') // the served model is reported back
  })

  it('omits providerCostUsd when the upstream does not report a cost', async () => {
    const fetchImpl = vi.fn(async () =>
      orResponse({
        choices: [{ message: { content: 'ok' } }],
        model: 'openai/gpt-4o',
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 }
      })
    ) as unknown as typeof fetch
    const client = new OpenRouterGatewayClient({
      baseUrl: 'https://openrouter.ai/api/v1',
      fetchImpl
    })
    const res = await client.chat({ virtualKey: 'k', model: 'openai/gpt-4o', messages: [] })
    expect(res.providerCostUsd).toBeUndefined()
  })

  it('throws a GatewayError with the status when a key is over its spend limit', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('insufficient credits', { status: 402 })
    ) as unknown as typeof fetch
    const client = new OpenRouterGatewayClient({
      baseUrl: 'https://openrouter.ai/api/v1',
      fetchImpl
    })
    await expect(
      client.chat({ virtualKey: 'k', model: 'openai/gpt-4o', messages: [] })
    ).rejects.toMatchObject({ name: 'GatewayError', status: 402 })
    await expect(
      client.chat({ virtualKey: 'k', model: 'openai/gpt-4o', messages: [] })
    ).rejects.toBeInstanceOf(GatewayError)
  })
})
