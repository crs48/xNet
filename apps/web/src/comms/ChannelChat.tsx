/**
 * ChannelChat — message list + composer, shared by the channel tab and the
 * Room context section (0167). Typing indicators ride room presence; the
 * channel watermark advances (debounced) while the chat is visible.
 */
import { sendMessage, typingPeers, type PeerPresence } from '@xnetjs/comms'
import { useDataBridge } from '@xnetjs/react/internal'
import { Send } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspaceTags } from '../hooks/useWorkspaceTags'
import { mergeMentionables, type Mentionable, type ProfileEntry } from './comms-utils'
import { useComms } from './CommsContext'
import {
  applyHashtagPick,
  composerTags,
  hashtagQueryAt,
  tagOptionsFor,
  type TagOption
} from './hashtag-composer'
import { useChannelMessages, useInbox, useProfiles, useRoomPresence, displayName } from './hooks'
import {
  applyMentionPick,
  composerMentions,
  mentionQueryAt,
  pickerOptionsFor
} from './mention-composer'

interface ChatMessageRow {
  id: string
  content?: string
  createdBy?: string
  createdAt?: number
  edited?: boolean
  redacted?: boolean
}

function formatTime(at: number | undefined): string {
  if (!at) return ''
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function EditedTag({ message }: { message: ChatMessageRow }) {
  if (!message.edited || message.redacted) return null
  return <span className="text-[10px] text-ink-3">(edited)</span>
}

function MessageBody({ message }: { message: ChatMessageRow }) {
  if (message.redacted) {
    return <span className="text-xs italic text-ink-3">message deleted</span>
  }
  return (
    <span className="whitespace-pre-wrap break-words text-xs text-ink-2">{message.content}</span>
  )
}

function MessageRow({ message, profiles }: { message: ChatMessageRow; profiles: ProfileEntry[] }) {
  const author = displayName(message.createdBy ?? '?', profiles)
  return (
    <li className="flex flex-col gap-0.5 px-3 py-1.5 hover:bg-surface-2/50">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium text-ink-1">{author}</span>
        <span className="font-mono text-[10px] text-ink-3">{formatTime(message.createdAt)}</span>
        <EditedTag message={message} />
      </div>
      <MessageBody message={message} />
    </li>
  )
}

function MessageList({
  messages,
  profiles,
  listRef
}: {
  messages: ChatMessageRow[]
  profiles: ProfileEntry[]
  listRef: React.RefObject<HTMLUListElement>
}) {
  if (messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-ink-3">
        No messages yet. Say hi!
      </div>
    )
  }
  return (
    <ul ref={listRef} className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0 py-2">
      {messages.map((message) => (
        <MessageRow key={message.id} message={message} profiles={profiles} />
      ))}
    </ul>
  )
}

function TypingLine({ peers, profiles }: { peers: PeerPresence[]; profiles: ProfileEntry[] }) {
  if (peers.length === 0) return <div className="h-4" />
  const names = peers.map((p) => displayName(p.user?.did ?? '?', profiles)).join(', ')
  return (
    <div className="h-4 truncate px-3 text-[10px] italic text-ink-3">
      {names} {peers.length === 1 ? 'is' : 'are'} typing…
    </div>
  )
}

function TagPicker({
  options,
  onPick
}: {
  options: TagOption[]
  onPick: (option: TagOption) => void
}) {
  if (options.length === 0) return null
  return (
    <ul className="absolute bottom-full left-0 z-10 m-0 mb-1 w-56 list-none rounded-md border border-hairline bg-surface-0 p-1 shadow-sm">
      {options.map((option) => (
        <li key={option.isNew ? '__new__' : option.id}>
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault()
              onPick(option)
            }}
            className="flex w-full cursor-pointer items-center gap-2 rounded border-none bg-transparent px-2 py-1 text-left text-xs text-ink-1 hover:bg-surface-2"
          >
            #{option.name}
            {option.isNew && <span className="text-[10px] text-ink-3">Create new tag</span>}
          </button>
        </li>
      ))}
    </ul>
  )
}

function MentionPicker({
  options,
  onPick
}: {
  options: Mentionable[]
  onPick: (option: Mentionable) => void
}) {
  if (options.length === 0) return null
  return (
    <ul className="absolute bottom-full left-0 z-10 m-0 mb-1 w-56 list-none rounded-md border border-hairline bg-surface-0 p-1 shadow-sm">
      {options.map((option) => (
        <li key={option.did}>
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault()
              onPick(option)
            }}
            className="flex w-full cursor-pointer items-center gap-2 rounded border-none bg-transparent px-2 py-1 text-left text-xs text-ink-1 hover:bg-surface-2"
          >
            @{option.label}
            <span className="truncate font-mono text-[10px] text-ink-3">{option.did}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function useMentionables(): Mentionable[] {
  const profiles = useProfiles()
  const { workspacePeers, me } = useComms()
  return useMemo(
    () => mergeMentionables(profiles, workspacePeers, me.did),
    [profiles, workspacePeers, me.did]
  )
}

const TYPING_THROTTLE_MS = 1500
const WATERMARK_DEBOUNCE_MS = 800

/** Advance the channel's read watermark while its newest message is visible. */
function useWatermarkAdvance(channelId: string, newest: ChatMessageRow | undefined): void {
  const { markChannelRead } = useInbox()
  useEffect(() => {
    if (!newest?.createdAt) return
    const timer = setTimeout(() => {
      void markChannelRead(channelId, newest.createdAt as number, newest.id)
    }, WATERMARK_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [channelId, newest?.id, newest?.createdAt, markChannelRead])
}

export function ChannelChat({ channelId }: { channelId: string }) {
  const bridge = useDataBridge()
  const { messages } = useChannelMessages(channelId)
  const { peers, session } = useRoomPresence(channelId)
  const profiles = useProfiles()
  const mentionables = useMentionables()

  const [text, setText] = useState('')
  const [caret, setCaret] = useState(0)
  const picked = useRef(new Map<string, string>())
  const pickedTags = useRef(new Map<string, string>())
  const lastTypingSent = useRef(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const { suggestions: tagSuggestions, getOrCreateTag } = useWorkspaceTags()
  const pickerOptions = pickerOptionsFor(text, caret, mentionables)
  const tagOptions = pickerOptions.length === 0 ? tagOptionsFor(text, caret, tagSuggestions) : []
  const typing = useMemo(() => typingPeers(peers, channelId, Date.now()), [peers, channelId])
  const rows = messages as unknown as ChatMessageRow[]

  useWatermarkAdvance(channelId, rows.at(-1))

  // Keep scrolled to the bottom on new messages.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages.length])

  const handleChange = useCallback(
    (value: string, caretPos: number) => {
      setText(value)
      setCaret(caretPos)
      const now = Date.now()
      if (session && now - lastTypingSent.current > TYPING_THROTTLE_MS) {
        lastTypingSent.current = now
        session.setTyping(channelId)
      }
    },
    [session, channelId]
  )

  const pickMention = useCallback(
    (option: Mentionable) => {
      const query = mentionQueryAt(text, caret)
      if (!query) return
      picked.current.set(option.label, option.did)
      const next = applyMentionPick(text, caret, query.start, option.label)
      setText(next.text)
      setCaret(next.caret)
      inputRef.current?.focus()
    },
    [text, caret]
  )

  const pickTag = useCallback(
    (option: TagOption) => {
      const query = hashtagQueryAt(text, caret)
      if (!query) return
      const next = applyHashtagPick(text, caret, query.start, option.name)
      setText(next.text)
      setCaret(next.caret)
      inputRef.current?.focus()
      // Resolve the id in the background; an unresolved pick sends as plain text.
      void getOrCreateTag(option.name).then((tag) => {
        if (tag) pickedTags.current.set(tag.name, tag.id)
      })
    },
    [text, caret, getOrCreateTag]
  )

  const send = useCallback(async () => {
    const content = text.trim()
    if (!content || !bridge) return
    setText('')
    session?.setTyping(null)
    await sendMessage(bridge, {
      channelId,
      content,
      mentions: composerMentions(content, picked.current),
      tags: composerTags(content, pickedTags.current)
    })
    picked.current.clear()
    pickedTags.current.clear()
  }, [text, bridge, channelId, session])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MessageList messages={rows} profiles={profiles} listRef={listRef} />
      <TypingLine peers={typing} profiles={profiles} />
      <div className="relative border-t border-hairline p-2">
        <MentionPicker options={pickerOptions} onPick={pickMention} />
        <TagPicker options={tagOptions} onPick={pickTag} />
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={text}
            rows={2}
            placeholder="Message… (@ to mention, # to tag, Enter to send)"
            onChange={(event) => handleChange(event.target.value, event.target.selectionStart ?? 0)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                pickerOptions.length === 0 &&
                tagOptions.length === 0
              ) {
                event.preventDefault()
                void send()
              }
            }}
            className="min-h-0 flex-1 resize-none rounded-md border border-hairline bg-surface-0 px-2 py-1.5 text-xs text-ink-1 outline-none placeholder:text-ink-3 focus:border-border-emphasis"
          />
          <button
            type="button"
            title="Send"
            aria-label="Send message"
            onClick={() => void send()}
            disabled={!text.trim()}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-hairline bg-surface-0 text-ink-2 hover:text-ink-1 disabled:cursor-default disabled:opacity-50"
          >
            <Send size={12} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  )
}
