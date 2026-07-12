/**
 * ChannelChat — the channel message feed + composer (0198), shared by the
 * channel tab and the Room context section (0167). Rendering is delegated to
 * ChannelMessageList (grouped rows, reactions, threads); this owns the rich
 * composer (the @ / # / [[ pickers and emoji insert), the read watermark,
 * typing presence, inline edit, and the right-hand thread pane.
 */
import type { ChatRow } from './message-grouping'
import type { WikilinkTarget } from '@xnetjs/editor/react'
import { sensitivityLabels, type SensitivityLabelValue } from '@xnetjs/abuse'
import {
  editMessage,
  redactMessage,
  sendMessage,
  setMessageLinkPreviews,
  typingPeers,
  type PresenceStatus
} from '@xnetjs/comms'
import { ChatMessageSchema, sanitizeLinkPreviews } from '@xnetjs/data'
import { useCanCreate, useXNet } from '@xnetjs/react'
import { useDataBridge } from '@xnetjs/react/internal'
import { cn, LinkPreviewCard, Popover, useListboxNavigation } from '@xnetjs/ui'
import { Link2, Send, Shield, Smile, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useLinkTargets } from '../hooks/useLinkTargets'
import { useWorkspaceTags } from '../hooks/useWorkspaceTags'
import { useSelfLabel } from '../lib/self-label'
import { normalizeHubHttpUrl } from '../lib/share-links'
import { currentUrlEnv } from '../lib/url-upres'
import { ChannelMessageList } from './ChannelMessageList'
import { useChatDensity } from './chat-prefs'
import { mergeMentionables, type Mentionable } from './comms-utils'
import { useComms } from './CommsContext'
import { EmojiPicker } from './EmojiPicker'
import {
  applyHashtagPick,
  composerTags,
  hashtagQueryAt,
  shouldSendOnEnter,
  tagOptionsFor,
  type TagOption
} from './hashtag-composer'
import {
  useChannelMessages,
  useEnsureProfiles,
  useInbox,
  useProfiles,
  useRoomPresence
} from './hooks'
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
import { ThreadPane } from './ThreadPane'
import { applyUrlUpres, internalUrlCandidate, type UpresCandidate } from './url-upres-composer'
import { useComposerPreviews } from './useComposerPreviews'

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

/**
 * Up-res pill (0295): offers to convert a pasted internal URL into a
 * `[[Title]]` link pick. Escape (or ×) keeps the plain URL.
 */
function UpresPill({
  candidate,
  onAccept,
  onDismiss
}: {
  candidate: UpresCandidate
  onAccept: () => void
  onDismiss: () => void
}) {
  return (
    <div className="absolute bottom-full left-0 z-10 mb-1 flex items-center gap-0.5 rounded-md border border-hairline bg-surface-0 p-1 shadow-sm">
      <button
        type="button"
        onMouseDown={(event) => {
          event.preventDefault()
          onAccept()
        }}
        className={pickerOptionClass(true)}
      >
        <Link2 size={12} strokeWidth={1.5} className="shrink-0 text-ink-3" />
        <span className="min-w-0 flex-1 truncate">Link [[{candidate.title}]]</span>
        <span className="shrink-0 text-[10px] uppercase tracking-wider text-ink-3">
          {candidate.kind}
        </span>
      </button>
      <button
        type="button"
        title="Keep plain URL (Esc)"
        aria-label="Keep plain URL"
        onMouseDown={(event) => {
          event.preventDefault()
          onDismiss()
        }}
        className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded border-none bg-transparent text-ink-3 hover:text-ink-1"
      >
        <X size={12} strokeWidth={1.5} />
      </button>
    </div>
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
            {option.isSelf && <span className="text-ink-3">(you)</span>}
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
function useWatermarkAdvance(channelId: string, newest: ChatRow | undefined): void {
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

function watermarkAt(state: { watermarks?: unknown }, channelId: string): number {
  const map = state.watermarks as Record<string, { at?: number }> | undefined
  return map?.[channelId]?.at ?? 0
}

export function ChannelChat({ channelId }: { channelId: string }) {
  const bridge = useDataBridge()
  const { me } = useComms()
  const { messages } = useChannelMessages(channelId)
  const { peers, session } = useRoomPresence(channelId)
  const profiles = useProfiles()
  const mentionables = useMentionables()
  const { state } = useInbox()
  const [density] = useChatDensity()

  const [text, setText] = useState('')
  const [caret, setCaret] = useState(0)
  const [pendingLabel, setPendingLabel] = useState<SensitivityLabelValue | null>(null)
  const { selfLabel } = useSelfLabel()
  const [pickerDismissed, setPickerDismissed] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [openThreadId, setOpenThreadId] = useState<string | null>(null)
  const picked = useRef(new Map<string, string>())
  const pickedTags = useRef(new Map<string, string>())
  const pickedLinks = useRef(new Map<string, string>())
  const [dismissedUpres, setDismissedUpres] = useState<ReadonlySet<string>>(new Set())
  const lastTypingSent = useRef(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { suggestions: tagSuggestions, getOrCreateTag } = useWorkspaceTags()
  const { linkTargets } = useLinkTargets()
  const pickerOptions = pickerOptionsFor(text, caret, mentionables)
  const linkOptions = linkOptionsFor(text, caret, linkTargets)
  const tagOptions =
    pickerOptions.length === 0 && linkOptions.length === 0
      ? tagOptionsFor(text, caret, tagSuggestions)
      : []
  const typing = useMemo(() => typingPeers(peers, channelId, Date.now()), [peers, channelId])
  const rows = messages as unknown as ChatRow[]

  // In shared channels authors may be DIDs we've never met — fetch their
  // profiles so names/avatars render instead of DID fragments.
  const authorDids = useMemo(() => rows.map((row) => row.createdBy), [rows])
  useEnsureProfiles(authorDids)

  const presenceByDid = useMemo(() => {
    const map = new Map<string, PresenceStatus>()
    for (const peer of peers) {
      const did = peer.user?.did
      if (did) map.set(did, peer.status ?? 'active')
    }
    return map
  }, [peers])

  const lastReadAt = watermarkAt(state, channelId)

  useWatermarkAdvance(channelId, rows.at(-1))

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

  const { hubUrl } = useXNet()
  const urlEnv = useMemo(() => currentUrlEnv(hubUrl ? normalizeHubHttpUrl(hubUrl) : null), [hubUrl])

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

  const {
    offers: previewOffers,
    dismiss: dismissPreview,
    dismissAll: dismissAllPreviews,
    reset: resetPreviews
  } = useComposerPreviews(text, urlEnv)

  const upresCandidate = useMemo(
    () =>
      activeKind === null ? internalUrlCandidate(text, linkTargets, urlEnv, dismissedUpres) : null,
    [activeKind, text, linkTargets, urlEnv, dismissedUpres]
  )

  const acceptUpres = useCallback(() => {
    if (!upresCandidate) return
    pickedLinks.current.set(upresCandidate.title, upresCandidate.nodeId)
    const next = applyUrlUpres(text, upresCandidate)
    setText(next.text)
    setCaret(next.caret)
    const input = inputRef.current
    if (input) {
      input.focus()
      requestAnimationFrame(() => input.setSelectionRange(next.caret, next.caret))
    }
  }, [upresCandidate, text])

  const dismissUpres = useCallback(() => {
    if (!upresCandidate) return
    setDismissedUpres((prev) => new Set(prev).add(upresCandidate.url))
    inputRef.current?.focus()
  }, [upresCandidate])

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

  // Post permission (0304): ChatMessage splits create/update — members may
  // post, only the author may edit. Fail open: gate only on a definitive
  // deny, so a missing/erroring auth API never blocks sending.
  const createDraft = useMemo(() => ({ channel: channelId }), [channelId])
  const createCheck = useCanCreate(ChatMessageSchema.schema['@id'], createDraft)
  const postBlocked = !createCheck.loading && !createCheck.error && !createCheck.canCreate

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
      links: composerLinks(content, pickedLinks.current),
      linkPreviews: previewOffers.length > 0 ? previewOffers : undefined
    })
    if (pendingLabel) {
      const messageId = (created as { id?: string } | undefined)?.id
      if (messageId) await selfLabel(messageId, pendingLabel)
      setPendingLabel(null)
    }
    picked.current.clear()
    pickedTags.current.clear()
    pickedLinks.current.clear()
    setDismissedUpres(new Set())
    resetPreviews()
  }, [text, bridge, channelId, session, pendingLabel, selfLabel, previewOffers, resetPreviews])

  const insertEmoji = useCallback(
    (emoji: string) => {
      const el = inputRef.current
      const pos = el?.selectionStart ?? text.length
      setText((prev) => prev.slice(0, pos) + emoji + prev.slice(pos))
      requestAnimationFrame(() => {
        const input = inputRef.current
        if (input) {
          input.focus()
          input.setSelectionRange(pos + emoji.length, pos + emoji.length)
        }
      })
    },
    [text]
  )

  const submitEdit = useCallback(
    async (message: ChatRow, content: string) => {
      if (!bridge) return
      await editMessage(bridge, message.id, content)
      setEditingId(null)
    },
    [bridge]
  )

  const editLastOwnMessage = useCallback(() => {
    const mine = rows.filter((m) => m.createdBy === me.did && !m.inReplyTo && !m.redacted)
    const last = mine.at(-1)
    if (last) setEditingId(last.id)
  }, [rows, me.did])

  const deleteMessage = useCallback(
    async (message: ChatRow) => {
      if (!bridge) return
      await redactMessage(bridge, message.id)
      if (editingId === message.id) setEditingId(null)
    },
    [bridge, editingId]
  )

  const removePreview = useCallback(
    (message: ChatRow, url: string) => {
      if (!bridge || message.createdBy !== me.did) return
      const remaining = sanitizeLinkPreviews(message.linkPreviews).filter(
        (preview) => preview.url !== url
      )
      void setMessageLinkPreviews(bridge, message.id, remaining.length ? remaining : null)
    },
    [bridge, me.did]
  )

  const openThread = useCallback((rootId: string) => setOpenThreadId(rootId), [])

  return (
    <div className="flex h-full min-h-0">
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <ChannelMessageList
          channelId={channelId}
          messages={rows}
          profiles={profiles}
          linkTargets={linkTargets}
          me={me.did}
          presenceByDid={presenceByDid}
          lastReadAt={lastReadAt}
          density={density}
          typingPeers={typing}
          editingId={editingId}
          onStartEdit={(message) => setEditingId(message.id)}
          onCancelEdit={() => setEditingId(null)}
          onSubmitEdit={submitEdit}
          onReply={(message) => openThread(message.id)}
          onDelete={(message) => void deleteMessage(message)}
          onRemovePreview={removePreview}
          onOpenThread={openThread}
        />
        <div className="relative border-t border-hairline p-2">
          {activeKind === 'mention' && (
            <MentionPicker options={pickerOptions} nav={navProps} onPick={pickMention} />
          )}
          {activeKind === 'tag' && (
            <TagPicker options={tagOptions} nav={navProps} onPick={pickTag} />
          )}
          {activeKind === 'link' && (
            <LinkPicker options={linkOptions} nav={navProps} onPick={pickLink} />
          )}
          {upresCandidate && (
            <UpresPill candidate={upresCandidate} onAccept={acceptUpres} onDismiss={dismissUpres} />
          )}
          {previewOffers.length > 0 && (
            <div className="mb-1.5 flex flex-col gap-1">
              {previewOffers.map((offer) => (
                <LinkPreviewCard
                  key={offer.url}
                  url={offer.url}
                  title={offer.title}
                  domain={offer.domain}
                  description={offer.description}
                  providerName={offer.providerName}
                  onRemove={() => dismissPreview(offer.url)}
                  className="bg-surface-0"
                />
              ))}
            </div>
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
              onChange={(event) =>
                handleChange(event.target.value, event.target.selectionStart ?? 0)
              }
              onKeyDown={(event) => {
                if (activeKind && pickerNav.onKeyDown(event)) return
                if (upresCandidate && event.key === 'Escape') {
                  event.preventDefault()
                  dismissUpres()
                  return
                }
                if (previewOffers.length > 0 && event.key === 'Escape') {
                  event.preventDefault()
                  dismissAllPreviews()
                  return
                }
                if (
                  event.key === 'ArrowUp' &&
                  !activeKind &&
                  text.trim() === '' &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault()
                  editLastOwnMessage()
                  return
                }
                if (!event.nativeEvent.isComposing && shouldSendOnEnter(event, 0)) {
                  event.preventDefault()
                  void send()
                }
              }}
              className="min-h-0 flex-1 resize-none rounded-md border border-hairline bg-surface-0 px-2 py-1.5 text-sm text-ink-1 outline-none placeholder:text-ink-3 focus:border-border-emphasis"
            />
            <EmojiPicker
              side="top"
              align="end"
              onSelect={insertEmoji}
              trigger={
                <button
                  type="button"
                  title="Emoji"
                  aria-label="Insert emoji"
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-hairline bg-surface-0 text-ink-3 hover:text-ink-1"
                >
                  <Smile size={12} strokeWidth={1.5} />
                </button>
              }
            />
            <ComposerSelfLabel value={pendingLabel} onChange={setPendingLabel} />
            <button
              type="button"
              title="Send"
              aria-label="Send message"
              onClick={() => void send()}
              disabled={!text.trim() || postBlocked}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-hairline bg-surface-0 text-ink-2 hover:text-ink-1 disabled:cursor-default disabled:opacity-50"
            >
              <Send size={12} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>
      {openThreadId && (
        <ThreadPane
          channelId={channelId}
          rootId={openThreadId}
          me={me.did}
          onClose={() => setOpenThreadId(null)}
        />
      )}
    </div>
  )
}
