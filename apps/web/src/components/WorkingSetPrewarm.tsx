/**
 * Working-set prewarm (explorations 0204, 0212).
 *
 * Subscribes to the landing working set for the app's lifetime. Two effects:
 *  1. The queries start as early as the data bridge is ready (this mounts at
 *     provider level, before/with the first route), so a landing surface paints
 *     from a warm bridge cache instead of kicking the query on mount.
 *  2. Holding a live subscription keeps the cache entries from being evicted
 *     when a route unmounts, so switching tabs back to a list is instant.
 *
 * The bridge dedupes by query descriptor, so each prewarm query MUST use the
 * exact descriptor its real surface uses — otherwise it warms a cache key no
 * view reads (pure over-fetch) and the real query still misses on arrival.
 * Renders nothing.
 *
 * 0212 broadened the set beyond docs to the other primary list surfaces:
 *  - Page/Database/Canvas → the home route (`{orderBy:{updatedAt:'desc'},limit:50}`).
 *  - Channel → the channel sidebar `useChannels()` (`{orderBy:{createdAt:'asc'}}`).
 *  - Task → the `/tasks` route via `useTasks()` (`{}`).
 */
import { CanvasSchema, ChannelSchema, DatabaseSchema, PageSchema, TaskSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import { useQueryTimer } from '../lib/read-path-probe'

// Each descriptor mirrors the matching surface exactly so the bridge dedupes
// (see the route/hook cited above) — do not "tidy" these into one shape.
const RECENT = { orderBy: { updatedAt: 'desc' as const }, limit: 50 }
const CHANNELS = { orderBy: { createdAt: 'asc' as const } }
const TASKS = {}

/** Row count of a query result (the `?.`/`??` lives here, not inline ×5). */
const rowCount = (q: { data?: { length: number } | null }): number => q.data?.length ?? 0

export function WorkingSetPrewarm(): null {
  const pages = useQuery(PageSchema, RECENT)
  const databases = useQuery(DatabaseSchema, RECENT)
  const canvases = useQuery(CanvasSchema, RECENT)
  const channels = useQuery(ChannelSchema, CHANNELS)
  const tasks = useQuery(TaskSchema, TASKS)

  // Read-path timing for the prewarmed surfaces (gated behind xnet:boot:debug).
  useQueryTimer('prewarm:pages', pages.loading, rowCount(pages))
  useQueryTimer('prewarm:databases', databases.loading, rowCount(databases))
  useQueryTimer('prewarm:canvases', canvases.loading, rowCount(canvases))
  useQueryTimer('prewarm:channels', channels.loading, rowCount(channels))
  useQueryTimer('prewarm:tasks', tasks.loading, rowCount(tasks))

  return null
}
