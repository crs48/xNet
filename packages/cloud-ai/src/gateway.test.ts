import { describe, expect, it, vi } from 'vitest'
import { GatewayClient, GatewayError } from './gateway'

const openAiResponse = (text: string) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: text } }],
      model: 'gpt-4o',
      usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 }
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )

describe('GatewayClient', () => {
  it('posts an OpenAI-compatible request with the virtual key and parses usage', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('http://localhost:4000/chat/completions')
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer sk-tenant-1')
      const body = JSON.parse(String(init?.body))
      expect(body.model).toBe('gpt-4o')
      expect(body.mock_response).toBe('canned') // passthrough to LiteLLM
      return openAiResponse('hello')
    }) as unknown as typeof fetch

    const client = new GatewayClient({ baseUrl: 'http://localhost:4000/', fetchImpl })
    const res = await client.chat({
      virtualKey: 'sk-tenant-1',
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      mockResponse: 'canned'
    })
    expect(res.text).toBe('hello')
    expect(res.usage).toEqual({ inputTokens: 12, outputTokens: 8, totalTokens: 20 })
  })

  it('throws a GatewayError with the status on a budget rejection', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: 'budget exceeded' } }), { status: 429 })
    ) as unknown as typeof fetch
    const client = new GatewayClient({ baseUrl: 'http://localhost:4000', fetchImpl })
    await expect(
      client.chat({ virtualKey: 'k', model: 'gpt-4o', messages: [] })
    ).rejects.toMatchObject({ name: 'GatewayError', status: 429 })
    await expect(
      client.chat({ virtualKey: 'k', model: 'gpt-4o', messages: [] })
    ).rejects.toBeInstanceOf(GatewayError)
  })
})
