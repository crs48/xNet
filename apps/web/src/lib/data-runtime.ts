/**
 * Data-runtime selection (worker-resident vs main-thread).
 *
 * Centralizes the rollout lever for exploration 0164/0182. The worker runtime
 * moves query execution, change signing, and invalidation off the UI thread.
 * It is implemented and flag-gated; flipping it on by default is a one-line
 * change to {@link DEFAULT_DATA_RUNTIME} once real-browser input-latency
 * telemetry confirms no regression on reload-heavy screens (feeds, authorized
 * lists).
 *
 * Override per device with `localStorage['xnet:runtime']`:
 * - `'worker'` — force the worker runtime (opt-in today)
 * - `'main'`   — force the main-thread runtime (kill switch once the default flips)
 * - anything else / unset — use {@link DEFAULT_DATA_RUNTIME}
 */

export type DataRuntime = 'worker' | 'main'

/**
 * The default runtime when the user has not pinned one. Stays `'main'` until
 * the worker runtime's real-browser latency telemetry is captured and the
 * pagination/auth reload tail (0182 Phases 6–7) is in place; then flip to
 * `'worker'` here for a progressive rollout.
 */
export const DEFAULT_DATA_RUNTIME: DataRuntime = 'main'

export const DATA_RUNTIME_STORAGE_KEY = 'xnet:runtime'

/**
 * Resolve the active runtime from a stored override, falling back to the
 * default. Pure so the rollout/kill-switch logic is trivially reviewable.
 */
export function resolveDataRuntime(
  stored: string | null | undefined,
  fallback: DataRuntime = DEFAULT_DATA_RUNTIME
): DataRuntime {
  if (stored === 'worker') return 'worker'
  if (stored === 'main') return 'main'
  return fallback
}

/** Read the active runtime from localStorage, tolerating restricted storage. */
export function getDataRuntime(): DataRuntime {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_DATA_RUNTIME
    return resolveDataRuntime(localStorage.getItem(DATA_RUNTIME_STORAGE_KEY))
  } catch {
    return DEFAULT_DATA_RUNTIME
  }
}

/** Whether the worker-resident data runtime is active. */
export function isWorkerRuntimeEnabled(): boolean {
  return getDataRuntime() === 'worker'
}
