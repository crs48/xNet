/**
 * Linkable workspace nodes for the `[[` typeahead (exploration 0170).
 *
 * Mirrors the GlobalSearch quick-open queries (bounded, recency
 * ordered) and the workbench recents list for head-of-list ranking.
 * createPageTarget backs the popup's "Create page" row.
 */
import type { WikilinkTarget } from '@xnetjs/editor/react'
import {
  CanvasSchema,
  ChannelSchema,
  DashboardSchema,
  DatabaseSchema,
  PageSchema,
  SavedViewSchema
} from '@xnetjs/data'
import { useMutate, useQuery } from '@xnetjs/react'
import { useCallback, useMemo } from 'react'
import { useWorkbench } from '../workbench/state'
import { buildLinkTargets, linkableChannels } from './link-targets'

const LINKABLE_QUERY = { orderBy: { updatedAt: 'desc' as const }, limit: 200 }

export interface LinkTargetsApi {
  /** Linkable nodes, recents first */
  linkTargets: WikilinkTarget[]
  /** Create a page for the popup's create row; null when unusable */
  createPageTarget: (title: string) => Promise<WikilinkTarget | null>
}

export function useLinkTargets(): LinkTargetsApi {
  const { create } = useMutate()
  const recents = useWorkbench((state) => state.recents)
  const { data: pages } = useQuery(PageSchema, LINKABLE_QUERY)
  const { data: databases } = useQuery(DatabaseSchema, LINKABLE_QUERY)
  const { data: canvases } = useQuery(CanvasSchema, LINKABLE_QUERY)
  const { data: dashboards } = useQuery(DashboardSchema, LINKABLE_QUERY)
  const { data: savedViews } = useQuery(SavedViewSchema, LINKABLE_QUERY)
  const { data: channels } = useQuery(ChannelSchema, LINKABLE_QUERY)

  const linkTargets = useMemo(
    () =>
      buildLinkTargets(
        [
          { kind: 'page', docs: pages },
          { kind: 'database', docs: databases },
          { kind: 'canvas', docs: canvases },
          { kind: 'dashboard', docs: dashboards },
          { kind: 'savedview', docs: savedViews },
          { kind: 'channel', docs: linkableChannels(channels) }
        ],
        recents.map((recent) => recent.nodeId)
      ),
    [pages, databases, canvases, dashboards, savedViews, channels, recents]
  )

  const createPageTarget = useCallback(
    async (title: string): Promise<WikilinkTarget | null> => {
      const name = title.trim()
      if (!name) return null
      const page = await create(PageSchema, { title: name })
      return page ? { href: page.id, title: name, kind: 'page' } : null
    },
    [create]
  )

  return { linkTargets, createPageTarget }
}
