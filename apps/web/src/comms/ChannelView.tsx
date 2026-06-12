/**
 * ChannelView — the channel tab surface (0167): header with kind, roster
 * and call controls, then the shared ChannelChat.
 */
import { rosterUsers } from '@xnetjs/comms'
import { ChannelSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import { Hash, MessageCircle, Volume2 } from 'lucide-react'
import { CallControls } from './CallDock'
import { ChannelChat } from './ChannelChat'
import { channelHeaderModel } from './comms-utils'
import { useComms } from './CommsContext'
import { useProfiles, useRoomPresence, displayName } from './hooks'

const KIND_ICONS = { channel: Hash, dm: MessageCircle, voice: Volume2 } as const

function HeaderRoster({ channelId }: { channelId: string }) {
  const { peers } = useRoomPresence(channelId)
  const profiles = useProfiles()
  const users = rosterUsers(peers)
  if (users.length === 0) return null
  return (
    <span className="truncate text-[11px] text-ink-3">
      here: {users.map((u) => displayName(u.did, profiles)).join(', ')}
    </span>
  )
}

function HeaderTopic({ topic }: { topic?: string }) {
  if (!topic) return null
  return <span className="truncate text-[11px] text-ink-3">{topic}</span>
}

export function ChannelView({ channelId }: { channelId: string }) {
  const { me } = useComms()
  const profiles = useProfiles()
  const { data: channel } = useQuery(ChannelSchema, channelId)
  const header = channelHeaderModel(channel as Record<string, unknown> | null, me.did, profiles)
  const Icon = KIND_ICONS[header.kind as keyof typeof KIND_ICONS] ?? Hash

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-0">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-hairline px-3">
        <Icon size={14} strokeWidth={1.5} className="shrink-0 text-ink-3" />
        <span className="truncate text-sm font-medium text-ink-1">{header.label}</span>
        <HeaderTopic topic={header.topic} />
        <div className="min-w-0 flex-1" />
        <HeaderRoster channelId={channelId} />
        <CallControls roomId={channelId} autoJoinVoice={header.kind === 'voice'} />
      </header>
      <div className="min-h-0 flex-1">
        <ChannelChat channelId={channelId} />
      </div>
    </div>
  )
}
