/**
 * Built-in sidebar row sources (exploration 0353).
 *
 * The nine navs' data, restated once each as rows of the one tree.
 * Documents keep manual order (a doc tree must not reshuffle when a
 * peer edits); channels and DMs sort by recency and bump on unread —
 * the type-scoped sort defaults that make chat and docs coexist in one
 * list without either feeling wrong.
 */
import {
  CanvasSchema,
  DashboardSchema,
  DatabaseSchema,
  MapSchema,
  PageSchema,
  SavedViewSchema
} from '@xnetjs/data'
import { isUnread } from '@xnetjs/comms'
import { useQuery } from '@xnetjs/react'
import { useMemo } from 'react'
import { channelLabel } from '../../comms/comms-utils'
import { useComms } from '../../comms/CommsContext'
import { useChannels, useInbox, useProfiles, displayName } from '../../comms/hooks'
import { useWorkbench, type TabNodeType } from '../state'
import type { SidebarRowModel, SidebarRowSource } from './contracts'
import { sidebarRegistry } from './registry'

const QUERY = { orderBy: { updatedAt: 'desc' as const }, limit: 200 }

interface DocShape {
  id: string
  title?: string
  updatedAt?: number
  sortKey?: string
  folder?: string | null
  space?: string | null
  tags?: string[]
}

/** Documents, databases, canvases, dashboards, maps — manual order. */
function useDocumentRows(): SidebarRowModel[] {
  const { data: pages } = useQuery(PageSchema, QUERY)
  const { data: databases } = useQuery(DatabaseSchema, QUERY)
  const { data: canvases } = useQuery(CanvasSchema, QUERY)
  const { data: dashboards } = useQuery(DashboardSchema, QUERY)
  const { data: maps } = useQuery(MapSchema, QUERY)

  return useMemo(() => {
    const groups: Array<[TabNodeType, DocShape[] | undefined | null]> = [
      ['page', pages as DocShape[] | undefined],
      ['database', databases as DocShape[] | undefined],
      ['canvas', canvases as DocShape[] | undefined],
      ['dashboard', dashboards as DocShape[] | undefined],
      ['map', maps as DocShape[] | undefined]
    ]
    const rows: SidebarRowModel[] = []
    for (const [nodeType, docs] of groups) {
      for (const doc of docs ?? []) {
        rows.push({
          id: doc.id,
          nodeType,
          title: doc.title?.trim() || 'Untitled',
          // Docs hold their place: a peer's edit must never reshuffle
          // the tree under the reader's cursor.
          sortPolicy: 'manual',
          sortKey: doc.sortKey ?? '',
          updatedAt: doc.updatedAt ?? 0,
          folder: doc.folder ?? null,
          space: doc.space ?? null,
          tags: doc.tags
        })
      }
    }
    return rows
  }, [pages, databases, canvases, dashboards, maps])
}

/** Channels and DMs — recency order, unread bump, mute-aware. */
function useChannelRows(): SidebarRowModel[] {
  const { channels } = useChannels()
  const { me } = useComms()
  const profiles = useProfiles()
  const { items, state } = useInbox()
  const mutedRowIds = useWorkbench((s) => s.mutedRowIds)

  return useMemo(() => {
    // Same unread rule the ChatsPanel uses, so badge parity is exact.
    const now = Date.now()
    const unreadFor = (channelId: string) =>
      items.filter((item) => item.contextId === channelId && isUnread(item, state, now)).length

    return channels.map((channel) => ({
      id: channel.id,
      nodeType: 'channel' as TabNodeType,
      title: channelLabel(channel, me.did, profiles),
      badge: unreadFor(channel.id),
      // Chat is the thing that just happened — recency, and unread
      // floats it up (unless muted; see effectiveBadge/shouldBump).
      sortPolicy: 'recency' as const,
      updatedAt: channel.updatedAt ?? channel.createdAt ?? 0,
      muted: mutedRowIds.includes(channel.id)
    }))
  }, [channels, me.did, profiles, items, state, mutedRowIds])
}

/** Workspace people — manual (alphabetical) order. */
function usePeopleRows(): SidebarRowModel[] {
  const profiles = useProfiles()
  return useMemo(
    () =>
      profiles.map((profile) => ({
        id: profile.did,
        nodeType: 'person' as TabNodeType,
        title: displayName(profile.did, profiles),
        sortPolicy: 'manual' as const,
        sortKey: displayName(profile.did, profiles).toLowerCase(),
        updatedAt: 0
      })),
    [profiles]
  )
}

/** Saved views — the Set primitive, as rows. */
function useSavedViewRows(): SidebarRowModel[] {
  const { data } = useQuery(SavedViewSchema, QUERY)
  return useMemo(
    () =>
      ((data ?? []) as DocShape[]).map((view) => ({
        id: view.id,
        nodeType: 'savedview' as TabNodeType,
        title: view.title?.trim() || 'Untitled view',
        sortPolicy: 'manual' as const,
        sortKey: view.sortKey ?? '',
        updatedAt: view.updatedAt ?? 0
      })),
    [data]
  )
}

export const documentsSource: SidebarRowSource = {
  id: 'documents',
  label: 'Documents',
  useRows: useDocumentRows
}

export const channelsSource: SidebarRowSource = {
  id: 'channels',
  label: 'Chats',
  useRows: useChannelRows
}

export const peopleSource: SidebarRowSource = {
  id: 'people',
  label: 'People',
  useRows: usePeopleRows
}

export const savedViewsSource: SidebarRowSource = {
  id: 'saved-views',
  label: 'Views',
  useRows: useSavedViewRows
}

/**
 * The built-in lenses. `all` is the mixed projection (chat above docs
 * by policy, never interleaved arbitrarily); the rest are type-scoped.
 */
export function registerBuiltinSidebarSources(): void {
  if (sidebarRegistry.hasSource('documents')) return

  sidebarRegistry.registerSource(documentsSource)
  sidebarRegistry.registerSource(channelsSource)
  sidebarRegistry.registerSource(peopleSource)
  sidebarRegistry.registerSource(savedViewsSource)

  sidebarRegistry.registerLens({ id: 'all', label: 'All', sources: [] })
  sidebarRegistry.registerLens({
    id: 'docs',
    label: 'Docs',
    sources: ['documents'],
    sortPolicy: 'manual'
  })
  sidebarRegistry.registerLens({
    id: 'chats',
    label: 'Chats',
    sources: ['channels'],
    sortPolicy: 'recency'
  })
  sidebarRegistry.registerLens({ id: 'people', label: 'People', sources: ['people'] })
  sidebarRegistry.registerLens({ id: 'views', label: 'Views', sources: ['saved-views'] })
}
