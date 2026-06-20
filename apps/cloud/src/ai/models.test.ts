import { describe, expect, it, vi } from 'vitest'
import { createModelCatalog, fetchModelCatalog, toModelCard } from './models'

const RAW = {
  data: [
    {
      id: 'anthropic/claude-sonnet-4-6',
      name: 'Anthropic: Claude Sonnet 4.6',
      context_length: 200000,
      pricing: { prompt: '0.000003', completion: '0.000015' },
      architecture: { modality: 'text+image->text' }
    },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', pricing: { prompt: '0.00000015' } },
    { name: 'no id — dropped' }
  ]
}

const jsonFetch = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('toModelCard', () => {
  it('normalizes prices to USD per 1M tokens and derives the family', () => {
    const card = toModelCard(RAW.data[0])
    expect(card).toEqual({
      id: 'anthropic/claude-sonnet-4-6',
      name: 'Anthropic: Claude Sonnet 4.6',
      family: 'anthropic',
      inUsdPerM: 3,
      outUsdPerM: 15,
      contextLength: 200000,
      modality: 'text+image->text'
    })
  })

  it('returns null fields for absent data and null for an id-less entry', () => {
    expect(toModelCard(RAW.data[1])).toMatchObject({ outUsdPerM: null, contextLength: null })
    expect(toModelCard(RAW.data[2])).toBeNull()
  })
})

describe('fetchModelCatalog', () => {
  it('fetches, normalizes, and drops id-less entries', async () => {
    const cards = await fetchModelCatalog({
      baseUrl: 'https://or/api/v1',
      fetchImpl: jsonFetch(RAW)
    })
    expect(cards.map((c) => c.id)).toEqual(['anthropic/claude-sonnet-4-6', 'openai/gpt-4o-mini'])
  })

  it('throws on a non-2xx upstream', async () => {
    await expect(fetchModelCatalog({ fetchImpl: jsonFetch({}, 500) })).rejects.toThrow(/500/)
  })
})

describe('createModelCatalog (TTL cache)', () => {
  it('serves cached cards within the TTL without re-fetching', async () => {
    const fetchImpl = jsonFetch(RAW)
    let t = 1000
    const catalog = createModelCatalog({ fetchImpl, ttlMs: 5000, now: () => t })
    await catalog.get()
    t = 4000 // still inside the TTL
    await catalog.get()
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1)
  })

  it('serves stale while revalidating once the TTL lapses', async () => {
    const fetchImpl = jsonFetch(RAW)
    let t = 0
    const catalog = createModelCatalog({ fetchImpl, ttlMs: 100, now: () => t })
    await catalog.get()
    t = 1000 // past the TTL
    const stale = await catalog.get() // returns immediately (stale), kicks a refresh
    expect(stale).toHaveLength(2)
    await Promise.resolve()
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1)
  })

  it('keeps the last good value when a refresh fails', async () => {
    let ok = true
    const fetchImpl = vi.fn(async () =>
      ok ? new Response(JSON.stringify(RAW)) : new Response('boom', { status: 500 })
    ) as unknown as typeof fetch
    let t = 0
    const catalog = createModelCatalog({ fetchImpl, ttlMs: 100, now: () => t })
    await catalog.get()
    ok = false
    t = 1000
    await catalog.get() // serves stale, background refresh fails silently
    await Promise.resolve()
    const after = await catalog.get()
    expect(after).toHaveLength(2) // still the last good value
  })
})
