/**
 * InboxTray — the notification center (0168), rendered inside the bottom
 * panel's Notifications view. GitHub-grade triage: machine-readable reason
 * chips as filters, unread state from the user-owned InboxState, done /
 * snooze / ack actions, and deep links into the source.
 */
import { useNavigate } from '@tanstack/react-router'
import { isUnread, type InboxItem, type NotificationReason } from '@xnetjs/comms'
import { Bell, Check, Clock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { desktopNotificationPermission, enableDesktopNotifications } from './desktop-notifications'
import { useInbox, useProfiles, displayName } from './hooks'

const REASON_LABELS: Partial<Record<NotificationReason, string>> = {
  mention: 'mention',
  'room-mention': '@room',
  dm: 'dm',
  assigned: 'assigned',
  reply: 'reply',
  comment: 'comment',
  keyword: 'keyword',
  'call-missed': 'missed call',
  system: 'system'
}

const FILTERS: Array<{ id: 'all' | NotificationReason; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'mention', label: 'Mentions' },
  { id: 'dm', label: 'DMs' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'reply', label: 'Replies' },
  { id: 'comment', label: 'Comments' }
]

const CHAT_SCHEMA = 'xnet://xnet.fyi/ChatMessage@1.0.0'
const SNOOZE_MS = 60 * 60 * 1000

function itemRoute(item: InboxItem): { to: string; params: Record<string, string> } | null {
  if (!item.contextId) return null
  if (item.schemaId === CHAT_SCHEMA) {
    return { to: '/channel/$channelId', params: { channelId: item.contextId } }
  }
  return { to: '/doc/$docId', params: { docId: item.contextId } }
}

function timeAgo(at: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60000))
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`
}

function ReasonChip({ reason }: { reason: NotificationReason }) {
  return (
    <span className="shrink-0 rounded-full border border-hairline px-1.5 text-[10px] text-ink-3">
      {REASON_LABELS[reason] ?? reason}
    </span>
  )
}

function FilterRow({
  active,
  onSelect
}: {
  active: string
  onSelect: (id: 'all' | NotificationReason) => void
}) {
  return (
    <div className="flex items-center gap-2 border-b border-hairline px-3 py-1.5">
      {FILTERS.map((filter) => (
        <button
          key={filter.id}
          type="button"
          onClick={() => onSelect(filter.id)}
          className={`cursor-pointer border-none bg-transparent p-0 text-[11px] ${
            active === filter.id ? 'font-medium text-ink-1' : 'text-ink-3 hover:text-ink-2'
          }`}
        >
          {filter.label}
        </button>
      ))}
    </div>
  )
}

/**
 * One-time desktop-alerts opt-in (0172). Only rendered while the browser
 * permission is still undecided; the grant also re-requests durable
 * storage (a Chromium important-site signal — see desktop-notifications).
 */
function DesktopAlertsOptIn() {
  const [permission, setPermission] = useState(desktopNotificationPermission)
  const [requesting, setRequesting] = useState(false)

  if (permission !== 'default') return null

  const enable = async () => {
    setRequesting(true)
    try {
      setPermission(await enableDesktopNotifications())
    } finally {
      setRequesting(false)
    }
  }

  return (
    <div className="flex items-center gap-2 border-b border-hairline px-3 py-1.5">
      <Bell size={12} strokeWidth={1.5} className="shrink-0 text-ink-3" />
      <span className="min-w-0 flex-1 truncate text-[11px] text-ink-3">
        Get desktop alerts for mentions and DMs — also lets this browser keep xNet data durable.
      </span>
      <button
        type="button"
        onClick={() => void enable()}
        disabled={requesting}
        className="shrink-0 cursor-pointer rounded border border-hairline bg-transparent px-1.5 py-0.5 text-[11px] text-ink-2 hover:text-ink-1 disabled:cursor-wait disabled:opacity-60"
      >
        {requesting ? 'Asking…' : 'Enable'}
      </button>
    </div>
  )
}

export function InboxTray() {
  const navigate = useNavigate()
  const profiles = useProfiles()
  const { items, state, markDone, snooze, ackMention } = useInbox()
  const [filter, setFilter] = useState<'all' | NotificationReason>('all')

  const visible = useMemo(() => {
    const now = Date.now()
    return items
      .filter((item) => filter === 'all' || item.reason === filter)
      .map((item) => ({ item, unread: isUnread(item, state, now) }))
      .filter(({ item, unread }) => unread || state.items?.[item.sourceId]?.state === 'saved')
  }, [items, state, filter])

  const open = (item: InboxItem) => {
    void ackMention(item.sourceId)
    const route = itemRoute(item)
    if (route) void navigate({ to: route.to, params: route.params })
  }

  if (items.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <DesktopAlertsOptIn />
        <div className="flex flex-1 items-center justify-center text-xs text-ink-3">
          Mentions, DMs, replies, and assignments will appear here.
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DesktopAlertsOptIn />
      <FilterRow active={filter} onSelect={setFilter} />
      {visible.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-xs text-ink-3">
          Inbox zero — nothing unread.
        </div>
      ) : (
        <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
          {visible.map(({ item }) => (
            <li
              key={item.sourceId}
              className="group flex items-center gap-2 border-b border-hairline px-3 py-1.5 hover:bg-surface-2/50"
            >
              <ReasonChip reason={item.reason} />
              <button
                type="button"
                onClick={() => open(item)}
                className="flex min-w-0 flex-1 cursor-pointer items-baseline gap-2 border-none bg-transparent p-0 text-left"
              >
                <span className="shrink-0 text-xs font-medium text-ink-1">
                  {displayName(item.actor, profiles)}
                </span>
                <span className="min-w-0 truncate text-xs text-ink-2">{item.preview}</span>
              </button>
              <span className="shrink-0 font-mono text-[10px] text-ink-3">{timeAgo(item.at)}</span>
              <span className="hidden shrink-0 items-center gap-1 group-hover:flex">
                <button
                  type="button"
                  title="Snooze 1h"
                  aria-label="Snooze 1 hour"
                  onClick={() => void snooze(item.sourceId, Date.now() + SNOOZE_MS)}
                  className="flex cursor-pointer items-center border-none bg-transparent p-0.5 text-ink-3 hover:text-ink-1"
                >
                  <Clock size={12} strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  title="Done"
                  aria-label="Mark done"
                  onClick={() => void markDone(item.sourceId)}
                  className="flex cursor-pointer items-center border-none bg-transparent p-0.5 text-ink-3 hover:text-ink-1"
                >
                  <Check size={12} strokeWidth={1.5} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
