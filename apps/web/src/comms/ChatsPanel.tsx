/**
 * ChatsPanel — Left Panel view listing channels, DMs, and voice rooms
 * (0167). Unread mention counts come from the local notifier; voice-room
 * occupancy and DM partner presence come from the workspace roster.
 */
import { useNavigate } from '@tanstack/react-router'
import {
  createChannel,
  ensureDmChannel,
  isUnread,
  peersInCall,
  type InboxItem,
  type InboxStateData
} from '@xnetjs/comms'
import { useDataBridge } from '@xnetjs/react/internal'
import { Hash, MessageCircle, Plus, Volume2 } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { channelLabel, type ChannelEntry } from './comms-utils'
import { useComms } from './CommsContext'
import { useChannels, useInbox, useProfiles, displayName } from './hooks'

const KIND_ICONS: Record<string, typeof Hash> = {
  channel: Hash,
  dm: MessageCircle,
  voice: Volume2
}

function unreadMentionCount(channelId: string, items: InboxItem[], state: InboxStateData): number {
  const now = Date.now()
  return items.filter((i) => i.contextId === channelId && isUnread(i, state, now)).length
}

function MentionBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span className="rounded-full bg-ink-1 px-1.5 font-mono text-[10px] leading-4 text-surface-0">
      {count}
    </span>
  )
}

function OccupancyBadge({ count }: { count: number }) {
  if (count === 0) return null
  return <span className="font-mono text-[10px] text-ink-3">◉ {count}</span>
}

function ChannelRow({
  channel,
  label,
  mentionCount,
  occupancy,
  onOpen
}: {
  channel: ChannelEntry
  label: string
  mentionCount: number
  occupancy: number
  onOpen: () => void
}) {
  const Icon = KIND_ICONS[channel.kind ?? 'channel'] ?? Hash
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full cursor-pointer items-center gap-2 rounded border-none bg-transparent px-2 py-1 text-left text-xs text-ink-2 hover:bg-surface-2 hover:text-ink-1"
      >
        <Icon size={13} strokeWidth={1.5} className="shrink-0 text-ink-3" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <OccupancyBadge count={occupancy} />
        <MentionBadge count={mentionCount} />
      </button>
    </li>
  )
}

function NewChannelForm({ onDone }: { onDone: () => void }) {
  const bridge = useDataBridge()
  const [name, setName] = useState('')

  const submit = async () => {
    const trimmed = name.trim()
    if (!trimmed || !bridge) return
    await createChannel(bridge, { name: trimmed })
    setName('')
    onDone()
  }

  return (
    <div className="px-2 pb-2">
      <input
        autoFocus
        type="text"
        value={name}
        placeholder="channel name… (Enter)"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void submit()
          if (event.key === 'Escape') onDone()
        }}
        className="h-6 w-full rounded border border-hairline bg-surface-0 px-2 text-xs text-ink-1 outline-none placeholder:text-ink-3"
      />
    </div>
  )
}

function NewDmList({ onDone }: { onDone: () => void }) {
  const bridge = useDataBridge()
  const navigate = useNavigate()
  const profiles = useProfiles()
  const { me } = useComms()
  const candidates = profiles.filter((p) => p.did !== me.did)

  const open = async (did: string) => {
    if (!bridge) return
    const { channelId } = await ensureDmChannel(bridge, [me.did, did])
    onDone()
    void navigate({ to: '/channel/$channelId', params: { channelId } })
  }

  if (candidates.length === 0) {
    return <div className="px-2 pb-2 text-[11px] text-ink-3">No known profiles to DM yet.</div>
  }
  return (
    <ul className="m-0 list-none px-2 pb-2">
      {candidates.map((profile) => (
        <li key={profile.did}>
          <button
            type="button"
            onClick={() => void open(profile.did)}
            className="w-full cursor-pointer truncate rounded border-none bg-transparent px-2 py-1 text-left text-xs text-ink-2 hover:bg-surface-2"
          >
            {displayName(profile.did, profiles)}
          </button>
        </li>
      ))}
    </ul>
  )
}

function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-2 pb-1 pt-3">
      <span className="text-[10px] font-medium uppercase tracking-wider text-ink-3">{title}</span>
      {action}
    </div>
  )
}

function AddButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex cursor-pointer items-center border-none bg-transparent p-0.5 text-ink-3 hover:text-ink-1"
    >
      <Plus size={12} strokeWidth={1.5} />
    </button>
  )
}

export function ChatsPanel() {
  const navigate = useNavigate()
  const { channels } = useChannels()
  const { items, state } = useInbox()
  const { me, workspacePeers } = useComms()
  const profiles = useProfiles()
  const [creating, setCreating] = useState<'channel' | 'dm' | null>(null)

  const groups = useMemo(() => {
    const list = channels as unknown as ChannelEntry[]
    return {
      channels: list.filter((c) => c.kind !== 'dm' && c.kind !== 'voice'),
      voice: list.filter((c) => c.kind === 'voice'),
      dms: list.filter((c) => c.kind === 'dm')
    }
  }, [channels])

  const rows = (list: ChannelEntry[]) =>
    list.map((channel) => (
      <ChannelRow
        key={channel.id}
        channel={channel}
        label={channelLabel(channel, me.did, profiles)}
        mentionCount={unreadMentionCount(channel.id, items, state)}
        occupancy={peersInCall(workspacePeers, channel.id).length}
        onOpen={() =>
          void navigate({ to: '/channel/$channelId', params: { channelId: channel.id } })
        }
      />
    ))

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto pb-2">
      <SectionHeader
        title="Channels"
        action={<AddButton title="New channel" onClick={() => setCreating('channel')} />}
      />
      {creating === 'channel' && <NewChannelForm onDone={() => setCreating(null)} />}
      <ul className="m-0 list-none p-0 px-1">{rows(groups.channels)}</ul>

      <SectionHeader title="Voice rooms" />
      <ul className="m-0 list-none p-0 px-1">{rows(groups.voice)}</ul>

      <SectionHeader
        title="Direct messages"
        action={<AddButton title="New DM" onClick={() => setCreating('dm')} />}
      />
      {creating === 'dm' && <NewDmList onDone={() => setCreating(null)} />}
      <ul className="m-0 list-none p-0 px-1">{rows(groups.dms)}</ul>
    </div>
  )
}
