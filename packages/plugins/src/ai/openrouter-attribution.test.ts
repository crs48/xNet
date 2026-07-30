import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  OpenAICompatibleProvider,
  OPENROUTER_ATTRIBUTION_HEADERS,
  isOpenRouterBaseUrl
} from './providers'

describe('isOpenRouterBaseUrl', () => {
  it('matches OpenRouter hosts and rejects others', () => {
    expect(isOpenRouterBaseUrl('https://openrouter.ai/api')).toBe(true)
    expect(isOpenRouterBaseUrl('https://openrouter.ai/api/v1')).toBe(true)
    expect(isOpenRouterBaseUrl('https://api.openai.com')).toBe(false)
    expect(isOpenRouterBaseUrl('http://localhost:11434')).toBe(false)
  })
})

describe('OpenRouter app attribution headers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const chatBody = { choices: [{ message: { content: 'hi' } }], usage: {} }

  it('sends HTTP-Referer + X-Title only to OpenRouter', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify(chatBody), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)

    const openrouter = new OpenAICompatibleProvider({
      baseUrl: 'https://openrouter.ai/api',
      apiKey: 'sk-or-x',
      model: 'anthropic/claude-sonnet-5'
    })
    await openrouter.generate('hello')
    const orHeaders = fetchMock.mock.calls[0][1].headers as Record<string, string>
    expect(orHeaders['HTTP-Referer']).toBe(OPENROUTER_ATTRIBUTION_HEADERS['HTTP-Referer'])
    expect(orHeaders['X-Title']).toBe('xNet')

    fetchMock.mockClear()
    const openai = new OpenAICompatibleProvider({
      baseUrl: 'https://api.openai.com',
      apiKey: 'sk-x',
      model: 'gpt-5'
    })
    await openai.generate('hello')
    const oaHeaders = fetchMock.mock.calls[0][1].headers as Record<string, string>
    expect(oaHeaders['HTTP-Referer']).toBeUndefined()
    expect(oaHeaders['X-Title']).toBeUndefined()
  })

  it('lets user-supplied headers override attribution', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify(chatBody), { status: 200 })
    )
    vi.stubGlobal('fetch', fetchMock)
    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://openrouter.ai/api',
      apiKey: 'sk-or-x',
      model: 'anthropic/claude-sonnet-5',
      defaultHeaders: { 'X-Title': 'My Fork' }
    })
    await provider.generate('hello')
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>
    expect(headers['X-Title']).toBe('My Fork')
  })
})
