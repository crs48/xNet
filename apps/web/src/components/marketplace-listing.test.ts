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
  it('splits by actual install state', () => {
    const entries = [
      make('fyi.xnet.mermaid', { tier: 'bundled' }),
      make('dev.alice.kanban'),
      make('dev.bob.calendar')
    ]
    const { builtIn, installed, available } = partitionListings(entries, [
      'fyi.xnet.mermaid',
      'dev.alice.kanban'
    ])
    expect(builtIn.map((e) => e.id)).toEqual(['fyi.xnet.mermaid'])
    expect(installed.map((e) => e.id)).toEqual(['dev.alice.kanban'])
    expect(available.map((e) => e.id)).toEqual(['dev.bob.calendar'])
  })

  it('shows a bundled entry as available until it is actually installed (0290)', () => {
    const entries = [make('fyi.xnet.github', { tier: 'bundled' })]
    const { builtIn, installed, available } = partitionListings(entries, [])
    expect(builtIn).toHaveLength(0)
    expect(installed).toHaveLength(0)
    expect(available.map((e) => e.id)).toEqual(['fyi.xnet.github'])
  })

  it('labels an installed bundled entry as built-in', () => {
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
  it('is true for first-party entries with a catalog manifest', () => {
    expect(
      isInstallable(make('fyi.xnet.github', { tier: 'bundled', manifestUrl: undefined }))
    ).toBe(true)
  })
  it('is false for bundled entries without a catalog manifest', () => {
    expect(isInstallable(make('fyi.xnet.mermaid', { tier: 'bundled' }))).toBe(false)
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
