import type { CommunityAgentRun } from './agent-contract'
import type { PeerSnapshot } from './peer-contract'
import type { CommunityData } from './use-community-data'
import { ChatMessageSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import { Menu, MenuItem, MenuSeparator, Tooltip } from '@xnetjs/ui'
import {
  Bot,
  Circle,
  CircleAlert,
  File,
  Hash,
  Image,
  MessageCircle,
  MoreHorizontal,
  Pin,
  PinOff,
  Reply,
  Video,
  Volume2,
  Blocks,
  CheckCheck
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { agentReplyContent } from './agent-activity'
import { chatIsUnread, sortChatIds, type ChatSummary } from './chat-inbox'
import { fileMimeType } from './chat-media'
import { useChatPreferences } from './use-chat-preferences'

function ObserveChat({
  id,
  runs,
  onSummary
}: {
  id: string
  runs: CommunityAgentRun[]
  onSummary: (id: string, summary: ChatSummary | undefined, error: boolean) => void
}) {
  const query = useQuery(ChatMessageSchema, {
    where: { channel: id },
    orderBy: { createdAt: 'desc' },
    limit: 1
  })
  const message = query.data[0]
  const run = runs.find((item) => item.replyId === message?.id)
  const summary = useMemo<ChatSummary | undefined>(() => {
    if (!message) return undefined
    const file = message.attachments?.[0]
    const mime = file ? fileMimeType(file.name, file.mimeType) : ''
    const kind: ChatSummary['kind'] = message.redacted
      ? 'message'
      : message.developmentKind
        ? 'extension'
        : mime.startsWith('image/')
          ? 'image'
          : mime.startsWith('video/')
            ? 'video'
            : mime.startsWith('audio/')
              ? 'audio'
              : file
                ? 'file'
                : message.inReplyTo && !run
                  ? 'thread'
                  : 'message'
    const text = message.redacted
      ? 'Message removed'
      : message.developmentKind
        ? 'Extension development updated'
        : run
          ? `${run.provider === 'codex' ? 'Codex' : 'Claude'}: ${agentReplyContent(message.content ?? '', run)}`
          : message.content?.trim() || file?.name || 'Message'
    return {
      id: message.id,
      createdAt: message.createdAt,
      createdBy: message.createdBy,
      agentReply: !!run,
      kind,
      text: text.replace(/\s+/g, ' ').slice(0, 200)
    }
  }, [message, run])
  useEffect(() => {
    if (!query.loading) onSummary(id, summary, !!query.error)
  }, [id, summary, query.loading, query.error, onSummary])
  return null
}

const previewIcons = {
  message: null,
  file: File,
  image: Image,
  video: Video,
  audio: Volume2,
  extension: Blocks,
  thread: Reply
}
const timeLabel = (time: number) =>
  new Date(time).toLocaleDateString() === new Date().toLocaleDateString()
    ? new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    : new Date(time).toLocaleDateString([], { month: 'short', day: 'numeric' })

export function ChatInbox({
  data,
  runs,
  peers,
  selected,
  filter,
  kind,
  space,
  onOpen
}: {
  data: CommunityData
  runs: CommunityAgentRun[]
  peers?: PeerSnapshot
  selected: string | null
  filter: string
  kind: 'all' | 'direct' | 'groups' | 'unread'
  space: string | null
  onOpen: (id: string) => void
}) {
  const preferences = useChatPreferences(data.did)
  const list = useRef<HTMLDivElement>(null)
  const restoreActions = (id: string) => {
    requestAnimationFrame(() => {
      const target = list.current?.querySelector<HTMLElement>(
        `[data-chat-actions="${CSS.escape(id)}"]`
      )
      ;(target ?? list.current)?.focus({ preventScroll: true })
      if (target && list.current) {
        const bounds = target.getBoundingClientRect()
        const visible = list.current.getBoundingClientRect()
        if (bounds.top < visible.top) list.current.scrollTop += bounds.top - visible.top
        else if (bounds.bottom > visible.bottom)
          list.current.scrollTop += bounds.bottom - visible.bottom
      }
    })
  }
  const [summaries, setSummaries] = useState<Record<string, ChatSummary | undefined>>({})
  const [failures, setFailures] = useState<Record<string, boolean>>({})
  const observe = useCallback((id: string, summary: ChatSummary | undefined, error: boolean) => {
    setSummaries((old) =>
      JSON.stringify(old[id]) === JSON.stringify(summary) ? old : { ...old, [id]: summary }
    )
    setFailures((old) => (!!old[id] === error ? old : { ...old, [id]: error }))
  }, [])
  const latest = selected ? summaries[selected]?.id : undefined
  const update = preferences.update
  const ready = preferences.ready
  useEffect(() => {
    const markRead = () => {
      if (
        selected &&
        latest &&
        ready &&
        document.visibilityState === 'visible' &&
        document.hasFocus()
      )
        update(selected, (old) => ({ ...old, seen: latest, unread: false }))
    }
    markRead()
    window.addEventListener('focus', markRead)
    document.addEventListener('visibilitychange', markRead)
    return () => {
      window.removeEventListener('focus', markRead)
      document.removeEventListener('visibilitychange', markRead)
    }
  }, [selected, latest, update, ready])
  const groupNames = new Map(data.spaces.map((entry) => [entry.id, entry.name]))
  const channelCounts = new Map<string, number>()
  for (const entry of data.channels)
    if (entry.space) channelCounts.set(entry.space, (channelCounts.get(entry.space) ?? 0) + 1)
  const channels = new Map(data.channels.map((entry) => [entry.id, entry]))
  const visible = sortChatIds(
    data.channels
      .filter(
        (entry) =>
          (!space || entry.space === space) &&
          (kind === 'all' || kind === 'unread' || (kind === 'direct') === (entry.kind === 'dm')) &&
          (kind !== 'unread' ||
            chatIsUnread(summaries[entry.id], preferences.chats[entry.id], data.did)) &&
          `${entry.name ?? ''} ${groupNames.get(entry.space ?? '') ?? ''}`
            .toLowerCase()
            .includes(filter.toLowerCase())
      )
      .map((entry) => entry.id),
    summaries,
    preferences.chats
  )
  const sections = [
    { label: 'Pinned', ids: visible.filter((id) => !!preferences.chats[id]?.pinnedAt) },
    { label: 'Recent', ids: visible.filter((id) => !preferences.chats[id]?.pinnedAt) }
  ]
  return (
    <div
      ref={list}
      tabIndex={-1}
      className="min-h-0 flex-1 overflow-y-auto px-2 pb-3"
      role="region"
      aria-label="Chat list"
    >
      {data.channels.map((entry) => (
        <ObserveChat key={entry.id} id={entry.id} runs={runs} onSummary={observe} />
      ))}
      {preferences.error && (
        <p role="alert" className="px-3 py-2 text-xs text-destructive">
          {preferences.error}
        </p>
      )}
      {sections.map(
        ({ label, ids }) =>
          ids.length > 0 && (
            <section key={label} aria-label={`${label} chats`} className="mb-4">
              <h2 className="flex items-center gap-1.5 px-3 pb-2 pt-3 text-[11px] font-medium text-muted-foreground">
                {label === 'Pinned' && <Pin size={11} aria-hidden="true" />}
                {label}
                <span className="ml-auto tabular-nums">{ids.length}</span>
              </h2>
              {ids.map((id) => {
                const entry = channels.get(id)!
                const summary = summaries[id]
                const preference = preferences.chats[id]
                const unread = chatIsUnread(summary, preference, data.did)
                const name = entry.name || 'Chat'
                const groupName =
                  entry.space && (channelCounts.get(entry.space) ?? 0) > 1
                    ? groupNames.get(entry.space)
                    : undefined
                const latestRun = runs
                  .filter((run) => run.channelId === id)
                  .sort((a, b) => b.startedAt - a.startedAt)[0]
                const working = latestRun && ['queued', 'running'].includes(latestRun.status)
                const failed = latestRun && ['failed', 'interrupted'].includes(latestRun.status)
                const group = peers?.groups?.find(
                  (item) => item.id === id || item.channels?.some((channel) => channel.id === id)
                )
                const pending = peers?.contacts.some(
                  (contact) =>
                    (contact.groupId ?? contact.channel) === (group?.id ?? id) && contact.queued
                )
                const status = failures[id]
                  ? 'Preview unavailable'
                  : working
                    ? `${latestRun.provider === 'codex' ? 'Codex' : 'Claude'} is working`
                    : failed
                      ? 'Agent needs attention'
                      : pending
                        ? 'Waiting to deliver'
                        : unread
                          ? 'Unread activity'
                          : undefined
                const PreviewIcon = summary ? previewIcons[summary.kind] : null
                const ChatIcon = latestRun
                  ? Bot
                  : groupName
                    ? Hash
                    : entry.kind === 'dm'
                      ? MessageCircle
                      : Hash
                return (
                  <div
                    key={id}
                    className="chat-row group relative mb-1 flex items-start rounded-xl"
                    data-selected={selected === id}
                  >
                    <button
                      className="flex min-w-0 flex-1 items-start gap-2.5 rounded-xl py-2.5 pl-3 pr-1 text-left hover:bg-muted/60"
                      aria-current={selected === id ? 'page' : undefined}
                      aria-label={`${groupName ? `${groupName}, ` : ''}${name}${status ? `, ${status}` : ''}`}
                      onClick={() => {
                        update(id, (old) => ({ ...old, seen: summary?.id, unread: false }))
                        onOpen(id)
                      }}
                    >
                      <ChatIcon
                        size={15}
                        aria-hidden="true"
                        className={`mt-0.5 shrink-0 ${unread ? 'text-foreground' : 'text-muted-foreground'}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-[13px] ${unread ? 'font-semibold' : 'font-medium'}`}
                        >
                          {name}
                        </span>
                        {groupName && (
                          <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                            {groupName}
                          </span>
                        )}
                        <span
                          className={`mt-1 flex items-center gap-1 truncate text-[11px] ${failed || failures[id] ? 'text-foreground' : 'text-muted-foreground'}`}
                        >
                          {working ? (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground motion-safe:animate-pulse" />
                          ) : failed || failures[id] ? (
                            <CircleAlert size={11} className="shrink-0" />
                          ) : PreviewIcon ? (
                            <PreviewIcon size={11} className="shrink-0" />
                          ) : null}
                          <span className="truncate">
                            {working || failed || pending || failures[id]
                              ? status
                              : summary?.text || 'Start a conversation'}
                          </span>
                        </span>
                      </span>
                    </button>
                    <div className="flex w-10 shrink-0 flex-col items-center gap-1 pr-1 pt-2.5">
                      {unread ? (
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-slate-600"
                          aria-hidden="true"
                        />
                      ) : summary ? (
                        <time
                          dateTime={new Date(summary.createdAt).toISOString()}
                          className="whitespace-nowrap text-[9px] tabular-nums text-muted-foreground"
                        >
                          {timeLabel(summary.createdAt)}
                        </time>
                      ) : null}
                      <Menu
                        className="community-menu min-w-[190px]"
                        trigger={
                          <button
                            aria-label={`Actions for ${name}`}
                            data-chat-actions={id}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-muted focus-visible:opacity-100 group-hover:opacity-100 data-[popup-open]:opacity-100"
                          >
                            <MoreHorizontal size={15} />
                          </button>
                        }
                      >
                        <MenuItem
                          icon={preference?.pinnedAt ? <PinOff size={14} /> : <Pin size={14} />}
                          onSelect={() => {
                            update(id, (old) => ({
                              ...old,
                              pinnedAt: old.pinnedAt ? undefined : Date.now()
                            }))
                            restoreActions(id)
                          }}
                        >
                          {preference?.pinnedAt ? 'Unpin chat' : 'Pin chat'}
                        </MenuItem>
                        <MenuItem
                          icon={unread ? <CheckCheck size={14} /> : <Circle size={13} />}
                          onSelect={() => {
                            update(id, (old) => ({ ...old, seen: summary?.id, unread: !unread }))
                            restoreActions(id)
                          }}
                        >
                          {unread ? 'Mark as read' : 'Mark as unread'}
                        </MenuItem>
                        <MenuSeparator />
                        <p className="px-3 py-1.5 text-[10px] text-muted-foreground">
                          Saved on this device
                        </p>
                      </Menu>
                    </div>
                  </div>
                )
              })}
            </section>
          )
      )}
      {!data.loading && !visible.length && (
        <p className="px-4 py-8 text-center text-xs leading-6 text-muted-foreground">
          {kind === 'unread'
            ? 'You’re all caught up.'
            : filter
              ? 'No chats match this search.'
              : 'Your chats will appear here.'}
        </p>
      )}
      <Tooltip
        content="Pins and read markers are private to this device."
        className="community-tooltip"
      >
        <button className="mx-3 text-[10px] text-muted-foreground">Your personal inbox</button>
      </Tooltip>
    </div>
  )
}
