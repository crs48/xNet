/**
 * Shared SQL batching helpers for the SQLite storage layer (exploration 0276).
 *
 * SQLite binds are capped per statement, and every distinct `VALUES (?,?),…`/
 * `IN (?,…)` arity is a distinct SQL string — a guaranteed miss in the
 * worker's prepared-statement cache (explorations 0263/0264). These helpers
 * keep id-list SQL inside the bind budget and collapse the statement-shape
 * space to a handful of cacheable arities.
 */

export const SQLITE_BIND_PARAMETER_BATCH_SIZE = 900
export const SQLITE_HYDRATE_NODE_BATCH_SIZE = Math.floor(SQLITE_BIND_PARAMETER_BATCH_SIZE / 2)

/**
 * Fixed arity buckets for id-list SQL (exploration 0264). Padding id lists up
 * to the nearest bucket with NULLs (which never join/match) collapses the
 * shape space to a handful of cacheable statements.
 */
export const SQL_HYDRATE_ARITY_BUCKETS = [1, 10, 50, 150, SQLITE_HYDRATE_NODE_BATCH_SIZE] as const
export const SQL_IN_ARITY_BUCKETS = [10, 50, 300, SQLITE_BIND_PARAMETER_BATCH_SIZE] as const

/** Pad `items` with NULLs up to the nearest arity bucket (see above). */
export function padToArityBucket<T>(
  items: readonly T[],
  buckets: readonly number[]
): ReadonlyArray<T | null> {
  const size = buckets.find((bucket) => bucket >= items.length) ?? items.length
  if (size === items.length) return items
  return [...items, ...Array<null>(size - items.length).fill(null)]
}

export function chunkItems<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}
