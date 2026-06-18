/**
 * OPFS sync-access-handle contention retry (exploration 0204 follow-up).
 *
 * The OPFS-SAHPool VFS acquires an exclusive sync access handle for each
 * database file at install time. On a page RELOAD the new worker can start
 * before the previous worker has released its handles, so
 * `installOpfsSAHPoolVfs` rejects with `NoModificationAllowedError`
 * ("Access Handles cannot be created if there is another open Access Handle
 * or Writable stream associated with the same file.").
 *
 * The web adapter used to catch this once and silently fall back to an
 * in-memory database — so nothing persisted across reloads and the UI showed
 * no data until the hub re-synced (the real cause of "renders only once the
 * dot goes green"). Retrying a few times with a short backoff lets the
 * previous worker release its handles and keeps the database on durable OPFS.
 */

/**
 * Whether an error is the OPFS exclusive-access-handle contention error —
 * i.e. another (usually just-closed) worker/tab still holds the file handles.
 * Other open failures (OPFS unsupported, private window, quota) are NOT this
 * and must fall through immediately rather than retry.
 */
export function isOpfsLockError(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null | undefined
  if (!e) return false
  if (e.name === 'NoModificationAllowedError') return true
  return /Access Handles cannot be created|createSyncAccessHandle/i.test(e.message ?? '')
}

export interface OpfsLockRetryOptions {
  /** Total attempts including the first (default 5). */
  attempts?: number
  /** Base backoff; attempt N waits baseDelayMs * N (default 150ms → 150/300/450/600). */
  baseDelayMs?: number
  /** Injectable sleep (tests pass a no-op). Defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>
  /** Called before each retry (not before the first attempt). */
  onRetry?: (attempt: number, err: unknown) => void
}

/**
 * Run `fn`, retrying only on the OPFS lock error with linear backoff. Any
 * other error is rethrown immediately (so unsupported/private-window cases
 * still fall back fast). The last error is rethrown once attempts are spent.
 */
export async function withOpfsLockRetry<T>(
  fn: () => Promise<T>,
  options: OpfsLockRetryOptions = {}
): Promise<T> {
  const attempts = options.attempts ?? 5
  const baseDelayMs = options.baseDelayMs ?? 150
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))

  let lastErr: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isOpfsLockError(err) || attempt === attempts) throw err
      options.onRetry?.(attempt, err)
      await sleep(baseDelayMs * attempt)
    }
  }
  throw lastErr
}
