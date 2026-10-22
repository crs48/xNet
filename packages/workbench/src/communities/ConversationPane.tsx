import type { CommunityAgentRun } from './agent-contract'
import type { AttachmentServices } from './ChatAttachment'
import type { CommunityAgents } from './use-community-agents'
import type { CommunityData, Conversation } from './use-community-data'
import type { FileRef } from '@xnetjs/data'
export type { AttachmentServices } from './ChatAttachment'
import { ChatMessageSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import {
  AtSign,
  Bot,
  Blocks,
  ArrowLeft,
  ArrowUp,
  Check,
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
import { agentReplyContent } from './agent-activity'
import { AgentRunCards, AgentRunHistory, AgentRunReceipt } from './AgentRunCards'
import { fileMimeType } from './chat-media'
import { Attachment } from './ChatAttachment'
import { ChatContent } from './ChatContent'
import { ChatExtensionPanel } from './ChatExtensionPanel'
import { readDevelopmentEntry } from './extension-development'
import { EXTENSION_SHARE_MIME, type SharedExtension } from './extension-versions'
import { createExtensionVersion } from './extension-versions'
import { ExtensionProjects, publishDevelopment } from './ExtensionProjects'
import { audienceLabel, type Audience } from './model'
import { Avatar, EmptyState, IconButton, inputClass, secondaryButton } from './primitives'
import { SharedExtensionAttachment } from './SharedExtensionAttachment'
import { useChatHistory, type ChatMessage as Message } from './use-chat-history'
import { useChatPreviews } from './use-chat-previews'
import { VirtualChatTimeline } from './VirtualChatTimeline'

function MessageRow({
  message,
  agentRun,
  previous,
  data,
  services,
  onReply,
  onDelete,
  onReviewExtension,
  onSharedExtension
}: {
  message: Message
  agentRun?: CommunityAgentRun
  previous?: Message
  data: CommunityData
  services: AttachmentServices
  onReply: () => void
  onDelete: () => void
  onReviewExtension: (id: string) => void
  onSharedExtension: (version: SharedExtension) => void
}) {
  const own = message.createdBy === data.did
  const grouped =
    !agentRun &&
    !previous?.id.startsWith('agent-reply-') &&
    previous?.createdBy === message.createdBy &&
    message.createdAt - previous.createdAt < 300000 &&
    !message.inReplyTo
  const name = agentRun
    ? agentRun.provider === 'codex'
      ? 'Codex'
      : 'Claude'
    : data.nameFor(message.createdBy)
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
              {agentRun && (
                <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                  AI · saved by {data.nameFor(message.createdBy)}
                </span>
              )}
              {own && !agentRun && name !== 'You' && (
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
        {message.redacted ? (
          <p className="text-sm italic text-muted-foreground">Message removed</p>
        ) : (
          <ChatContent
            content={
              agentRun && message.content
                ? agentReplyContent(message.content, agentRun)
                : (message.content ?? '')
            }
            previews={message.linkPreviews}
            services={services}
          />
        )}
        {!message.redacted && agentRun && <AgentRunReceipt run={agentRun} />}
        {!message.redacted && agentRun?.extension && (
          <button
            className={`${secondaryButton} mt-2`}
            onClick={() => onReviewExtension(agentRun.id)}
          >
            <Blocks size={14} /> Preview {agentRun.extension.title}
          </button>
        )}
        {!message.redacted &&
          message.attachments?.map((file) =>
            file.mimeType === EXTENSION_SHARE_MIME ? (
              <SharedExtensionAttachment
                key={file.cid}
                file={file}
                services={services}
                sender={message.createdBy}
                onOpen={onSharedExtension}
              />
            ) : (
              <Attachment key={file.cid} file={file} services={services} />
            )
          )}
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
  agents,
  onAgentSettings,
  channel,
  data,
  services,
  onBack,
  onDetails,
  onCall
}: {
  agents: CommunityAgents
  onAgentSettings: () => void
  channel: Conversation
  data: CommunityData
  services: AttachmentServices
  onBack: () => void
  onDetails: () => void
  onCall: (video: boolean) => void
}) {
  const binding = agents.snapshot.bindings.find(
    (entry) => entry.channelId === channel.id && entry.enabled
  )
  const [extensionOpen, setExtensionOpen] = useState(false)
  const [extensionRunId, setExtensionRunId] = useState<string | undefined>()
  const [sharedExtension, setSharedExtension] = useState<SharedExtension | undefined>()
  const [selectedProject, setSelectedProject] = useState('')
  const [projectEditBase, setProjectEditBase] = useState<{
    project: string
    version: string
    nonce: number
  } | null>(null)
  const [projectPreview, setProjectPreview] = useState<{ project: string; version: string } | null>(
    null
  )
  const [remixBase, setRemixBase] = useState<{ id: string; title: string } | null>(null)
  const [mention, setMention] = useState(false)
  const [mentionPicker, setMentionPicker] = useState(false)
  const [pendingRequest, setPendingRequest] = useState<
    Parameters<NonNullable<typeof agents.port>['start']>[0] | null
  >(null)
  const agentName = binding?.provider === 'claude' ? 'Claude' : 'Codex'
  const agentBusy = agents.snapshot.runs.some(
    (run) => run.channelId === channel.id && run.status === 'running'
  )
  const [tab, setTab] = useState<'conversation' | 'media' | 'activity' | 'extensions'>(
    'conversation'
  )
  const [searching, setSearching] = useState(false)
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [reply, setReply] = useState<Message | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const history = useChatHistory(channel.id, search)
  const { messages, loading, error: queryError, reload } = history
  const conversationMessages = useMemo(
    () =>
      messages.filter(
        (message) =>
          !['attempt', 'host', 'accept', 'withdraw'].includes(message.developmentKind ?? '')
      ),
    [messages]
  )
  const recentContext = useQuery(ChatMessageSchema, {
    where: { channel: channel.id },
    orderBy: { createdAt: 'desc' },
    page: { first: 30, count: 'none' },
    enabled: !!binding
  })
  const scroller = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
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
  const previews = useChatPreviews(draft, services, channel.id)
  const send = async () => {
    if (
      (!draft.trim() && !files.length) ||
      busy ||
      (agentBusy && (mention || binding?.mode === 'direct'))
    )
      return
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      if (!data.bridge) throw new Error('The local store is still loading.')
      if (binding && (binding.mode === 'direct' || mention)) {
        if (recentContext.error) throw recentContext.error
        if (recentContext.loading)
          throw new Error('Recent messages are still loading. Try again in a moment.')
      }
      const finishPreviews = previews.prepare()
      const attachments: FileRef[] = []
      if (files.length && !services.blobs) throw new Error('Attachment storage is not available.')
      for (const file of files)
        attachments.push(
          await services.blobs!.upload(
            new globalThis.File([file], file.name, { type: fileMimeType(file.name, file.type) })
          )
        )
      const sent = await data.bridge.create(ChatMessageSchema, {
        channel: channel.id,
        linkPreviews: [],
        content: `${mention ? `@${agentName}\n\n` : ''}${draft.trim() || attachments.map((file) => file.name).join(', ')}`,
        ...(attachments.length ? { attachments } : {}),
        ...(reply ? { inReplyTo: reply.inReplyTo || reply.id } : {})
      })
      for (const attachment of attachments) services.transfers?.enqueueUpload(attachment)
      // Sending never waits for the network. Only the sender adds the snapshot;
      // a redacted message must not regain media when an in-flight fetch finishes.
      const bridge = data.bridge
      void finishPreviews()
        .then(async (linkPreviews) => {
          if (!linkPreviews.length) return
          const current = await bridge.get?.(sent.id)
          if (
            current &&
            !current.properties.redacted &&
            current.properties.content === sent.properties.content
          )
            await bridge.update(sent.id, { linkPreviews })
        })
        .catch((cause: unknown) =>
          setError(`Message saved, but its preview could not be saved: ${String(cause)}`)
        )
      previews.reset()
      setDraftAndPersist('')
      setFiles([])
      setReply(null)
      setSaved(true)
      history.jumpToLatest()
      composer.current?.focus()
      if (binding && agents.port && (binding.mode === 'direct' || mention)) {
        const contextIds = [...recentContext.data]
          .reverse()
          .filter((message) => !message.redacted)
          .map((message) => message.id)
        const request = {
          channelId: channel.id,
          messageId: sent.id,
          contextIds,
          ...(remixBase ? { extensionRevisionId: remixBase.id } : {})
        }
        setPendingRequest(request)
        await agents.port.start(request)
        setPendingRequest(null)
        setRemixBase(null)
      }
      setMention(false)
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
    <div className="flex min-h-0 min-w-0 flex-1">
      <section
        aria-label={title}
        className={`${extensionOpen ? 'hidden lg:flex' : 'flex'} min-h-0 min-w-0 flex-1 flex-col bg-background`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          if (!busy) addFiles(Array.from(event.dataTransfer.files))
        }}
      >
        <header className="flex min-h-[78px] shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-3 py-3 sm:gap-3 sm:px-4 md:px-6">
          <IconButton label="Back to conversations" onClick={onBack} className="md:!hidden">
            <ArrowLeft size={19} />
          </IconButton>
          <span className="hidden sm:block">
            <Avatar name={title} />
          </span>
          <div className="min-w-[120px] flex-1">
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
          <div
            className="ml-auto flex shrink-0 items-center gap-1.5"
            role="group"
            aria-label="Conversation actions"
          >
            <IconButton
              label="Conversation extensions"
              onClick={() => {
                setSharedExtension(undefined)
                setExtensionRunId(undefined)
                setExtensionOpen(!extensionOpen)
              }}
            >
              <Blocks size={18} />
            </IconButton>
            <IconButton label="Conversation agent" onClick={onAgentSettings}>
              <Bot size={18} />
            </IconButton>
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
          </div>
        </header>
        <div
          className="flex h-11 shrink-0 items-center gap-4 overflow-x-auto border-b border-border px-6"
          role="tablist"
          aria-label="Conversation views"
        >
          {(
            [
              'conversation',
              'extensions',
              'media',
              ...(agents.port ? ['activity' as const] : [])
            ] as const
          ).map((value) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => {
                setTab(value)
                scroller.current?.scrollTo({ top: 0 })
              }}
              className={`h-full shrink-0 border-b-2 text-xs font-medium ${tab === value ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground'}`}
            >
              {value === 'conversation'
                ? 'Conversation'
                : value === 'extensions'
                  ? 'Build together'
                  : value === 'media'
                    ? 'Shared media'
                    : 'Agent activity'}
            </button>
          ))}
        </div>
        {binding && tab !== 'extensions' && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-6 py-2 text-[11px] text-muted-foreground">
            <Bot size={13} />
            <span>
              {agentName} · your login ·{' '}
              {binding.context === 'question'
                ? 'this message only'
                : 'recent text, drafts + agent memory'}{' '}
              · attachments excluded
            </span>
            <button className="ml-auto underline" onClick={onAgentSettings}>
              Settings
            </button>
            <button
              className="underline"
              onClick={() => {
                void agents.port
                  ?.reset(channel.id)
                  .catch((cause: unknown) => agents.setError(String(cause)))
              }}
            >
              Reset agent memory
            </button>
          </div>
        )}
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
        {tab === 'conversation' ? (
          <VirtualChatTimeline
            key={search.trim()}
            history={{ ...history, messages: conversationMessages }}
            empty={
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
            }
            activity={
              search.trim() ? null : <AgentRunCards agents={agents} channelId={channel.id} />
            }
            renderMessage={(message, index) => (
              <div key={message.id}>
                {(index === 0 ||
                  new Date(conversationMessages[index - 1].createdAt).toDateString() !==
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
                  agentRun={agents.snapshot.runs.find(
                    (run) =>
                      run.replyId === message.id &&
                      run.owner === message.createdBy &&
                      run.status === 'completed'
                  )}
                  previous={conversationMessages[index - 1]}
                  data={data}
                  services={services}
                  onReply={() => {
                    setReply(message)
                    composer.current?.focus()
                  }}
                  onDelete={() => setDeleteId(message.id)}
                  onSharedExtension={(version) => {
                    setProjectPreview(null)
                    setExtensionRunId(undefined)
                    setSharedExtension(version)
                    setExtensionOpen(true)
                  }}
                  onReviewExtension={(id) => {
                    setProjectPreview(null)
                    setSharedExtension(undefined)
                    setExtensionRunId(id)
                    setExtensionOpen(true)
                  }}
                />
                {message.developmentProject && (
                  <button
                    className="mb-3 ml-16 text-xs underline"
                    onClick={() => {
                      setSelectedProject(message.developmentProject!)
                      setTab('extensions')
                    }}
                  >
                    Open extension conversation
                  </button>
                )}
              </div>
            )}
          />
        ) : (
          <div ref={scroller} data-chat-scroll className="min-h-0 flex-1 overflow-y-auto pb-6">
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
            {tab === 'media' && history.hasOlder && (
              <div className="p-4 text-center">
                <button
                  onClick={history.older}
                  disabled={loading || !!queryError}
                  className={secondaryButton}
                >
                  Load earlier messages
                </button>
              </div>
            )}
            {tab === 'media' && !loading && !queryError && !messages.length && (
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
            {tab === 'extensions' ? (
              <ExtensionProjects
                data={data}
                agents={agents}
                channel={channel}
                selectedProject={selectedProject}
                editBase={projectEditBase}
                onSelectProject={setSelectedProject}
                onSettings={onAgentSettings}
                onPreview={(version, project, entry) => {
                  setProjectPreview({ project, version: entry })
                  setSharedExtension(version)
                  setExtensionRunId(undefined)
                  setExtensionOpen(true)
                }}
              />
            ) : tab === 'media' ? (
              <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-2">
                {messages.flatMap((message) =>
                  message.redacted
                    ? []
                    : (message.attachments ?? []).map((file) => (
                        <Attachment
                          key={`${message.id}-${file.cid}`}
                          file={file}
                          services={services}
                        />
                      ))
                )}
                {messages.length > 0 &&
                  !messages.some((message) => !message.redacted && message.attachments?.length) && (
                    <p className="text-sm text-muted-foreground">
                      No attachments in the loaded conversation history.
                    </p>
                  )}
              </div>
            ) : (
              <AgentRunHistory
                agents={agents}
                channelId={channel.id}
                onPreview={(id) => {
                  setSharedExtension(undefined)
                  setExtensionRunId(id)
                  setExtensionOpen(true)
                }}
              />
            )}
            {tab === 'media' && history.offset > 0 && (
              <div className="flex justify-center gap-3 p-4">
                <button
                  onClick={history.newer}
                  disabled={loading || !!queryError}
                  className={secondaryButton}
                >
                  Load newer messages
                </button>
                <button onClick={history.jumpToLatest} className={secondaryButton}>
                  Jump to latest
                </button>
              </div>
            )}
          </div>
        )}
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
                  ?.update(deleteId, {
                    content: '',
                    redacted: true,
                    attachments: null,
                    linkPreviews: null
                  })
                  .then(() => setDeleteId(null))
                  .catch((cause: unknown) => setError(String(cause)))
              }}
            >
              Remove
            </button>
          </div>
        )}
        <div className={tab === 'extensions' ? 'hidden' : 'shrink-0 px-4 pb-4 md:px-6'}>
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
            {(mention || binding?.mode === 'direct') && binding && (
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1">
                  <Bot size={13} />
                  {agentName}
                  {mention && (
                    <button
                      aria-label="Remove agent mention"
                      onClick={() => setMention(false)}
                      type="button"
                    >
                      <X size={12} />
                    </button>
                  )}
                </span>
                <span className="text-muted-foreground">Only you can invoke this agent</span>
              </div>
            )}
            {mentionPicker && binding && (
              <button
                type="button"
                className={`${secondaryButton} mb-2`}
                onClick={() => {
                  setMention(true)
                  setMentionPicker(false)
                  setDraftAndPersist(draft.replace(/(^|\s)@\w*$/, '$1'))
                  composer.current?.focus()
                }}
              >
                <Bot size={14} />
                Mention {agentName} · your local runtime
              </button>
            )}
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
            {remixBase && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
                <Blocks size={14} />
                <span className="flex-1">
                  Editing {remixBase.title}. Describe your changes below.
                </span>
                <IconButton label="Clear extension edit context" onClick={() => setRemixBase(null)}>
                  <X size={13} />
                </IconButton>
              </div>
            )}
            {previews.offers.length > 0 && (
              <div className="mb-3 space-y-1" aria-label="Link previews">
                {previews.offers.map((offer) => (
                  <div
                    key={offer.url}
                    className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {offer.result?.preview.title ?? new URL(offer.url).host}
                      </p>
                      <p role="status" className="truncate text-[11px] text-muted-foreground">
                        {offer.error
                          ? 'Preview unavailable · the link will still be sent'
                          : offer.result
                            ? (offer.result.warning ?? 'Preview ready')
                            : 'Preparing preview…'}
                      </p>
                    </div>
                    <IconButton
                      label={`Remove preview for ${new URL(offer.url).host}`}
                      onClick={() => previews.dismiss(offer.url)}
                    >
                      <X size={13} />
                    </IconButton>
                  </div>
                ))}
              </div>
            )}
            <textarea
              ref={composer}
              aria-label={`Message ${title}`}
              value={draft}
              disabled={busy}
              maxLength={9900}
              onChange={(event) => {
                setDraftAndPersist(event.target.value)
                setMentionPicker(!!binding && /(^|\s)@\w*$/.test(event.target.value))
              }}
              onPaste={(event) => {
                const pasted = Array.from(event.clipboardData.files)
                if (pasted.length) {
                  event.preventDefault()
                  addFiles(pasted)
                }
              }}
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
                  label="Mention an agent"
                  disabled={busy || !binding}
                  onClick={() => setMentionPicker(!mentionPicker)}
                >
                  <AtSign size={18} />
                </IconButton>
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
                    : 'Markdown supported · Enter to send · Shift + Enter for a new line'}
                </span>
              </div>
              <button
                type="submit"
                aria-label="Send message"
                disabled={
                  busy ||
                  (agentBusy && (!!mention || binding?.mode === 'direct')) ||
                  (!draft.trim() && !files.length)
                }
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground text-background disabled:opacity-30"
              >
                {busy ? <span className="animate-pulse">…</span> : <ArrowUp size={19} />}
              </button>
            </div>
          </form>
          {error && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {error}
              {pendingRequest && (
                <button
                  className="ml-2 underline"
                  onClick={() => {
                    void agents.port
                      ?.start(pendingRequest)
                      .then(() => {
                        setPendingRequest(null)
                        setError('')
                        setMention(false)
                      })
                      .catch((cause: unknown) => setError(String(cause)))
                  }}
                >
                  Retry agent for saved message
                </button>
              )}
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
      {extensionOpen && (
        <ChatExtensionPanel
          key={`${channel.id}:${data.did}`}
          channelId={channel.id}
          data={data}
          services={services}
          shared={sharedExtension}
          onPublishVersion={
            projectPreview
              ? async (revision) => {
                  const node = await data.bridge?.get?.(projectPreview.version)
                  const base = node ? await readDevelopmentEntry(node) : null
                  if (
                    base?.record.kind !== 'version' ||
                    base.record.extension.versionId !== revision.lineage?.parent
                  )
                    throw new Error(
                      'Choose the project version you edited before publishing this variation.'
                    )
                  const extension = await createExtensionVersion({
                    title: revision.title,
                    summary: revision.summary,
                    source: revision.source,
                    author: data.did!,
                    parent: revision.lineage?.parent,
                    changeNote: revision.lineage?.changeNote || 'Manual edit'
                  })
                  const version = await publishDevelopment(data, channel.id, extension.changeNote, {
                    kind: 'version',
                    project: projectPreview.project,
                    parents: [projectPreview.version],
                    extension,
                    manual: true
                  })
                  setProjectPreview({ project: projectPreview.project, version })
                }
              : undefined
          }
          onHistory={
            projectPreview
              ? () => {
                  setSelectedProject(projectPreview.project)
                  setTab('extensions')
                  setExtensionOpen(false)
                }
              : undefined
          }
          onRemix={(revision) => {
            if (projectPreview) {
              setProjectEditBase({ ...projectPreview, nonce: Date.now() })
              setSelectedProject(projectPreview.project)
              setTab('extensions')
              setExtensionOpen(false)
              return
            }
            setRemixBase({ id: revision.id, title: revision.title })
            setMention(true)
            setExtensionOpen(false)
            composer.current?.focus()
            if (!binding) onAgentSettings()
          }}
          run={agents.snapshot.runs.find((run) => run.id === extensionRunId)}
          proposals={agents.snapshot.runs.filter(
            (run) =>
              run.channelId === channel.id &&
              (run.purpose === 'extension' || !!run.extension) &&
              run.status === 'completed'
          )}
          onReview={(id) => {
            setProjectPreview(null)
            setSharedExtension(undefined)
            setExtensionRunId(id)
          }}
          onClose={() => setExtensionOpen(false)}
        />
      )}
    </div>
  )
}
