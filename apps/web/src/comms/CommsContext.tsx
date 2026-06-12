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
  workspacePresenceRoomId,
  type Notifier,
  type PeerPresence,
  type RoomManager,
  type RoomSession,
  type UserCard
} from '@xnetjs/comms'
import { ProfileSchema, type NodeChangeEvent } from '@xnetjs/data'
import { useQuery, useXNet } from '@xnetjs/react'
import { useDataBridge } from '@xnetjs/react/internal'
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { tabFromPathname } from '../workbench/tabs'
import { userCardFrom } from './comms-utils'
import { useRoomSession } from './use-room-session'

/** Single-workspace deployments share one well-known roster room. */
export const WORKSPACE_ID = 'main'

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
  const profile = profiles?.[0] as unknown as Record<string, unknown> | undefined
  // Query snapshots preserve node identity (0163), so `profile` is a stable dep.
  return useMemo(() => userCardFrom(did, profile), [did, profile])
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

  const { session: workspaceSession, peers: workspacePeers } = useRoomSession(
    roomManager,
    workspacePresenceRoomId(WORKSPACE_ID)
  )
  useViewingBroadcast(workspaceSession)
  useNotifierFeed(notifier)

  const value = useMemo<CommsValue>(
    () => ({ me, roomManager, notifier, workspacePeers, workspaceSession }),
    [me, roomManager, notifier, workspacePeers, workspaceSession]
  )

  return <CommsContext.Provider value={value}>{children}</CommsContext.Provider>
}
