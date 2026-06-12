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
  inboxStateNodeId,
  type InboxItemTriage
} from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import { useDataBridge } from '@xnetjs/react/internal'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useComms } from './CommsContext'

// ─── Presence ────────────────────────────────────────────────────────────────

export interface RoomPresenceResult {
  peers: PeerPresence[]
  session: RoomSession | null
}

/** Join the presence room for a node while mounted. */
export function useRoomPresence(nodeId: string | null): RoomPresenceResult {
  const { roomManager } = useComms()
  const [session, setSession] = useState<RoomSession | null>(null)
  const [peers, setPeers] = useState<PeerPresence[]>([])

  useEffect(() => {
    if (!roomManager || !nodeId) return
    let active = true
    let joined: RoomSession | null = null
    let unsubscribe: (() => void) | null = null

    void roomManager.join(nodeId).then((s) => {
      if (!active) {
        s.leave()
        return
      }
      joined = s
      setSession(s)
      setPeers(s.getPeers())
      unsubscribe = s.onPeersChange(setPeers)
    })

    return () => {
      active = false
      unsubscribe?.()
      joined?.leave()
      setSession(null)
      setPeers([])
    }
  }, [roomManager, nodeId])

  return { peers, session }
}

// ─── Profiles ────────────────────────────────────────────────────────────────

export interface ProfileEntry {
  did: string
  name?: string
  avatar?: string
}

/** All known profiles, deduped by DID (newest wins). */
export function useProfiles(): ProfileEntry[] {
  const { data } = useQuery(ProfileSchema, { orderBy: { createdAt: 'desc' } })
  return useMemo(() => {
    const seen = new Map<string, ProfileEntry>()
    for (const profile of data ?? []) {
      const did = profile.did as string | undefined
      if (did && !seen.has(did)) {
        seen.set(did, {
          did,
          name: profile.displayName as string | undefined,
          avatar: profile.avatar as string | undefined
        })
      }
    }
    return [...seen.values()]
  }, [data])
}

/** Resolve a DID to a short human label. */
export function displayName(did: string, profiles: ProfileEntry[]): string {
  const profile = profiles.find((p) => p.did === did)
  return profile?.name?.trim() || `${did.slice(8, 14)}…`
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
