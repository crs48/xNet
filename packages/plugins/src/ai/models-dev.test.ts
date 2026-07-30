import { describe, expect, it, vi } from 'vitest'
import {
  fetchModelsDevCatalog,
  parseModelsDevCatalog,
  modelsForProvider,
  MODELS_DEV_SNAPSHOT
} from './models-dev'

/** A minimal models.dev api.json fixture. */
const API_FIXTURE = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    models: {
      'claude-sonnet-5': {
        name: 'Claude Sonnet 5',
        cost: { input: 3, output: 15 },
        limit: { context: 200000, output: 64000 },
        tool_call: true,
        reasoning: true
      }
    }
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    models: {
      'llama3.2': { name: 'Llama 3.2', limit: { context: 128000 } }
    }
  }
}

const okResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as Response

describe('parseModelsDevCatalog', () => {
  it('flattens provider→model into qualified entries', () => {
    const models = parseModelsDevCatalog(API_FIXTURE)
    const sonnet = models.find((m) => m.id === 'anthropic/claude-sonnet-5')
    expect(sonnet).toMatchObject({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      name: 'Claude Sonnet 5',
      contextLength: 200000,
      inUsdPerM: 3,
      outUsdPerM: 15,
      toolCall: true,
      reasoning: true
    })
  })

  it('defaults missing fields defensively (no cost/flags → null/false)', () => {
    const models = parseModelsDevCatalog(API_FIXTURE)
    const llama = models.find((m) => m.id === 'ollama/llama3.2')
    expect(llama).toMatchObject({
      contextLength: 128000,
      inUsdPerM: null,
      outUsdPerM: null,
      toolCall: false,
      reasoning: false
    })
  })

  it('returns empty for junk input', () => {
    expect(parseModelsDevCatalog(null)).toEqual([])
    expect(parseModelsDevCatalog('nope')).toEqual([])
    expect(parseModelsDevCatalog({ anthropic: { models: 'bad' } })).toEqual([])
  })
})

describe('fetchModelsDevCatalog', () => {
  it('returns the live catalog when the fetch succeeds', async () => {
    const fetchImpl = vi.fn(async () => okResponse(API_FIXTURE)) as unknown as typeof fetch
    const result = await fetchModelsDevCatalog({ fetchImpl })
    expect(result.source).toBe('network')
    expect(result.models.map((m) => m.id)).toContain('anthropic/claude-sonnet-5')
  })

  it('falls back to the snapshot on a non-2xx response', async () => {
    const fetchImpl = vi.fn(
      async () => ({ ok: false, status: 503 }) as Response
    ) as unknown as typeof fetch
    const result = await fetchModelsDevCatalog({ fetchImpl })
    expect(result.source).toBe('snapshot')
    expect(result.models).toEqual([...MODELS_DEV_SNAPSHOT])
  })

  it('falls back to the snapshot when the fetch throws (outage)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    const result = await fetchModelsDevCatalog({ fetchImpl })
    expect(result.source).toBe('snapshot')
    expect(result.models.length).toBeGreaterThan(0)
  })

  it('falls back to the snapshot when the body parses to zero models', async () => {
    const fetchImpl = vi.fn(async () => okResponse({})) as unknown as typeof fetch
    const result = await fetchModelsDevCatalog({ fetchImpl })
    expect(result.source).toBe('snapshot')
  })
})

describe('modelsForProvider', () => {
  it('filters to one provider', () => {
    const models = parseModelsDevCatalog(API_FIXTURE)
    expect(modelsForProvider(models, 'ollama').map((m) => m.model)).toEqual(['llama3.2'])
  })
})
