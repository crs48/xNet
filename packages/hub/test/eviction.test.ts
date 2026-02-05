/**
 * Tests for the EvictionService (demo mode).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EvictionService, type EvictionStorage } from '../src/services/eviction'
import { DEMO_DEFAULTS, type DemoOverrides } from '../src/types'

// ─── Mock Storage ───────────────────────────────────────────

function createMockStorage(): EvictionStorage & {
  activities: Map<string, number>
  userData: Set<string>
} {
  const activities = new Map<string, number>()
  const userData = new Set<string>()

  return {
    activities,
    userData,
    async upsertActivity(did: string, timestamp: number) {
      activities.set(did, timestamp)
      userData.add(did)
    },
    async getInactiveDids(cutoff: number) {
      const result: string[] = []
      for (const [did, ts] of activities) {
        if (ts < cutoff) result.push(did)
      }
      return result
    },
    async deleteUserData(did: string) {
      userData.delete(did)
    },
    async deleteActivity(did: string) {
      activities.delete(did)
    }
  }
}

// ─── Tests ──────────────────────────────────────────────────

describe('EvictionService', () => {
  let storage: ReturnType<typeof createMockStorage>
  let config: DemoOverrides

  beforeEach(() => {
    storage = createMockStorage()
    config = { ...DEMO_DEFAULTS, evictionTtl: 100, evictionInterval: 50 }
  })

  describe('touch', () => {
    it('should record activity for a DID', async () => {
      const service = new EvictionService(storage, config)
      await service.touch('did:key:z123')

      expect(storage.activities.has('did:key:z123')).toBe(true)
    })

    it('should update timestamp on repeated touch', async () => {
      const service = new EvictionService(storage, config)
      await service.touch('did:key:z123')
      const first = storage.activities.get('did:key:z123')!

      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 5))
      await service.touch('did:key:z123')
      const second = storage.activities.get('did:key:z123')!

      expect(second).toBeGreaterThanOrEqual(first)
    })
  })

  describe('evict', () => {
    it('should evict inactive users past TTL', async () => {
      const service = new EvictionService(storage, config)

      // Stale user (200ms ago, TTL is 100ms)
      await storage.upsertActivity('did:key:stale', Date.now() - 200)
      // Active user (just now)
      await storage.upsertActivity('did:key:active', Date.now())

      const count = await service.evict()

      expect(count).toBe(1)
      expect(storage.userData.has('did:key:stale')).toBe(false)
      expect(storage.activities.has('did:key:stale')).toBe(false)
      expect(storage.userData.has('did:key:active')).toBe(true)
    })

    it('should return 0 when no users are stale', async () => {
      const service = new EvictionService(storage, config)

      await storage.upsertActivity('did:key:active', Date.now())
      const count = await service.evict()

      expect(count).toBe(0)
      expect(storage.userData.has('did:key:active')).toBe(true)
    })

    it('should evict all stale users', async () => {
      const service = new EvictionService(storage, config)
      const now = Date.now()

      await storage.upsertActivity('did:key:a', now - 300)
      await storage.upsertActivity('did:key:b', now - 200)
      await storage.upsertActivity('did:key:c', now - 150)
      await storage.upsertActivity('did:key:d', now)

      const count = await service.evict()

      expect(count).toBe(3)
      expect(storage.userData.size).toBe(1)
      expect(storage.userData.has('did:key:d')).toBe(true)
    })

    it('should handle empty storage', async () => {
      const service = new EvictionService(storage, config)
      const count = await service.evict()
      expect(count).toBe(0)
    })
  })

  describe('start / stop', () => {
    it('should start periodic eviction', async () => {
      vi.useFakeTimers()
      const service = new EvictionService(storage, config)

      await storage.upsertActivity('did:key:old', Date.now() - 200)
      service.start()

      // First evict runs immediately
      await vi.advanceTimersByTimeAsync(1)
      expect(storage.userData.has('did:key:old')).toBe(false)

      service.stop()
      vi.useRealTimers()
    })

    it('should stop cleanly', () => {
      const service = new EvictionService(storage, config)
      service.start()
      service.stop()
      // Should not throw if stopped twice
      service.stop()
    })
  })

  describe('DEMO_DEFAULTS', () => {
    it('should have sensible defaults', () => {
      expect(DEMO_DEFAULTS.quota).toBe(10 * 1024 * 1024)
      expect(DEMO_DEFAULTS.maxDocs).toBe(50)
      expect(DEMO_DEFAULTS.maxBlob).toBe(2 * 1024 * 1024)
      expect(DEMO_DEFAULTS.evictionTtl).toBe(24 * 60 * 60 * 1000)
      expect(DEMO_DEFAULTS.evictionInterval).toBe(60 * 60 * 1000)
    })
  })
})
