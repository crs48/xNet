import type { ConnectorDetection } from '@xnetjs/plugins'
import { describe, expect, it, vi } from 'vitest'
import {
  applyRuntimeEvent,
  baseUrlFromDetail,
  canSendMessage,
  errorMessage,
  providerConfigForConnector,
  reduceRuntimeEvent
} from './ai-chat-connector'

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

describe('reduceRuntimeEvent', () => {
  it('maps a model delta to a delta effect', () => {
    expect(reduceRuntimeEvent({ type: 'model.delta', payload: { text: 'hi' } })).toEqual({
      delta: 'hi'
    })
  })
  it('ignores an empty delta', () => {
    expect(reduceRuntimeEvent({ type: 'model.delta', payload: { text: '' } })).toBeNull()
  })
  it('marks completion as settled', () => {
    expect(reduceRuntimeEvent({ type: 'run.completed' })).toEqual({ settled: true })
    expect(reduceRuntimeEvent({ type: 'model.completed' })).toEqual({ settled: true })
  })
  it('maps a failure to settled + error', () => {
    expect(reduceRuntimeEvent({ type: 'run.failed', payload: { error: 'boom' } })).toEqual({
      settled: true,
      error: 'boom'
    })
  })
  it('ignores unrelated events', () => {
    expect(reduceRuntimeEvent({ type: 'thread.created' })).toBeNull()
  })
})

describe('applyRuntimeEvent', () => {
  const handlers = () => ({ onDelta: vi.fn(), onSettled: vi.fn(), onError: vi.fn() })

  it('routes a delta to onDelta', () => {
    const h = handlers()
    applyRuntimeEvent({ type: 'model.delta', threadId: 't1', payload: { text: 'x' } }, 't1', h)
    expect(h.onDelta).toHaveBeenCalledWith('x')
  })
  it('routes a failure to onSettled + onError', () => {
    const h = handlers()
    applyRuntimeEvent({ type: 'run.failed', payload: { error: 'e' } }, 't1', h)
    expect(h.onSettled).toHaveBeenCalled()
    expect(h.onError).toHaveBeenCalledWith('e')
  })
  it('ignores events for a different thread', () => {
    const h = handlers()
    applyRuntimeEvent({ type: 'model.delta', threadId: 'other', payload: { text: 'x' } }, 't1', h)
    expect(h.onDelta).not.toHaveBeenCalled()
  })
})

describe('canSendMessage / errorMessage', () => {
  it('requires content, idle, and a runtime', () => {
    expect(canSendMessage('hi', false, true)).toBe(true)
    expect(canSendMessage('', false, true)).toBe(false)
    expect(canSendMessage('hi', true, true)).toBe(false)
    expect(canSendMessage('hi', false, false)).toBe(false)
  })
  it('extracts an error message', () => {
    expect(errorMessage(new Error('nope'))).toBe('nope')
    expect(errorMessage('raw')).toBe('raw')
  })
})
