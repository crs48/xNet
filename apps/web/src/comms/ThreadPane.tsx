/**
 * ThreadPane — a right-hand panel showing a root message and its replies (0198),
 * with a composer that posts replies (inReplyTo = root). Replies are kept out of
 * the main feed, so this is where a threaded conversation is read and continued.
 */
import { compareMessages, sendMessage } from '@xnetjs/comms'
import { ChatMessageSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import { useDataBridge } from '@xnetjs/react/internal'
import { cn, LinkifiedText } from '@xnetjs/ui'
import { Send, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ChatAvatar } from './ChatAvatar'
import { displayName, useEnsureProfiles, useProfiles, type ProfileEntry } from './hooks'
import { formatTime, type ChatRow } from './message-grouping'
import { ReactionBar } from './ReactionBar'
import { useMessageReactions } from './useMessageReactions'

function ThreadMessage({
  message,
  profiles,
  me,
  root
}: {
  message: ChatRow
  profiles: ProfileEntry[]
  me: string
  root?: boolean
}) {
  const author = profiles.find((p) => p.did === message.createdBy)
  const { groups, toggle } = useMessageReactions(message.id, me)
  return (
    <li className={cn('flex gap-2.5 px-3 py-1.5', root && 'border-b border-hairline pb-3')}>
      <ChatAvatar
        did={message.createdBy ?? '?'}
        src={author?.avatar}
        size={28}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold text-ink-1">
            {displayName(message.createdBy ?? '?', profiles)}
          </span>
          <time className="font-mono text-[10px] text-ink-3">{formatTime(message.createdAt)}</time>
        </div>
        {message.redacted ? (
          <span className="text-xs italic text-ink-3">message deleted</span>
        ) : (
          <LinkifiedText
            value={message.content ?? ''}
            className="whitespace-pre-wrap break-words text-sm text-ink-2"
            detectPhones
          />
        )}
        <ReactionBar groups={groups} profiles={profiles} onToggle={(emoji) => void toggle(emoji)} />
      </div>
    </li>
  )
}

export function ThreadPane({
  channelId,
  rootId,
  me,
  onClose
}: {
  channelId: string
  rootId: string
  me: string
  onClose: () => void
}) {
  const bridge = useDataBridge()
  const profiles = useProfiles()
  const { data: rootData } = useQuery(ChatMessageSchema, rootId)
  const { data: replyData } = useQuery(ChatMessageSchema, { where: { inReplyTo: rootId } })
  const [text, setText] = useState('')

  const root = rootData as unknown as ChatRow | null
  const replies = useMemo(
    () => [...((replyData as unknown as ChatRow[]) ?? [])].sort(compareMessages),
    [replyData]
  )
  const authorDids = useMemo(
    () => [root?.createdBy, ...replies.map((reply) => reply.createdBy)],
    [root?.createdBy, replies]
  )
  useEnsureProfiles(authorDids)

  const send = async () => {
    const content = text.trim()
    if (!content || !bridge) return
    setText('')
    await sendMessage(bridge, { channelId, content, inReplyTo: rootId })
  }

  return (
    <aside className="flex h-full w-80 min-w-0 shrink-0 flex-col border-l border-hairline">
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-hairline px-3">
        <span className="text-sm font-medium text-ink-1">Thread</span>
        <button
          type="button"
          aria-label="Close thread"
          onClick={onClose}
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded border-none bg-transparent text-ink-3 hover:bg-surface-2 hover:text-ink-1"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </header>
      <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0 py-2">
        {root && <ThreadMessage message={root} profiles={profiles} me={me} root />}
        {replies.length > 0 && (
          <li className="px-3 py-1 text-[10px] uppercase tracking-wider text-ink-3">
            {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
          </li>
        )}
        {replies.map((reply) => (
          <ThreadMessage key={reply.id} message={reply} profiles={profiles} me={me} />
        ))}
      </ul>
      <div className="border-t border-hairline p-2">
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            rows={2}
            placeholder="Reply…"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && text.trim() === '') {
                event.preventDefault()
                onClose()
              } else if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault()
                void send()
              }
            }}
            className="min-h-0 flex-1 resize-none rounded-md border border-hairline bg-surface-0 px-2 py-1.5 text-sm text-ink-1 outline-none placeholder:text-ink-3 focus:border-border-emphasis"
          />
          <button
            type="button"
            title="Send reply"
            aria-label="Send reply"
            onClick={() => void send()}
            disabled={!text.trim()}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-hairline bg-surface-0 text-ink-2 hover:text-ink-1 disabled:cursor-default disabled:opacity-50"
          >
            <Send size={13} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </aside>
  )
}
