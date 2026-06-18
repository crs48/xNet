/**
 * Working-set prewarm (exploration 0204).
 *
 * Subscribes to the landing working set — recent pages, databases and
 * canvases — for the app's lifetime. Two effects:
 *  1. The queries start as early as the data bridge is ready (this mounts at
 *     provider level, before/with the first route), so the home route paints
 *     from a warm bridge cache instead of kicking the query on mount.
 *  2. Holding a live subscription keeps the cache entries from being evicted
 *     when a route unmounts, so switching tabs back to a list is instant.
 *
 * The bridge dedupes by query descriptor, so sharing the exact descriptor the
 * home route uses means no double fetch. Renders nothing.
 */
import { CanvasSchema, DatabaseSchema, PageSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'

const RECENT = { orderBy: { updatedAt: 'desc' as const }, limit: 50 }

export function WorkingSetPrewarm(): null {
  useQuery(PageSchema, RECENT)
  useQuery(DatabaseSchema, RECENT)
  useQuery(CanvasSchema, RECENT)
  return null
}
