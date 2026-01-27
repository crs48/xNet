/**
 * Tests for Yjs State Integrity (Hash-at-Rest)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  hashYjsState,
  verifyYjsStateIntegrity,
  YjsIntegrityError,
  createPersistedDocState,
  verifyPersistedDocState,
  loadVerifiedState,
  shouldCompact,
  COMPACTION_UPDATE_THRESHOLD,
  COMPACTION_TIME_THRESHOLD
} from './yjs-integrity'

describe('hashYjsState', () => {
  it('produces consistent BLAKE3 hash for same state', () => {
    const state = new Uint8Array([1, 2, 3, 4, 5])
    expect(hashYjsState(state)).toBe(hashYjsState(state))
  })

  it('produces different hash for different state', () => {
    const state1 = new Uint8Array([1, 2, 3])
    const state2 = new Uint8Array([1, 2, 4])
    expect(hashYjsState(state1)).not.toBe(hashYjsState(state2))
  })

  it('returns hex string', () => {
    const state = new Uint8Array([1, 2, 3])
    const hash = hashYjsState(state)
    expect(hash).toMatch(/^[0-9a-f]+$/)
  })

  it('handles empty state', () => {
    const state = new Uint8Array([])
    const hash = hashYjsState(state)
    expect(hash).toBeTruthy()
    expect(typeof hash).toBe('string')
  })

  it('handles large state', () => {
    const state = new Uint8Array(100_000).fill(42)
    const hash = hashYjsState(state)
    expect(hash).toBeTruthy()
  })
})

describe('verifyYjsStateIntegrity', () => {
  it('returns true for matching hash', () => {
    const state = new Uint8Array([10, 20, 30])
    const hash = hashYjsState(state)
    expect(verifyYjsStateIntegrity(state, hash)).toBe(true)
  })

  it('returns false for mismatching hash', () => {
    const state = new Uint8Array([10, 20, 30])
    expect(verifyYjsStateIntegrity(state, 'deadbeef')).toBe(false)
  })

  it('returns false for tampered state', () => {
    const state = new Uint8Array([10, 20, 30])
    const hash = hashYjsState(state)
    state[0] = 99 // tamper
    expect(verifyYjsStateIntegrity(state, hash)).toBe(false)
  })
})

describe('YjsIntegrityError', () => {
  it('contains docId, expectedHash, and actualHash', () => {
    const error = new YjsIntegrityError('doc-123', 'expected123', 'actual456')

    expect(error.docId).toBe('doc-123')
    expect(error.expectedHash).toBe('expected123')
    expect(error.actualHash).toBe('actual456')
    expect(error.name).toBe('YjsIntegrityError')
  })

  it('has descriptive message', () => {
    const error = new YjsIntegrityError('doc-123', 'abcdef1234567890', 'ghijkl9876543210')
    expect(error.message).toContain('doc-123')
    expect(error.message).toContain('corrupted')
  })
})

describe('createPersistedDocState', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates record with computed hash', () => {
    const state = new Uint8Array([1, 2, 3])
    const record = createPersistedDocState(state)

    expect(record.state).toBe(state)
    expect(record.hash).toBe(hashYjsState(state))
    expect(record.persistedAt).toBe(Date.now())
    expect(record.updateCount).toBe(0)
  })

  it('accepts custom updateCount', () => {
    const state = new Uint8Array([1, 2, 3])
    const record = createPersistedDocState(state, 42)

    expect(record.updateCount).toBe(42)
  })
})

describe('verifyPersistedDocState', () => {
  it('passes for valid record', () => {
    const state = new Uint8Array([1, 2, 3])
    const record = createPersistedDocState(state)

    expect(() => verifyPersistedDocState('doc-1', record)).not.toThrow()
  })

  it('throws YjsIntegrityError for corrupted record', () => {
    const state = new Uint8Array([1, 2, 3])
    const record = createPersistedDocState(state)
    record.state[0] = 99 // tamper

    expect(() => verifyPersistedDocState('doc-1', record)).toThrow(YjsIntegrityError)
  })

  it('throws YjsIntegrityError with correct details', () => {
    const state = new Uint8Array([1, 2, 3])
    const record = createPersistedDocState(state)
    const originalHash = record.hash
    record.state[0] = 99 // tamper

    try {
      verifyPersistedDocState('doc-123', record)
      expect.fail('Should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(YjsIntegrityError)
      const error = e as YjsIntegrityError
      expect(error.docId).toBe('doc-123')
      expect(error.expectedHash).toBe(originalHash)
      expect(error.actualHash).not.toBe(originalHash)
    }
  })
})

describe('loadVerifiedState', () => {
  it('returns state for valid record', () => {
    const state = new Uint8Array([1, 2, 3])
    const record = createPersistedDocState(state)

    const loaded = loadVerifiedState('doc-1', record)
    expect(loaded).toBe(state)
  })

  it('returns state for legacy record without hash', () => {
    const state = new Uint8Array([1, 2, 3])
    const legacyRecord = { state }

    const loaded = loadVerifiedState('doc-1', legacyRecord)
    expect(loaded).toBe(state)
  })

  it('throws YjsIntegrityError for corrupted record with hash', () => {
    const state = new Uint8Array([1, 2, 3])
    const record = createPersistedDocState(state)
    record.state[0] = 99 // tamper

    expect(() => loadVerifiedState('doc-1', record)).toThrow(YjsIntegrityError)
  })

  it('does not verify legacy records without hash (backward compat)', () => {
    const state = new Uint8Array([1, 2, 3])
    const legacyRecord = { state, hash: undefined }

    // Even if we tamper, should not throw (no hash to verify against)
    state[0] = 99
    expect(() => loadVerifiedState('doc-1', legacyRecord as any)).not.toThrow()
  })
})

describe('shouldCompact', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns true when updateCount >= threshold', () => {
    const recentPersist = Date.now() - 1000
    expect(shouldCompact(COMPACTION_UPDATE_THRESHOLD, recentPersist)).toBe(true)
    expect(shouldCompact(COMPACTION_UPDATE_THRESHOLD + 10, recentPersist)).toBe(true)
  })

  it('returns false when updateCount < threshold and time < threshold', () => {
    const recentPersist = Date.now() - 1000
    expect(shouldCompact(0, recentPersist)).toBe(false)
    expect(shouldCompact(COMPACTION_UPDATE_THRESHOLD - 1, recentPersist)).toBe(false)
  })

  it('returns true when time > threshold even if updateCount is low', () => {
    const oldPersist = Date.now() - COMPACTION_TIME_THRESHOLD - 1000
    expect(shouldCompact(0, oldPersist)).toBe(true)
    expect(shouldCompact(10, oldPersist)).toBe(true)
  })

  it('returns false when time is exactly at threshold', () => {
    const atThreshold = Date.now() - COMPACTION_TIME_THRESHOLD
    expect(shouldCompact(0, atThreshold)).toBe(false)
  })
})
