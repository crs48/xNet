import type { CommunityData, Conversation } from './use-community-data'
import type { BlobService, BlobTransferQueue, FileRef } from '@xnetjs/data'
import { compareMessages } from '@xnetjs/comms'
import { ChatMessageSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import {
  ArrowLeft,
  ArrowUp,
  Check,
  Download,
  File,
  Image,
  Info,
  Paperclip,
  Phone,
  Reply,
  Search,
  Trash2,
  Video,
  X
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { audienceLabel, bytesLabel, type Audience } from './model'
import { Avatar, EmptyState, IconButton, inputClass, secondaryButton } from './primitives'

type Message = ReturnType<typeof useMessages>['messages'][number]
function useMessages(channelId: string, limit: number, search: string) {
  const query = useQuery(ChatMessageSchema, {
    where: { channel: channelId },
    orderBy: { createdAt: 'desc' },
    limit,
    ...(search.trim() ? { search: search.trim() } : {})
  })
  const messages = useMemo(() => [...query.data].sort(compareMessages), [query.data])
  return { ...query, messages }
}
export interface AttachmentServices {
  blobs: BlobService | null
  transfers?: BlobTransferQueue | null
}
export function Attachment({ file, services }: { file: FileRef; services: AttachmentServices }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = async () => {
    setBusy(true)
    setError('')
    try {
      if (!services.blobs) throw new Error('File storage is not available.')
      if (!(await services.blobs.has(file)) && services.transfers)
        await services.transfers.ensureLocal(file)
      setUrl(await services.blobs.getUrl(file))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  const image = /^image\/(png|jpeg|webp|gif|avif)$/.test(file.mimeType)
  const video = /^video\/(mp4|webm|ogg)$/.test(file.mimeType)
  const audio = /^audio\//.test(file.mimeType)
  return (
    <div className="my-2 max-w-sm overflow-hidden rounded-xl border border-border bg-background text-foreground">
      {url && image && <img src={url} alt={file.name} className="max-h-64 w-full object-contain" />}
      {url && video && <video src={url} controls preload="metadata" className="max-h-64 w-full" />}
      {url && audio && <audio src={url} controls preload="metadata" className="w-full" />}
      <div className="flex items-center gap-3 p-3">
        {image ? <Image size={20} /> : video ? <Video size={20} /> : <File size={20} />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="text-xs text-muted-foreground">{bytesLabel(file.size)}</p>
        </div>
        {url ? (
          <a
            href={url}
            download={file.name}
            aria-label={`Download ${file.name}`}
            className="rounded-lg p-2 hover:bg-muted"
          >
            <Download size={17} />
          </a>
        ) : (
          <button
            onClick={() => void load()}
            disabled={busy}
            className="rounded-lg px-2 py-1 text-xs font-medium hover:bg-muted"
          >
            {busy ? 'Loading…' : 'Open'}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="px-3 pb-3 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
function MessageRow({
  message,
  previous,
  data,
  services,
  onReply,
  onDelete
}: {
  message: Message
  previous?: Message
  data: CommunityData
  services: AttachmentServices
  onReply: () => void
  onDelete: () => void
}) {
  const own = message.createdBy === data.did
  const grouped =
    previous?.createdBy === message.createdBy &&
    message.createdAt - previous.createdAt < 300000 &&
    !message.inReplyTo
  const name = data.nameFor(message.createdBy)
  return (
    <article
      id={`message-${message.id}`}
      aria-label={`Message from ${name}`}
      className={`group flex gap-3 px-6 ${grouped ? 'pt-1' : 'pt-6'} hover:bg-muted/30`}
    >
      <div className="w-10 shrink-0">{!grouped && <Avatar name={name} />}</div>
      <div className="min-w-0 flex-1 pb-1">
        {!grouped && (
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-sm font-semibold">
              {name}
              {own && name !== 'You' && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">you</span>
              )}
            </span>
            <time
              dateTime={new Date(message.createdAt).toISOString()}
              className="text-[11px] text-muted-foreground"
            >
              {new Date(message.createdAt).toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit'
              })}
            </time>
          </div>
        )}
        {message.inReplyTo && (
          <p className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Reply size={12} />
            Reply in this conversation
          </p>
        )}
        <p
          className={`whitespace-pre-wrap break-words text-[14px] leading-[1.65] ${message.redacted ? 'italic text-muted-foreground' : ''}`}
        >
          {message.redacted ? 'Message removed' : message.content}
        </p>
        {!message.redacted &&
          message.attachments?.map((file) => (
            <Attachment key={file.cid} file={file} services={services} />
          ))}
        {message.edited && !message.redacted && (
          <span className="text-[10px] text-muted-foreground">edited</span>
        )}
      </div>
      {!message.redacted && (
        <div className="flex self-start opacity-0 focus-within:opacity-100 group-hover:opacity-100">
          <IconButton label={`Reply to ${name}`} onClick={onReply}>
            <Reply size={15} />
          </IconButton>
          {own && (
            <IconButton label="Remove message" onClick={onDelete}>
              <Trash2 size={15} />
            </IconButton>
          )}
        </div>
      )}
    </article>
  )
}
export function ConversationPane({
  channel,
  data,
  services,
  onBack,
  onDetails,
  onCall
}: {
  channel: Conversation
  data: CommunityData
  services: AttachmentServices
  onBack: () => void
  onDetails: () => void
  onCall: (video: boolean) => void
}) {
  const [tab, setTab] = useState<'conversation' | 'media'>('conversation')
  const [searching, setSearching] = useState(false)
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(100)
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [reply, setReply] = useState<Message | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const { messages, loading, error: queryError, reload } = useMessages(channel.id, limit, search)
  const scroller = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const nearBottom = useRef(true)
  const space = data.spaces.find((entry) => entry.id === channel.space)
  const audience = (space?.visibility ?? 'private') as Audience
  const title =
    channel.name ||
    (channel.members ?? [])
      .filter((did) => did !== data.did)
      .map(data.nameFor)
      .join(', ') ||
    'Conversation'
  const draftKey = `xnet:chat-draft:${data.did}:${channel.id}`
  useEffect(() => {
    try {
      setDraft(localStorage.getItem(draftKey) ?? '')
    } catch {
      setError('This device cannot restore saved drafts.')
    }
  }, [draftKey])
  useEffect(() => {
    if (nearBottom.current && !search)
      scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [messages, search])
  const setDraftAndPersist = (value: string) => {
    setDraft(value)
    setSaved(false)
    try {
      if (value) localStorage.setItem(draftKey, value)
      else localStorage.removeItem(draftKey)
    } catch {
      setError('Your draft is in memory only; this device cannot save it.')
    }
  }
  const send = async () => {
    if ((!draft.trim() && !files.length) || busy) return
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      if (!data.bridge) throw new Error('The local store is still loading.')
      const attachments: FileRef[] = []
      if (files.length && !services.blobs) throw new Error('Attachment storage is not available.')
      for (const file of files) attachments.push(await services.blobs!.upload(file))
      await data.bridge.create(ChatMessageSchema, {
        channel: channel.id,
        content: draft.trim() || attachments.map((file) => file.name).join(', '),
        ...(attachments.length ? { attachments } : {}),
        ...(reply ? { inReplyTo: reply.inReplyTo || reply.id } : {})
      })
      for (const attachment of attachments) services.transfers?.enqueueUpload(attachment)
      setDraftAndPersist('')
      setFiles([])
      setReply(null)
      setSaved(true)
      nearBottom.current = true
      composer.current?.focus()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  const addFiles = (incoming: File[]) => {
    if (
      incoming.some((file) => file.size > 100 * 1024 * 1024) ||
      files.length + incoming.length > 8
    ) {
      setError('Attach up to 8 files, each smaller than 100 MB.')
      return
    }
    setFiles((previous) => [...previous, ...incoming])
    setError('')
  }
  return (
    <section
      aria-label={title}
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-background"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        if (!busy) addFiles(Array.from(event.dataTransfer.files))
      }}
    >
      <header className="flex h-[78px] shrink-0 items-center gap-1.5 border-b border-border px-3 sm:gap-3 sm:px-4 md:px-6">
        <IconButton label="Back to conversations" onClick={onBack} className="md:!hidden">
          <ArrowLeft size={19} />
        </IconButton>
        <span className="hidden sm:block">
          <Avatar name={title} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold tracking-tight">
            {channel.kind !== 'dm' && (
              <span className="mr-1 font-normal text-muted-foreground">#</span>
            )}
            {title}
          </h1>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {space?.name && space.name !== title ? `${space.name} · ` : ''}
            {audienceLabel[audience]}
          </p>
        </div>
        <IconButton label="Start voice call" onClick={() => onCall(false)}>
          <Phone size={18} />
        </IconButton>
        <IconButton label="Start video call" onClick={() => onCall(true)}>
          <Video size={19} />
        </IconButton>
        <span className="mx-1 h-5 w-px bg-border" />
        <IconButton
          label="Search conversation"
          onClick={() => {
            setSearching(!searching)
            setSearch('')
          }}
        >
          <Search size={18} />
        </IconButton>
        <IconButton label="Conversation details" onClick={onDetails}>
          <Info size={18} />
        </IconButton>
      </header>
      <div
        className="flex h-11 shrink-0 items-center gap-6 border-b border-border px-6"
        role="tablist"
        aria-label="Conversation views"
      >
        {(['conversation', 'media'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`h-full border-b-2 text-xs font-medium ${tab === value ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground'}`}
          >
            {value === 'conversation' ? 'Conversation' : 'Shared media'}
          </button>
        ))}
        <span className="ml-auto hidden text-[11px] text-muted-foreground sm:block">
          Your space. Your conversation.
        </span>
      </div>
      {searching && (
        <div className="flex items-center gap-2 border-b border-border px-6 py-3">
          <Search size={17} className="text-muted-foreground" />
          <input
            autoFocus
            aria-label="Search messages in conversation"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search this conversation…"
            className={`${inputClass} !border-0 !p-1`}
          />
          <IconButton
            label="Close search"
            onClick={() => {
              setSearching(false)
              setSearch('')
            }}
          >
            <X size={16} />
          </IconButton>
        </div>
      )}
      <div
        ref={scroller}
        onScroll={() => {
          const node = scroller.current
          if (node)
            nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 120
        }}
        className="min-h-0 flex-1 overflow-y-auto pb-6"
      >
        {queryError && (
          <div role="alert" className="p-6 text-sm">
            Could not load messages: {queryError.message}
            <button onClick={reload} className={`${secondaryButton} ml-2`}>
              Retry
            </button>
          </div>
        )}
        {loading && (
          <p role="status" className="p-6 text-sm text-muted-foreground">
            Loading messages…
          </p>
        )}
        {messages.length >= limit && (
          <div className="p-4 text-center">
            <button onClick={() => setLimit((value) => value + 100)} className={secondaryButton}>
              Load earlier messages
            </button>
          </div>
        )}
        {!loading && !queryError && !messages.length && (
          <EmptyState
            icon={<span className="text-2xl">#</span>}
            title={search ? 'No matching messages' : `This is the start of ${title}`}
            description={
              search
                ? 'Try a different word or clear the search to return to the conversation.'
                : channel.topic ||
                  'A little place to stay in touch. Send a message, share a moment, or start a call.'
            }
          />
        )}
        {tab === 'conversation' ? (
          messages.map((message, index) => (
            <div key={message.id}>
              {(index === 0 ||
                new Date(messages[index - 1].createdAt).toDateString() !==
                  new Date(message.createdAt).toDateString()) && (
                <div className="mx-6 mb-2 mt-7 flex items-center gap-4">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {new Date(message.createdAt).toLocaleDateString([], {
                      month: 'long',
                      day: 'numeric'
                    })}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}
              <MessageRow
                message={message}
                previous={messages[index - 1]}
                data={data}
                services={services}
                onReply={() => {
                  setReply(message)
                  composer.current?.focus()
                }}
                onDelete={() => setDeleteId(message.id)}
              />
            </div>
          ))
        ) : (
          <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-2">
            {messages.flatMap((message) =>
              message.redacted
                ? []
                : (message.attachments ?? []).map((file) => (
                    <Attachment key={`${message.id}-${file.cid}`} file={file} services={services} />
                  ))
            )}
            {messages.length > 0 &&
              !messages.some((message) => !message.redacted && message.attachments?.length) && (
                <p className="text-sm text-muted-foreground">
                  No attachments in the loaded conversation history.
                </p>
              )}
          </div>
        )}
      </div>
      {deleteId && (
        <div className="flex items-center justify-between gap-2 border-t border-border bg-muted px-6 py-3 text-sm">
          <span>Remove your message? Copies may remain on other devices.</span>
          <button className={secondaryButton} onClick={() => setDeleteId(null)}>
            Cancel
          </button>
          <button
            className={secondaryButton}
            onClick={() => {
              void data.bridge
                ?.update(deleteId, { content: '', redacted: true, attachments: null })
                .then(() => setDeleteId(null))
                .catch((cause: unknown) => setError(String(cause)))
            }}
          >
            Remove
          </button>
        </div>
      )}
      <div className="shrink-0 px-4 pb-4 md:px-6">
        {reply && (
          <div className="flex items-center justify-between rounded-t-xl border border-b-0 border-border bg-muted px-4 py-2">
            <p className="truncate text-xs">
              <Reply size={12} className="mr-2 inline" />
              Replying to {data.nameFor(reply.createdBy)}: {reply.content?.slice(0, 80)}
            </p>
            <IconButton label="Cancel reply" onClick={() => setReply(null)}>
              <X size={14} />
            </IconButton>
          </div>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
          className={`border border-border bg-background p-3 focus-within:border-foreground/40 ${reply ? 'rounded-b-xl' : 'rounded-xl'}`}
        >
          {files.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {files.map((file, index) => (
                <span
                  key={`${file.name}-${index}`}
                  className="inline-flex items-center gap-1 rounded-md bg-muted pl-2 text-xs"
                >
                  {file.name}
                  <IconButton
                    label={`Remove attachment ${file.name}`}
                    disabled={busy}
                    onClick={() => setFiles((previous) => previous.filter((_, i) => i !== index))}
                  >
                    <X size={12} />
                  </IconButton>
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={composer}
            aria-label={`Message ${title}`}
            value={draft}
            disabled={busy}
            maxLength={10000}
            onChange={(event) => setDraftAndPersist(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                void send()
              }
            }}
            rows={2}
            placeholder={`Message ${channel.kind === 'dm' ? title : `#${title}`}…`}
            className="w-full resize-none bg-transparent px-1 py-1 text-sm leading-6 outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                onChange={(event) => {
                  addFiles(Array.from(event.target.files ?? []))
                  event.target.value = ''
                }}
              />
              <IconButton
                label="Attach files"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip size={18} />
              </IconButton>
              <span className="text-[11px] text-muted-foreground">
                {files.length
                  ? 'Files stay on this device until shared with a host.'
                  : 'Enter to send · Shift + Enter for a new line'}
              </span>
            </div>
            <button
              type="submit"
              aria-label="Send message"
              disabled={busy || (!draft.trim() && !files.length)}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground text-background disabled:opacity-30"
            >
              {busy ? <span className="animate-pulse">…</span> : <ArrowUp size={19} />}
            </button>
          </div>
        </form>
        {error && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {error}
          </p>
        )}
        <div
          aria-live="polite"
          className="mt-2 flex min-h-4 items-center gap-1 text-[10px] text-muted-foreground"
        >
          {saved && (
            <>
              <Check size={11} />
              Saved on this device. Delivery to others is not confirmed.
            </>
          )}
        </div>
      </div>
    </section>
  )
}
