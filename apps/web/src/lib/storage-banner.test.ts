import type { PersistentStorageStatus } from '@xnetjs/sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  detectBrowserFamily,
  getStorageBanner,
  getStorageRecoveryItems,
  type StorageBannerContext
} from './storage-banner'

function status(overrides: Partial<PersistentStorageStatus> = {}): PersistentStorageStatus {
  return {
    supported: true,
    persisted: false,
    granted: false,
    requested: true,
    requestable: true,
    state: 'not-granted',
    message: 'declined for now',
    usageBytes: 1024,
    quotaBytes: 4096,
    ...overrides
  }
}

function context(overrides: Partial<StorageBannerContext> = {}): StorageBannerContext {
  return { browserFamily: 'chromium', installAvailable: false, isInstalled: false, ...overrides }
}

describe('detectBrowserFamily', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const cases: Array<[string, string]> = [
    [
      'chromium',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    ],
    [
      'firefox',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0'
    ],
    [
      'safari',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
    ],
    ['other', 'curl/8.0']
  ]

  it.each(cases)('detects %s', (family, userAgent) => {
    vi.stubGlobal('navigator', { userAgent })
    expect(detectBrowserFamily()).toBe(family)
  })

  it('is other without a navigator', () => {
    vi.stubGlobal('navigator', undefined)
    expect(detectBrowserFamily()).toBe('other')
  })
})

describe('getStorageBanner', () => {
  it('returns null without a warning or status', () => {
    expect(getStorageBanner({ ...context() })).toBeNull()
  })

  it('shows no banner once granted — the StatusBar carries the working state', () => {
    const banner = getStorageBanner({ storageStatus: status({ state: 'granted' }), ...context() })
    expect(banner).toBeNull()
  })

  it('treats a Chromium denial as informational and pending', () => {
    const banner = getStorageBanner({ storageStatus: status(), ...context() })
    expect(banner).toMatchObject({
      tone: 'info',
      title: 'Durable storage pending',
      actionLabel: 'Retry durable storage'
    })
    expect(banner?.detailItems?.[0]).toContain('No action needed')
  })

  it('offers Enable before the first request', () => {
    const banner = getStorageBanner({ storageStatus: status({ requested: false }), ...context() })
    expect(banner).toMatchObject({
      title: 'Enable durable local storage',
      actionLabel: 'Enable durable storage'
    })
  })

  it('warns on Safari in a tab and drops the futile retry action', () => {
    const banner = getStorageBanner({
      storageStatus: status(),
      ...context({ browserFamily: 'safari' })
    })
    expect(banner).toMatchObject({
      tone: 'warning',
      title: 'Safari limits durable storage in browser tabs'
    })
    expect(banner?.actionLabel).toBeUndefined()
    expect(banner?.detailItems?.join(' ')).toContain('7 days')
  })

  it('keeps the retry action for installed Safari', () => {
    const banner = getStorageBanner({
      storageStatus: status(),
      ...context({ browserFamily: 'safari', isInstalled: true })
    })
    expect(banner?.actionLabel).toBe('Retry durable storage')
  })

  it('warns on Firefox with prompt guidance', () => {
    const banner = getStorageBanner({
      storageStatus: status(),
      ...context({ browserFamily: 'firefox' })
    })
    expect(banner?.tone).toBe('warning')
    expect(banner?.detailItems?.join(' ')).toContain('Page Info')
  })

  it('offers the install secondary action when available', () => {
    const banner = getStorageBanner({
      storageStatus: status(),
      ...context({ installAvailable: true })
    })
    expect(banner?.secondaryActionLabel).toBe('Install app')
  })

  it('keeps unsupported and error states informational', () => {
    for (const state of ['unsupported', 'error'] as const) {
      const banner = getStorageBanner({ storageStatus: status({ state }), ...context() })
      expect(banner).toMatchObject({ tone: 'info', title: 'Storage durability unavailable' })
    }
  })

  it('prefixes the storage warning when present', () => {
    const banner = getStorageBanner({
      storageWarning: 'OPFS probe failed.',
      storageStatus: status(),
      ...context()
    })
    expect(banner).toMatchObject({ tone: 'warning', title: 'Storage may be limited' })
    expect(banner?.message).toContain('OPFS probe failed.')
    expect(banner?.message).toContain('declined for now')
  })
})

describe('getStorageRecoveryItems', () => {
  it('returns nothing once granted', () => {
    expect(getStorageRecoveryItems(status({ state: 'granted' }), context())).toEqual([])
  })

  it('gives generic guidance on unknown browsers', () => {
    const items = getStorageRecoveryItems(status(), context({ browserFamily: 'other' }))
    expect(items[0]).toContain('install, notification, and usage signals')
  })

  it('distinguishes Firefox copy by requested state', () => {
    const before = getStorageRecoveryItems(
      status({ requested: false }),
      context({ browserFamily: 'firefox' })
    )
    const after = getStorageRecoveryItems(status(), context({ browserFamily: 'firefox' }))
    expect(before[0]).toContain('Choose Allow')
    expect(after[0]).toContain('blocked prompt')
  })
})
