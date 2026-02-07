/**
 * Performance Module
 *
 * Utilities for measuring and monitoring canvas performance.
 */

// Frame Monitor
export { FrameMonitor, createFrameMonitor, type FrameStats } from './frame-monitor'

// Memory Profile
export {
  getMemoryUsage,
  formatBytes,
  profileMemory,
  MemoryTracker,
  createMemoryTracker,
  type MemorySnapshot
} from './memory-profile'
