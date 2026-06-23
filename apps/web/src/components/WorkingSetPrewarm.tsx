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
 * The bridge dedupes by query descriptor, so sharing the exact descriptor a
 * route uses means no double fetch. Renders nothing.
 *
 * 0212 broadened the set beyond docs (Page/Database/Canvas) to the other
 * primary list surfaces a user commonly lands on — Channels (chat) and Tasks —
 * since `startupTab` can open those and the original prewarm left them cold.
 * `updatedAt` is a node-system field, so ordering by it is valid for any
 * schema.
 */
import { CanvasSchema, ChannelSchema, DatabaseSchema, PageSchema, TaskSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import { useQueryTimer } from '../lib/read-path-probe'

const RECENT = { orderBy: { updatedAt: 'desc' as const }, limit: 50 }

export function WorkingSetPrewarm(): null {
  const pages = useQuery(PageSchema, RECENT)
  const databases = useQuery(DatabaseSchema, RECENT)
  const canvases = useQuery(CanvasSchema, RECENT)
  const channels = useQuery(ChannelSchema, RECENT)
  const tasks = useQuery(TaskSchema, RECENT)

  // Read-path timing for the prewarmed surfaces (gated behind xnet:boot:debug).
  useQueryTimer('prewarm:pages', pages.loading, pages.data?.length ?? 0)
  useQueryTimer('prewarm:databases', databases.loading, databases.data?.length ?? 0)
  useQueryTimer('prewarm:canvases', canvases.loading, canvases.data?.length ?? 0)
  useQueryTimer('prewarm:channels', channels.loading, channels.data?.length ?? 0)
  useQueryTimer('prewarm:tasks', tasks.loading, tasks.data?.length ?? 0)

  return null
}
