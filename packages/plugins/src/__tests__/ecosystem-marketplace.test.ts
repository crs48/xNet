/**
 * Tests for the marketplace index/search and supply-chain provenance (0192).
 */

import { describe, it, expect } from 'vitest'
import {
  searchMarketplace,
  sortMarketplace,
  filterByCategory,
  aggregateRatings,
  MarketplaceClient,
  type MarketplaceEntry,
  type PluginRating
} from '../ecosystem/marketplace'
import {
  failClosedVerifier,
  verifyProvenance,
  summarizeProvenance,
  type ProvenanceVerifier
} from '../ecosystem/provenance'

const INDEX: MarketplaceEntry[] = [
  {
    id: 'com.acme.kanban',
    name: 'Kanban Board',
    description: 'A drag-and-drop task board',
    version: '1.0.0',
    author: 'Acme',
    keywords: ['tasks', 'board'],
    category: 'productivity',
    manifestUrl: 'https://example.com/kanban.json',
    installs: 5000,
    stars: 120
  },
  {
    id: 'com.acme.invoice',
    name: 'Invoices',
    description: 'Generate invoices from deals',
    version: '2.1.0',
    author: 'Acme',
    keywords: ['finance', 'billing'],
    category: 'finance',
    manifestUrl: 'https://example.com/invoice.json',
    installs: 800,
    stars: 40
  },
  {
    id: 'com.other.tasks',
    name: 'Task Helper',
    description: 'Quick task capture',
    version: '0.9.0',
    author: 'Other',
    keywords: ['tasks'],
    category: 'productivity',
    manifestUrl: 'https://example.com/tasks.json',
    installs: 12000,
    stars: 5
  }
]

describe('searchMarketplace', () => {
  it('matches across name, description, keywords, author, category', () => {
    expect(searchMarketplace(INDEX, 'task').map((e) => e.id)).toContain('com.acme.kanban')
    expect(searchMarketplace(INDEX, 'finance').map((e) => e.id)).toEqual(['com.acme.invoice'])
    expect(searchMarketplace(INDEX, 'acme').length).toBe(2)
    expect(searchMarketplace(INDEX, '')).toHaveLength(3)
  })

  it('requires all terms to match (AND semantics)', () => {
    expect(searchMarketplace(INDEX, 'acme finance').map((e) => e.id)).toEqual(['com.acme.invoice'])
    expect(searchMarketplace(INDEX, 'acme nonsense')).toHaveLength(0)
  })
})

describe('sortMarketplace', () => {
  it('ranks relevance by name hit over popularity', () => {
    const result = sortMarketplace(searchMarketplace(INDEX, 'task'), 'relevance', 'task')
    // "Task Helper" (name hit) should outrank "Kanban Board" (keyword hit) despite installs.
    expect(result[0].id).toBe('com.other.tasks')
  })

  it('sorts by installs and stars', () => {
    expect(sortMarketplace(INDEX, 'installs')[0].id).toBe('com.other.tasks')
    expect(sortMarketplace(INDEX, 'stars')[0].id).toBe('com.acme.kanban')
  })
})

describe('filterByCategory', () => {
  it('filters case-insensitively and passes all when empty', () => {
    expect(filterByCategory(INDEX, 'finance')).toHaveLength(1)
    expect(filterByCategory(INDEX, 'Productivity')).toHaveLength(2)
    expect(filterByCategory(INDEX, undefined)).toHaveLength(3)
  })
})

describe('MarketplaceClient', () => {
  it('fetches once, caches, and searches in memory', async () => {
    let fetches = 0
    const client = new MarketplaceClient({
      indexUrl: 'https://example.com/registry.json',
      fetchJson: async <T>() => {
        fetches += 1
        return INDEX as unknown as T
      }
    })
    const finance = await client.search('finance')
    expect(finance.map((e) => e.id)).toEqual(['com.acme.invoice'])
    await client.search('tasks', { sort: 'installs', category: 'productivity' })
    expect(fetches).toBe(1) // cached
  })
})

describe('aggregateRatings', () => {
  it('averages, counts, and histograms, ignoring out-of-range', () => {
    const ratings: PluginRating[] = [
      { pluginId: 'x', stars: 5, authorDID: 'a' },
      { pluginId: 'x', stars: 3, authorDID: 'b' },
      { pluginId: 'x', stars: 9, authorDID: 'c' } // ignored
    ]
    const s = aggregateRatings(ratings)
    expect(s.count).toBe(2)
    expect(s.average).toBe(4)
    expect(s.histogram[5]).toBe(1)
    expect(s.histogram[3]).toBe(1)
  })

  it('returns zero average for no ratings', () => {
    expect(aggregateRatings([])).toEqual({
      count: 0,
      average: 0,
      histogram: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    })
  })
})

describe('provenance verification (fail-closed)', () => {
  it('treats missing provenance as unverified', async () => {
    const r = await verifyProvenance({ artifactDigest: 'abc' })
    expect(r.verified).toBe(false)
    expect(r.reason).toMatch(/No provenance/)
  })

  it('treats present-but-unverifiable provenance as unverified by default', async () => {
    const r = await verifyProvenance({
      artifactDigest: 'abc',
      provenance: { sourceRepo: 'xnetjs/plugins' }
    })
    expect(r.verified).toBe(false)
  })

  it('never throws — a throwing verifier becomes an unverified result', async () => {
    const boom: ProvenanceVerifier = {
      verify: async () => {
        throw new Error('rekor offline')
      }
    }
    const r = await verifyProvenance({ artifactDigest: 'abc' }, boom)
    expect(r.verified).toBe(false)
    expect(r.reason).toBe('rekor offline')
  })

  it('summarizes verified and unverified results', async () => {
    expect(summarizeProvenance({ verified: true, sourceRepo: 'xnetjs/plugins' })).toBe(
      'Verified build from xnetjs/plugins'
    )
    expect(summarizeProvenance(await failClosedVerifier.verify({ artifactDigest: 'x' }))).toMatch(
      /^Unverified/
    )
  })
})
