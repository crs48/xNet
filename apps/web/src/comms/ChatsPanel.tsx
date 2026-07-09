/**
 * ChatsPanel — Left Panel view listing channels, DMs, and voice rooms
 * (0167/0198). DM rows show the partner's avatar + live presence dot; rows with
 * unread mentions are emphasised. Voice-room occupancy and DM partner presence
 * come from the workspace roster; mention counts from the local notifier.
 */
import { useNavigate } from '@tanstack/react-router'
import {
  createChannel,
  ensureDmChannel,
  isUnread,
  peersInCall,
  type InboxItem,
  type InboxStateData,
  type PeerPresence,
  type PresenceStatus
} from '@xnetjs/comms'
import { useDataBridge } from '@xnetjs/react/internal'
import { cn, ActionDropdownItems, ActionMenuList, ContextMenu, Menu, type Action } from '@xnetjs/ui'
import {
  Archive,
  CheckCheck,
  Hash,
  MessageCircle,
  MoreHorizontal,
  Plus,
  SquareArrowOutUpRight,
  Volume2
} from 'lucide-react'
import { createElement, useMemo, useState, type ReactNode } from 'react'
import { ChatAvatar } from './ChatAvatar'
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
    <span className="rounded-full bg-destructive px-1.5 font-mono text-[10px] leading-4 text-surface-0">
      {count}
    </span>
  )
}

function OccupancyBadge({ count }: { count: number }) {
  if (count === 0) return null
  return <span className="font-mono text-[10px] text-success">◉ {count}</span>
}

function ChannelRow({
  leading,
  label,
  mentionCount,
  occupancy,
  onOpen,
  actions
}: {
  leading: ReactNode
  label: string
  mentionCount: number
  occupancy: number
  onOpen: () => void
  /** Right-click / kebab verbs for this channel (open, mark read, archive). */
  actions: Action[]
}) {
  const unread = mentionCount > 0
  return (
    <li>
      <ContextMenu className="contents" menu={<ActionMenuList actions={actions} />}>
        <div
          className={cn(
            'group flex w-full items-center gap-2 rounded px-2 py-1 text-xs hover:bg-surface-2 hover:text-ink-1',
            unread ? 'font-medium text-ink-1' : 'text-ink-2'
          )}
        >
          <button
            type="button"
            onClick={onOpen}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-left text-inherit"
          >
            <span className="flex w-[18px] shrink-0 items-center justify-center">{leading}</span>
            <span className="min-w-0 flex-1 truncate">{label}</span>
          </button>
          <OccupancyBadge count={occupancy} />
          <MentionBadge count={mentionCount} />
          <Menu
            align="start"
            trigger={
              <button
                type="button"
                title="Channel actions"
                aria-label="Channel actions"
                onClick={(event) => event.stopPropagation()}
                className="invisible shrink-0 cursor-pointer border-none bg-transparent p-0 text-ink-3 hover:text-ink-1 group-hover:visible"
              >
                <MoreHorizontal size={13} strokeWidth={1.5} />
              </button>
            }
          >
            <ActionDropdownItems actions={actions} />
          </Menu>
        </div>
      </ContextMenu>
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
            className="flex w-full cursor-pointer items-center gap-2 truncate rounded border-none bg-transparent px-2 py-1 text-left text-xs text-ink-2 hover:bg-surface-2"
          >
            <ChatAvatar did={profile.did} src={profile.avatar} size={18} />
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
  const bridge = useDataBridge()
  const { channels } = useChannels()
  const { items, state, markChannelRead } = useInbox()
  const { me, workspacePeers } = useComms()
  const profiles = useProfiles()
  const [creating, setCreating] = useState<'channel' | 'dm' | null>(null)

  const channelActions = (channel: ChannelEntry): Action[] => [
    {
      id: 'open',
      label: 'Open',
      icon: createElement(SquareArrowOutUpRight, { size: 14 }),
      run: () => void navigate({ to: '/channel/$channelId', params: { channelId: channel.id } })
    },
    {
      id: 'read',
      label: 'Mark as read',
      icon: createElement(CheckCheck, { size: 14 }),
      run: () => void markChannelRead(channel.id, Date.now())
    },
    { id: '---' },
    {
      id: 'archive',
      label: 'Archive',
      icon: createElement(Archive, { size: 14 }),
      run: () => void bridge?.update(channel.id, { archived: true })
    }
  ]

  const presenceByDid = useMemo(() => {
    const map = new Map<string, PresenceStatus>()
    for (const peer of workspacePeers as PeerPresence[]) {
      const did = peer.user?.did
      if (did) map.set(did, peer.status ?? 'active')
    }
    return map
  }, [workspacePeers])

  const groups = useMemo(() => {
    const list = channels as unknown as ChannelEntry[]
    return {
      channels: list.filter((c) => c.kind !== 'dm' && c.kind !== 'voice'),
      voice: list.filter((c) => c.kind === 'voice'),
      dms: list.filter((c) => c.kind === 'dm')
    }
  }, [channels])

  const leadingFor = (channel: ChannelEntry): ReactNode => {
    if (channel.kind === 'dm') {
      const partner = (channel.members ?? []).find((m) => m !== me.did)
      if (partner) {
        const profile = profiles.find((p) => p.did === partner)
        return (
          <ChatAvatar
            did={partner}
            src={profile?.avatar}
            size={18}
            status={presenceByDid.get(partner)}
            showPresence={presenceByDid.has(partner)}
          />
        )
      }
      return <MessageCircle size={13} strokeWidth={1.5} className="text-ink-3" />
    }
    const Icon = KIND_ICONS[channel.kind ?? 'channel'] ?? Hash
    return <Icon size={13} strokeWidth={1.5} className="text-ink-3" />
  }

  const rows = (list: ChannelEntry[]) =>
    list.map((channel) => (
      <ChannelRow
        key={channel.id}
        leading={leadingFor(channel)}
        label={channelLabel(channel, me.did, profiles)}
        mentionCount={unreadMentionCount(channel.id, items, state)}
        occupancy={peersInCall(workspacePeers, channel.id).length}
        onOpen={() =>
          void navigate({ to: '/channel/$channelId', params: { channelId: channel.id } })
        }
        actions={channelActions(channel)}
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
