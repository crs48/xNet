/**
 * Billing read-only mode (exploration 0418).
 *
 * The load-bearing assertions here are the *negative* ones: a self-hosted hub
 * must never be blocked, and a read-only hub must never lock a customer out of
 * paying or exporting. Those are the two ways this feature could do real harm.
 */

import { describe, expect, it } from 'vitest'
import { resolveWritesEnabled } from '../config'
import { DEFAULT_CONFIG, type HubConfig } from '../types'
import { isAlwaysWritable, isBlockedWhenReadOnly, READ_ONLY_BODY } from './read-only'

const config = (over: Partial<HubConfig> = {}): HubConfig =>
  ({ ...DEFAULT_CONFIG, ...over }) as HubConfig

describe('resolveWritesEnabled', () => {
  it('is true for a self-hosted hub (no entitlement token, field absent)', () => {
    expect(resolveWritesEnabled(config())).toBe(true)
  })

  it('is true when explicitly enabled', () => {
    expect(resolveWritesEnabled(config({ writesEnabled: true }))).toBe(true)
  })

  it('is false ONLY on an explicit false', () => {
    expect(resolveWritesEnabled(config({ writesEnabled: false }))).toBe(false)
  })

  it('treats undefined as enabled — the fail-open invariant', () => {
    expect(resolveWritesEnabled(config({ writesEnabled: undefined }))).toBe(true)
  })
})

describe('isBlockedWhenReadOnly', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'post', 'delete'])(
    'blocks %s on a data route',
    (m) => {
      expect(isBlockedWhenReadOnly(m, '/changes')).toBe(true)
    }
  )

  it.each(['GET', 'HEAD', 'OPTIONS'])('never blocks %s', (m) => {
    expect(isBlockedWhenReadOnly(m, '/changes')).toBe(false)
  })

  it('does not block the routes that let a customer stop being read-only', () => {
    for (const path of ['/billing/checkout', '/billing/portal', '/auth/revoke', '/challenge']) {
      expect(isBlockedWhenReadOnly('POST', path)).toBe(false)
    }
  })

  it('does not block the exit ramp — export must work when unpaid (Charter §6)', () => {
    expect(isBlockedWhenReadOnly('POST', '/export')).toBe(false)
    expect(isBlockedWhenReadOnly('POST', '/backup/export')).toBe(false)
  })

  it('does not block POST-shaped reads', () => {
    expect(isBlockedWhenReadOnly('POST', '/query')).toBe(false)
    expect(isBlockedWhenReadOnly('POST', '/search')).toBe(false)
  })

  it('blocks a route that merely starts with an allowlisted word', () => {
    // `/exports-admin` is not `/export` — prefix matching must respect segments.
    expect(isBlockedWhenReadOnly('POST', '/exports-admin')).toBe(true)
  })

  it('allows exact matches and sub-paths of an allowlisted prefix', () => {
    expect(isAlwaysWritable('/billing')).toBe(true)
    expect(isAlwaysWritable('/billing/checkout')).toBe(true)
    expect(isAlwaysWritable('/billingx')).toBe(false)
  })
})

describe('READ_ONLY_BODY', () => {
  it('carries a machine-readable code the app can branch on', () => {
    expect(READ_ONLY_BODY.code).toBe('billing_read_only')
  })

  it('tells the user their data is safe, not that something broke', () => {
    expect(READ_ONLY_BODY.error).toMatch(/data is safe/i)
  })
})
