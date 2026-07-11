/**
 * ChannelView — the channel tab surface (0198): a richer header (kind glyph,
 * name, editable topic, a live presence avatar stack + member count, and a
 * members popover) above the shared ChannelChat.
 */
import { rosterUsers, type UserCard } from '@xnetjs/comms'
import { ChannelSchema } from '@xnetjs/data'
import { useMutate, useQuery } from '@xnetjs/react'
import { cn, Popover } from '@xnetjs/ui'
import { Hash, MessageCircle, Rows2, Rows3, Users, Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ShareButton } from '../components/ShareButton'
import { CallControls } from './CallDock'
import { ChannelChat } from './ChannelChat'
import { useChatDensity } from './chat-prefs'
import { ChatAvatar } from './ChatAvatar'
import { channelHeaderModel } from './comms-utils'
import { useComms } from './CommsContext'
import {
  displayName,
  useChannelShareSync,
  useProfiles,
  useRoomPresence,
  type ProfileEntry
} from './hooks'

const KIND_ICONS = { channel: Hash, dm: MessageCircle, voice: Volume2 } as const

function DensityToggle() {
  const [density, setDensity] = useChatDensity()
  const compact = density === 'compact'
  return (
    <button
      type="button"
      title={compact ? 'Comfortable density' : 'Compact density'}
      aria-label={compact ? 'Switch to comfortable density' : 'Switch to compact density'}
      aria-pressed={compact}
      onClick={() => setDensity(compact ? 'comfortable' : 'compact')}
      className="flex h-7 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink-1"
    >
      {compact ? <Rows3 size={14} strokeWidth={1.5} /> : <Rows2 size={14} strokeWidth={1.5} />}
    </button>
  )
}

function EditableTopic({ channelId, topic }: { channelId: string; topic?: string }) {
  const { update } = useMutate()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(topic ?? '')
  useEffect(() => setValue(topic ?? ''), [topic])

  const save = () => {
    void update(ChannelSchema, channelId, { topic: value.trim() })
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        placeholder="Add a topic"
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === 'Enter') save()
          if (event.key === 'Escape') {
            setValue(topic ?? '')
            setEditing(false)
          }
        }}
        className="min-w-0 flex-1 rounded border border-border-emphasis bg-surface-0 px-1.5 py-0.5 text-[11px] text-ink-1 outline-none"
      />
    )
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="min-w-0 truncate text-left text-[11px] text-ink-3 hover:text-ink-1"
      title="Edit topic"
    >
      {topic?.trim() || 'Add a topic'}
    </button>
  )
}

function MembersButton({
  roster,
  memberCount,
  profiles
}: {
  roster: UserCard[]
  memberCount: number
  profiles: ProfileEntry[]
}) {
  if (roster.length === 0 && memberCount === 0) return null
  const trigger = (
    <button
      type="button"
      aria-label="Members"
      className="flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-surface-2"
    >
      <span className="flex -space-x-1.5">
        {roster.slice(0, 4).map((user) => (
          <ChatAvatar
            key={user.did}
            did={user.did}
            src={user.avatar}
            size={22}
            status="active"
            showPresence
            className="ring-2 ring-surface-0"
          />
        ))}
      </span>
      {memberCount > 0 && (
        <span className="ml-1 flex items-center gap-0.5 text-[11px] text-ink-3">
          <Users size={11} strokeWidth={1.5} />
          {memberCount}
        </span>
      )}
    </button>
  )
  return (
    <Popover trigger={trigger} side="bottom" align="end" className="w-52 p-2">
      <div className="flex flex-col gap-0.5">
        <span className="px-1 pb-1 text-[10px] uppercase tracking-wider text-ink-3">
          Here now · {roster.length}
        </span>
        {roster.length === 0 && (
          <span className="px-1 py-1 text-xs text-ink-3">No one else here</span>
        )}
        {roster.map((user) => (
          <div
            key={user.did}
            className="flex items-center gap-2 rounded px-1 py-1 text-xs text-ink-1"
          >
            <ChatAvatar did={user.did} src={user.avatar} size={20} status="active" showPresence />
            <span className="truncate">{displayName(user.did, profiles)}</span>
          </div>
        ))}
      </div>
    </Popover>
  )
}

export function ChannelView({ channelId }: { channelId: string }) {
  const { me } = useComms()
  // Receive a shared channel's node, history, and member profiles (0298).
  useChannelShareSync(channelId)
  const profiles = useProfiles()
  const { peers } = useRoomPresence(channelId)
  const { data: channel } = useQuery(ChannelSchema, channelId)
  const record = channel as Record<string, unknown> | null
  const header = channelHeaderModel(record, me.did, profiles)
  const Icon = KIND_ICONS[header.kind as keyof typeof KIND_ICONS] ?? Hash
  const roster = rosterUsers(peers).filter((user) => user.did !== me.did)
  const memberCount = (record?.members as string[] | undefined)?.length ?? 0

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-0">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-hairline px-3">
        <Icon size={15} strokeWidth={1.5} className="shrink-0 text-ink-3" />
        <span className={cn('shrink-0 truncate text-sm font-semibold text-ink-1')}>
          {header.label}
        </span>
        <span className="h-4 w-px shrink-0 bg-hairline" />
        <EditableTopic channelId={channelId} topic={header.topic} />
        <div className="min-w-0 flex-1" />
        <MembersButton roster={roster} memberCount={memberCount} profiles={profiles} />
        <ShareButton docId={channelId} docType="channel" />
        <DensityToggle />
        <CallControls roomId={channelId} autoJoinVoice={header.kind === 'voice'} />
      </header>
      <div className="min-h-0 flex-1">
        <ChannelChat channelId={channelId} />
      </div>
    </div>
  )
}
