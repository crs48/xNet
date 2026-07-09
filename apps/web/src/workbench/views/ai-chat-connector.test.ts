import type { ConnectorDetection } from '@xnetjs/plugins'
import { describe, expect, it, vi } from 'vitest'
import {
  applyRuntimeEvent,
  baseUrlFromDetail,
  canSendMessage,
  errorMessage,
  fetchManagedModels,
  formatModelOption,
  groupModelsByFamily,
  isUsableTier,
  KNOWN_BRIDGE_AGENTS,
  parseBridgeHealth,
  parseModelsResponse,
  pickUsableConnector,
  providerConfigForConnector,
  reduceRuntimeEvent,
  type ManagedModel
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

  it('maps the bridge to an OpenAI-compatible endpoint with the pairing token', () => {
    const config = providerConfigForConnector(
      det({ tier: 'bridge', detail: 'http://127.0.0.1:31416' }),
      { bridgeToken: 'pair-123' }
    )
    expect(config).toEqual({
      type: 'openai-compatible',
      options: { baseUrl: 'http://127.0.0.1:31416', apiKey: 'pair-123' }
    })
  })

  it('returns null for the bridge until a pairing token is supplied', () => {
    const config = providerConfigForConnector(
      det({ tier: 'bridge', detail: 'http://127.0.0.1:31416' }),
      {}
    )
    expect(config).toBeNull()
  })

  it('maps managed to the keyless managed provider at the same origin', () => {
    const config = providerConfigForConnector(det({ tier: 'managed' }), {
      model: 'anthropic/claude-sonnet-4-6'
    })
    expect(config).toEqual({
      type: 'managed',
      options: { baseUrl: '', model: 'anthropic/claude-sonnet-4-6' }
    })
  })

  it('maps managed with an explicit hub base URL and no model', () => {
    const config = providerConfigForConnector(det({ tier: 'managed' }), {
      hubBaseUrl: 'https://h.xnet.app'
    })
    expect(config).toEqual({ type: 'managed', options: { baseUrl: 'https://h.xnet.app' } })
  })

  it('returns null for in-tab tiers (constructed with an injected engine)', () => {
    expect(providerConfigForConnector(det({ tier: 'webllm' }), {})).toBeNull()
    expect(providerConfigForConnector(det({ tier: 'prompt-api' }), {})).toBeNull()
  })
})

describe('managed model catalog helpers', () => {
  it('parses a /ai/models body and narrows malformed entries', () => {
    const result = parseModelsResponse({
      models: [
        {
          id: 'anthropic/claude-sonnet-4-6',
          name: 'Claude Sonnet 4.6',
          family: 'anthropic',
          inUsdPerM: 3,
          outUsdPerM: 15,
          contextLength: 200000,
          modality: 'text->text'
        },
        { id: 'openai/gpt-4o-mini', inUsdPerM: 'nope' }, // bad price → null, family derived
        { name: 'no id' } // dropped
      ],
      defaultModel: 'anthropic/claude-sonnet-4-6'
    })
    expect(result.models.map((m) => m.id)).toEqual([
      'anthropic/claude-sonnet-4-6',
      'openai/gpt-4o-mini'
    ])
    expect(result.models[1]).toMatchObject({
      family: 'openai',
      inUsdPerM: null,
      name: 'openai/gpt-4o-mini'
    })
    expect(result.defaultModel).toBe('anthropic/claude-sonnet-4-6')
  })

  it('returns an empty result for garbage', () => {
    expect(parseModelsResponse(null)).toEqual({ models: [], defaultModel: null })
    expect(parseModelsResponse({ models: 'x' })).toEqual({ models: [], defaultModel: null })
  })

  it('fetchManagedModels hits /ai/models with credentials and degrades to empty', async () => {
    const ok = vi.fn(
      async () =>
        new Response(JSON.stringify({ models: [{ id: 'a/b' }], defaultModel: null }), {
          status: 200
        })
    ) as unknown as typeof fetch
    const res = await fetchManagedModels('https://hub', ok)
    expect(res.models).toHaveLength(1)
    const [url, init] = (ok as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://hub/ai/models')
    expect((init as RequestInit).credentials).toBe('include')

    const bad = vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch
    expect(await fetchManagedModels('', bad)).toEqual({ models: [], defaultModel: null })
  })

  it('formats a picker label with price + context and groups by family', () => {
    const sonnet: ManagedModel = {
      id: 'anthropic/claude-sonnet-4-6',
      name: 'Claude Sonnet 4.6',
      family: 'anthropic',
      inUsdPerM: 3,
      outUsdPerM: 15,
      contextLength: 200000,
      modality: null
    }
    expect(formatModelOption(sonnet)).toBe('Claude Sonnet 4.6 · $3/$15 per Mtok · 200k ctx')
    const grouped = groupModelsByFamily([sonnet, { ...sonnet, id: 'openai/x', family: 'openai' }])
    expect(grouped.map(([family]) => family)).toEqual(['anthropic', 'openai'])
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
  it('maps a CORS/network failure to an actionable hint', () => {
    expect(errorMessage(new Error('Failed to fetch'))).toMatch(/CORS|OLLAMA_ORIGINS/i)
    expect(errorMessage(new Error('Load failed'))).toMatch(/OLLAMA_ORIGINS/i)
    expect(errorMessage(new TypeError('NetworkError when attempting to fetch'))).toMatch(/CORS/i)
  })
})

describe('isUsableTier / pickUsableConnector', () => {
  it('treats config tiers and the in-tab tiers (prompt-api, webllm) as usable', () => {
    expect(isUsableTier('cloud-key')).toBe(true)
    expect(isUsableTier('local-server')).toBe(true)
    expect(isUsableTier('bridge')).toBe(true)
    expect(isUsableTier('prompt-api')).toBe(true)
    // webllm is now wired (host-supplied engine + gesture-gated download), so it
    // is selectable; the panel only builds it after an explicit "run" click.
    expect(isUsableTier('webllm')).toBe(true)
  })

  it('falls back to webllm when it is the only available usable tier', () => {
    const detections = [
      det({ tier: 'cloud-key', available: false, preference: 2 }),
      det({ tier: 'local-server', available: false, preference: 3 }),
      det({ tier: 'webllm', available: true, preference: 4 }),
      det({ tier: 'prompt-api', available: false, preference: 5 })
    ]
    expect(pickUsableConnector(detections)?.tier).toBe('webllm')
  })

  it('picks the first available usable tier in preference order', () => {
    const detections = [
      det({ tier: 'cloud-key', available: true, preference: 2 }),
      det({ tier: 'webllm', available: true, preference: 4 })
    ]
    expect(pickUsableConnector(detections)?.tier).toBe('cloud-key')
  })

  it('ignores unavailable tiers', () => {
    expect(pickUsableConnector([det({ tier: 'cloud-key', available: false })])).toBeNull()
  })
})

describe('parseBridgeHealth', () => {
  it('extracts ok/agent/version from a bridge /health body', () => {
    expect(
      parseBridgeHealth({
        ok: true,
        service: 'xnet-agent-bridge',
        agent: 'claude',
        version: '1.2.0'
      })
    ).toEqual({ ok: true, agent: 'claude', version: '1.2.0' })
  })
  it('reports not-ok for malformed or empty bodies', () => {
    expect(parseBridgeHealth(null)).toEqual({ ok: false })
    expect(parseBridgeHealth('nope')).toEqual({ ok: false })
    expect(parseBridgeHealth({ ok: false })).toEqual({ ok: false })
  })
  it('omits non-string agent/version', () => {
    expect(parseBridgeHealth({ ok: true, agent: 5, version: null })).toEqual({ ok: true })
  })
})

describe('KNOWN_BRIDGE_AGENTS', () => {
  it('includes the primary agents', () => {
    const ids = KNOWN_BRIDGE_AGENTS.map((agent) => agent.id)
    expect(ids).toContain('claude')
    expect(ids).toContain('codex')
  })
})
