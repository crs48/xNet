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
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { tabFromPathname } from '../workbench/tabs'
import { userCardFrom } from './comms-utils'
import { useDesktopNotificationDelivery } from './desktop-notifications'
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

/**
 * Defer the workspace presence join until the main thread is idle (i.e. after
 * first paint). Presence acquisition warms a Y.Doc through the single SQLite
 * worker; running it during the initial landing-query burst let it head-of-line
 * block every read (exploration 0227). Presence is republished continuously, so
 * a one-tick delay is imperceptible. Falls back to a timer where
 * `requestIdleCallback` is unavailable.
 */
function useWorkspacePresenceReady(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') {
      setReady(true)
      return
    }
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (handle: number) => void
    }
    if (typeof win.requestIdleCallback === 'function') {
      const handle = win.requestIdleCallback(() => setReady(true), { timeout: 2000 })
      return () => win.cancelIdleCallback?.(handle)
    }
    const timer = setTimeout(() => setReady(true), 0)
    return () => clearTimeout(timer)
  }, [])
  return ready
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

  // Join workspace presence only after first paint (exploration 0227): passing
  // null until idle is a no-op join, so landing reads paint first.
  const presenceReady = useWorkspacePresenceReady()
  const { session: workspaceSession, peers: workspacePeers } = useRoomSession(
    roomManager,
    presenceReady ? workspacePresenceRoomId(WORKSPACE_ID) : null
  )
  useViewingBroadcast(workspaceSession)
  useNotifierFeed(notifier)
  useDesktopNotificationDelivery(notifier)

  const value = useMemo<CommsValue>(
    () => ({ me, roomManager, notifier, workspacePeers, workspaceSession }),
    [me, roomManager, notifier, workspacePeers, workspaceSession]
  )

  return <CommsContext.Provider value={value}>{children}</CommsContext.Provider>
}
