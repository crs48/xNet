import type { CommunityAgentPort } from './agent-contract'
import type { PeerChatPort } from './peer-contract'
import { ChatMessageSchema } from '@xnetjs/data'
import { useQuery, useXNet } from '@xnetjs/react'
import { Tooltip } from '@xnetjs/ui'
import {
  Bot,
  ArrowLeft,
  ArrowUpRight,
  BellOff,
  Building2,
  Check,
  ChevronRight,
  Globe,
  Hash,
  LayoutGrid,
  Lock,
  MessageCircle,
  Plus,
  Search,
  Settings,
  Users,
  X
} from 'lucide-react'
import { useDeferredValue, useEffect, useRef, useState, type ReactNode } from 'react'
import { AgentSettings } from './AgentSettings'
import { CallPanel } from './CallPanel'
import { ChatInbox } from './ChatInbox'
import { ConversationPane, type AttachmentServices } from './ConversationPane'
import { CreateConversation, InviteDialog, ProfileDialog } from './dialogs'
import { JoinConversation } from './JoinConversation'
import { audienceDescription, audienceLabel, type Audience, type Section } from './model'
import { isPeerRecord } from './peer-contract'
import { PeerSettings, usePeers } from './PeerSettings'
import {
  Avatar,
  EmptyState,
  IconButton,
  Modal,
  inputClass,
  primaryButton,
  secondaryButton
} from './primitives'
import { useCommunityAgents } from './use-community-agents'
import { useCommunityData, type CommunityData, type Conversation } from './use-community-data'
import './communities.css'

export interface CommunityAppProps extends AttachmentServices {
  peers?: PeerChatPort
  agents?: CommunityAgentPort
  desktop?: boolean
  initialConversationId?: string
  onOpenWorkspace?: () => void
  onOpenSettings?: () => void
  onAddShared?: () => void
  banner?: ReactNode
  profileIdentity?: ReactNode
}
function Details({
  channel,
  data,
  onClose,
  onInvite,
  onArchive
}: {
  channel: Conversation
  data: CommunityData
  onClose: () => void
  onInvite: () => void
  onArchive: () => void
}) {
  const space = data.spaces.find((entry) => entry.id === channel.space)
  const audience = (space?.visibility ?? 'private') as Audience
  const members = [
    ...new Set([
      ...(channel.members ?? []),
      ...data.members
        .filter((member) => member.space === channel.space)
        .map((member) => member.member)
    ])
  ]
  const owner = space?.createdBy === data.did || (data.did && space?.owners?.includes(data.did))
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  return (
    <aside
      aria-label="Conversation information"
      className="absolute inset-y-0 right-0 z-20 flex w-[300px] max-w-full flex-col border-l border-border bg-background xl:static"
    >
      <header className="flex h-[78px] shrink-0 items-center justify-between border-b border-border px-5">
        <h2 className="text-sm font-semibold">Chat details</h2>
        <IconButton label="Close details" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </header>
      <div className="flex-1 space-y-7 overflow-y-auto p-5">
        <div className="flex flex-col items-center py-3 text-center">
          <Avatar name={channel.name || 'Conversation'} large />
          <h3 className="mt-3 text-base font-semibold">{channel.name || 'Conversation'}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{space?.name}</p>
        </div>
        {channel.topic && (
          <p className="text-sm leading-6 text-muted-foreground">{channel.topic}</p>
        )}
        <section>
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Audience
          </h3>
          <div className="flex items-center gap-2 text-sm">
            {audience === 'public' ? <Globe size={16} /> : <Lock size={16} />}{' '}
            {audienceLabel[audience]}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {audienceDescription[audience]}
          </p>
        </section>
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              People · {members.length}
            </h3>
            {owner && channel.kind !== 'dm' && (
              <IconButton label="Invite a person" onClick={onInvite}>
                <Plus size={16} />
              </IconButton>
            )}
          </div>
          <div className="space-y-3">
            {members.map((member) => (
              <div key={member} className="flex items-center gap-3">
                <Avatar name={data.nameFor(member)} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{data.nameFor(member)}</p>
                  <p className="text-xs text-muted-foreground">
                    {!!member && space?.owners?.includes(member) ? 'Owner' : 'Member'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-xl bg-muted p-3">
          <h3 className="mb-1 text-xs font-medium">Privacy in this preview</h3>
          <p className="text-xs leading-5 text-muted-foreground">
            {isPeerRecord(channel.id)
              ? 'Only approved participants receive this chat over encrypted peer connections. Copies already received remain on each device.'
              : 'This older workspace chat uses the existing host transport. Create a new peer chat for private communication.'}
          </p>
        </section>
        <button
          onClick={() => {
            void navigator.clipboard
              .writeText(channel.id)
              .then(() => setCopied(true))
              .catch((cause: unknown) => setError(String(cause)))
          }}
          className={`${secondaryButton} w-full`}
        >
          {copied ? <Check size={15} /> : <Hash size={15} />}{' '}
          {copied ? 'Conversation ID copied' : 'Copy conversation ID'}
        </button>
        <p className="!mt-2 text-[11px] leading-5 text-muted-foreground">
          An ID is a reference, not an invitation or a grant of access.
        </p>
        {owner && (
          <button
            onClick={onArchive}
            className="text-xs text-muted-foreground underline underline-offset-4"
          >
            Archive conversation
          </button>
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </aside>
  )
}
function GlobalSearch({
  data,
  onClose,
  onOpen
}: {
  data: CommunityData
  onClose: () => void
  onOpen: (id: string) => void
}) {
  const [term, setTerm] = useState('')
  const deferred = useDeferredValue(term)
  const {
    data: results,
    loading,
    error
  } = useQuery(ChatMessageSchema, {
    search: deferred,
    enabled: deferred.trim().length > 1,
    orderBy: { createdAt: 'desc' },
    limit: 50
  })
  const channels = data.channels.filter((channel) =>
    channel.name?.toLowerCase().includes(deferred.toLowerCase())
  )
  const open = (id: string) => {
    onOpen(id)
    onClose()
  }
  return (
    <Modal title="Search your conversations" onClose={onClose}>
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <Search size={18} />
          <input
            autoFocus
            aria-label="Search all messages"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="People, conversations, and messages…"
            className={inputClass}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Searches conversations stored on this device.
        </p>
        {channels.slice(0, 8).map((channel) => (
          <button
            key={channel.id}
            onClick={() => open(channel.id)}
            className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-muted"
          >
            <Hash size={17} />
            <span className="flex-1 text-sm">{channel.name}</span>
            <ChevronRight size={15} />
          </button>
        ))}
        {deferred.length > 1 && (
          <section>
            <h3 className="mb-3 text-xs font-semibold text-muted-foreground">
              Messages{results.length === 50 ? ' · first 50 matches' : ''}
            </h3>
            {loading ? (
              <p role="status" className="text-sm">
                Searching…
              </p>
            ) : (
              results
                .filter((message) => !message.redacted)
                .map((message) => (
                  <button
                    key={message.id}
                    onClick={() => {
                      if (message.channel) open(message.channel)
                    }}
                    className="mb-1 block w-full rounded-lg p-3 text-left hover:bg-muted"
                  >
                    <p className="text-xs text-muted-foreground">
                      {data.channels.find((channel) => channel.id === message.channel)?.name ||
                        'Conversation'}{' '}
                      · {data.nameFor(message.createdBy)}
                    </p>
                    <p className="mt-1 line-clamp-3 text-sm leading-6">{message.content}</p>
                  </button>
                ))
            )}
            {!loading && !results.length && (
              <p className="text-sm text-muted-foreground">No matching messages.</p>
            )}
          </section>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
        )}
      </div>
    </Modal>
  )
}
export function CommunityApp({
  agents: agentPort,
  peers,
  desktop,
  initialConversationId,
  blobs,
  transfers,
  resolveLink,
  onOpenWorkspace,
  onOpenSettings,
  onAddShared,
  banner,
  profileIdentity
}: CommunityAppProps) {
  const peerState = usePeers(peers)
  const [peerSettings, setPeerSettings] = useState(false)
  const [peerGroupId, setPeerGroupId] = useState<string | undefined>()
  useEffect(() => {
    if (peerState?.incomingLink) setPeerSettings(true)
  }, [peerState?.incomingLink])
  const data = useCommunityData(peerState?.contacts, peerState?.groups)
  const [peerProfileError, setPeerProfileError] = useState('')
  const ownName = data.profiles.find(
    (entry) => entry.did === data.did && entry.createdBy === data.did
  )?.displayName
  useEffect(() => {
    if (!peers || !ownName) return
    let active = true
    void peers.setDisplayName(ownName).then(
      () => {
        if (active) setPeerProfileError('')
      },
      () => {
        if (active)
          setPeerProfileError(
            'Your profile name could not be shared with your peers. Reopen xNet to retry.'
          )
      }
    )
    return () => {
      active = false
    }
  }, [peers, ownName])
  const agents = useCommunityAgents(agentPort, data, { blobs, transfers })
  const [agentSettings, setAgentSettings] = useState<Conversation | true | null>(null)
  const { syncManager } = useXNet()
  const [section, setSection] = useState<Section>('messages')
  const [selected, setSelected] = useState<string | null>(null)
  const [spaceFilter, setSpaceFilter] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [listFilter, setListFilter] = useState<'all' | 'direct' | 'groups' | 'unread'>('all')
  const [details, setDetails] = useState(false)
  const [dialog, setDialog] = useState<
    'create' | 'profile' | 'search' | 'settings' | 'invite' | 'archive' | 'join' | null
  >(null)
  const [createKind, setCreateKind] = useState<'dm' | 'group' | 'community' | 'organization'>(
    'group'
  )
  const [newPerson, setNewPerson] = useState<string | undefined>()
  const [newChannelSpace, setNewChannelSpace] = useState<string | undefined>()
  const [activeCall, setActiveCall] = useState<{ channel: Conversation; video: boolean } | null>(
    null
  )
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const initialSelection = useRef(false)
  useEffect(() => {
    if (data.loading || initialSelection.current) return
    const destination = initialConversationId
      ? data.channels.find(
          (channel) =>
            channel.id === initialConversationId ||
            channel.id ===
              peerState?.contacts.find((contact) => contact.invitationId === initialConversationId)
                ?.channel
        )
      : data.channels[0]
    if (!destination) return
    initialSelection.current = true
    setSelected(destination.id)
    if (initialConversationId) setMobileOpen(true)
  }, [data.loading, data.channels, initialConversationId, peerState?.contacts])
  useEffect(() => {
    if (!syncManager) return
    const update = () => setConnected(syncManager.status === 'connected')
    update()
    return syncManager.on('status', update)
  }, [syncManager])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        setDialog('search')
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  const channel = data.channels.find((entry) => entry.id === selected) ?? null
  const selectedPeerGroup = peerState?.groups?.find(
    (group) => group.id === channel?.id || group.channels?.some((entry) => entry.id === channel?.id)
  )
  const community = data.spaces.find((entry) => entry.id === spaceFilter)
  const knownPeople = [
    ...new Set([
      ...data.profiles
        .filter((profile) => profile.createdBy === profile.did)
        .map((profile) => profile.did),
      ...data.channels.flatMap((entry) => entry.members ?? []),
      ...data.members.map((member) => member.member)
    ])
  ].filter((person): person is `did:key:${string}` => !!person && person !== data.did)
  const open = (id: string) => {
    setSelected(id)
    setSection('messages')
    setMobileOpen(true)
    setDetails(false)
  }
  const create = (kind: typeof createKind, space?: string, person?: string) => {
    if (peers) {
      const group = peerState?.groups?.find((entry) => `${entry.id}-space` === space)
      setPeerGroupId(group?.id)
      setPeerSettings(true)
      return
    }
    setNewPerson(person)
    setCreateKind(kind)
    setNewChannelSpace(space)
    setDialog('create')
  }
  return (
    <div className="community-app flex h-full min-h-0 flex-col overflow-clip bg-background text-foreground">
      {desktop && (
        <header className="community-titlebar titlebar-drag flex h-9 shrink-0 items-center justify-center border-b border-border/60 text-[11px] font-medium">
          xNet
        </header>
      )}
      {banner}
      {peerState?.contacts
        .filter((contact) => contact.status === 'requesting')
        .map((contact) => (
          <button
            key={contact.channel}
            className="border-b border-border bg-muted/40 px-4 py-2 text-left text-xs hover:bg-muted"
            onClick={() => {
              setPeerGroupId(undefined)
              setPeerSettings(true)
            }}
          >
            {contact.name} ·{' '}
            {contact.error ? 'Connection needs attention' : 'Waiting for your friend to approve'}
            <span className="ml-2 text-muted-foreground">View request</span>
          </button>
        ))}
      {peerProfileError && (
        <p role="alert" className="p-3 text-sm text-destructive">
          {peerProfileError}
        </p>
      )}
      {agents.error && (
        <div
          role="alert"
          className="flex items-center gap-3 border-b border-border px-5 py-2 text-xs"
        >
          <span className="flex-1">{agents.error}</span>
          <button
            onClick={() => {
              agents.setError('')
              agents.retryPublication()
            }}
          >
            Retry saving
          </button>
        </div>
      )}
      {agentSettings && (
        <AgentSettings
          agents={agents}
          data={data}
          channel={agentSettings === true ? undefined : agentSettings}
          onOpen={open}
          onClose={() => setAgentSettings(null)}
        />
      )}
      <div className="relative flex min-h-0 flex-1">
        <nav
          aria-label="Main navigation"
          className={`${mobileOpen ? 'hidden md:flex' : 'flex'} w-[54px] shrink-0 flex-col items-center border-r border-border/60 bg-muted/60 py-4`}
        >
          <button
            aria-label="xNet home"
            onClick={() => {
              setSection('messages')
              setSpaceFilter(null)
              setMobileOpen(false)
            }}
            className="relative mb-5 flex h-8 w-8 items-center justify-center rounded-xl text-background"
          >
            <svg
              aria-hidden="true"
              focusable="false"
              viewBox="0 0 64 64"
              className="pointer-events-none absolute inset-0 h-full w-full fill-foreground drop-shadow-sm"
            >
              <path d="M32 0C60 0 64 4 64 32S60 64 32 64S0 60 0 32S4 0 32 0Z" />
            </svg>
            <span aria-hidden="true" className="community-brand-mark relative h-5 w-5" />
          </button>
          {(
            [
              { key: 'messages', label: 'Chats', icon: MessageCircle },
              { key: 'people', label: 'People', icon: Users },
              { key: 'communities', label: 'Communities', icon: Building2 }
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <IconButton
              key={key}
              label={label}
              aria-current={section === key ? 'page' : undefined}
              onClick={() => {
                setSection(key)
                setMobileOpen(false)
                setSpaceFilter(null)
              }}
              className={`mb-2 !h-9 !w-9 ${section === key ? '!bg-white !text-foreground shadow-sm' : ''}`}
            >
              <Icon size={19} strokeWidth={1.7} />
            </IconButton>
          ))}
          <div className="flex-1" />
          <IconButton label="Settings" onClick={() => setDialog('settings')}>
            <Settings size={20} />
          </IconButton>
          <Tooltip content="Your profile" className="community-tooltip">
            <button aria-label="Your profile" onClick={() => setDialog('profile')} className="mt-4">
              <Avatar name={data.did ? data.nameFor(data.did) : 'You'} />
            </button>
          </Tooltip>
        </nav>
        <aside
          aria-label="Conversation navigation"
          className={`${mobileOpen ? 'hidden md:flex' : 'flex'} community-sidebar min-w-0 flex-1 flex-col border-r border-border/60 md:w-[264px] md:flex-none`}
        >
          <header className="flex h-[68px] shrink-0 items-center justify-between px-4">
            <div className="min-w-0">
              <span role="img" aria-label="xNet" className="community-brand-wordmark h-5" />
              <h1 className="mt-1 truncate text-sm font-semibold tracking-tight">
                {community?.name ||
                  { messages: 'Chats', people: 'People', communities: 'Communities' }[section]}
              </h1>
            </div>
            <IconButton
              label="New chat"
              onClick={() => create(section === 'communities' ? 'community' : 'group')}
            >
              <Plus size={20} />
            </IconButton>
          </header>
          <div className="px-4">
            {peers && (
              <button
                onClick={() => {
                  setPeerGroupId(undefined)
                  setPeerSettings(true)
                }}
                className="mb-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-muted"
              >
                <Users size={16} />
                People & invitations
                {peerState?.contacts.some((c) => c.status === 'pending') && (
                  <span className="ml-auto">Approval needed</span>
                )}
              </button>
            )}
            <button
              onClick={() => setAgentSettings(true)}
              className="mb-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-muted"
            >
              <Bot size={16} />
              Your agents
              <span className="ml-auto text-muted-foreground">
                {agents.snapshot.runtimes.some((runtime) => runtime.state === 'ready')
                  ? 'Ready'
                  : 'Connect'}
              </span>
            </button>
            <button
              onClick={() => setDialog('search')}
              className="chat-button-secondary mb-3 flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground"
            >
              <Search size={14} />
              <span className="flex-1 text-left">Search messages</span>
              <kbd className="rounded border border-border px-1 text-[10px]">⌘ K</kbd>
            </button>
          </div>
          {section === 'messages' && (
            <>
              <div className="mb-3 flex gap-1 px-4">
                {(['all', 'direct', 'groups', 'unread'] as const).map((value) => (
                  <button
                    key={value}
                    aria-pressed={listFilter === value}
                    onClick={() => setListFilter(value)}
                    className={`rounded-lg px-2.5 py-1.5 text-[11px] ${listFilter === value ? 'bg-white font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
                  >
                    {{ all: 'All', direct: 'Direct', groups: 'Groups', unread: 'Unread' }[value]}
                  </button>
                ))}
              </div>
              {community && (
                <button
                  className="mx-4 mb-3 flex items-center gap-2 text-xs text-muted-foreground"
                  onClick={() => setSpaceFilter(null)}
                >
                  <ArrowLeft size={13} />
                  All conversations
                </button>
              )}
              <label className="sr-only" htmlFor="conversation-filter">
                Filter conversations
              </label>
              <input
                id="conversation-filter"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Find a chat…"
                className="mx-4 mb-1 rounded-lg border border-transparent bg-transparent px-2 py-2 text-xs outline-none placeholder:text-muted-foreground focus:border-border focus:bg-background focus:ring-1 focus:ring-ring"
              />
              <ChatInbox
                data={data}
                runs={agents.snapshot.runs}
                peers={peerState}
                selected={selected}
                filter={filter}
                kind={listFilter}
                space={spaceFilter}
                onOpen={open}
              />
              {community && (
                <button
                  className={`${secondaryButton} mx-4 mb-4`}
                  onClick={() => create('group', community.id)}
                >
                  <Plus size={15} />
                  New channel
                </button>
              )}
            </>
          )}
          {section === 'people' && (
            <div className="flex-1 space-y-1 overflow-y-auto px-3">
              {knownPeople.map((person) => (
                <button
                  key={person}
                  className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-muted"
                  onClick={() => {
                    const existing = data.channels.find(
                      (entry) => entry.kind === 'dm' && entry.members?.includes(person)
                    )
                    if (existing) open(existing.id)
                    else create('dm', undefined, person)
                  }}
                >
                  <Avatar name={data.nameFor(person)} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{data.nameFor(person)}</p>
                    <p className="text-xs text-muted-foreground">xNet contact</p>
                  </div>
                </button>
              ))}
              {!knownPeople.length && (
                <p className="p-4 text-sm leading-6 text-muted-foreground">
                  People from your chats appear here. Find someone by a shared link or Bluesky
                  handle.
                </p>
              )}
              <button onClick={() => create('dm')} className={`${secondaryButton} !mt-4 w-full`}>
                <Plus size={15} />
                Add a person
              </button>
            </div>
          )}
          {section === 'communities' && (
            <div className="flex-1 space-y-2 overflow-y-auto px-3">
              {data.spaces
                .filter(
                  (space) =>
                    space.kind === 'community' ||
                    space.kind === 'organization' ||
                    space.kind === 'family' ||
                    space.kind === 'workspace'
                )
                .map((space) => (
                  <button
                    key={space.id}
                    onClick={() => {
                      setSpaceFilter(space.id)
                      setListFilter('all')
                      setSection('messages')
                      const first = data.channels.find((entry) => entry.space === space.id)
                      if (first) setSelected(first.id)
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-muted"
                  >
                    <span className="rounded-lg bg-muted p-2">
                      <Building2 size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{space.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {audienceLabel[(space.visibility || 'private') as Audience]}
                      </p>
                    </div>
                    <ChevronRight size={15} />
                  </button>
                ))}
              <button
                onClick={() => create('community')}
                className={`${secondaryButton} !mt-4 w-full`}
              >
                <Plus size={15} />
                Create a group
              </button>
            </div>
          )}
          {data.limited && (
            <p className="px-5 py-3 text-xs text-muted-foreground">
              This preview has reached its local list limit. Some conversations or members may not
              be shown.
            </p>
          )}
          <div className="mt-auto flex items-center gap-2 border-t border-border/60 px-4 py-3 text-[11px] text-muted-foreground">
            <span
              className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-foreground' : 'border border-foreground'}`}
            />
            {connected ? 'Workspace connected' : 'Saved on this device'}
            <span className="ml-auto text-[10px]">Preview</span>
          </div>
        </aside>
        {peerSettings && peers && (
          <PeerSettings
            port={peers}
            state={peerState}
            initialGroupId={peerGroupId}
            onProfile={() => {
              setPeerSettings(false)
              setDialog('profile')
            }}
            onClose={() => setPeerSettings(false)}
            onOpen={(channel) => {
              setSelected(channel)
              setSection('messages')
              setMobileOpen(true)
              setPeerSettings(false)
            }}
          />
        )}
        <main
          className={`${mobileOpen ? 'flex' : 'hidden md:flex'} community-main relative min-h-0 min-w-0 flex-1 bg-background`}
        >
          {channel ? (
            <ConversationPane
              agents={agents}
              peer={
                selectedPeerGroup?.hosting
                  ? {
                      status: 'approved',
                      hosting: true,
                      access: selectedPeerGroup.access,
                      queued: peerState?.contacts.some(
                        (contact) => contact.groupId === selectedPeerGroup.id && contact.queued
                      )
                    }
                  : (() => {
                      const contact =
                        peerState?.contacts.find(
                          (entry) =>
                            (entry.groupId ?? entry.channel) ===
                              (selectedPeerGroup?.id ?? channel.id) && entry.status !== 'blocked'
                        ) ??
                        peerState?.contacts.find(
                          (entry) =>
                            (entry.groupId ?? entry.channel) ===
                            (selectedPeerGroup?.id ?? channel.id)
                        )
                      return contact ? { ...contact, access: selectedPeerGroup?.access } : undefined
                    })()
              }
              onJoinPublic={
                selectedPeerGroup && peers
                  ? () => peers.joinPublic(selectedPeerGroup.id)
                  : undefined
              }
              onAgentSettings={() => setAgentSettings(channel!)}
              key={channel.id}
              channel={channel}
              data={data}
              services={
                isPeerRecord(channel.id) ? { blobs: null } : { blobs, transfers, resolveLink }
              }
              onBack={() => setMobileOpen(false)}
              onDetails={() => {
                if (selectedPeerGroup) {
                  setPeerGroupId(selectedPeerGroup.id)
                  setPeerSettings(true)
                } else setDetails(!details)
              }}
              onCall={(video) => {
                if (!activeCall) setActiveCall({ channel, video })
                else setError('Leave your current call before starting another.')
              }}
            />
          ) : (
            <EmptyState
              icon={<MessageCircle size={28} strokeWidth={1.4} />}
              title="Good conversations start here."
              description="A quieter place for your friends, family, and communities. Bring your people. Make it yours."
            >
              <button onClick={() => create('group')} className={primaryButton}>
                <Plus size={16} />
                New chat
              </button>
              <button
                onClick={() => setDialog('profile')}
                className="mt-4 text-xs text-muted-foreground underline underline-offset-4"
              >
                Set up your profile
              </button>
            </EmptyState>
          )}
          {details && channel && (
            <Details
              key={channel.id}
              channel={channel}
              data={data}
              onClose={() => setDetails(false)}
              onInvite={() =>
                isPeerRecord(channel.id)
                  ? (setPeerGroupId(selectedPeerGroup?.id), setPeerSettings(true))
                  : setDialog('invite')
              }
              onArchive={() => setDialog('archive')}
            />
          )}
        </main>
      </div>
      {(error || data.error) && (
        <div
          role="alert"
          className="flex items-center justify-between border-t border-border bg-background px-5 py-3 text-sm"
        >
          {error || data.error?.message}
          <IconButton label="Dismiss error" onClick={() => setError('')}>
            <X size={16} />
          </IconButton>
        </div>
      )}
      {dialog === 'create' && (
        <CreateConversation
          data={data}
          initialKind={createKind}
          initialPerson={newPerson}
          spaceId={newChannelSpace}
          onOpen={open}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'join' && <JoinConversation onOpen={open} onClose={() => setDialog(null)} />}
      {dialog === 'profile' && (
        <ProfileDialog data={data} identity={profileIdentity} onClose={() => setDialog(null)} />
      )}
      {dialog === 'search' && (
        <GlobalSearch data={data} onOpen={open} onClose={() => setDialog(null)} />
      )}
      {dialog === 'invite' && channel && (
        <InviteDialog data={data} channel={channel} onClose={() => setDialog(null)} />
      )}
      {dialog === 'archive' && channel && (
        <Modal title="Archive conversation?" onClose={() => setDialog(null)}>
          <p className="mb-5 text-sm leading-6 text-muted-foreground">
            Messages remain stored, but this conversation will leave the active list.
          </p>
          <button
            className={primaryButton}
            onClick={() => {
              void data.bridge
                ?.update(channel.id, { archived: true })
                .then(() => {
                  setDialog(null)
                  setSelected(null)
                  setDetails(false)
                })
                .catch((cause: unknown) => setError(String(cause)))
            }}
          >
            Archive {channel.name}
          </button>
        </Modal>
      )}
      {dialog === 'settings' && (
        <Modal title="Make xNet yours" onClose={() => setDialog(null)}>
          <div className="space-y-4">
            <button
              onClick={() => setDialog('profile')}
              className="flex w-full items-center gap-3 rounded-xl border border-border p-4 text-left"
            >
              <Users size={20} />
              <span className="flex-1">
                <span className="block text-sm font-medium">Profile & social links</span>
                <span className="text-xs text-muted-foreground">
                  Your name, identity, Bluesky, and X
                </span>
              </span>
              <ChevronRight size={16} />
            </button>
            <div className="rounded-xl bg-muted p-4">
              <p className="mb-1 flex items-center gap-2 text-sm font-medium">
                <BellOff size={16} />
                Quiet by default
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                No engagement counters, autoplay, or notification prompts. Your conversations stay
                in chronological order.
              </p>
            </div>
            <button className={`${secondaryButton} w-full`} onClick={() => setDialog('join')}>
              Open a shared conversation
              <ArrowUpRight size={15} />
            </button>
            {onAddShared && (
              <button
                className={`${secondaryButton} w-full`}
                onClick={() => {
                  setDialog(null)
                  onAddShared()
                }}
              >
                Open a shared invitation
                <ArrowUpRight size={15} />
              </button>
            )}
            {onOpenSettings && (
              <button
                className={`${secondaryButton} w-full`}
                onClick={() => {
                  setDialog(null)
                  onOpenSettings()
                }}
              >
                <Settings size={15} />
                Hosting, storage & advanced settings
              </button>
            )}
            {onOpenWorkspace && (
              <button
                className={`${secondaryButton} w-full`}
                onClick={() => {
                  setDialog(null)
                  onOpenWorkspace()
                }}
              >
                <LayoutGrid size={15} />
                Open workspace tools
              </button>
            )}
            <p className="text-xs leading-5 text-muted-foreground">
              This is the community redesign of xNet. Documents, canvases, and other workspace tools
              remain available while the new foundation takes shape.
            </p>
          </div>
        </Modal>
      )}
      {activeCall && (
        <CallPanel
          channel={activeCall.channel}
          data={data}
          video={activeCall.video}
          onClose={() => setActiveCall(null)}
        />
      )}
    </div>
  )
}
