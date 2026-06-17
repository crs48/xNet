/**
 * Tests for marketplace recommendations (0194 Phase 4).
 */

import { describe, it, expect } from 'vitest'
import { recommendExtensions, type MarketplaceEntry } from '../ecosystem/marketplace'

const INDEX: MarketplaceEntry[] = [
  {
    id: 'com.acme.invoice',
    name: 'Invoices',
    description: 'Generate invoices from deals',
    version: '1.0.0',
    author: 'Acme',
    category: 'finance',
    keywords: ['invoice', 'billing'],
    manifestUrl: 'u',
    installs: 800
  },
  {
    id: 'com.acme.forecast',
    name: 'Forecast',
    description: 'Pipeline forecasting',
    version: '1.0.0',
    author: 'Acme',
    category: 'finance',
    keywords: ['forecast'],
    manifestUrl: 'u',
    installs: 5000
  },
  {
    id: 'com.other.kanban',
    name: 'Kanban',
    description: 'Task board',
    version: '1.0.0',
    author: 'Other',
    category: 'productivity',
    keywords: ['tasks'],
    manifestUrl: 'u',
    installs: 12000
  }
]

describe('recommendExtensions', () => {
  it('ranks by signal match, not raw popularity', () => {
    // User engages with finance + invoices; kanban is most popular but irrelevant.
    const recs = recommendExtensions(INDEX, [{ category: 'finance' }, { keyword: 'invoice' }])
    expect(recs[0].id).toBe('com.acme.invoice') // category + keyword hit
    expect(recs.map((r) => r.id)).not.toContain('com.other.kanban')
  })

  it('breaks score ties by install count', () => {
    // Both finance entries match the category equally → forecast (more installs) first.
    const recs = recommendExtensions(INDEX, [{ category: 'finance' }])
    expect(recs.map((r) => r.id)).toEqual(['com.acme.forecast', 'com.acme.invoice'])
  })

  it('excludes already-installed extensions', () => {
    const recs = recommendExtensions(INDEX, [{ category: 'finance' }], {
      installedIds: ['com.acme.forecast']
    })
    expect(recs.map((r) => r.id)).toEqual(['com.acme.invoice'])
  })

  it('returns nothing when no signal matches', () => {
    expect(recommendExtensions(INDEX, [{ category: 'gaming' }])).toEqual([])
  })

  it('honours the limit', () => {
    const recs = recommendExtensions(INDEX, [{ keyword: 'invoice' }, { category: 'finance' }], {
      limit: 1
    })
    expect(recs).toHaveLength(1)
  })

  it('weights stronger signals higher', () => {
    const recs = recommendExtensions(INDEX, [
      { keyword: 'forecast', weight: 5 },
      { keyword: 'invoice', weight: 1 }
    ])
    expect(recs[0].id).toBe('com.acme.forecast')
  })
})
