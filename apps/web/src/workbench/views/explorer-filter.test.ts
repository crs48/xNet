/**
 * Explorer filter tests (0166).
 */
import { describe, expect, it } from 'vitest'
import { filterExplorerItems } from './explorer-filter'

const items = [
  { title: 'Roadmap', type: 'page' },
  { title: 'CRM', type: 'database' },
  { title: '', type: 'canvas' }
]

describe('filterExplorerItems', () => {
  it('passes everything through for the all filter with no search', () => {
    expect(filterExplorerItems(items, 'all', '')).toHaveLength(3)
  })

  it('filters by type', () => {
    expect(filterExplorerItems(items, 'database', '')).toEqual([{ title: 'CRM', type: 'database' }])
  })

  it('filters by case-insensitive title text', () => {
    expect(filterExplorerItems(items, 'all', 'road')).toEqual([{ title: 'Roadmap', type: 'page' }])
    expect(filterExplorerItems(items, 'all', 'ROAD')).toEqual([{ title: 'Roadmap', type: 'page' }])
  })

  it('matches untitled items against the "untitled" needle', () => {
    expect(filterExplorerItems(items, 'all', 'untitled')).toEqual([{ title: '', type: 'canvas' }])
  })

  it('combines type and text filters', () => {
    expect(filterExplorerItems(items, 'page', 'crm')).toEqual([])
  })
})
