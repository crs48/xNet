/**
 * Tests for the status bar sync-cluster decision/format logic (0233).
 */
import { describe, expect, it } from 'vitest'
import { coarseSyncState, isIntegrityAlert, relativeTime } from './sync-format'

describe('coarseSyncState', () => {
  it('reports offline when the browser is offline regardless of hub', () => {
    expect(coarseSyncState('connected', true, 'healthy', 0)).toBe('offline')
  })

  it('maps a disconnected hub to offline', () => {
    expect(coarseSyncState('disconnected', false, 'degraded', 0)).toBe('offline')
  })

  it('surfaces connecting and error directly', () => {
    expect(coarseSyncState('connecting', false, 'connecting', 0)).toBe('connecting')
    expect(coarseSyncState('error', false, 'degraded', 0)).toBe('error')
  })

  it('is synced only when connected, settled, and nothing is queued', () => {
    expect(coarseSyncState('connected', false, 'healthy', 0)).toBe('synced')
  })

  it('shows syncing while replaying or with pending changes', () => {
    expect(coarseSyncState('connected', false, 'replaying', 0)).toBe('syncing')
    expect(coarseSyncState('connected', false, 'healthy', 3)).toBe('syncing')
  })
})

describe('isIntegrityAlert', () => {
  it('is false with no failure', () => {
    expect(isIntegrityAlert(null, null)).toBe(false)
    expect(isIntegrityAlert(null, { at: 100 })).toBe(false)
  })

  it('is true for a failure with no reconciliation', () => {
    expect(isIntegrityAlert({ at: 100 }, null)).toBe(true)
  })

  it('clears once a reconciliation happens at/after the failure', () => {
    expect(isIntegrityAlert({ at: 100 }, { at: 100 })).toBe(false)
    expect(isIntegrityAlert({ at: 100 }, { at: 200 })).toBe(false)
  })

  it('stays set if the only reconciliation predates the failure', () => {
    expect(isIntegrityAlert({ at: 200 }, { at: 100 })).toBe(true)
  })
})

describe('relativeTime', () => {
  it('renders an em dash for missing timestamps', () => {
    expect(relativeTime(null)).toBe('—')
  })

  it('formats seconds, minutes, and hours', () => {
    const now = 1_000_000_000
    expect(relativeTime(now - 5_000, now)).toBe('5s ago')
    expect(relativeTime(now - 90_000, now)).toBe('2m ago')
    expect(relativeTime(now - 3_600_000, now)).toBe('1h ago')
  })

  it('never goes negative for a future timestamp', () => {
    const now = 1_000
    expect(relativeTime(now + 5_000, now)).toBe('0s ago')
  })
})
