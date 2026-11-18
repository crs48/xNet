import type { CommunityData } from './use-community-data'
import { ChatMessageSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import { ArrowUp, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChatContent } from './ChatContent'
import { isPeerRecord, peerMessagePrefix } from './peer-contract'
import { IconButton, primaryButton } from './primitives'
import { useChatHistory } from './use-chat-history'
import { VirtualChatTimeline } from './VirtualChatTimeline'

export function ChatThread({
  rootId,
  channelId,
  data,
  readOnly,
  onClose
}: {
  rootId: string
  channelId: string
  data: CommunityData
  readOnly: boolean
  onClose: () => void
}) {
  const root = useQuery(ChatMessageSchema, rootId)
  const history = useChatHistory(channelId, '', rootId)
  const draftKey = `xnet:thread-draft:${data.did}:${rootId}`
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  useLayoutEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [rootId])
  useEffect(() => {
    try {
      setDraft(localStorage.getItem(draftKey) ?? '')
    } catch {
      setError('This device cannot restore your draft.')
    }
  }, [draftKey])
  const changeDraft = (value: string) => {
    setDraft(value)
    try {
      if (value) localStorage.setItem(draftKey, value)
      else localStorage.removeItem(draftKey)
    } catch {
      setError('Your draft is in memory only.')
    }
  }
  const available = root.data?.channel === channelId
  const send = async () => {
    if (!draft.trim() || busy || readOnly || !available) return
    setBusy(true)
    setError('')
    try {
      if (!data.bridge || !data.did) throw new Error('Your local data is still loading.')
      await data.bridge.create(
        ChatMessageSchema,
        { channel: channelId, content: draft.trim(), inReplyTo: rootId },
        isPeerRecord(channelId)
          ? `${peerMessagePrefix(channelId, data.did)}${crypto.randomUUID()}`
          : undefined
      )
      changeDraft('')
      history.jumpToLatest()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <aside
      aria-label="Message thread"
      onKeyDownCapture={(event) => {
        // Closing the thread also dismisses its tooltips. Portaled dialogs keep their own Escape.
        if (
          event.key === 'Escape' &&
          !event.nativeEvent.isComposing &&
          event.currentTarget.contains(event.target as Node)
        ) {
          event.stopPropagation()
          onClose()
        }
      }}
      className="chat-thread flex min-h-0 min-w-0 flex-1 flex-col border-l border-border bg-background "
    >
      <header className="flex h-[68px] shrink-0 items-center justify-between border-b border-border/60 px-5">
        <div>
          <h2 ref={heading} tabIndex={-1} className="text-sm font-semibold outline-none">
            Thread
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Same people and access as this chat</p>
        </div>
        <IconButton label="Close thread" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </header>
      <div className="max-h-48 shrink-0 overflow-y-auto border-b border-border bg-muted/20 p-4 text-sm">
        {root.loading ? (
          'Loading original message…'
        ) : root.error ? (
          <p role="alert">{root.error.message}</p>
        ) : !available ? (
          'Original message is unavailable in this chat.'
        ) : (
          <>
            <p className="mb-2 text-xs font-medium">{data.nameFor(root.data?.createdBy)}</p>
            {root.data?.redacted ? (
              <p className="italic text-muted-foreground">Message removed</p>
            ) : (
              <ChatContent content={root.data?.content ?? ''} services={{ blobs: null }} />
            )}
          </>
        )}
      </div>
      {available && (
        <VirtualChatTimeline
          selfDid={data.did}
          label="Thread replies"
          history={history}
          activity={null}
          empty={
            <p className="p-6 text-sm text-muted-foreground">
              Keep this topic going. Replies stay connected to the original message.
            </p>
          }
          renderMessage={(message) => (
            <div className="px-5 py-3">
              <p className="mb-1 text-xs font-medium">
                {data.nameFor(message.createdBy)}
                <time className="ml-2 font-normal text-muted-foreground">
                  {new Date(message.createdAt).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                </time>
              </p>
              {message.redacted ? (
                <p className="text-sm italic text-muted-foreground">Message removed</p>
              ) : (
                <ChatContent content={message.content ?? ''} services={{ blobs: null }} />
              )}
            </div>
          )}
        />
      )}
      <form
        className="shrink-0 space-y-2 border-t border-border p-4"
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        <textarea
          aria-label="Reply in thread"
          className="chat-composer min-h-20 w-full resize-none rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-foreground"
          placeholder={readOnly ? 'Join this chat to reply' : 'Reply in thread…'}
          value={draft}
          onChange={(event) => changeDraft(event.target.value)}
          maxLength={isPeerRecord(channelId) ? 4000 : 9900}
          disabled={readOnly || !available}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              void send()
            }
          }}
        />
        <div className="flex justify-end">
          <button
            aria-label="Send thread reply"
            className={primaryButton}
            disabled={busy || readOnly || !available || !draft.trim()}
          >
            <ArrowUp size={15} />
            {busy ? 'Sending…' : 'Reply'}
          </button>
        </div>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </form>
    </aside>
  )
}
