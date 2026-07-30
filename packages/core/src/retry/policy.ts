/**
 * Retry/backoff policies (exploration 0303).
 *
 * One dependency-free vocabulary for every reconnect/retry loop in the repo,
 * replacing the hand-rolled backoff math that had drifted into three parallel
 * implementations (sync connection-manager, WebSocketSyncProvider, webhook
 * emitter). Deliberately shaped like Effect's `Schedule` combinators so a
 * later migration would be mechanical — but scope-guarded: if this module
 * needs union/intersect/cron/hedging, stop and re-read exploration 0303.
 */

/**
 * A retry policy maps a 1-based attempt number to the delay (in ms) to wait
 * before that attempt, or `null` to give up retrying.
 */
export interface RetryPolicy {
  /** Delay in ms before the given 1-based attempt, or `null` to give up. */
  delayFor(attempt: number): number | null
}

/** The same delay before every attempt. */
export function fixed(delayMs: number): RetryPolicy {
  return {
    delayFor: () => delayMs
  }
}

/**
 * Exponential backoff: `baseMs * factor^(attempt - 1)`.
 * Attempt 1 waits `baseMs`, attempt 2 waits `baseMs * factor`, and so on.
 */
export function exponential(baseMs: number, factor = 2): RetryPolicy {
  return {
    delayFor: (attempt) => baseMs * factor ** (attempt - 1)
  }
}

/** Cap another policy's delay at `maxDelayMs`. Passes `null` (give up) through. */
export function capped(policy: RetryPolicy, maxDelayMs: number): RetryPolicy {
  return {
    delayFor: (attempt) => {
      const delay = policy.delayFor(attempt)
      return delay === null ? null : Math.min(delay, maxDelayMs)
    }
  }
}

/**
 * Add random jitter on top of another policy's delay: `delay + floor(random()
 * * delay * ratio)`, i.e. up to `ratio` extra. Matches the hub rate-limit
 * backoff behavior (exploration 0206) at the default `ratio` of 0.5. Passes
 * `null` (give up) through. `random` is injectable for deterministic tests.
 */
export function jittered(
  policy: RetryPolicy,
  ratio = 0.5,
  random: () => number = Math.random
): RetryPolicy {
  return {
    delayFor: (attempt) => {
      const delay = policy.delayFor(attempt)
      return delay === null ? null : delay + Math.floor(random() * delay * ratio)
    }
  }
}

/** Give up (return `null`) once `attempt` exceeds `maxAttempts`. */
export function limitAttempts(policy: RetryPolicy, maxAttempts: number): RetryPolicy {
  return {
    delayFor: (attempt) => (attempt > maxAttempts ? null : policy.delayFor(attempt))
  }
}
