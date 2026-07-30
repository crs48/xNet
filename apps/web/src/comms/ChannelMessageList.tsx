/**
 * ChannelMessageList — the scrollable, grouped message feed (0198).
 *
 * Thread replies (inReplyTo set) are kept out of the main feed and surfaced in
 * the thread pane; the root they reply to gets a thread footer derived from the
 * loaded window. The feed sticks to the bottom only when the reader is already
 * there, otherwise a jump-to-latest pill appears with the unread count. New
 * messages slide in; history loaded on open does not.
 */
import type { PeerPresence, PresenceStatus } from '@xnetjs/comms'
import type { WikilinkTarget } from '@xnetjs/editor/react'
import { ArrowDown } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { hidesContent, useBlockList } from '../lib/block-list'
import { attributionText, useTrustedContentLabelsBatch } from '../lib/content-labels-trust'
import { displayName, type ProfileEntry } from './hooks'
import { groupMessages, type ChatRow } from './message-grouping'
import { MessageRow, type Density, type ThreadSummary } from './MessageRow'

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1 w-1 animate-bounce rounded-full bg-ink-3 motion-reduce:animate-none"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  )
}

function TypingLine({ peers, profiles }: { peers: PeerPresence[]; profiles: ProfileEntry[] }) {
  if (peers.length === 0) return <div className="h-5" />
  const names = peers.map((p) => displayName(p.user?.did ?? '?', profiles)).join(', ')
  return (
    <div className="flex h-5 items-center gap-2 px-4 text-[11px] italic text-ink-3">
      <TypingDots />
      <span className="truncate">
        {names} {peers.length === 1 ? 'is' : 'are'} typing…
      </span>
    </div>
  )
}

/** Derive per-root thread summaries from the loaded reply messages. */
function buildThreadIndex(replies: ChatRow[]): Map<string, ThreadSummary> {
  const index = new Map<string, ThreadSummary>()
  for (const reply of replies) {
    const root = reply.inReplyTo
    if (!root) continue
    const summary = index.get(root) ?? { count: 0, participants: [], lastAt: undefined }
    summary.count += 1
    if (reply.createdBy && !summary.participants.includes(reply.createdBy)) {
      summary.participants.push(reply.createdBy)
    }
    if ((reply.createdAt ?? 0) > (summary.lastAt ?? 0)) summary.lastAt = reply.createdAt
    index.set(root, summary)
  }
  return index
}

export function ChannelMessageList({
  channelId,
  messages,
  profiles,
  linkTargets,
  me,
  presenceByDid,
  lastReadAt,
  density,
  typingPeers,
  editingId,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onReply,
  onDelete,
  onRemovePreview,
  onOpenThread
}: {
  channelId: string
  messages: ChatRow[]
  profiles: ProfileEntry[]
  linkTargets: WikilinkTarget[]
  me: string
  presenceByDid: Map<string, PresenceStatus>
  lastReadAt: number
  density: Density
  typingPeers: PeerPresence[]
  editingId: string | null
  onStartEdit: (message: ChatRow) => void
  onCancelEdit: () => void
  onSubmitEdit: (message: ChatRow, content: string) => void | Promise<void>
  onReply: (message: ChatRow) => void
  onDelete?: (message: ChatRow) => void
  /** Author removes a stored URL preview card (0295). */
  onRemovePreview?: (message: ChatRow, url: string) => void
  onOpenThread: (rootId: string) => void
}) {
  const listRef = useRef<HTMLUListElement>(null)
  const atBottomRef = useRef(true)
  const mountedAtRef = useRef(Date.now())
  const [showPill, setShowPill] = useState(false)

  const roots = useMemo(() => messages.filter((m) => !m.inReplyTo), [messages])
  const threadIndex = useMemo(
    () => buildThreadIndex(messages.filter((m) => m.inReplyTo)),
    [messages]
  )
  const rows = useMemo(() => groupMessages(roots, lastReadAt), [roots, lastReadAt])

  const ids = useMemo(() => roots.map((m) => m.id), [roots])
  const labelsByTarget = useTrustedContentLabelsBatch(ids)
  const blocks = useBlockList()
  const hiddenCount = roots.filter(
    (m) => m.createdBy && hidesContent(blocks.list, m.createdBy)
  ).length
  const unreadAhead = roots.filter((m) => (m.createdAt ?? 0) > lastReadAt).length

  const scrollToBottom = () => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  // Reset to the bottom when switching channels; stop animating history.
  useEffect(() => {
    mountedAtRef.current = Date.now()
    atBottomRef.current = true
    setShowPill(false)
    scrollToBottom()
  }, [channelId])

  // Stick to the bottom on new messages only when already near it.
  useEffect(() => {
    if (atBottomRef.current) scrollToBottom()
  }, [messages.length])

  const handleScroll = () => {
    const el = listRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    atBottomRef.current = near
    setShowPill(!near)
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {roots.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-ink-3">
          No messages yet. Say hi!
        </div>
      ) : (
        <ul
          ref={listRef}
          onScroll={handleScroll}
          role="log"
          aria-label="Messages"
          aria-live="polite"
          className="scroll-fade m-0 min-h-0 flex-1 list-none overflow-y-auto p-0 py-2"
        >
          {hiddenCount > 0 && (
            <li className="px-4 py-1 text-[10px] text-ink-3">
              🛡 {hiddenCount} message(s) hidden by your block/mute list
            </li>
          )}
          {rows.map((row) => {
            const trusted = labelsByTarget.get(row.message.id)
            return (
              <MessageRow
                key={row.message.id}
                row={row}
                profiles={profiles}
                linkTargets={linkTargets}
                labels={trusted?.labels ?? []}
                attribution={trusted ? attributionText(trusted.attributions) : undefined}
                hiddenByBlock={
                  row.message.createdBy ? hidesContent(blocks.list, row.message.createdBy) : false
                }
                me={me}
                authorStatus={
                  row.message.createdBy ? presenceByDid.get(row.message.createdBy) : undefined
                }
                density={density}
                animateIn={(row.message.createdAt ?? 0) > mountedAtRef.current}
                isEditing={editingId === row.message.id}
                onStartEdit={() => onStartEdit(row.message)}
                onCancelEdit={onCancelEdit}
                onSubmitEdit={(content) => onSubmitEdit(row.message, content)}
                onReply={() => onReply(row.message)}
                onDelete={onDelete ? () => onDelete(row.message) : undefined}
                onRemovePreview={onRemovePreview}
                thread={threadIndex.get(row.message.id)}
                onOpenThread={() => onOpenThread(row.message.id)}
              />
            )
          })}
        </ul>
      )}

      {showPill && (
        <button
          type="button"
          onClick={() => {
            scrollToBottom()
            atBottomRef.current = true
            setShowPill(false)
          }}
          className="absolute bottom-3 right-4 flex animate-fade-in items-center gap-1.5 rounded-full border border-hairline bg-surface-0 px-3 py-1.5 text-xs text-ink-1 shadow-sm hover:bg-surface-2 motion-reduce:animate-none"
        >
          <ArrowDown size={13} strokeWidth={2} />
          {unreadAhead > 0 ? `${unreadAhead} new` : 'Jump to latest'}
        </button>
      )}

      <TypingLine peers={typingPeers} profiles={profiles} />
    </div>
  )
}
