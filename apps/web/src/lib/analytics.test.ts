import { afterEach, describe, expect, it } from 'vitest'
import { __resetAnalytics, initAnalytics, isAnalyticsConfigured } from './analytics'

afterEach(() => {
  __resetAnalytics()
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
