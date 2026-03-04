/**
 * @xnetjs/data - Query router tests.
 */

import type { FilterGroup } from './view-types'
import { describe, it, expect } from 'vitest'
import { QueryRouter, DEFAULT_ROUTER_CONFIG } from './query-router'

describe('QueryRouter', () => {
  describe('route', () => {
    it('routes small datasets to local', () => {
      const router = new QueryRouter()
      const result = router.route({
        rowCount: 1000,
        hasHubConnection: true
      })

      expect(result.source).toBe('local')
      expect(result.reason).toBe('small_dataset')
    })

    it('routes large datasets to hub', () => {
      const router = new QueryRouter()
      const result = router.route({
        rowCount: 500_000,
        hasHubConnection: true
      })

      expect(result.source).toBe('hub')
      expect(result.reason).toBe('large_dataset')
    })

    it('routes medium datasets to hybrid', () => {
      const router = new QueryRouter()
      const result = router.route({
        rowCount: 50_000,
        hasHubConnection: true
      })

      expect(result.source).toBe('hybrid')
      expect(result.reason).toBe('medium_dataset')
    })

    it('routes search queries to hub', () => {
      const router = new QueryRouter()
      const result = router.route({
        rowCount: 1000,
        search: 'test query',
        hasHubConnection: true
      })

      expect(result.source).toBe('hub')
      expect(result.reason).toBe('search_requires_fts5')
    })

    it('falls back to local for search without hub connection', () => {
      const router = new QueryRouter()
      const result = router.route({
        rowCount: 1000,
        search: 'test query',
        hasHubConnection: false
      })

      expect(result.source).toBe('local')
      expect(result.reason).toBe('search_no_hub_fallback')
    })

    it('routes complex filters to hub', () => {
      const router = new QueryRouter()
      const complexFilter: FilterGroup = {
        operator: 'and',
        conditions: [
          { columnId: 'a', operator: 'equals', value: 1 },
          { columnId: 'b', operator: 'equals', value: 2 },
          { columnId: 'c', operator: 'equals', value: 3 },
          { columnId: 'd', operator: 'equals', value: 4 },
          { columnId: 'e', operator: 'equals', value: 5 },
          { columnId: 'f', operator: 'equals', value: 6 }
        ]
      }

      const result = router.route({
        rowCount: 1000,
        filters: complexFilter,
        hasHubConnection: true
      })

      expect(result.source).toBe('hub')
      expect(result.reason).toBe('complex_filter')
    })

    it('routes nested filter groups to hub', () => {
      const router = new QueryRouter()
      const nestedFilter: FilterGroup = {
        operator: 'and',
        conditions: [
          { columnId: 'a', operator: 'equals', value: 1 },
          {
            operator: 'or',
            conditions: [
              { columnId: 'b', operator: 'equals', value: 2 },
              { columnId: 'c', operator: 'equals', value: 3 }
            ]
          }
        ]
      }

      const result = router.route({
        rowCount: 1000,
        filters: nestedFilter,
        hasHubConnection: true
      })

      expect(result.source).toBe('hub')
      expect(result.reason).toBe('complex_filter')
    })

    it('falls back to local without hub connection', () => {
      const router = new QueryRouter()
      const result = router.route({
        rowCount: 500_000,
        hasHubConnection: false
      })

      expect(result.source).toBe('local')
      expect(result.reason).toBe('no_hub_connection')
    })

    it('keeps simple filters local for small datasets', () => {
      const router = new QueryRouter()
      const simpleFilter: FilterGroup = {
        operator: 'and',
        conditions: [{ columnId: 'status', operator: 'equals', value: 'active' }]
      }

      const result = router.route({
        rowCount: 1000,
        filters: simpleFilter,
        hasHubConnection: true
      })

      expect(result.source).toBe('local')
      expect(result.reason).toBe('small_dataset')
    })
  })

  describe('isComplexFilter', () => {
    it('returns false for simple filters', () => {
      const router = new QueryRouter()
      const filter: FilterGroup = {
        operator: 'and',
        conditions: [{ columnId: 'a', operator: 'equals', value: 1 }]
      }

      expect(router.isComplexFilter(filter)).toBe(false)
    })

    it('returns true for many conditions', () => {
      const router = new QueryRouter()
      const filter: FilterGroup = {
        operator: 'and',
        conditions: Array.from({ length: 10 }, (_, i) => ({
          columnId: `col${i}`,
          operator: 'equals' as const,
          value: i
        }))
      }

      expect(router.isComplexFilter(filter)).toBe(true)
    })

    it('returns true for nested groups', () => {
      const router = new QueryRouter()
      const filter: FilterGroup = {
        operator: 'and',
        conditions: [
          {
            operator: 'or',
            conditions: [{ columnId: 'a', operator: 'equals', value: 1 }]
          }
        ]
      }

      expect(router.isComplexFilter(filter)).toBe(true)
    })
  })

  describe('configuration', () => {
    it('uses default config', () => {
      const router = new QueryRouter()
      const config = router.getConfig()

      expect(config.localThreshold).toBe(DEFAULT_ROUTER_CONFIG.localThreshold)
      expect(config.hybridThreshold).toBe(DEFAULT_ROUTER_CONFIG.hybridThreshold)
    })

    it('accepts custom config', () => {
      const router = new QueryRouter({
        localThreshold: 5000,
        hybridThreshold: 50_000
      })

      const result = router.route({
        rowCount: 7000,
        hasHubConnection: true
      })

      expect(result.source).toBe('hybrid')
    })

    it('can update config', () => {
      const router = new QueryRouter()
      router.setConfig({ localThreshold: 5000 })

      const result = router.route({
        rowCount: 7000,
        hasHubConnection: true
      })

      expect(result.source).toBe('hybrid')
    })

    it('can disable search to hub', () => {
      const router = new QueryRouter({ searchToHub: false })

      const result = router.route({
        rowCount: 1000,
        search: 'test',
        hasHubConnection: true
      })

      expect(result.source).toBe('local')
    })

    it('can disable complex filter to hub', () => {
      const router = new QueryRouter({ complexFilterToHub: false })
      const complexFilter: FilterGroup = {
        operator: 'and',
        conditions: Array.from({ length: 10 }, (_, i) => ({
          columnId: `col${i}`,
          operator: 'equals' as const,
          value: i
        }))
      }

      const result = router.route({
        rowCount: 1000,
        filters: complexFilter,
        hasHubConnection: true
      })

      expect(result.source).toBe('local')
    })
  })

  describe('edge cases', () => {
    it('handles zero rows', () => {
      const router = new QueryRouter()
      const result = router.route({
        rowCount: 0,
        hasHubConnection: true
      })

      expect(result.source).toBe('local')
    })

    it('handles exactly threshold rows', () => {
      const router = new QueryRouter()

      // Exactly at local threshold
      let result = router.route({
        rowCount: 10_000,
        hasHubConnection: true
      })
      expect(result.source).toBe('hybrid')

      // Exactly at hybrid threshold
      result = router.route({
        rowCount: 100_000,
        hasHubConnection: true
      })
      expect(result.source).toBe('hub')
    })

    it('handles empty filter', () => {
      const router = new QueryRouter()
      const emptyFilter: FilterGroup = {
        operator: 'and',
        conditions: []
      }

      const result = router.route({
        rowCount: 1000,
        filters: emptyFilter,
        hasHubConnection: true
      })

      expect(result.source).toBe('local')
    })
  })
})
