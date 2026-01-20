import { describe, it, expect } from 'vitest'
import { shouldCreateSnapshot, DEFAULT_SNAPSHOT_TRIGGERS } from './snapshots'

describe('Snapshots', () => {
  const triggers = {
    updateCount: 10000,
    timeInterval: 24 * 60 * 60 * 1000, // 24 hours
    storagePressure: 0.8
  }

  it('should trigger on update count', () => {
    expect(shouldCreateSnapshot(10000, Date.now(), 0, 100, triggers)).toBe(true)
    expect(shouldCreateSnapshot(9999, Date.now(), 0, 100, triggers)).toBe(false)
  })

  it('should trigger on time interval', () => {
    const old = Date.now() - 25 * 60 * 60 * 1000 // 25 hours ago
    expect(shouldCreateSnapshot(0, old, 0, 100, triggers)).toBe(true)

    const recent = Date.now() - 1 * 60 * 60 * 1000 // 1 hour ago
    expect(shouldCreateSnapshot(0, recent, 0, 100, triggers)).toBe(false)
  })

  it('should trigger on storage pressure', () => {
    expect(shouldCreateSnapshot(0, Date.now(), 85, 100, triggers)).toBe(true)
    expect(shouldCreateSnapshot(0, Date.now(), 80, 100, triggers)).toBe(true)
    expect(shouldCreateSnapshot(0, Date.now(), 70, 100, triggers)).toBe(false)
  })

  it('should handle zero storage total', () => {
    expect(shouldCreateSnapshot(0, Date.now(), 0, 0, triggers)).toBe(false)
  })

  it('should use default triggers when not provided', () => {
    expect(DEFAULT_SNAPSHOT_TRIGGERS.updateCount).toBe(10000)
    expect(DEFAULT_SNAPSHOT_TRIGGERS.storagePressure).toBe(0.8)
  })
})
