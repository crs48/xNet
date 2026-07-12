/**
 * Single-flight promise memoization (exploration 0300).
 *
 * The one implementation of the "share the in-flight promise so concurrent
 * callers don't convoy the backend" pattern that had been independently
 * hand-rolled at several call sites (schema registry lazy loads, sqlite
 * adapter EXPLAIN diagnostics — explorations 0271/0276).
 *
 * The caller owns the map, so lifetime policy (instance field vs module
 * scope), size caps, and explicit invalidation stay at the call site.
 */

export interface SingleFlightOptions {
  /**
   * What happens to the map entry after the promise settles:
   *
   * - `'settled'` (default): the entry is removed once the promise settles —
   *   the map only ever holds in-flight work (dedupe, not a cache).
   * - `'keep'`: the entry stays after success, memoizing the result until the
   *   caller evicts it. Rejections are always removed, so a failure never
   *   poisons the key and the next caller retries.
   */
  retain?: 'settled' | 'keep'
}

/**
 * Return the in-flight promise for `key` if one exists; otherwise start
 * `fn()`, store its promise in `map`, and return it. Entry lifetime after
 * settling is controlled by {@link SingleFlightOptions.retain}.
 */
export function singleFlight<K, V>(
  map: Map<K, Promise<V>>,
  key: K,
  fn: () => Promise<V>,
  options: SingleFlightOptions = {}
): Promise<V> {
  const existing = map.get(key)
  if (existing) return existing

  const promise = fn()
  map.set(key, promise)

  // Only evict the entry if it is still ours — the call site may have
  // replaced or cleared it (e.g. explicit invalidation) in the meantime.
  const evict = (): void => {
    if (map.get(key) === promise) map.delete(key)
  }
  if ((options.retain ?? 'settled') === 'settled') {
    promise.then(evict, evict)
  } else {
    promise.then(undefined, evict)
  }

  return promise
}
