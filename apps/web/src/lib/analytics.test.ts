import { afterEach, describe, expect, it } from 'vitest'
import {
  analyticsAllowed,
  __resetAnalytics,
  initAnalytics,
  isAnalyticsConfigured
} from './analytics'
import { consent } from './consent'

afterEach(async () => {
  __resetAnalytics()
  await consent.setConsent({ tier: 'off', grantedAt: new Date(0) })
  document.querySelectorAll('script[data-domain]').forEach((el) => el.remove())
})

describe('analytics', () => {
  it('reports unconfigured and injects no script without a domain', () => {
    // VITE_ANALYTICS_DOMAIN is unset in tests.
    expect(isAnalyticsConfigured()).toBe(false)
    initAnalytics()
    expect(document.querySelector('script[data-domain]')).toBeNull()
  })

  it('does not throw when called repeatedly', () => {
    expect(() => {
      initAnalytics()
      initAnalytics()
    }).not.toThrow()
  })
})

describe('analyticsAllowed (consent suppression)', () => {
  it('is allowed by default (cookieless needs no consent)', () => {
    // default: tier off, grantedAt epoch 0 → "not chosen", so not an opt-out
    expect(analyticsAllowed()).toBe(true)
  })

  it('is suppressed by an explicit global opt-out', async () => {
    await consent.setConsent({ tier: 'off', grantedAt: new Date() })
    expect(analyticsAllowed()).toBe(false)
  })

  it('is allowed when the user opted into a telemetry tier', async () => {
    await consent.setTier('crashes')
    expect(analyticsAllowed()).toBe(true)
  })
})
