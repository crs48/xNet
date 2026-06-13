import type { ConnectorDetection } from '@xnetjs/plugins'
import { describe, expect, it } from 'vitest'
import { baseUrlFromDetail, providerConfigForConnector } from './ai-chat-connector'

const det = (over: Partial<ConnectorDetection>): ConnectorDetection => ({
  tier: 'cloud-key',
  label: 'x',
  available: true,
  toolCalling: 'reliable',
  preference: 1,
  ...over
})

describe('providerConfigForConnector', () => {
  it('maps cloud-key to the chosen cloud provider with the key', () => {
    const config = providerConfigForConnector(det({ tier: 'cloud-key' }), {
      apiKey: 'sk-test',
      cloudProvider: 'openai',
      model: 'gpt-4o'
    })
    expect(config).toEqual({ type: 'openai', options: { apiKey: 'sk-test', model: 'gpt-4o' } })
  })

  it('defaults cloud-key to anthropic', () => {
    const config = providerConfigForConnector(det({ tier: 'cloud-key' }), { apiKey: 'sk' })
    expect(config?.type).toBe('anthropic')
  })

  it('returns null for cloud-key without a key', () => {
    expect(providerConfigForConnector(det({ tier: 'cloud-key' }), {})).toBeNull()
  })

  it('maps a reachable Ollama local server', () => {
    const config = providerConfigForConnector(
      det({ tier: 'local-server', detail: 'Ollama (http://localhost:11434)' }),
      {}
    )
    expect(config?.type).toBe('ollama')
    expect(config?.options.baseUrl).toBe('http://localhost:11434')
  })

  it('maps a reachable LM Studio local server', () => {
    const config = providerConfigForConnector(
      det({ tier: 'local-server', detail: 'LM Studio (http://localhost:1234)' }),
      {}
    )
    expect(config?.type).toBe('lmstudio')
    expect(config?.options.baseUrl).toBe('http://localhost:1234')
  })

  it('maps the bridge to an OpenAI-compatible endpoint', () => {
    const config = providerConfigForConnector(
      det({ tier: 'bridge', detail: 'http://127.0.0.1:31416' }),
      {}
    )
    expect(config).toEqual({
      type: 'openai-compatible',
      options: { baseUrl: 'http://127.0.0.1:31416' }
    })
  })

  it('returns null for in-tab tiers (constructed with an injected engine)', () => {
    expect(providerConfigForConnector(det({ tier: 'webllm' }), {})).toBeNull()
    expect(providerConfigForConnector(det({ tier: 'prompt-api' }), {})).toBeNull()
  })
})

describe('baseUrlFromDetail', () => {
  it('extracts a parenthesised url', () => {
    expect(baseUrlFromDetail('Ollama (http://localhost:11434)')).toBe('http://localhost:11434')
  })
  it('accepts a bare url', () => {
    expect(baseUrlFromDetail('http://127.0.0.1:31416')).toBe('http://127.0.0.1:31416')
  })
  it('returns undefined for non-urls', () => {
    expect(baseUrlFromDetail(undefined)).toBeUndefined()
    expect(baseUrlFromDetail('nope')).toBeUndefined()
  })
})
