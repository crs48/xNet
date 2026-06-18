import { describe, it, expect, vi } from 'vitest'
import {
  partitionListings,
  isInstallable,
  fetchManifest,
  type MarketplaceListing
} from './marketplace-listing'

const make = (id: string, over: Partial<MarketplaceListing> = {}): MarketplaceListing => ({
  id,
  name: id,
  description: '',
  version: '1.0.0',
  author: 'x',
  manifestUrl: `https://example.com/${id}/manifest.json`,
  tier: 'marketplace',
  ...over
})

describe('partitionListings', () => {
  it('splits built-in, installed, and available', () => {
    const entries = [
      make('fyi.xnet.mermaid', { tier: 'bundled' }),
      make('dev.alice.kanban'),
      make('dev.bob.calendar')
    ]
    const { builtIn, installed, available } = partitionListings(entries, ['dev.alice.kanban'])
    expect(builtIn.map((e) => e.id)).toEqual(['fyi.xnet.mermaid'])
    expect(installed.map((e) => e.id)).toEqual(['dev.alice.kanban'])
    expect(available.map((e) => e.id)).toEqual(['dev.bob.calendar'])
  })

  it('treats built-in plugins as built-in even when also installed', () => {
    const entries = [make('fyi.xnet.mermaid', { tier: 'bundled' })]
    const { builtIn, installed } = partitionListings(entries, ['fyi.xnet.mermaid'])
    expect(builtIn).toHaveLength(1)
    expect(installed).toHaveLength(0)
  })
})

describe('isInstallable', () => {
  it('is true for community plugins with a manifest url', () => {
    expect(isInstallable(make('a'))).toBe(true)
  })
  it('is false for built-in plugins', () => {
    expect(isInstallable(make('a', { tier: 'bundled' }))).toBe(false)
  })
  it('is false without a manifest url', () => {
    expect(isInstallable(make('a', { manifestUrl: undefined }))).toBe(false)
  })
})

describe('fetchManifest', () => {
  it('parses a successful response', async () => {
    const fake = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'a' }) })
    await expect(
      fetchManifest('https://x/m.json', fake as unknown as typeof fetch)
    ).resolves.toEqual({ id: 'a' })
    expect(fake).toHaveBeenCalledWith('https://x/m.json')
  })

  it('throws on a non-ok response', async () => {
    const fake = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    await expect(
      fetchManifest('https://x/m.json', fake as unknown as typeof fetch)
    ).rejects.toThrow('404')
  })
})
