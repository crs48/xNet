/**
 * Reconnect scheduler — the one timer-and-attempt-counter state machine shared
 * by every reconnecting transport (exploration 0303).
 *
 * `connection-manager.ts` and `WebSocketSyncProvider.ts` used to each carry a
 * private `reconnectDelay`/`reconnectAttempts`/`reconnectTimer` trio that had
 * already drifted (exponential-with-cap vs fixed delay). Delay math now lives
 * in `RetryPolicy` values from `@xnetjs/core`; this module owns the arming,
 * deduping, and cancellation of the retry timer around them.
 *
 * Internal to `@xnetjs/runtime` — not exported from any barrel (0276).
 */
import type { RetryPolicy } from '@xnetjs/core'

export interface ReconnectScheduler {
  /** Number of retries armed since the last `reset()`. */
  readonly attempts: number
  /** True while a retry timer is armed. */
  readonly pending: boolean
  /**
   * Arm the next retry. No-op (returns false) when a retry is already pending
   * or the policy has given up (`delayFor` returned null).
   */
  schedule(): boolean
  /** Forget the attempt history — call on successful (re)connect. */
  reset(): void
  /** Clear any armed timer — call on teardown. Attempt history is kept. */
  cancel(): void
}

export function createReconnectScheduler(options: {
  /**
   * Policy for the next attempt, consulted at `schedule()` time so callers can
   * switch schedules per close reason (e.g. the hub's 1008 rate-limit close
   * uses a longer, jittered backoff — exploration 0206).
   */
  policy: () => RetryPolicy
  /** Fired when the armed backoff elapses. */
  onRetry: () => void
}): ReconnectScheduler {
  let attempts = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  return {
    get attempts() {
      return attempts
    },
    get pending() {
      return timer !== null
    },
    schedule() {
      if (timer) return false
      const delay = options.policy().delayFor(attempts + 1)
      if (delay === null) return false
      attempts++
      timer = setTimeout(() => {
        timer = null
        options.onRetry()
      }, delay)
      return true
    },
    reset() {
      attempts = 0
    },
    cancel() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    }
  }
}
