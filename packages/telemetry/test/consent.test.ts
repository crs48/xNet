import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  ConsentManager,
  MemoryConsentStorage,
  DEFAULT_CONSENT,
  tierLevel,
  tierMeetsRequirement
} from '../src/consent'
import type { TelemetryTier } from '../src/consent'

describe('tierLevel', () => {
  it('maps tiers to progressive levels', () => {
    expect(tierLevel('off')).toBe(0)
    expect(tierLevel('local')).toBe(1)
    expect(tierLevel('crashes')).toBe(2)
    expect(tierLevel('anonymous')).toBe(3)
    expect(tierLevel('identified')).toBe(4)
  })
})

describe('tierMeetsRequirement', () => {
  it('returns true when current >= required', () => {
    expect(tierMeetsRequirement('anonymous', 'local')).toBe(true)
    expect(tierMeetsRequirement('crashes', 'crashes')).toBe(true)
    expect(tierMeetsRequirement('identified', 'off')).toBe(true)
  })

  it('returns false when current < required', () => {
    expect(tierMeetsRequirement('off', 'local')).toBe(false)
    expect(tierMeetsRequirement('local', 'crashes')).toBe(false)
    expect(tierMeetsRequirement('crashes', 'anonymous')).toBe(false)
  })
})

describe('DEFAULT_CONSENT', () => {
  it('defaults to off with privacy-first settings', () => {
    expect(DEFAULT_CONSENT.tier).toBe('off')
    expect(DEFAULT_CONSENT.reviewBeforeSend).toBe(true)
    expect(DEFAULT_CONSENT.autoScrub).toBe(true)
    expect(DEFAULT_CONSENT.enabledSchemas).toEqual([])
  })
})

describe('ConsentManager', () => {
  let manager: ConsentManager
  let storage: MemoryConsentStorage

  beforeEach(() => {
    storage = new MemoryConsentStorage()
    manager = new ConsentManager({ storage, autoLoad: false })
  })

  describe('defaults', () => {
    it('starts with tier off', () => {
      expect(manager.tier).toBe('off')
      expect(manager.isEnabled).toBe(false)
      expect(manager.isSharingEnabled).toBe(false)
    })
  })

  describe('setTier', () => {
    it('updates tier and emits tier-changed', async () => {
      const listener = vi.fn()
      manager.on('tier-changed', listener)

      await manager.setTier('crashes')
      expect(manager.tier).toBe('crashes')
      expect(manager.isEnabled).toBe(true)
      expect(manager.isSharingEnabled).toBe(true)
      expect(listener).toHaveBeenCalledWith('off', 'crashes')
    })

    it('emits consent-changed', async () => {
      const listener = vi.fn()
      manager.on('consent-changed', listener)

      await manager.setTier('local')
      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener.mock.calls[0][0].tier).toBe('local')
    })
  })

  describe('setConsent', () => {
    it('updates multiple fields', async () => {
      await manager.setConsent({
        tier: 'anonymous',
        reviewBeforeSend: false,
        enabledSchemas: ['xnet://xnet.dev/telemetry/CrashReport']
      })
      expect(manager.current.tier).toBe('anonymous')
      expect(manager.current.reviewBeforeSend).toBe(false)
      expect(manager.current.enabledSchemas).toEqual(['xnet://xnet.dev/telemetry/CrashReport'])
    })
  })

  describe('allowsTier', () => {
    it('checks progressive tier levels', async () => {
      await manager.setTier('crashes')
      expect(manager.allowsTier('off')).toBe(true)
      expect(manager.allowsTier('local')).toBe(true)
      expect(manager.allowsTier('crashes')).toBe(true)
      expect(manager.allowsTier('anonymous')).toBe(false)
      expect(manager.allowsTier('identified')).toBe(false)
    })
  })

  describe('allowsSchema', () => {
    it('allows all when enabledSchemas is empty', async () => {
      await manager.setTier('local')
      expect(manager.allowsSchema('xnet://anything')).toBe(true)
    })

    it('filters by enabledSchemas when set', async () => {
      await manager.setConsent({
        tier: 'local',
        enabledSchemas: ['xnet://xnet.dev/telemetry/CrashReport']
      })
      expect(manager.allowsSchema('xnet://xnet.dev/telemetry/CrashReport')).toBe(true)
      expect(manager.allowsSchema('xnet://xnet.dev/telemetry/UsageMetric')).toBe(false)
    })

    it('returns false when tier is off', () => {
      expect(manager.allowsSchema('xnet://anything')).toBe(false)
    })
  })

  describe('persistence', () => {
    it('persists to storage on update', async () => {
      await manager.setTier('anonymous')
      const stored = await storage.get('xnet:telemetry:consent')
      expect(stored?.tier).toBe('anonymous')
    })

    it('loads from storage', async () => {
      await storage.set('xnet:telemetry:consent', {
        ...DEFAULT_CONSENT,
        tier: 'crashes',
        grantedAt: new Date()
      })
      await manager.load()
      expect(manager.tier).toBe('crashes')
      expect(manager.isLoaded).toBe(true)
    })

    it('resets expired consent to off', async () => {
      await storage.set('xnet:telemetry:consent', {
        ...DEFAULT_CONSENT,
        tier: 'anonymous',
        grantedAt: new Date(),
        expiresAt: new Date(Date.now() - 1000) // expired
      })
      await manager.load()
      expect(manager.tier).toBe('off')
    })
  })

  describe('reset', () => {
    it('reverts to DEFAULT_CONSENT', async () => {
      await manager.setTier('identified')
      await manager.reset()
      expect(manager.tier).toBe('off')
      expect(manager.isEnabled).toBe(false)
    })

    it('emits tier-changed on reset', async () => {
      await manager.setTier('crashes')
      const listener = vi.fn()
      manager.on('tier-changed', listener)
      await manager.reset()
      expect(listener).toHaveBeenCalledWith('crashes', 'off')
    })
  })

  describe('off/on', () => {
    it('removes listener', async () => {
      const listener = vi.fn()
      manager.on('tier-changed', listener)
      manager.off('tier-changed', listener)
      await manager.setTier('local')
      expect(listener).not.toHaveBeenCalled()
    })
  })
})
