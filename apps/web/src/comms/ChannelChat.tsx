/**
 * ChannelChat — message list + composer, shared by the channel tab and the
 * Room context section (0167). Typing indicators ride room presence; the
 * channel watermark advances (debounced) while the chat is visible.
 */
import type { TabNodeType } from '../workbench/state'
import type { WikilinkTarget } from '@xnetjs/editor/react'
import { useNavigate } from '@tanstack/react-router'
import { sensitivityLabels, type AbuseLabel, type SensitivityLabelValue } from '@xnetjs/abuse'
import { sendMessage, typingPeers, type PeerPresence } from '@xnetjs/comms'
import { useDataBridge } from '@xnetjs/react/internal'
import { cn, LinkifiedText, Popover, useListboxNavigation } from '@xnetjs/ui'
import { Send, Shield } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { ModeratedPost } from '../components/ModeratedMedia'
import { PersonMentionChip } from '../components/PersonHovercard'
import { useLinkTargets } from '../hooks/useLinkTargets'
import { useWorkspaceTags } from '../hooks/useWorkspaceTags'
import { hidesContent, useBlockList } from '../lib/block-list'
import { useContentLabelsBatch, useSelfLabel } from '../lib/self-label'
import { navigateToNode } from '../workbench/navigation'
import { mergeMentionables, type Mentionable, type ProfileEntry } from './comms-utils'
import { useComms } from './CommsContext'
import {
  applyHashtagPick,
  composerTags,
  hashtagQueryAt,
  shouldSendOnEnter,
  tagOptionsFor,
  type TagOption
} from './hashtag-composer'
import { useChannelMessages, useInbox, useProfiles, useRoomPresence, displayName } from './hooks'
import {
  applyLinkPick,
  composerLinks,
  linkOptionsFor,
  linkQueryAt,
  nodeIdFromHref
} from './link-composer'
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
  /** Structured mentions declared by the composer (0168) */
  mentions?: { dids?: string[]; room?: boolean }
  /** Tag node ids declared by the composer (0169) */
  tags?: string[]
  /** Linked node ids declared by the composer (0170) */
  links?: string[]
}

function formatTime(at: number | undefined): string {
  if (!at) return ''
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function EditedTag({ message }: { message: ChatMessageRow }) {
  if (!message.edited || message.redacted) return null
  return <span className="text-[10px] text-ink-3">(edited)</span>
}

/**
 * Unlike tags/mentions (structured, composer-declared — see MessageTagChips),
 * links are render-time decoration: a URL's meaning lives in its text, so the
 * stored content is never parsed into structure or rewritten (0171).
 */
function MessageBody({ message }: { message: ChatMessageRow }) {
  if (message.redacted) {
    return <span className="text-xs italic text-ink-3">message deleted</span>
  }
  return (
    <LinkifiedText
      value={message.content ?? ''}
      className="whitespace-pre-wrap break-words text-xs text-ink-2"
      detectPhones
    />
  )
}

/** Mention chips from the message's structured DIDs — open the person popover (0172). */
function MessageMentionChips({ message }: { message: ChatMessageRow }) {
  const dids = message.mentions?.dids ?? []
  if (dids.length === 0 || message.redacted) return null
  return (
    <div className="flex flex-wrap gap-1">
      {dids.map((did) => (
        <PersonMentionChip key={did} did={did} />
      ))}
    </div>
  )
}

/** Chips rendered from the message's structured tags — never parsed text (0169). */
function MessageTagChips({ message }: { message: ChatMessageRow }) {
  const navigate = useNavigate()
  const { allTags } = useWorkspaceTags()
  const tagIds = message.tags ?? []
  if (tagIds.length === 0 || message.redacted) return null
  return (
    <div className="flex flex-wrap gap-1">
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

/** Chips for the message's structured node links — never parsed text (0170). */
function MessageLinkChips({
  message,
  linkTargets
}: {
  message: ChatMessageRow
  linkTargets: WikilinkTarget[]
}) {
  const navigate = useNavigate()
  const linkIds = message.links ?? []
  if (linkIds.length === 0 || message.redacted) return null
  return (
    <div className="flex flex-wrap gap-1">
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

function MessageRow({
  message,
  profiles,
  linkTargets,
  labels,
  hiddenByBlock
}: {
  message: ChatMessageRow
  profiles: ProfileEntry[]
  linkTargets: WikilinkTarget[]
  labels: readonly AbuseLabel[]
  hiddenByBlock: boolean
}) {
  const author = displayName(message.createdBy ?? '?', profiles)
  return (
    <li className="flex flex-col gap-0.5 px-3 py-1.5 hover:bg-surface-2/50">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium text-ink-1">{author}</span>
        <span className="font-mono text-[10px] text-ink-3">{formatTime(message.createdAt)}</span>
        <EditedTag message={message} />
      </div>
      {/* Render gate (0176): blurred per the viewer's dial for sensitive labels,
          and hidden entirely for a blocked/muted author. */}
      <ModeratedPost
        labels={labels}
        platformVisibility={hiddenByBlock ? 'hide' : undefined}
        hiddenPlaceholder={<span className="text-xs italic text-ink-3">message hidden</span>}
      >
        <MessageBody message={message} />
      </ModeratedPost>
      <MessageMentionChips message={message} />
      <MessageTagChips message={message} />
      <MessageLinkChips message={message} linkTargets={linkTargets} />
    </li>
  )
}

const NO_LABELS: readonly AbuseLabel[] = []

function MessageList({
  messages,
  profiles,
  linkTargets,
  listRef
}: {
  messages: ChatMessageRow[]
  profiles: ProfileEntry[]
  linkTargets: WikilinkTarget[]
  listRef: React.RefObject<HTMLUListElement>
}) {
  const ids = useMemo(() => messages.map((message) => message.id), [messages])
  const labelsByTarget = useContentLabelsBatch(ids)
  const blocks = useBlockList()
  const hiddenCount = messages.filter(
    (message) => message.createdBy && hidesContent(blocks.list, message.createdBy)
  ).length
  if (messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-xs text-ink-3">
        No messages yet. Say hi!
      </div>
    )
  }
  return (
    <ul ref={listRef} className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0 py-2">
      {hiddenCount > 0 && (
        <li className="px-3 py-1 text-[10px] text-ink-3">
          🛡 {hiddenCount} message(s) hidden by your block/mute list
        </li>
      )}
      {messages.map((message) => (
        <MessageRow
          key={message.id}
          message={message}
          profiles={profiles}
          linkTargets={linkTargets}
          labels={labelsByTarget.get(message.id) ?? NO_LABELS}
          hiddenByBlock={message.createdBy ? hidesContent(blocks.list, message.createdBy) : false}
        />
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

/**
 * Shared keyboard state the chat pickers receive (0172). Only one picker is
 * ever open at a time (the active query is exclusive), so a single
 * useListboxNavigation in ChannelChat drives whichever is showing.
 */
interface PickerNav {
  activeIndex: number
  optionId: (index: number) => string | undefined
  onHover: (index: number) => void
}

const PICKER_LIST_CLASS =
  'absolute bottom-full left-0 z-10 m-0 mb-1 list-none rounded-md border border-hairline bg-surface-0 p-1 shadow-sm'

function pickerOptionClass(active: boolean): string {
  return cn(
    'flex w-full cursor-pointer items-center gap-2 rounded border-none px-2 py-1 text-left text-xs text-ink-1',
    active ? 'bg-surface-2' : 'bg-transparent hover:bg-surface-2'
  )
}

function TagPicker({
  options,
  nav,
  onPick
}: {
  options: TagOption[]
  nav: PickerNav
  onPick: (option: TagOption) => void
}) {
  if (options.length === 0) return null
  return (
    <ul
      id="chat-suggest-listbox"
      role="listbox"
      aria-label="Tags"
      className={cn(PICKER_LIST_CLASS, 'w-56')}
    >
      {options.map((option, index) => (
        <li key={option.isNew ? '__new__' : option.id}>
          <button
            type="button"
            id={nav.optionId(index)}
            role="option"
            aria-selected={index === nav.activeIndex}
            onMouseEnter={() => nav.onHover(index)}
            onMouseDown={(event) => {
              event.preventDefault()
              onPick(option)
            }}
            className={pickerOptionClass(index === nav.activeIndex)}
          >
            #{option.name}
            {option.isNew && <span className="text-[10px] text-ink-3">Create new tag</span>}
          </button>
        </li>
      ))}
    </ul>
  )
}

function LinkPicker({
  options,
  nav,
  onPick
}: {
  options: WikilinkTarget[]
  nav: PickerNav
  onPick: (option: WikilinkTarget) => void
}) {
  if (options.length === 0) return null
  return (
    <ul
      id="chat-suggest-listbox"
      role="listbox"
      aria-label="Links"
      className={cn(PICKER_LIST_CLASS, 'w-64')}
    >
      {options.map((option, index) => (
        <li key={option.href}>
          <button
            type="button"
            id={nav.optionId(index)}
            role="option"
            aria-selected={index === nav.activeIndex}
            onMouseEnter={() => nav.onHover(index)}
            onMouseDown={(event) => {
              event.preventDefault()
              onPick(option)
            }}
            className={pickerOptionClass(index === nav.activeIndex)}
          >
            <span className="min-w-0 flex-1 truncate">[[{option.title}]]</span>
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-ink-3">
              {option.kind}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function MentionPicker({
  options,
  nav,
  onPick
}: {
  options: Mentionable[]
  nav: PickerNav
  onPick: (option: Mentionable) => void
}) {
  if (options.length === 0) return null
  return (
    <ul
      id="chat-suggest-listbox"
      role="listbox"
      aria-label="People"
      className={cn(PICKER_LIST_CLASS, 'w-56')}
    >
      {options.map((option, index) => (
        <li key={option.did}>
          <button
            type="button"
            id={nav.optionId(index)}
            role="option"
            aria-selected={index === nav.activeIndex}
            onMouseEnter={() => nav.onHover(index)}
            onMouseDown={(event) => {
              event.preventDefault()
              onPick(option)
            }}
            className={pickerOptionClass(index === nav.activeIndex)}
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

/** Composer "mark sensitive" shield (0176): self-label the next message. */
function ComposerSelfLabel({
  value,
  onChange
}: {
  value: SensitivityLabelValue | null
  onChange: (value: SensitivityLabelValue | null) => void
}) {
  const trigger: ReactElement = (
    <button
      type="button"
      title="Mark sensitive"
      aria-label="Mark message sensitive"
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md border border-hairline bg-surface-0',
        value ? 'text-accent-ink' : 'text-ink-3 hover:text-ink-1'
      )}
    >
      <Shield size={12} strokeWidth={1.5} />
    </button>
  )
  return (
    <Popover trigger={trigger} side="top" align="end">
      <div className="flex w-44 flex-col gap-0.5">
        <span className="px-2 py-1 text-[10px] uppercase tracking-wider text-ink-3">
          Mark message as
        </span>
        {sensitivityLabels.map((label) => (
          <button
            key={label.id}
            type="button"
            onClick={() => onChange(value === label.id ? null : label.id)}
            className={cn(
              'rounded px-2 py-1.5 text-left text-xs hover:bg-surface-2',
              value === label.id ? 'text-accent-ink' : 'text-ink-1'
            )}
          >
            {label.name}
            {value === label.id ? ' ✓' : ''}
          </button>
        ))}
      </div>
    </Popover>
  )
}

export function ChannelChat({ channelId }: { channelId: string }) {
  const bridge = useDataBridge()
  const { messages } = useChannelMessages(channelId)
  const { peers, session } = useRoomPresence(channelId)
  const profiles = useProfiles()
  const mentionables = useMentionables()

  const [text, setText] = useState('')
  const [caret, setCaret] = useState(0)
  // Pending self-label for the next message (0176): applied after send, when the
  // new message node has an id.
  const [pendingLabel, setPendingLabel] = useState<SensitivityLabelValue | null>(null)
  const { selfLabel } = useSelfLabel()
  // Escape hides the active picker until the query next changes (the pickers
  // are otherwise derived purely from text + caret, with no open/close state).
  const [pickerDismissed, setPickerDismissed] = useState(false)
  const picked = useRef(new Map<string, string>())
  const pickedTags = useRef(new Map<string, string>())
  const pickedLinks = useRef(new Map<string, string>())
  const lastTypingSent = useRef(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const { suggestions: tagSuggestions, getOrCreateTag } = useWorkspaceTags()
  const { linkTargets } = useLinkTargets()
  const pickerOptions = pickerOptionsFor(text, caret, mentionables)
  const linkOptions = linkOptionsFor(text, caret, linkTargets)
  const tagOptions =
    pickerOptions.length === 0 && linkOptions.length === 0
      ? tagOptionsFor(text, caret, tagSuggestions)
      : []
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
      setPickerDismissed(false)
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

  const pickLink = useCallback(
    (option: WikilinkTarget) => {
      const query = linkQueryAt(text, caret)
      if (!query) return
      pickedLinks.current.set(option.title, nodeIdFromHref(option.href))
      const next = applyLinkPick(text, caret, query.start, option.title)
      setText(next.text)
      setCaret(next.caret)
      inputRef.current?.focus()
    },
    [text, caret]
  )

  // Exactly one picker can be active at a caret (the @/[[/# queries are
  // mutually exclusive), so a single listbox nav drives whichever is showing.
  const activeKind: 'mention' | 'link' | 'tag' | null = pickerDismissed
    ? null
    : pickerOptions.length > 0
      ? 'mention'
      : linkOptions.length > 0
        ? 'link'
        : tagOptions.length > 0
          ? 'tag'
          : null
  const activeOptionCount =
    activeKind === 'mention'
      ? pickerOptions.length
      : activeKind === 'link'
        ? linkOptions.length
        : activeKind === 'tag'
          ? tagOptions.length
          : 0
  // Stable across re-renders for the same query (option arrays are rebuilt each
  // render); changes only when the query does, so arrowing never resets to 0.
  const pickerResetKey =
    activeKind === 'mention'
      ? `mention:${pickerOptions.map((o) => o.did).join(',')}`
      : activeKind === 'link'
        ? `link:${linkOptions.map((o) => o.href).join(',')}`
        : activeKind === 'tag'
          ? `tag:${tagOptions.map((o) => (o.isNew ? `new:${o.name}` : o.id)).join(',')}`
          : 'none'

  const commitActive = useCallback(
    (index: number) => {
      if (activeKind === 'mention') {
        const option = pickerOptions[index]
        if (option) pickMention(option)
      } else if (activeKind === 'link') {
        const option = linkOptions[index]
        if (option) pickLink(option)
      } else if (activeKind === 'tag') {
        const option = tagOptions[index]
        if (option) pickTag(option)
      }
    },
    [activeKind, pickerOptions, linkOptions, tagOptions, pickMention, pickLink, pickTag]
  )

  const pickerNav = useListboxNavigation({
    count: activeOptionCount,
    isOpen: activeKind !== null,
    onCommit: commitActive,
    onDismiss: () => setPickerDismissed(true),
    resetKey: pickerResetKey,
    idPrefix: 'chat-suggest'
  })
  const navProps: PickerNav = {
    activeIndex: pickerNav.activeIndex,
    optionId: pickerNav.optionId,
    onHover: pickerNav.setActiveIndex
  }

  const send = useCallback(async () => {
    const content = text.trim()
    if (!content || !bridge) return
    setText('')
    session?.setTyping(null)
    const created = await sendMessage(bridge, {
      channelId,
      content,
      mentions: composerMentions(content, picked.current),
      tags: composerTags(content, pickedTags.current),
      links: composerLinks(content, pickedLinks.current)
    })
    // Apply the author's pending self-label to the just-sent message (0176).
    if (pendingLabel) {
      const messageId = (created as { id?: string } | undefined)?.id
      if (messageId) await selfLabel(messageId, pendingLabel)
      setPendingLabel(null)
    }
    picked.current.clear()
    pickedTags.current.clear()
    pickedLinks.current.clear()
  }, [text, bridge, channelId, session, pendingLabel, selfLabel])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MessageList
        messages={rows}
        profiles={profiles}
        linkTargets={linkTargets}
        listRef={listRef}
      />
      <TypingLine peers={typing} profiles={profiles} />
      <div className="relative border-t border-hairline p-2">
        {activeKind === 'mention' && (
          <MentionPicker options={pickerOptions} nav={navProps} onPick={pickMention} />
        )}
        {activeKind === 'tag' && <TagPicker options={tagOptions} nav={navProps} onPick={pickTag} />}
        {activeKind === 'link' && (
          <LinkPicker options={linkOptions} nav={navProps} onPick={pickLink} />
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={text}
            rows={2}
            placeholder="Message… (@ mention, # tag, [[ link, Enter to send)"
            role={activeKind ? 'combobox' : undefined}
            aria-expanded={activeKind ? true : undefined}
            aria-controls={activeKind ? 'chat-suggest-listbox' : undefined}
            aria-activedescendant={activeKind ? pickerNav.activeDescendantId : undefined}
            aria-autocomplete={activeKind ? 'list' : undefined}
            onChange={(event) => handleChange(event.target.value, event.target.selectionStart ?? 0)}
            onKeyDown={(event) => {
              // Active picker gets first refusal on arrows/Enter/Tab/Escape.
              if (activeKind && pickerNav.onKeyDown(event)) return
              // No picker open: Enter sends (unless mid-IME-composition).
              if (!event.nativeEvent.isComposing && shouldSendOnEnter(event, 0)) {
                event.preventDefault()
                void send()
              }
            }}
            className="min-h-0 flex-1 resize-none rounded-md border border-hairline bg-surface-0 px-2 py-1.5 text-xs text-ink-1 outline-none placeholder:text-ink-3 focus:border-border-emphasis"
          />
          <ComposerSelfLabel value={pendingLabel} onChange={setPendingLabel} />
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
