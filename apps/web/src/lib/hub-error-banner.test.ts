/**
 * Hub write-rejection banners (exploration 0418).
 *
 * The tests that matter are about tone and honesty: a billing pause must not
 * read like data loss, and an unrecognised failure must not be dressed up as a
 * reassuring one.
 */

import { describe, expect, it } from 'vitest'
import { hubErrorBanner, isBillingReadOnly, rejectionCodeOf } from './hub-error-banner'

const BILLING = 'https://cloud.xnet.fyi/dashboard'

describe('hubErrorBanner', () => {
  it('handles both spellings of the billing code (socket vs HTTP body)', () => {
    expect(hubErrorBanner('BILLING_READ_ONLY', { billingUrl: BILLING })?.title).toMatch(
      /read-only/i
    )
    expect(hubErrorBanner('billing_read_only', { billingUrl: BILLING })?.title).toMatch(
      /read-only/i
    )
  })

  it('leads with reassurance — a billing pause is not a data-loss event', () => {
    const b = hubErrorBanner('BILLING_READ_ONLY', { billingUrl: BILLING })
    expect(b?.message.indexOf('safe')).toBeLessThan(b?.message.indexOf('paused new writes') ?? 0)
    expect(b?.message).toMatch(/copy on this device is untouched/i)
  })

  it('tells the user their local edits are not lost', () => {
    const b = hubErrorBanner('BILLING_READ_ONLY', { billingUrl: BILLING })
    expect(b?.detailItems?.join(' ')).toMatch(/stay on this device and sync/i)
  })

  it('offers no action button when there is nowhere to send them', () => {
    expect(hubErrorBanner('BILLING_READ_ONLY')?.actionLabel).toBeUndefined()
    expect(hubErrorBanner('BILLING_READ_ONLY', { billingUrl: BILLING })?.actionLabel).toBe(
      'Manage billing'
    )
  })

  it('keeps quota and billing distinct — they need different actions', () => {
    const quota = hubErrorBanner('QUOTA_EXCEEDED', { billingUrl: BILLING })
    const billing = hubErrorBanner('BILLING_READ_ONLY', { billingUrl: BILLING })
    expect(quota?.title).not.toBe(billing?.title)
    expect(quota?.title).toMatch(/full/i)
  })

  it('describes STORAGE_FULL as transient and needing no user action', () => {
    const b = hubErrorBanner('STORAGE_FULL')
    expect(b?.actionLabel).toBeUndefined()
    expect(b?.detailItems?.join(' ')).toMatch(/queued locally, not dropped/i)
  })

  it('returns null for an unknown code rather than inventing reassurance', () => {
    expect(hubErrorBanner('SOMETHING_NEW')).toBeNull()
    expect(hubErrorBanner(undefined)).toBeNull()
    expect(hubErrorBanner(null)).toBeNull()
    expect(hubErrorBanner('UNAUTHORIZED')).toBeNull()
  })

  it('never claims data was lost', () => {
    for (const code of ['BILLING_READ_ONLY', 'QUOTA_EXCEEDED', 'STORAGE_FULL']) {
      const b = hubErrorBanner(code, { billingUrl: BILLING })
      expect(b?.message.toLowerCase()).not.toMatch(/lost|deleted|corrupt/)
    }
  })
})

describe('isBillingReadOnly', () => {
  it('matches both spellings and nothing else', () => {
    expect(isBillingReadOnly('BILLING_READ_ONLY')).toBe(true)
    expect(isBillingReadOnly('billing_read_only')).toBe(true)
    expect(isBillingReadOnly('QUOTA_EXCEEDED')).toBe(false)
    expect(isBillingReadOnly(undefined)).toBe(false)
  })
})

describe('rejectionCodeOf', () => {
  it('reads the socket error shape', () => {
    expect(rejectionCodeOf({ code: 'BILLING_READ_ONLY' })).toBe('BILLING_READ_ONLY')
  })

  it('reads the HTTP body shape', () => {
    expect(rejectionCodeOf({ error: { code: 'billing_read_only' } })).toBe('billing_read_only')
  })

  it('is null-safe on anything else', () => {
    expect(rejectionCodeOf(null)).toBeNull()
    expect(rejectionCodeOf('nope')).toBeNull()
    expect(rejectionCodeOf({})).toBeNull()
    expect(rejectionCodeOf({ code: 42 })).toBeNull()
  })
})
