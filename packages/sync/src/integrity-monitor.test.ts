/**
 * Tests for the periodic integrity monitor.
 */

import type { Change } from './change'
import type { DID, ContentId } from '@xnet/core'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createIntegrityMonitor,
  createReactIntegrityMonitor,
  type IntegrityMonitor
} from './integrity-monitor'

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function createTestChange(id: string, parentHash: ContentId | null = null): Change<unknown> {
  const author = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID
  return {
    id,
    protocolVersion: 1,
    type: 'test',
    payload: { test: true },
    hash: `cid:blake3:${id.padStart(64, '0')}` as ContentId,
    parentHash,
    authorDID: author,
    signature: new Uint8Array([1, 2, 3, 4]),
    wallTime: Date.now(),
    lamport: { time: 1, author }
  }
}

function createTestChanges(count: number): Change<unknown>[] {
  const changes: Change<unknown>[] = []
  let parentHash: ContentId | null = null

  for (let i = 0; i < count; i++) {
    const change = createTestChange(`change-${i}`, parentHash)
    changes.push(change)
    parentHash = change.hash
  }

  return changes
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('IntegrityMonitor', () => {
  let monitor: IntegrityMonitor | null = null

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    if (monitor) {
      monitor.stop()
      monitor = null
    }
    vi.useRealTimers()
  })

  describe('createIntegrityMonitor', () => {
    it('should create a monitor instance', () => {
      monitor = createIntegrityMonitor({
        getChanges: () => []
      })

      expect(monitor).toBeDefined()
      expect(monitor.start).toBeInstanceOf(Function)
      expect(monitor.stop).toBeInstanceOf(Function)
      expect(monitor.checkNow).toBeInstanceOf(Function)
      expect(monitor.getStats).toBeInstanceOf(Function)
      expect(monitor.isRunning).toBeInstanceOf(Function)
    })

    it('should not be running initially', () => {
      monitor = createIntegrityMonitor({
        getChanges: () => []
      })

      expect(monitor.isRunning()).toBe(false)
    })

    it('should have initial stats', () => {
      monitor = createIntegrityMonitor({
        getChanges: () => []
      })

      const stats = monitor.getStats()
      expect(stats.checksPerformed).toBe(0)
      expect(stats.totalIssuesFound).toBe(0)
      expect(stats.lastCheckAt).toBeNull()
      expect(stats.lastReport).toBeNull()
      expect(stats.isRunning).toBe(false)
      expect(stats.isChecking).toBe(false)
    })
  })

  describe('start/stop', () => {
    it('should start and stop the monitor', () => {
      monitor = createIntegrityMonitor({
        getChanges: () => []
      })

      monitor.start()
      expect(monitor.isRunning()).toBe(true)

      monitor.stop()
      expect(monitor.isRunning()).toBe(false)
    })

    it('should not start twice', () => {
      const getChanges = vi.fn().mockReturnValue(createTestChanges(20))

      monitor = createIntegrityMonitor({
        getChanges,
        intervalMs: 1000,
        checkOnStart: true
      })

      monitor.start()
      monitor.start() // Should be a no-op

      expect(monitor.isRunning()).toBe(true)
    })

    it('should not stop if not running', () => {
      monitor = createIntegrityMonitor({
        getChanges: () => []
      })

      monitor.stop() // Should be a no-op
      expect(monitor.isRunning()).toBe(false)
    })
  })

  describe('periodic checks', () => {
    it('should run checks at the specified interval', async () => {
      const getChanges = vi.fn().mockReturnValue(createTestChanges(20))
      const onCheck = vi.fn()

      monitor = createIntegrityMonitor({
        getChanges,
        intervalMs: 1000,
        onCheck
      })

      monitor.start()

      // Initially no checks
      expect(onCheck).not.toHaveBeenCalled()

      // Advance to first interval
      await vi.advanceTimersByTimeAsync(1000)
      expect(onCheck).toHaveBeenCalledTimes(1)

      // Advance to second interval
      await vi.advanceTimersByTimeAsync(1000)
      expect(onCheck).toHaveBeenCalledTimes(2)

      monitor.stop()
    })

    it('should run check immediately on start if configured', async () => {
      const getChanges = vi.fn().mockReturnValue(createTestChanges(20))
      const onCheck = vi.fn()

      monitor = createIntegrityMonitor({
        getChanges,
        intervalMs: 10000,
        checkOnStart: true,
        onCheck
      })

      monitor.start()

      // Should run immediately
      await vi.advanceTimersByTimeAsync(0)
      expect(onCheck).toHaveBeenCalledTimes(1)

      monitor.stop()
    })

    it('should use default interval if not specified', async () => {
      const getChanges = vi.fn().mockReturnValue(createTestChanges(20))
      const onCheck = vi.fn()

      monitor = createIntegrityMonitor({
        getChanges,
        onCheck
      })

      monitor.start()

      // Default is 5 minutes
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
      expect(onCheck).toHaveBeenCalledTimes(1)

      monitor.stop()
    })
  })

  describe('checkNow', () => {
    it('should run a check immediately', async () => {
      const changes = createTestChanges(20)
      monitor = createIntegrityMonitor({
        getChanges: () => changes,
        minChangesForCheck: 5, // Lower threshold to ensure check runs
        // Skip hash verification since our test changes have fake hashes
        verifyOptions: { skipHashes: true, skipSignatures: true }
      })

      const report = await monitor.checkNow()

      expect(report.checked).toBe(20)
      expect(report.valid).toBe(20)
      expect(report.issues).toHaveLength(0)
    })

    it('should update stats after check', async () => {
      const changes = createTestChanges(20)
      monitor = createIntegrityMonitor({
        getChanges: () => changes,
        minChangesForCheck: 5
      })

      await monitor.checkNow()

      const stats = monitor.getStats()
      expect(stats.checksPerformed).toBe(1)
      expect(stats.lastCheckAt).not.toBeNull()
      expect(stats.lastReport).not.toBeNull()
    })

    it('should work with async getChanges', async () => {
      // Use real timers for this test since we have real async operations
      vi.useRealTimers()

      const changes = createTestChanges(20)
      monitor = createIntegrityMonitor({
        getChanges: async () => {
          await new Promise((r) => setTimeout(r, 10))
          return changes
        },
        minChangesForCheck: 5
      })

      const report = await monitor.checkNow()
      expect(report.checked).toBe(20)

      // Restore fake timers for other tests
      vi.useFakeTimers()
    })
  })

  describe('callbacks', () => {
    it('should call onIssues when issues are found', async () => {
      const onIssues = vi.fn()

      // Create changes with a broken chain (missing parent)
      const changes = createTestChanges(15) // Need enough changes to pass minChangesForCheck
      changes[5].parentHash =
        'cid:blake3:0000000000000000000000000000000000000000000000000000000000missing' as ContentId

      monitor = createIntegrityMonitor({
        getChanges: () => changes,
        onIssues,
        minChangesForCheck: 5
      })

      await monitor.checkNow()

      expect(onIssues).toHaveBeenCalledTimes(1)
      const report = onIssues.mock.calls[0][0]
      expect(report.issues.length).toBeGreaterThan(0)
    })

    it('should call onCheck after every check', async () => {
      const onCheck = vi.fn()
      const changes = createTestChanges(20)

      monitor = createIntegrityMonitor({
        getChanges: () => changes,
        onCheck
      })

      await monitor.checkNow()
      await monitor.checkNow()

      expect(onCheck).toHaveBeenCalledTimes(2)
    })

    it('should call onError when check fails', async () => {
      const onError = vi.fn()

      monitor = createIntegrityMonitor({
        getChanges: () => {
          throw new Error('Failed to get changes')
        },
        onError
      })

      await expect(monitor.checkNow()).rejects.toThrow('Failed to get changes')
      expect(onError).toHaveBeenCalledTimes(1)
    })
  })

  describe('minChangesForCheck', () => {
    it('should skip check if too few changes', async () => {
      const onCheck = vi.fn()

      monitor = createIntegrityMonitor({
        getChanges: () => createTestChanges(5),
        minChangesForCheck: 10,
        onCheck
      })

      await monitor.checkNow()

      // onCheck is not called when skipped
      expect(onCheck).not.toHaveBeenCalled()
    })

    it('should run check if enough changes', async () => {
      const onCheck = vi.fn()

      monitor = createIntegrityMonitor({
        getChanges: () => createTestChanges(15),
        minChangesForCheck: 10,
        onCheck
      })

      await monitor.checkNow()

      expect(onCheck).toHaveBeenCalledTimes(1)
    })
  })

  describe('quickCheck option', () => {
    it('should use quick check when enabled', async () => {
      const changes = createTestChanges(20)

      monitor = createIntegrityMonitor({
        getChanges: () => changes,
        quickCheck: true
      })

      const report = await monitor.checkNow()

      // Quick check should still work
      expect(report.checked).toBe(20)
    })
  })

  describe('configure', () => {
    it('should update configuration', async () => {
      const onCheck = vi.fn()

      monitor = createIntegrityMonitor({
        getChanges: () => createTestChanges(20),
        intervalMs: 1000
      })

      monitor.start()

      // Update interval
      monitor.configure({ intervalMs: 500, onCheck })

      // Should restart with new interval
      expect(monitor.isRunning()).toBe(true)

      await vi.advanceTimersByTimeAsync(500)
      expect(onCheck).toHaveBeenCalledTimes(1)
    })
  })

  describe('concurrent checks', () => {
    it('should not run multiple checks simultaneously', async () => {
      let checkCount = 0
      const getChanges = vi.fn().mockImplementation(async () => {
        checkCount++
        await new Promise((r) => setTimeout(r, 100))
        return createTestChanges(20)
      })

      monitor = createIntegrityMonitor({
        getChanges
      })

      // Start multiple checks
      const p1 = monitor.checkNow()
      const p2 = monitor.checkNow()

      await vi.advanceTimersByTimeAsync(100)
      await Promise.all([p1, p2])

      // Should only run once
      expect(checkCount).toBe(1)
    })
  })
})

describe('createReactIntegrityMonitor', () => {
  let monitor: IntegrityMonitor | null = null

  afterEach(() => {
    if (monitor) {
      monitor.stop()
      monitor = null
    }
  })

  it('should emit state changes on start', () => {
    const onStateChange = vi.fn()

    monitor = createReactIntegrityMonitor({
      getChanges: () => [],
      onStateChange
    })

    monitor.start()

    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        isRunning: true
      })
    )
  })

  it('should emit state changes on stop', () => {
    const onStateChange = vi.fn()

    monitor = createReactIntegrityMonitor({
      getChanges: () => [],
      onStateChange
    })

    monitor.start()
    onStateChange.mockClear()

    monitor.stop()

    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        isRunning: false
      })
    )
  })

  it('should emit state changes after check', async () => {
    const onStateChange = vi.fn()

    monitor = createReactIntegrityMonitor({
      getChanges: () => createTestChanges(20),
      onStateChange
    })

    await monitor.checkNow()

    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        checksPerformed: 1,
        lastReport: expect.any(Object)
      })
    )
  })
})
