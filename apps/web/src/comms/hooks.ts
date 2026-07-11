/**
 * Comms hooks — presence rooms, chat data, and the inbox (0167/0168).
 */
import {
  channelHistoryQuery,
  compareMessages,
  deriveBadges,
  withAckedMention,
  withTriage,
  withWatermark,
  type BadgeCounts,
  type InboxItem,
  type InboxStateData,
  type PeerPresence,
  type RoomSession
} from '@xnetjs/comms'
import {
  ChannelSchema,
  ChatMessageSchema,
  InboxStateSchema,
  ProfileSchema,
  WorkspaceSchema,
  inboxStateNodeId,
  profileNodeId,
  type InboxItemTriage
} from '@xnetjs/data'
import { channelShareRoom, useQuery, useXNet, workspaceShareRoom } from '@xnetjs/react'
import { useDataBridge } from '@xnetjs/react/internal'
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { dedupeProfiles, displayName, type ProfileEntry } from './comms-utils'
import { useComms } from './CommsContext'
import { useRoomSession } from './use-room-session'

export { displayName, type ProfileEntry }

/**
 * Subscribe (receive-only) to a channel's share room while mounted so a
 * shared channel's node, messages, and member profiles sync into the local
 * store (exploration 0298). Harmless for channels you own — the hub only
 * fans grant-covered content into the room, and applies are idempotent.
 */
export function useChannelShareSync(channelId: string | null): void {
  const { syncManager } = useXNet()
  useEffect(() => {
    if (!channelId || !syncManager) return
    const room = channelShareRoom(channelId)
    syncManager.subscribeShareRoom(room)
    return () => syncManager.unsubscribeShareRoom(room)
  }, [channelId, syncManager])
}

/**
 * Keep a grantee's shared channels and workspaces receiving edits across
 * reloads (exploration 0298 follow-up). A channel/workspace view subscribes to
 * its share room only while open; this subscribes to the share rooms for every
 * channel/workspace that was shared *to* me (not authored by me) for as long as
 * the app is running — so new messages and bench edits arrive even when the
 * view is closed. Own channels sync via the author room and are skipped;
 * workspaces have no `createdBy`, so all are subscribed (there are few, and the
 * hub only fans grant-covered content in — applies are idempotent by hash).
 * Refcounted with the per-view subscriptions in the sync manager.
 */
export function useSharedRoomBootSync(): void {
  const { syncManager, authorDID } = useXNet()
  const { data: channels } = useQuery(ChannelSchema)
  const { data: workspaces } = useQuery(WorkspaceSchema)

  const rooms = useMemo(() => {
    const list: string[] = []
    for (const c of channels ?? []) {
      if (c.createdBy && c.createdBy === authorDID) continue
      if (typeof c.id === 'string') list.push(channelShareRoom(c.id))
    }
    for (const w of workspaces ?? []) {
      if (w.createdBy && w.createdBy === authorDID) continue
      if (typeof w.id === 'string') list.push(workspaceShareRoom(w.id))
    }
    return [...new Set(list)]
  }, [channels, workspaces, authorDID])

  useEffect(() => {
    if (!syncManager) return
    for (const room of rooms) syncManager.subscribeShareRoom(room)
    return () => {
      for (const room of rooms) syncManager.unsubscribeShareRoom(room)
    }
  }, [syncManager, rooms])
}

// ─── Presence ────────────────────────────────────────────────────────────────

export interface RoomPresenceResult {
  peers: PeerPresence[]
  session: RoomSession | null
}

/** Join the presence room for a node while mounted. */
export function useRoomPresence(nodeId: string | null): RoomPresenceResult {
  const { roomManager } = useComms()
  return useRoomSession(roomManager, nodeId)
}

// ─── Profiles ────────────────────────────────────────────────────────────────

/** All known profiles, deduped by DID (newest wins). */
export function useProfiles(): ProfileEntry[] {
  const { data } = useQuery(ProfileSchema, { orderBy: { createdAt: 'desc' } })
  return useMemo(
    () => dedupeProfiles(data as unknown as Array<Record<string, unknown>> | null),
    [data]
  )
}

// Profile acquisitions already requested this session — module-level so every
// surface shares one in-flight set and a missing profile is asked for once.
const requestedProfileNodes = new Set<string>()

/**
 * Make sure a Profile is present (or being fetched) for each DID. Authors in
 * shared contexts are only DIDs on `createdBy`; their canonical profile node
 * is acquired from the hub by its deterministic `profileNodeId` — profile
 * rooms are readable by any authenticated peer (hub-published identity).
 */
export function useEnsureProfiles(dids: ReadonlyArray<string | undefined | null>): void {
  const { syncManager } = useXNet()
  const profiles = useProfiles()
  const key = useMemo(
    () =>
      [...new Set(dids.filter((d): d is string => Boolean(d?.startsWith('did:'))))]
        .sort()
        .join(' '),
    [dids]
  )
  useEffect(() => {
    if (!syncManager || !key) return
    for (const did of key.split(' ')) {
      if (profiles.some((p) => p.did === did)) continue
      const nodeId = profileNodeId(did)
      if (requestedProfileNodes.has(nodeId)) continue
      requestedProfileNodes.add(nodeId)
      void Promise.resolve(syncManager.acquire(nodeId)).catch(() => {
        // Allow a retry on the next render burst (e.g. hub reconnect).
        requestedProfileNodes.delete(nodeId)
      })
    }
  }, [syncManager, key, profiles])
}

// ─── Chat data ───────────────────────────────────────────────────────────────

export function useChannelMessages(channelId: string, limit = 100) {
  const { data, loading } = useQuery(ChatMessageSchema, channelHistoryQuery(channelId, limit))
  const messages = useMemo(() => {
    return [...(data ?? [])].sort(compareMessages)
  }, [data])
  return { messages, loading }
}

export function useChannels() {
  const { data, loading } = useQuery(ChannelSchema, { orderBy: { createdAt: 'asc' } })
  const channels = useMemo(() => (data ?? []).filter((c) => c.archived !== true), [data])
  return { channels, loading }
}

// ─── Inbox ───────────────────────────────────────────────────────────────────

export interface InboxApi {
  items: InboxItem[]
  state: InboxStateData
  badges: BadgeCounts
  markDone: (sourceId: string) => Promise<void>
  saveItem: (sourceId: string) => Promise<void>
  snooze: (sourceId: string, untilMs: number) => Promise<void>
  ackMention: (sourceId: string) => Promise<void>
  markChannelRead: (channelId: string, at: number, nodeId?: string) => Promise<void>
}

function asStateData(node: Record<string, unknown> | null | undefined): InboxStateData {
  if (!node) return {}
  return {
    watermarks: node.watermarks as InboxStateData['watermarks'],
    ackedMentions: node.ackedMentions as InboxStateData['ackedMentions'],
    items: node.items as InboxStateData['items'],
    prefs: node.prefs as InboxStateData['prefs']
  }
}

export function useInbox(): InboxApi {
  const { notifier, me } = useComms()
  const bridge = useDataBridge()
  const stateId = inboxStateNodeId(me.did)

  const items = useSyncExternalStore(notifier.subscribe, notifier.getItems, notifier.getItems)
  const { data: stateNode } = useQuery(InboxStateSchema, stateId)
  const state = useMemo(() => asStateData(stateNode as Record<string, unknown> | null), [stateNode])

  const badges = useMemo(() => deriveBadges(items, state, Date.now()), [items, state])

  const write = useCallback(
    async (fields: Record<string, unknown>) => {
      if (!bridge) return
      if (stateNode) {
        await bridge.update(stateId, fields)
        return
      }
      await bridge.create(
        InboxStateSchema,
        { owner: me.did as `did:key:${string}`, ...fields },
        stateId
      )
    },
    [bridge, stateNode, stateId, me.did]
  )

  const setTriage = useCallback(
    (sourceId: string, triage: InboxItemTriage | null) =>
      write(withTriage(state, sourceId, triage)),
    [write, state]
  )

  return {
    items,
    state,
    badges,
    markDone: useCallback((sourceId) => setTriage(sourceId, { state: 'done' }), [setTriage]),
    saveItem: useCallback((sourceId) => setTriage(sourceId, { state: 'saved' }), [setTriage]),
    snooze: useCallback(
      (sourceId, untilMs) => setTriage(sourceId, { snoozedUntil: untilMs }),
      [setTriage]
    ),
    ackMention: useCallback((sourceId) => write(withAckedMention(state, sourceId)), [write, state]),
    markChannelRead: useCallback(
      (channelId, at, nodeId) => write(withWatermark(state, channelId, at, nodeId)),
      [write, state]
    )
  }
}
