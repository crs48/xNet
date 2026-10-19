import { ChatMessageSchema } from '@xnetjs/data'
import { useQuery, useXNet } from '@xnetjs/react'
import {
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
import { CallPanel } from './CallPanel'
import { ConversationPane, type AttachmentServices } from './ConversationPane'
import { CreateConversation, InviteDialog, ProfileDialog } from './dialogs'
import { JoinConversation } from './JoinConversation'
import { audienceDescription, audienceLabel, type Audience, type Section } from './model'
import {
  Avatar,
  EmptyState,
  IconButton,
  Modal,
  inputClass,
  primaryButton,
  secondaryButton
} from './primitives'
import { useCommunityData, type CommunityData, type Conversation } from './use-community-data'
import './communities.css'

export interface CommunityAppProps extends AttachmentServices {
  desktop?: boolean
  onOpenWorkspace?: () => void
  onOpenSettings?: () => void
  onAddShared?: () => void
  banner?: ReactNode
}
function Preview({ channelId }: { channelId: string }) {
  const { data } = useQuery(ChatMessageSchema, {
    where: { channel: channelId },
    orderBy: { createdAt: 'desc' },
    limit: 1
  })
  const message = data[0]
  return (
    <p className="mt-1 truncate text-xs text-muted-foreground">
      {message
        ? message.redacted
          ? 'Message removed'
          : message.content
        : 'Start the conversation'}
    </p>
  )
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
        <h2 className="text-sm font-semibold">Conversation details</h2>
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
            Messages are stored locally and use xNet’s existing access controls. End-to-end
            encryption and secure community recovery from exploration 0478 are still pending.
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
  desktop,
  blobs,
  transfers,
  onOpenWorkspace,
  onOpenSettings,
  onAddShared,
  banner
}: CommunityAppProps) {
  const data = useCommunityData()
  const { syncManager } = useXNet()
  const [section, setSection] = useState<Section>('messages')
  const [selected, setSelected] = useState<string | null>(null)
  const [spaceFilter, setSpaceFilter] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [listFilter, setListFilter] = useState<'all' | 'direct' | 'groups'>('all')
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
    initialSelection.current = true
    if (data.channels[0]) setSelected(data.channels[0].id)
  }, [data.loading, data.channels])
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
  const community = data.spaces.find((entry) => entry.id === spaceFilter)
  const visibleChannels = data.channels.filter(
    (entry) =>
      (!spaceFilter || entry.space === spaceFilter) &&
      (listFilter === 'all' || (listFilter === 'direct') === (entry.kind === 'dm')) &&
      (entry.name || '').toLowerCase().includes(filter.toLowerCase())
  )
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
    setNewPerson(person)
    setCreateKind(kind)
    setNewChannelSpace(space)
    setDialog('create')
  }
  return (
    <div className="community-app flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      {desktop && (
        <header className="titlebar-drag flex h-[38px] shrink-0 items-center justify-center border-b border-border text-[10px] font-medium tracking-[0.12em] text-muted-foreground">
          xNet · community preview
        </header>
      )}
      {banner}
      <div className="relative flex min-h-0 flex-1">
        <nav
          aria-label="Main navigation"
          className={`${mobileOpen ? 'hidden md:flex' : 'flex'} w-[76px] shrink-0 flex-col items-center border-r border-border bg-muted/30 py-5`}
        >
          <button
            aria-label="xNet home"
            onClick={() => {
              setSection('messages')
              setSpaceFilter(null)
              setMobileOpen(false)
            }}
            className="mb-9 flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-xl font-semibold tracking-tighter text-background"
          >
            x.
          </button>
          {(
            [
              { key: 'messages', label: 'Messages', icon: MessageCircle },
              { key: 'people', label: 'People', icon: Users },
              { key: 'communities', label: 'Communities', icon: Building2 }
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              aria-current={section === key ? 'page' : undefined}
              onClick={() => {
                setSection(key)
                setMobileOpen(false)
                setSpaceFilter(null)
              }}
              className={`mb-4 flex w-[64px] flex-col items-center gap-1.5 rounded-xl py-2.5 text-[9px] font-medium ${section === key ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Icon size={20} strokeWidth={1.7} />
              {label}
            </button>
          ))}
          <div className="flex-1" />
          <IconButton label="Settings" onClick={() => setDialog('settings')}>
            <Settings size={20} />
          </IconButton>
          <button
            aria-label="Your profile"
            title="Your profile"
            onClick={() => setDialog('profile')}
            className="mt-4"
          >
            <Avatar name={data.did ? data.nameFor(data.did) : 'You'} />
          </button>
        </nav>
        <aside
          aria-label="Conversation navigation"
          className={`${mobileOpen ? 'hidden md:flex' : 'flex'} min-w-0 flex-1 flex-col border-r border-border bg-background md:w-[300px] md:flex-none`}
        >
          <header className="flex h-[78px] shrink-0 items-center justify-between px-5">
            <h1 className="text-xl font-semibold tracking-tight">
              {community?.name ||
                { messages: 'Messages', people: 'People', communities: 'Communities' }[section]}
            </h1>
            <IconButton
              label={section === 'communities' ? 'New community' : 'New conversation'}
              onClick={() => create(section === 'communities' ? 'community' : 'group')}
            >
              <Plus size={20} />
            </IconButton>
          </header>
          <div className="px-4">
            <button
              onClick={() => setDialog('search')}
              className="mb-4 flex w-full items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
            >
              <Search size={14} />
              <span className="flex-1 text-left">Search anything</span>
              <kbd className="rounded border border-border px-1 text-[10px]">⌘ K</kbd>
            </button>
          </div>
          {section === 'messages' && (
            <>
              <div className="mb-3 flex gap-1 px-4">
                {(['all', 'direct', 'groups'] as const).map((value) => (
                  <button
                    key={value}
                    aria-pressed={listFilter === value}
                    onClick={() => setListFilter(value)}
                    className={`rounded-md px-3 py-1.5 text-xs ${listFilter === value ? 'bg-foreground font-medium text-background' : 'text-muted-foreground hover:bg-muted'}`}
                  >
                    {{ all: 'All', direct: 'Direct', groups: 'Groups' }[value]}
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
                placeholder="Filter conversations…"
                className="mx-4 mb-3 rounded-md bg-transparent px-1 py-1 text-xs outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
              />
              <div className="min-h-0 flex-1 overflow-y-auto px-2">
                {visibleChannels.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => open(entry.id)}
                    aria-current={selected === entry.id ? 'true' : undefined}
                    className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left ${selected === entry.id ? 'bg-muted' : 'hover:bg-muted/60'}`}
                  >
                    <Avatar name={entry.name || 'Conversation'} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {entry.kind !== 'dm' && (
                            <span className="mr-1 text-muted-foreground">#</span>
                          )}
                          {entry.name || 'Conversation'}
                        </span>
                      </div>
                      <Preview channelId={entry.id} />
                    </div>
                  </button>
                ))}
                {!data.loading && !visibleChannels.length && (
                  <p className="px-4 py-8 text-center text-sm leading-6 text-muted-foreground">
                    {filter ? 'No matching conversations.' : 'Your conversations will live here.'}
                  </p>
                )}
              </div>
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
                  People from your conversations appear here. Start a direct message with someone’s
                  xNet identity.
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
                Create a community
              </button>
            </div>
          )}
          {data.limited && (
            <p className="px-5 py-3 text-xs text-muted-foreground">
              This preview has reached its local list limit. Some conversations or members may not
              be shown.
            </p>
          )}
          <div className="mt-auto flex items-center gap-2 border-t border-border px-5 py-4 text-[11px] text-muted-foreground">
            <span
              className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-foreground' : 'border border-foreground'}`}
            />
            {connected ? 'Host connected' : 'Working locally'}
            <span className="ml-auto">Preview</span>
          </div>
        </aside>
        <main
          className={`${mobileOpen ? 'flex' : 'hidden md:flex'} relative min-h-0 min-w-0 flex-1`}
        >
          {channel ? (
            <ConversationPane
              key={channel.id}
              channel={channel}
              data={data}
              services={{ blobs, transfers }}
              onBack={() => setMobileOpen(false)}
              onDetails={() => setDetails(!details)}
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
                Start a conversation
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
              onInvite={() => setDialog('invite')}
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
      {dialog === 'profile' && <ProfileDialog data={data} onClose={() => setDialog(null)} />}
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
