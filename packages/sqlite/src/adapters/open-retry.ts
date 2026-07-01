/**
 * Web worker open()-timeout retry (exploration 0253).
 *
 * A cold `installOpfsSAHPoolVfs()` on a large DB file (the 318k-change body)
 * intermittently exceeds the per-attempt timeout — most often because a PRIOR
 * boot's open timed out and *leaked* a worker still holding the file's exclusive
 * OPFS sync access handle, so this boot's `createSyncAccessHandle()` blocks on the
 * contended handle. The proxy used to hard-fail on the first timeout ("App
 * initialization failed: Worker initialization timeout after 15s" → error screen).
 *
 * This retries with a *fresh* worker after terminating the stuck one (which frees
 * the handle), so the leaked-handle cascade — the actual intermittency — recovers
 * instead of failing. Bounded, so a genuinely broken/unavailable OPFS still fails
 * cleanly rather than hanging forever. Kept pure/injectable so the retry policy is
 * unit-testable without a real Worker.
 */

/** Handle to one open attempt: its promise, and a way to abandon its worker. */
export interface OpenAttempt {
  /** The worker's `open()` promise for this attempt. */
  readonly open: Promise<void>
  /**
   * Terminate this attempt's worker so it releases its OPFS sync access handle
   * *now* (a graceful close would queue behind the stuck open). Idempotent.
   */
  abandon(): void
}

export interface OpenTimeoutRetryOptions {
  /** Total attempts including the first (default 3). */
  maxAttempts?: number
  /** Per-attempt timeout before the worker is abandoned and retried (default 15000). */
  timeoutMs?: number
  /** Injectable backoff between attempts (tests pass a no-op). Defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>
  /** Called before each retry (not before the first attempt). */
  onRetry?: (attempt: number, err: unknown) => void
}

/**
 * Run `makeAttempt` up to `maxAttempts` times, racing each attempt's `open`
 * against a per-attempt timeout. On timeout (or any open failure) the attempt is
 * abandoned (its worker terminated → OPFS handle released) and, unless attempts
 * are exhausted, retried with a fresh attempt after a short backoff. The last
 * error is rethrown once attempts are spent.
 */
export async function openWithTimeoutRetry(
  makeAttempt: (attempt: number) => OpenAttempt,
  options: OpenTimeoutRetryOptions = {}
): Promise<void> {
  const maxAttempts = options.maxAttempts ?? 3
  const timeoutMs = options.timeoutMs ?? 15000
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const timeoutSeconds = Math.round(timeoutMs / 1000)

  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controls = makeAttempt(attempt)
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              `Worker initialization timeout after ${timeoutSeconds}s (attempt ${attempt}/${maxAttempts})`
            )
          ),
        timeoutMs
      )
    })

    try {
      await Promise.race([controls.open, timeout])
      return
    } catch (err) {
      lastErr = err
      controls.abandon()
      if (attempt >= maxAttempts) break
      options.onRetry?.(attempt, err)
      await sleep(250 * attempt)
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  throw lastErr
}
