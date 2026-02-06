/**
 * Yjs Update Size and Rate Limits
 *
 * Constants and utilities for preventing DoS via oversized or high-frequency Yjs updates.
 */

/** Maximum size of a single Yjs update (1MB) */
export const MAX_YJS_UPDATE_SIZE = 1_048_576

/** Maximum updates per second per connection */
export const MAX_YJS_UPDATES_PER_SECOND = 30

/** Maximum updates per minute per connection (sustained rate) */
export const MAX_YJS_UPDATES_PER_MINUTE = 600

/** Maximum document size (full state, 50MB) */
export const MAX_YJS_DOC_SIZE = 52_428_800

/** Chunk size for large initial syncs (256KB) */
export const YJS_SYNC_CHUNK_SIZE = 262_144

/** Burst allowance above per-second limit */
export const YJS_RATE_BURST_ALLOWANCE = 10

/**
 * Rate limiter configuration.
 */
export interface RateLimiterConfig {
  /** Maximum updates per second */
  maxPerSecond: number
  /** Maximum updates per minute */
  maxPerMinute: number
  /** Burst allowance above maxPerSecond */
  burstAllowance: number
}

/**
 * Default rate limiter configuration.
 */
export const DEFAULT_RATE_LIMITER_CONFIG: RateLimiterConfig = {
  maxPerSecond: MAX_YJS_UPDATES_PER_SECOND,
  maxPerMinute: MAX_YJS_UPDATES_PER_MINUTE,
  burstAllowance: YJS_RATE_BURST_ALLOWANCE
}

/**
 * Per-peer rate window state.
 */
interface RateWindow {
  count: number
  resetAt: number
}

/**
 * Extended config for rate limiter with cleanup options.
 */
export interface YjsRateLimiterOptions extends Partial<RateLimiterConfig> {
  /** How long until an entry is considered stale (default: 2 minutes) */
  staleThresholdMs?: number
  /** Cleanup interval in ms (default: 30 seconds). Set to 0 to disable auto-cleanup. */
  cleanupIntervalMs?: number
}

/**
 * Rate limiter for Yjs updates.
 *
 * Tracks per-peer update frequency and enforces both per-second and per-minute limits.
 *
 * @example
 * ```typescript
 * const limiter = new YjsRateLimiter()
 *
 * if (!limiter.allow(peerId)) {
 *   // Reject update, rate limit exceeded
 *   return { ok: false, reason: 'rate_exceeded' }
 * }
 * ```
 */
export class YjsRateLimiter {
  private secondWindows = new Map<string, RateWindow>()
  private minuteWindows = new Map<string, RateWindow>()
  private config: RateLimiterConfig
  private cleanupInterval: ReturnType<typeof setInterval> | null = null
  private staleThresholdMs: number

  constructor(options: YjsRateLimiterOptions = {}) {
    const { staleThresholdMs, cleanupIntervalMs, ...config } = options
    this.config = { ...DEFAULT_RATE_LIMITER_CONFIG, ...config }
    this.staleThresholdMs = staleThresholdMs ?? 2 * 60 * 1000 // 2 minutes

    const interval = cleanupIntervalMs ?? 30 * 1000 // 30 seconds
    if (interval > 0) {
      this.startCleanup(interval)
    }
  }

  /** Start periodic cleanup of stale entries. */
  startCleanup(intervalMs: number = 30 * 1000): void {
    this.stopCleanup()
    this.cleanupInterval = setInterval(() => this.cleanupStale(), intervalMs)
    // Unref so it doesn't prevent process from exiting
    if (typeof this.cleanupInterval === 'object' && 'unref' in this.cleanupInterval) {
      this.cleanupInterval.unref()
    }
  }

  /** Stop periodic cleanup. */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  /** Remove entries whose windows have expired. Returns count removed. */
  cleanupStale(): number {
    const now = Date.now()
    const threshold = now - this.staleThresholdMs
    let removed = 0

    for (const [peerId, window] of this.secondWindows) {
      // Remove if window expired a long time ago
      if (window.resetAt < threshold) {
        this.secondWindows.delete(peerId)
        removed++
      }
    }

    for (const [peerId, window] of this.minuteWindows) {
      if (window.resetAt < threshold) {
        this.minuteWindows.delete(peerId)
        removed++
      }
    }

    return removed
  }

  /** Get number of tracked peers. */
  get peerCount(): number {
    // Union of peers in both maps
    const peers = new Set([...this.secondWindows.keys(), ...this.minuteWindows.keys()])
    return peers.size
  }

  /**
   * Check if a peer can send another update.
   *
   * @param peerId - Peer identifier
   * @returns true if allowed, false if rate-limited
   */
  allow(peerId: string): boolean {
    const now = Date.now()

    // Per-second window
    const sec = this.secondWindows.get(peerId)
    if (!sec || now >= sec.resetAt) {
      this.secondWindows.set(peerId, { count: 1, resetAt: now + 1000 })
    } else {
      sec.count++
      if (sec.count > this.config.maxPerSecond + this.config.burstAllowance) {
        return false
      }
    }

    // Per-minute window (sustained rate)
    const min = this.minuteWindows.get(peerId)
    if (!min || now >= min.resetAt) {
      this.minuteWindows.set(peerId, { count: 1, resetAt: now + 60_000 })
    } else {
      min.count++
      if (min.count > this.config.maxPerMinute) {
        return false
      }
    }

    return true
  }

  /**
   * Get current rate info for a peer (for debugging/monitoring).
   */
  getInfo(peerId: string): { perSecond: number; perMinute: number } | undefined {
    const sec = this.secondWindows.get(peerId)
    const min = this.minuteWindows.get(peerId)
    if (!sec && !min) return undefined

    const now = Date.now()
    return {
      perSecond: sec && now < sec.resetAt ? sec.count : 0,
      perMinute: min && now < min.resetAt ? min.count : 0
    }
  }

  /**
   * Reset state for a disconnected peer.
   */
  remove(peerId: string): void {
    this.secondWindows.delete(peerId)
    this.minuteWindows.delete(peerId)
  }

  /**
   * Clear all state.
   */
  clear(): void {
    this.secondWindows.clear()
    this.minuteWindows.clear()
  }

  /**
   * Stop cleanup and clear all state.
   */
  destroy(): void {
    this.stopCleanup()
    this.clear()
  }
}

/**
 * Check if an update exceeds the size limit.
 */
export function isUpdateTooLarge(update: Uint8Array, maxSize = MAX_YJS_UPDATE_SIZE): boolean {
  return update.length > maxSize
}

/**
 * Check if a document state exceeds the size limit.
 */
export function isDocumentTooLarge(state: Uint8Array, maxSize = MAX_YJS_DOC_SIZE): boolean {
  return state.length > maxSize
}

/**
 * Calculate number of chunks needed for a large update.
 */
export function calculateChunkCount(totalSize: number, chunkSize = YJS_SYNC_CHUNK_SIZE): number {
  return Math.ceil(totalSize / chunkSize)
}

/**
 * Split a large update into chunks.
 */
export function chunkUpdate(update: Uint8Array, chunkSize = YJS_SYNC_CHUNK_SIZE): Uint8Array[] {
  const chunks: Uint8Array[] = []
  for (let i = 0; i < update.length; i += chunkSize) {
    chunks.push(update.slice(i, Math.min(i + chunkSize, update.length)))
  }
  return chunks
}

/**
 * Reassemble chunks into a single update.
 */
export function reassembleChunks(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}
