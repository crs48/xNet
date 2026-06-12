/**
 * RoomSection — contributes a "Room" section to the right Context Panel for
 * whatever node the active tab shows (0167): who's here now, plus the
 * node's persistent chat (a Channel with `target` = this node).
 *
 * Mounted once inside CommsProvider; publishes whenever the route maps to
 * a node-backed tab.
 */
import { useRouterState } from '@tanstack/react-router'
import { createChannel, rosterUsers, type UserCard } from '@xnetjs/comms'
import { ChannelSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import { useDataBridge } from '@xnetjs/react/internal'
import { useMemo } from 'react'
import { useContextPanel } from '../workbench/context-panel'
import { tabFromPathname } from '../workbench/tabs'
import { ChannelChat } from './ChannelChat'
import { useComms } from './CommsContext'
import { useProfiles, useRoomPresence, displayName } from './hooks'

function Avatar({ user }: { user: UserCard }) {
  const initial = (user.name?.trim() || user.did.slice(8, 9)).slice(0, 1).toUpperCase()
  return (
    <span
      title={user.name ?? user.did}
      className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium text-white"
      style={{ backgroundColor: user.color ?? '#888' }}
    >
      {initial}
    </span>
  )
}

function Roster({ nodeId }: { nodeId: string }) {
  const { peers } = useRoomPresence(nodeId)
  const profiles = useProfiles()
  const users = rosterUsers(peers)

  if (users.length === 0) {
    return <div className="px-3 py-2 text-[11px] text-ink-3">No one else is here right now.</div>
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
      {users.map((user) => (
        <span key={user.did} className="flex items-center gap-1">
          <Avatar user={user} />
          <span className="text-[11px] text-ink-2">{displayName(user.did, profiles)}</span>
        </span>
      ))}
    </div>
  )
}

function NodeChat({ nodeId }: { nodeId: string }) {
  const bridge = useDataBridge()
  const { data } = useQuery(ChannelSchema, { where: { target: nodeId } })
  const channel = data?.[0]

  if (!channel) {
    return (
      <div className="px-3 py-2">
        <button
          type="button"
          onClick={() => {
            if (bridge) void createChannel(bridge, { name: 'Document chat', target: nodeId })
          }}
          className="cursor-pointer rounded-md border border-hairline bg-surface-0 px-2 py-1 text-xs text-ink-2 hover:text-ink-1"
        >
          Start a chat on this document
        </button>
      </div>
    )
  }
  return <ChannelChat channelId={channel.id} />
}

function RoomContent({ nodeId }: { nodeId: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-hairline">
        <Roster nodeId={nodeId} />
      </div>
      <div className="min-h-0 flex-1">
        <NodeChat nodeId={nodeId} />
      </div>
    </div>
  )
}

const ROOMLESS_TABS = new Set(['tasks', 'data', 'channel'])

/** Singleton tabs host no room; channels have their own chat view. */
function roomNodeIdFor(pathname: string): string | null {
  const tab = tabFromPathname(pathname)
  if (!tab || ROOMLESS_TABS.has(tab.nodeType)) return null
  return tab.nodeId
}

export function RoomSection() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { workspacePeers } = useComms()
  const nodeId = roomNodeIdFor(pathname)

  const hereCount = useMemo(
    () => workspacePeers.filter((p) => nodeId && p.viewing === nodeId).length,
    [workspacePeers, nodeId]
  )

  const sections = useMemo(() => {
    if (!nodeId) return []
    return [
      {
        id: 'comms-room',
        title: 'Room',
        badge: hereCount > 0 ? hereCount : undefined,
        content: <RoomContent nodeId={nodeId} />
      }
    ]
  }, [nodeId, hereCount])

  useContextPanel('comms:room', sections)
  return null
}
