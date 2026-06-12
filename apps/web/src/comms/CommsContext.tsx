/**
 * CommsProvider — wires @xnetjs/comms into the workbench (0167/0168).
 *
 * Owns the singletons: a RoomManager over the SyncManager's awareness, the
 * workspace presence session (roster + "viewing" broadcast), and the
 * notifier fed by every change the DataBridge applies. Mounted once in the
 * root route so calls/presence survive navigation.
 */
import { useRouterState } from '@tanstack/react-router'
import {
  createNotifier,
  createRoomManager,
  type Notifier,
  type PeerPresence,
  type RoomManager,
  type RoomSession,
  type UserCard
} from '@xnetjs/comms'
import { ProfileSchema, type NodeChangeEvent } from '@xnetjs/data'
import { useQuery, useXNet } from '@xnetjs/react'
import { useDataBridge } from '@xnetjs/react/internal'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { tabFromPathname } from '../workbench/tabs'

/** Single-workspace deployments share one well-known roster room. */
export const WORKSPACE_ID = 'main'

const USER_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4']

function colorForDid(did: string): string {
  const hash = did.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return USER_COLORS[hash % USER_COLORS.length]
}

export interface CommsValue {
  me: UserCard
  roomManager: RoomManager | null
  notifier: Notifier
  /** Live workspace roster (remote peers) */
  workspacePeers: PeerPresence[]
  /** The workspace presence session (null until joined) */
  workspaceSession: RoomSession | null
}

const CommsContext = createContext<CommsValue | null>(null)

export function useComms(): CommsValue {
  const value = useContext(CommsContext)
  if (!value) throw new Error('useComms must be used within CommsProvider')
  return value
}

/** Null-safe variant for surfaces that render outside the provider. */
export function useCommsMaybe(): CommsValue | null {
  return useContext(CommsContext)
}

function useMe(): UserCard {
  const { authorDID } = useXNet()
  const did = authorDID ?? 'did:key:zanonymous'
  const { data: profiles } = useQuery(ProfileSchema, {
    where: { did: did as `did:key:${string}` }
  })
  const profile = profiles?.[0]
  return useMemo(
    () => ({
      did,
      name: (profile?.displayName as string | undefined) ?? undefined,
      avatar: (profile?.avatar as string | undefined) ?? undefined,
      color: colorForDid(did)
    }),
    [did, profile?.displayName, profile?.avatar]
  )
}

function useWorkspaceRoom(roomManager: RoomManager | null): {
  session: RoomSession | null
  peers: PeerPresence[]
} {
  const [session, setSession] = useState<RoomSession | null>(null)
  const [peers, setPeers] = useState<PeerPresence[]>([])

  useEffect(() => {
    if (!roomManager) return
    let active = true
    let joined: RoomSession | null = null
    let unsubscribe: (() => void) | null = null

    void roomManager.joinWorkspace(WORKSPACE_ID).then((s) => {
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
  }, [roomManager])

  return { session, peers }
}

/** Broadcast which node the user is viewing (drives "2 here" chips). */
function useViewingBroadcast(session: RoomSession | null): void {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  useEffect(() => {
    if (!session) return
    session.update({ viewing: tabFromPathname(pathname)?.nodeId ?? undefined })
  }, [session, pathname])
}

function useNotifierFeed(notifier: Notifier): void {
  const bridge = useDataBridge()
  useEffect(() => {
    return bridge?.subscribeToChanges?.((event: NodeChangeEvent) => {
      notifier.handleEvent({
        change: { authorDID: event.change.authorDID, wallTime: event.change.wallTime },
        node: event.node as Record<string, unknown> | null,
        previousNode: event.previousNode as Record<string, unknown> | null
      })
    })
  }, [bridge, notifier])
}

export function CommsProvider({ children }: { children: ReactNode }) {
  const { syncManager, authorDID } = useXNet()
  const me = useMe()

  const roomManager = useMemo(() => {
    if (!syncManager) return null
    return createRoomManager(syncManager, me)
    // Recreate only when identity facts change; sessions re-announce on join.
  }, [syncManager, me])

  const notifier = useMemo(() => createNotifier({ me: authorDID ?? '' }), [authorDID])

  const { session: workspaceSession, peers: workspacePeers } = useWorkspaceRoom(roomManager)
  useViewingBroadcast(workspaceSession)
  useNotifierFeed(notifier)

  const value = useMemo<CommsValue>(
    () => ({ me, roomManager, notifier, workspacePeers, workspaceSession }),
    [me, roomManager, notifier, workspacePeers, workspaceSession]
  )

  return <CommsContext.Provider value={value}>{children}</CommsContext.Provider>
}
