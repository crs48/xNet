/**
 * MessageRow — one rendered message in the channel feed (0198).
 *
 * Carries the cross-app chat grammar: a day separator and "New messages"
 * divider when the render row calls for them, grouped avatar/name/time headers
 * (suppressed for consecutive same-author messages), the moderated body with
 * structured mention/tag/link chips, an emoji reaction bar, a thread footer,
 * inline edit, and the hover action toolbar. Moderation/self-label wiring is
 * preserved from the original surface (0176).
 */
import type { TabNodeType } from '../workbench/state'
import type { AbuseLabel } from '@xnetjs/abuse'
import type { PresenceStatus } from '@xnetjs/comms'
import type { WikilinkTarget } from '@xnetjs/editor/react'
import { useNavigate } from '@tanstack/react-router'
import { cn, ActionMenuList, ContextMenu, LinkifiedText, type Action } from '@xnetjs/ui'
import { Copy, MessageSquareReply, Pencil, Trash2 } from 'lucide-react'
import { createElement, useEffect, useRef, useState } from 'react'
import { ModeratedPost } from '../components/ModeratedMedia'
import { PersonMentionChip } from '../components/PersonHovercard'
import { useWorkspaceTags } from '../hooks/useWorkspaceTags'
import { navigateToNode } from '../workbench/navigation'
import { ChatAvatar } from './ChatAvatar'
import { displayName, type ProfileEntry } from './hooks'
import { nodeIdFromHref } from './link-composer'
import { formatTime, type ChatRow, type RenderRow } from './message-grouping'
import { MessageHoverToolbar } from './MessageHoverToolbar'
import { ReactionBar } from './ReactionBar'
import { useMessageReactions } from './useMessageReactions'

export type Density = 'comfortable' | 'compact'

export interface ThreadSummary {
  count: number
  participants: string[]
  lastAt?: number
}

function EditedTag({ message }: { message: ChatRow }) {
  if (!message.edited || message.redacted) return null
  return <span className="text-[10px] text-ink-3">(edited)</span>
}

function MessageBody({ message }: { message: ChatRow }) {
  if (message.redacted) {
    return <span className="text-xs italic text-ink-3">message deleted</span>
  }
  return (
    <LinkifiedText
      value={message.content ?? ''}
      className="whitespace-pre-wrap break-words text-sm text-ink-2"
      detectPhones
    />
  )
}

function MessageMentionChips({ message }: { message: ChatRow }) {
  const dids = message.mentions?.dids ?? []
  if (dids.length === 0 || message.redacted) return null
  return (
    <div className="mt-0.5 flex flex-wrap gap-1">
      {dids.map((did) => (
        <PersonMentionChip key={did} did={did} />
      ))}
    </div>
  )
}

function MessageTagChips({ message }: { message: ChatRow }) {
  const navigate = useNavigate()
  const { allTags } = useWorkspaceTags()
  const tagIds = message.tags ?? []
  if (tagIds.length === 0 || message.redacted) return null
  return (
    <div className="mt-0.5 flex flex-wrap gap-1">
      {tagIds.map((tagId) => (
        <button
          key={tagId}
          type="button"
          onClick={() => navigateToNode(navigate, 'tag', tagId)}
          className="cursor-pointer rounded-full border border-hairline bg-transparent px-1.5 py-px text-[10px] text-ink-3 transition-colors hover:text-ink-1"
        >
          #{allTags.find((tag) => tag.id === tagId)?.name ?? tagId}
        </button>
      ))}
    </div>
  )
}

function MessageLinkChips({
  message,
  linkTargets
}: {
  message: ChatRow
  linkTargets: WikilinkTarget[]
}) {
  const navigate = useNavigate()
  const linkIds = message.links ?? []
  if (linkIds.length === 0 || message.redacted) return null
  return (
    <div className="mt-0.5 flex flex-wrap gap-1">
      {linkIds.map((id) => {
        const target = linkTargets.find((t) => nodeIdFromHref(t.href) === id)
        return (
          <button
            key={id}
            type="button"
            onClick={() => navigateToNode(navigate, (target?.kind ?? 'page') as TabNodeType, id)}
            className="cursor-pointer rounded-full border border-hairline bg-transparent px-1.5 py-px text-[10px] text-ink-3 transition-colors hover:text-ink-1"
          >
            [[{target?.title ?? `${id.slice(0, 8)}…`}]]
          </button>
        )
      })}
    </div>
  )
}

function DateSeparator({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2" aria-hidden>
      <span className="h-px flex-1 bg-hairline" />
      <span className="text-[11px] font-medium text-ink-3">{label}</span>
      <span className="h-px flex-1 bg-hairline" />
    </li>
  )
}

function UnreadDivider() {
  return (
    <li className="flex items-center gap-2 px-4 py-1" aria-label="New messages">
      <span className="h-px flex-1 bg-destructive/60" />
      <span className="text-[10px] font-medium uppercase tracking-wider text-destructive">New</span>
      <span className="h-px flex-1 bg-destructive/60" />
    </li>
  )
}

function ThreadFooter({ thread, onOpen }: { thread: ThreadSummary; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-1 flex w-fit items-center gap-2 rounded-md border border-transparent px-1.5 py-0.5 text-xs text-accent-ink transition-colors hover:border-hairline hover:bg-surface-1"
    >
      <span className="flex -space-x-1.5">
        {thread.participants.slice(0, 3).map((did) => (
          <ChatAvatar key={did} did={did} size={18} className="ring-2 ring-surface-0" />
        ))}
      </span>
      <span className="font-medium">
        {thread.count} {thread.count === 1 ? 'reply' : 'replies'}
      </span>
      {thread.lastAt != null && (
        <span className="text-ink-3">· last reply {formatTime(thread.lastAt)}</span>
      )}
    </button>
  )
}

function EditForm({
  initial,
  onSubmit,
  onCancel
}: {
  initial: string
  onSubmit: (content: string) => void | Promise<void>
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])
  return (
    <div className="mt-0.5 flex flex-col gap-1">
      <textarea
        ref={ref}
        value={value}
        rows={2}
        aria-label="Edit message"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            if (value.trim()) void onSubmit(value)
          }
        }}
        className="resize-none rounded-md border border-border-emphasis bg-surface-0 px-2 py-1.5 text-sm text-ink-1 outline-none"
      />
      <div className="flex items-center gap-2 text-[11px] text-ink-3">
        <span>
          escape to{' '}
          <button type="button" onClick={onCancel} className="text-accent-ink hover:underline">
            cancel
          </button>
        </span>
        <span>·</span>
        <span>
          enter to{' '}
          <button
            type="button"
            onClick={() => value.trim() && void onSubmit(value)}
            className="text-accent-ink hover:underline"
          >
            save
          </button>
        </span>
      </div>
    </div>
  )
}

export function MessageRow({
  row,
  profiles,
  linkTargets,
  labels,
  attribution,
  hiddenByBlock,
  me,
  authorStatus,
  density,
  animateIn,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onReply,
  onDelete,
  thread,
  onOpenThread
}: {
  row: RenderRow
  profiles: ProfileEntry[]
  linkTargets: WikilinkTarget[]
  labels: readonly AbuseLabel[]
  attribution?: string
  hiddenByBlock: boolean
  me: string
  authorStatus?: PresenceStatus
  density: Density
  animateIn: boolean
  isEditing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSubmitEdit: (content: string) => void | Promise<void>
  onReply: () => void
  /** Delete (redact) this message — only wired for the author's own messages. */
  onDelete?: () => void
  thread?: ThreadSummary
  onOpenThread: () => void
}) {
  const { message, startsGroup } = row
  const author = profiles.find((p) => p.did === message.createdBy)
  const authorName = displayName(message.createdBy ?? '?', profiles)
  const isOwn = message.createdBy === me
  const { groups, toggle } = useMessageReactions(message.id, me)
  const compact = density === 'compact'

  const messageActions: Action[] = [
    {
      id: 'copy',
      label: 'Copy text',
      icon: createElement(Copy, { size: 14 }),
      when: () => !message.redacted,
      run: () => void navigator.clipboard.writeText(message.content ?? '').catch(() => {})
    },
    {
      id: 'reply',
      label: 'Reply in thread',
      icon: createElement(MessageSquareReply, { size: 14 }),
      run: onReply
    },
    {
      id: 'edit',
      label: 'Edit',
      icon: createElement(Pencil, { size: 14 }),
      when: () => isOwn && !message.redacted,
      run: onStartEdit
    },
    { id: '---', when: () => isOwn && Boolean(onDelete) && !message.redacted },
    {
      id: 'delete',
      label: 'Delete',
      icon: createElement(Trash2, { size: 14 }),
      danger: true,
      when: () => isOwn && Boolean(onDelete) && !message.redacted,
      run: () => onDelete?.()
    }
  ]

  return (
    <>
      {row.daySeparator && <DateSeparator label={row.daySeparator} />}
      {row.firstUnread && <UnreadDivider />}
      <li
        className={cn(
          'group relative flex gap-2.5 px-4 hover:bg-surface-2/40',
          startsGroup ? (compact ? 'pt-1' : 'pt-1.5') : '',
          compact ? 'pb-0.5' : 'pb-1',
          animateIn && 'animate-slide-in-bottom motion-reduce:animate-none'
        )}
      >
        <ContextMenu className="contents" menu={<ActionMenuList actions={messageActions} />}>
          {startsGroup ? (
            <ChatAvatar
              did={message.createdBy ?? '?'}
              src={author?.avatar}
              size={compact ? 24 : 36}
              status={authorStatus}
              showPresence={authorStatus != null}
              className="mt-0.5"
            />
          ) : (
            <time className="w-9 shrink-0 select-none pt-0.5 text-right font-mono text-[10px] leading-5 text-ink-3 opacity-0 group-hover:opacity-100">
              {formatTime(message.createdAt)}
            </time>
          )}
          <div className="min-w-0 flex-1">
            {startsGroup && (
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-ink-1">{authorName}</span>
                <time className="font-mono text-[10px] text-ink-3">
                  {formatTime(message.createdAt)}
                </time>
                <EditedTag message={message} />
              </div>
            )}
            {isEditing ? (
              <EditForm
                initial={message.content ?? ''}
                onSubmit={onSubmitEdit}
                onCancel={onCancelEdit}
              />
            ) : (
              <>
                <ModeratedPost
                  labels={labels}
                  attribution={attribution}
                  platformVisibility={hiddenByBlock ? 'hide' : undefined}
                  hiddenPlaceholder={
                    <span className="text-xs italic text-ink-3">message hidden</span>
                  }
                >
                  <MessageBody message={message} />
                </ModeratedPost>
                <MessageMentionChips message={message} />
                <MessageTagChips message={message} />
                <MessageLinkChips message={message} linkTargets={linkTargets} />
                <ReactionBar
                  groups={groups}
                  profiles={profiles}
                  onToggle={(emoji) => void toggle(emoji)}
                />
                {thread && thread.count > 0 && (
                  <ThreadFooter thread={thread} onOpen={onOpenThread} />
                )}
              </>
            )}
          </div>
          {!isEditing && (
            <MessageHoverToolbar
              messageId={message.id}
              isOwn={isOwn}
              onToggleReaction={(emoji) => void toggle(emoji)}
              onReply={onReply}
              onStartEdit={onStartEdit}
            />
          )}
        </ContextMenu>
      </li>
    </>
  )
}
