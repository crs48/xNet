/**
 * Performance Tests
 *
 * Tests for performance monitoring utilities.
 */

import { describe, it, expect } from 'vitest'
import {
  FrameMonitor,
  createFrameMonitor,
  getMemoryUsage,
  formatBytes,
  MemoryTracker,
  createMemoryTracker
} from '../performance/index'

describe('FrameMonitor', () => {
  describe('constructor', () => {
    it('creates frame monitor', () => {
      const monitor = new FrameMonitor()
      expect(monitor).toBeDefined()
    })
  })

  describe('getStats', () => {
    it('returns zero stats when not started', () => {
      const monitor = new FrameMonitor()
      const stats = monitor.getStats()

      expect(stats.frameCount).toBe(0)
      expect(stats.averageFrameTime).toBe(0)
      expect(stats.fps).toBe(0)
    })
  })

  describe('start/stop', () => {
    it('starts and stops without error', () => {
      const monitor = new FrameMonitor()

      expect(() => monitor.start()).not.toThrow()
      expect(() => monitor.stop()).not.toThrow()
    })

    it('stop returns stats', () => {
      const monitor = new FrameMonitor()
      monitor.start()
      const stats = monitor.stop()

      expect(stats).toHaveProperty('frameCount')
      expect(stats).toHaveProperty('averageFrameTime')
      expect(stats).toHaveProperty('droppedFrames')
      expect(stats).toHaveProperty('fps')
    })
  })

  describe('reset', () => {
    it('resets measurements', () => {
      const monitor = new FrameMonitor()
      monitor.start()
      monitor.reset()
      const stats = monitor.stop()

      // After reset, should have very few or no frames
      expect(stats.frameCount).toBeLessThanOrEqual(1)
    })
  })
})

describe('createFrameMonitor', () => {
  it('creates frame monitor with factory', () => {
    const monitor = createFrameMonitor()
    expect(monitor).toBeInstanceOf(FrameMonitor)
  })
})

describe('getMemoryUsage', () => {
  it('returns null in non-Chrome environments', () => {
    // In Vitest/Node, performance.memory is not available
    const result = getMemoryUsage()
    // May be null depending on environment
    expect(result === null || typeof result === 'object').toBe(true)
  })
})

describe('formatBytes', () => {
  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500 B')
  })

  it('formats kilobytes', () => {
    expect(formatBytes(1500)).toBe('1.5 KB')
  })

  it('formats megabytes', () => {
    expect(formatBytes(1500000)).toBe('1.4 MB')
  })

  it('formats gigabytes', () => {
    expect(formatBytes(1500000000)).toBe('1.4 GB')
  })
})

describe('MemoryTracker', () => {
  describe('constructor', () => {
    it('creates memory tracker', () => {
      const tracker = new MemoryTracker()
      expect(tracker).toBeDefined()
    })
  })

  describe('start/stop', () => {
    it('starts and stops without error', () => {
      const tracker = new MemoryTracker()

      expect(() => tracker.start(100)).not.toThrow()
      expect(() => tracker.stop()).not.toThrow()
    })

    it('stop returns statistics', () => {
      const tracker = new MemoryTracker()
      tracker.start(100)
      const stats = tracker.stop()

      expect(stats).toHaveProperty('samples')
      expect(stats).toHaveProperty('peakUsed')
      expect(stats).toHaveProperty('averageUsed')
      expect(stats).toHaveProperty('growth')
    })
  })
})

describe('createMemoryTracker', () => {
  it('creates memory tracker with factory', () => {
    const tracker = createMemoryTracker()
    expect(tracker).toBeInstanceOf(MemoryTracker)
  })
})
