import type { CommunityAgentRun } from './agent-contract'
import type { AttachmentServices } from './ChatAttachment'
import type { CommunityAgents } from './use-community-agents'
import type { CommunityData, Conversation } from './use-community-data'
import type { FileRef } from '@xnetjs/data'
export type { AttachmentServices } from './ChatAttachment'
import { ChatMessageSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import { Popover, PopoverTitle, Tabs, TabsList, TabsTrigger } from '@xnetjs/ui'
import {
  AtSign,
  Bot,
  Blocks,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
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
import { ChatSplitLayout } from './ChatSplitLayout'
import { ChatThread } from './ChatThread'
import { ConnectionBadge } from './ConnectionBadge'
import { readDevelopmentEntry } from './extension-development'
import { EXTENSION_SHARE_MIME, type SharedExtension } from './extension-versions'
import { createExtensionVersion } from './extension-versions'
import { ExtensionProjects, publishDevelopment } from './ExtensionProjects'
import { audienceLabel, type Audience } from './model'
import {
  groupAccessLabel,
  isPeerRecord,
  peerMessagePrefix,
  type PeerContact
} from './peer-contract'
import {
  Avatar,
  ChatTabPanels,
  EmptyState,
  IconButton,
  inputClass,
  primaryButton,
  secondaryButton
} from './primitives'
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
  if (message.inReplyTo && !message.attachments?.length && !agentRun && !message.developmentKind) {
    return (
      <button
        onClick={onReply}
        className="mx-5 my-1 flex w-[calc(100%-2.5rem)] items-start gap-2 rounded-lg px-4 py-2 text-left text-xs text-muted-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2"
        aria-label={`Open thread reply from ${data.nameFor(message.createdBy)}`}
      >
        <Reply size={14} className="mt-0.5 shrink-0" />
        <span className="min-w-0">
          <span className="font-medium text-foreground">{data.nameFor(message.createdBy)}</span>{' '}
          replied in a thread
          <span className="mt-1 block truncate">
            {message.redacted ? 'Message removed' : message.content?.slice(0, 160)}
          </span>
        </span>
      </button>
    )
  }
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
      className={`chat-message group flex gap-3 px-6 ${grouped ? 'pt-1' : 'pt-6'} hover:bg-muted/30`}
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
        {message.inReplyTo && !agentRun && (
          <p className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Reply size={12} />
            Reply in this chat
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
  peer,
  onJoinPublic,
  agents,
  onAgentSettings,
  channel,
  data,
  services,
  onBack,
  onDetails,
  onCall
}: {
  peer?: Pick<PeerContact, 'status' | 'connection' | 'queued' | 'deliveredAt' | 'error'> & {
    hosting?: boolean
    access?: import('./peer-contract').GroupAccess
  }
  onJoinPublic?: () => Promise<void>
  agents: CommunityAgents
  onAgentSettings: () => void
  channel: Conversation
  data: CommunityData
  services: AttachmentServices
  onBack: () => void
  onDetails: () => void
  onCall: (video: boolean) => void
}) {
  const peerChat = isPeerRecord(channel.id)
  const peerReadOnly = peerChat && peer?.status !== 'approved'
  const binding = agents.snapshot.bindings.find(
    (entry) => !peerChat && entry.channelId === channel.id && entry.enabled
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
  const [agentContextOpen, setAgentContextOpen] = useState(false)
  const agentContextTrigger = useRef<HTMLButtonElement>(null)
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
  const [threadId, setThreadId] = useState<string | null>(null)
  const threadTrigger = useRef<HTMLElement | null>(null)
  const openThread = (id: string) => {
    threadTrigger.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    setThreadId(id)
  }
  const closeThread = () => {
    setThreadId(null)
    requestAnimationFrame(() => {
      if (threadTrigger.current?.isConnected) threadTrigger.current.focus({ preventScroll: true })
      else composer.current?.focus({ preventScroll: true })
    })
  }
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
  const previews = useChatPreviews(peerChat ? '' : draft, services, channel.id)
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
      if (peerChat && peer?.status !== 'approved')
        throw new Error(
          'This peer is not connected. Open Connect a friend to review the connection.'
        )
      if (
        peerChat &&
        (draft.trim().length > 4000 ||
          new TextEncoder().encode(JSON.stringify(draft.trim())).length > 12000)
      )
        throw new Error('Peer messages are limited to 4,000 characters.')
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
      const sent = await data.bridge.create(
        ChatMessageSchema,
        {
          channel: channel.id,
          ...(peerChat ? {} : { linkPreviews: [] }),
          content: `${mention ? `@${agentName}\n\n` : ''}${draft.trim() || attachments.map((file) => file.name).join(', ')}`,
          ...(attachments.length ? { attachments } : {}),
          ...(reply ? { inReplyTo: reply.inReplyTo || reply.id } : {})
        },
        peerChat ? `${peerMessagePrefix(channel.id, data.did!)}${crypto.randomUUID()}` : undefined
      )
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
          ...(remixBase
            ? { extensionRevisionId: remixBase.id }
            : extensionOpen && extensionRunId
              ? { extensionRunId }
              : {})
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
    if (peerChat) {
      setError('Attachments are not available in peer chat yet.')
      return
    }
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
  const viewTabs = [
    { value: 'conversation', label: 'Chat' },
    ...(!peerChat
      ? [
          { value: 'extensions', label: 'Build together' },
          { value: 'media', label: 'Shared media' }
        ]
      : []),
    ...(!peerChat && agents.port ? [{ value: 'activity', label: 'Agent activity' }] : [])
  ]
  return (
    <ChatSplitLayout
      detail={
        extensionOpen || threadId ? (
          <>
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
                        const version = await publishDevelopment(
                          data,
                          channel.id,
                          extension.changeNote,
                          {
                            kind: 'version',
                            project: projectPreview.project,
                            parents: [projectPreview.version],
                            extension,
                            manual: true
                          }
                        )
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
            {threadId && (
              <ChatThread
                key={threadId}
                rootId={threadId}
                channelId={channel.id}
                data={data}
                readOnly={peerReadOnly}
                onClose={closeThread}
              />
            )}
          </>
        ) : undefined
      }
    >
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (
            value === 'conversation' ||
            value === 'extensions' ||
            value === 'media' ||
            value === 'activity'
          )
            setTab(value)
        }}
        role="region"
        aria-label={title}
        className={`${extensionOpen || threadId ? 'hidden lg:flex' : 'flex'} min-h-0 min-w-0 flex-1 flex-col bg-background`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          if (!busy) addFiles(Array.from(event.dataTransfer.files))
        }}
      >
        <header className="flex min-h-[68px] shrink-0 flex-wrap items-center gap-1.5 px-3 py-3 sm:gap-3 sm:px-4 md:px-6">
          <IconButton label="Back to chats" onClick={onBack} className="md:!hidden">
            <ArrowLeft size={19} />
          </IconButton>

          <div className="min-w-[120px] flex-1">
            <h1 className="truncate text-sm font-semibold tracking-tight">
              {channel.kind !== 'dm' &&
                data.channels.filter((entry) => entry.space === channel.space).length > 1 && (
                  <span className="mr-1 font-normal text-muted-foreground">#</span>
                )}
              {title}
            </h1>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {space?.name && space.name !== title ? `${space.name} · ` : ''}
              {peer?.access
                ? groupAccessLabel[peer.access]
                : channel.kind === 'dm'
                  ? 'Private'
                  : audienceLabel[audience]}
            </p>
          </div>
          <div
            className="ml-auto flex shrink-0 items-center gap-1.5"
            role="group"
            aria-label="Conversation actions"
          >
            {peerChat && <ConnectionBadge peer={peer} />}
            {!peerChat && (
              <>
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
              </>
            )}
            <IconButton
              label="Search chat"
              onClick={() => {
                setSearching(!searching)
                setSearch('')
              }}
            >
              <Search size={18} />
            </IconButton>
            <IconButton label="Chat details" onClick={onDetails}>
              <Info size={18} />
            </IconButton>
          </div>
        </header>
        <div
          className={
            viewTabs.length === 1 ? 'hidden' : 'flex shrink-0 items-center px-4 pb-3 md:px-6'
          }
        >
          <TabsList
            activateOnFocus
            aria-label="Conversation views"
            className="chat-tab-list !h-auto"
          >
            {viewTabs.map(({ value, label }) => (
              <TabsTrigger key={value} value={value}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <ChatTabPanels
          value={tab}
          disabled={viewTabs.length === 1}
          values={viewTabs.map((item) => item.value)}
          className="flex flex-1 flex-col"
        >
          {peer?.status === 'viewing' && onJoinPublic && (
            <div className="flex items-center justify-between border-b border-border px-6 py-3 text-sm">
              <span>You’re viewing a public group.</span>
              <button
                className={primaryButton}
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  void onJoinPublic()
                    .catch((cause: unknown) => setError(String(cause)))
                    .finally(() => setBusy(false))
                }}
              >
                Join to post
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
              selfDid={data.did}
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
                      openThread(message.inReplyTo || message.id)
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
                  {message.inReplyTo &&
                    (message.attachments?.length || message.developmentKind) && (
                      <button
                        className="mb-3 ml-16 text-xs font-medium underline underline-offset-4"
                        onClick={() => openThread(message.inReplyTo!)}
                      >
                        Open thread
                      </button>
                    )}
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
                    !messages.some(
                      (message) => !message.redacted && message.attachments?.length
                    ) && (
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
                      ...(peerChat ? {} : { attachments: null, linkPreviews: null })
                    })
                    .then(() => setDeleteId(null))
                    .catch((cause: unknown) => setError(String(cause)))
                }}
              >
                Remove
              </button>
            </div>
          )}
          <div
            className={
              tab === 'extensions'
                ? 'hidden'
                : 'mx-auto w-full max-w-[940px] shrink-0 px-4 pb-3 md:px-6'
            }
          >
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
              className={`chat-composer border border-border bg-background p-3.5 ${reply ? 'rounded-b-2xl' : 'rounded-2xl'}`}
            >
              {binding && (
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <Popover
                    open={agentContextOpen}
                    onOpenChange={setAgentContextOpen}
                    className="community-popover"
                    side="top"
                    trigger={
                      <button
                        ref={agentContextTrigger}
                        type="button"
                        aria-label={`${agentName} context and settings`}
                        className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 hover:bg-accent"
                      >
                        <Bot size={13} aria-hidden="true" />
                        {agentName}
                        <ChevronDown size={11} aria-hidden="true" />
                      </button>
                    }
                  >
                    <PopoverTitle>{agentName} in this chat</PopoverTitle>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {binding.context === 'question'
                        ? 'Only your current message is sent to the provider. Each request starts fresh.'
                        : 'Recent text and agent memory are sent to the provider.'}{' '}
                      Attachments are excluded. Only you can invoke this agent here.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={secondaryButton}
                        onClick={() => {
                          setAgentContextOpen(false)
                          agentContextTrigger.current?.focus({ preventScroll: true })
                          onAgentSettings()
                        }}
                      >
                        Agent settings
                      </button>
                      <button
                        type="button"
                        className={secondaryButton}
                        onClick={() => {
                          void agents.port
                            ?.reset(channel.id)
                            .catch((cause: unknown) => agents.setError(String(cause)))
                        }}
                      >
                        Reset memory
                      </button>
                    </div>
                  </Popover>
                  <span className="text-muted-foreground">
                    {binding.mode === 'mentions' && !mention
                      ? `Mention @${agentName.toLowerCase()} to ask`
                      : binding.context === 'question'
                        ? 'This message only'
                        : 'Recent chat + memory'}
                  </span>
                  {mention && (
                    <IconButton label="Remove agent mention" onClick={() => setMention(false)}>
                      <X size={12} />
                    </IconButton>
                  )}
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
                        onClick={() =>
                          setFiles((previous) => previous.filter((_, i) => i !== index))
                        }
                      >
                        <X size={12} />
                      </IconButton>
                    </span>
                  ))}
                </div>
              )}
              {extensionOpen && extensionRunId && !remixBase && (
                <p className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Blocks size={14} /> Including the open extension so your agent can revise and
                  test it.
                </p>
              )}
              {remixBase && (
                <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
                  <Blocks size={14} />
                  <span className="flex-1">
                    Editing {remixBase.title}. Describe your changes below.
                  </span>
                  <IconButton
                    label="Clear extension edit context"
                    onClick={() => setRemixBase(null)}
                  >
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
                disabled={busy || peerReadOnly}
                maxLength={peerChat ? 4000 : 9900}
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
                placeholder={
                  peerReadOnly
                    ? peer?.status === 'viewing'
                      ? 'Join this group to send messages'
                      : peer?.status === 'blocked'
                        ? 'This conversation is disconnected'
                        : 'Waiting for connection approval'
                    : `Message ${channel.kind === 'dm' ? title : `#${title}`}…`
                }
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
                    disabled={busy || peerChat || !binding}
                    onClick={() => setMentionPicker(!mentionPicker)}
                  >
                    <AtSign size={18} />
                  </IconButton>
                  <IconButton
                    label="Attach files"
                    disabled={busy || peerChat}
                    onClick={() => fileInput.current?.click()}
                  >
                    <Paperclip size={18} />
                  </IconButton>
                  <span className="hidden text-[11px] text-muted-foreground sm:inline">
                    {peerReadOnly
                      ? peer?.status === 'viewing'
                        ? 'Public history · Join to post'
                        : 'Previously received messages stay on this device.'
                      : files.length
                        ? 'Files stay on this device until shared with a host.'
                        : 'Markdown supported · Enter to send · Shift + Enter for a new line'}
                  </span>
                </div>
                <button
                  type="submit"
                  aria-label="Send message"
                  disabled={
                    busy ||
                    peerReadOnly ||
                    (agentBusy && (!!mention || binding?.mode === 'direct')) ||
                    (!draft.trim() && !files.length)
                  }
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-30"
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
                  {peerChat
                    ? 'Saved on this device. Peer delivery status is shown above.'
                    : 'Saved on this device. Delivery to others is not confirmed.'}
                </>
              )}
            </div>
          </div>
        </ChatTabPanels>
      </Tabs>
    </ChatSplitLayout>
  )
}
