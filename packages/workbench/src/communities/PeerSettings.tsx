import type {
  PeerChatPort,
  PeerSnapshot,
  PeerInvitation,
  PeerDiscovery,
  GroupAccess
} from './peer-contract'
import { Tabs, TabsList, TabsTrigger } from '@xnetjs/ui'
import { Copy, Link, Plus, Search, Users, Check, Loader2, ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { groupAccessLabel, groupAccessDescription } from './peer-contract'
import { ChatTabPanels, Modal, inputClass, primaryButton, secondaryButton } from './primitives'
export function usePeers(port?: PeerChatPort): PeerSnapshot | undefined {
  const [state, setState] = useState<PeerSnapshot>()
  useEffect(() => {
    if (!port) return
    let alive = true
    const refresh = () =>
      void port
        .snapshot()
        .then((s) => {
          if (alive) setState(s)
        })
        .catch((error: unknown) => {
          if (alive)
            setState({ enabled: false, relayReady: false, contacts: [], error: String(error) })
        })
    const unsubscribe = port.subscribe(refresh)
    refresh()
    return () => {
      alive = false
      unsubscribe()
    }
  }, [port])
  return state
}
export function PeerSettings({
  port,
  state,
  onClose,
  onOpen,
  onProfile,
  initialGroupId
}: {
  port: PeerChatPort
  state?: PeerSnapshot
  onClose: () => void
  onOpen: (channel: string) => void
  onProfile?: () => void
  initialGroupId?: string
}) {
  const [tab, setTab] = useState<'people' | 'group' | 'link'>(
    state?.incomingLink ? 'link' : 'people'
  )
  const [groupId, setGroupId] = useState(initialGroupId)
  const group = state?.groups?.find((entry) => entry.id === groupId)
  const [name, setName] = useState('')
  const [access, setAccess] = useState<GroupAccess>('invite')
  const [channelName, setChannelName] = useState('')
  const [addingChannel, setAddingChannel] = useState(false)
  const [query, setQuery] = useState('')
  const [link, setLink] = useState(state?.incomingLink ?? '')
  const [shared, setShared] = useState('')
  const [inspected, setInspected] = useState<PeerInvitation>()
  const [discovery, setDiscovery] = useState<PeerDiscovery>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [requestedChannel, setRequestedChannel] = useState<string>()
  useEffect(() => {
    if (
      requestedChannel &&
      state?.contacts.some(
        (contact) =>
          (contact.groupId ?? contact.channel) === requestedChannel &&
          ['approved', 'viewing'].includes(contact.status)
      )
    )
      onOpen(requestedChannel)
  }, [requestedChannel, state?.contacts, onOpen])
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (state?.incomingLink) {
      setLink(state.incomingLink)
      setTab('link')
    }
  }, [state?.incomingLink])
  const act = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    setStatus('')
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }
  const showLink = (value: string) => {
    setShared(value)
    setCopied(false)
  }
  const review = async (value: string) => {
    setLink(value)
    setInspected(await port.inspectInvite(value))
    setTab('link')
  }
  const pending =
    state?.contacts.filter(
      (contact) => contact.status === 'pending' && (!groupId || contact.groupId === groupId)
    ) ?? []
  const contacts =
    state?.contacts.filter(
      (contact) =>
        !contact.groupId &&
        contact.status !== 'blocked' &&
        `${contact.displayName ?? ''} ${contact.name}`.toLowerCase().includes(query.toLowerCase())
    ) ?? []
  return (
    <Modal title={group ? group.name : 'New chat'} onClose={onClose}>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (value === 'people' || value === 'group' || value === 'link') {
            setTab(value)
            setShared('')
            setError('')
          }
        }}
        className="space-y-5"
      >
        {!group && (
          <TabsList
            activateOnFocus
            className="chat-tab-list flex !h-auto w-full"
            aria-label="Start a chat"
          >
            {(['people', 'group', 'link'] as const).map((value) => (
              <TabsTrigger
                key={value}
                value={value}
                className={`flex-1 rounded-lg px-3 py-2 text-sm ${tab === value ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}
              >
                {{ people: 'Person', group: 'Group', link: 'Open a link' }[value]}
              </TabsTrigger>
            ))}
          </TabsList>
        )}
        <ChatTabPanels
          value={tab}
          values={['people', 'group', 'link']}
          disabled={!!group}
          className="space-y-5"
        >
          {group ? (
            <>
              <p className="text-sm text-muted-foreground">
                {group.members.length} {group.members.length === 1 ? 'member' : 'members'} ·{' '}
                {groupAccessLabel[group.access ?? 'invite']}
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                {groupAccessDescription[group.access ?? 'invite']} New members can read available
                history from current members.
              </p>
              {group.hosting && (
                <>
                  <label className="block space-y-2 text-sm">
                    Access
                    <select
                      aria-label="Group access"
                      className={inputClass}
                      value={group.access ?? 'invite'}
                      disabled={busy || group.access === 'public'}
                      onChange={(event) =>
                        void act(async () => {
                          await port.setGroupAccess({
                            groupId: group.id,
                            access: event.target.value as GroupAccess
                          })
                          setShared('')
                          setStatus('Access updated. Previous links have been revoked.')
                        })
                      }
                    >
                      {group.access === 'public' ? (
                        <option value="public">Public</option>
                      ) : (
                        <>
                          <option value="invite">Invite only</option>
                          <option value="approval">Approval required</option>
                        </>
                      )}
                    </select>
                  </label>
                  <p className="text-xs text-muted-foreground">
                    To change public visibility, create a separate group. This history keeps its
                    original audience.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className={primaryButton}
                      disabled={busy}
                      onClick={() =>
                        void act(async () => showLink(await port.inviteToGroup(group.id)))
                      }
                    >
                      <Link size={15} />
                      {group.access === 'invite' ? 'Invite a person' : 'Get group link'}
                    </button>
                    <button
                      className={secondaryButton}
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await port.revokeLink(group.id)
                          setShared('')
                          setStatus('Link revoked. Existing members keep access.')
                        })
                      }
                    >
                      Revoke link
                    </button>
                  </div>
                </>
              )}
              <section className="space-y-2 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">
                    {(group.channels?.length ?? 1) > 1 ? 'Channels' : 'Chat'}
                  </h3>
                  {group.hosting && (
                    <button
                      className={secondaryButton}
                      onClick={() => setAddingChannel(!addingChannel)}
                    >
                      <Plus size={14} />
                      Add channel
                    </button>
                  )}
                </div>
                {(group.channels ?? [{ id: group.id, name: group.name }]).map((channel) => (
                  <button
                    key={channel.id}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => onOpen(channel.id)}
                  >
                    # {channel.name}
                  </button>
                ))}
                {addingChannel && (
                  <form
                    className="space-y-3 rounded-xl bg-muted/40 p-3"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void act(async () => {
                        const id = await port.addChannel({ groupId: group.id, name: channelName })
                        setChannelName('')
                        setAddingChannel(false)
                        onOpen(id)
                      })
                    }}
                  >
                    <label className="block space-y-2 text-sm">
                      Channel name
                      <input
                        className={inputClass}
                        value={channelName}
                        onChange={(event) => setChannelName(event.target.value)}
                        maxLength={80}
                        required
                        placeholder="weekend-plans"
                      />
                    </label>
                    <p className="text-xs leading-5 text-muted-foreground">
                      Channels share this group’s members and access. Your original chat becomes
                      General; its messages stay where they are.
                    </p>
                    <button className={primaryButton} disabled={busy || !channelName.trim()}>
                      Create channel
                    </button>
                  </form>
                )}
              </section>
              <section className="space-y-2 border-t border-border pt-4">
                <h3 className="text-sm font-medium">Members</h3>
                {group.members.map((did) => (
                  <div key={did} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {group.names?.[did] ?? `${did.slice(0, 16)}…${did.slice(-5)}`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {did === group.owner ? 'Host' : 'Member'}
                    </span>
                    {group.hosting && did !== group.owner && (
                      <button
                        className="text-xs underline"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            const contact = state?.contacts.find(
                              (entry) => entry.groupId === group.id && entry.binding.did === did
                            )
                            if (!contact) throw new Error('Member connection is unavailable.')
                            await port.block(contact.channel)
                          })
                        }
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </section>
            </>
          ) : tab === 'people' ? (
            <>
              <label className="block space-y-2 text-sm">
                Find a person
                <div className="flex gap-2">
                  <input
                    className={inputClass}
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value)
                      setDiscovery(undefined)
                    }}
                    placeholder="Name or Bluesky handle"
                  />
                  <button
                    aria-label="Find Bluesky profile"
                    className={secondaryButton}
                    disabled={busy || !query.trim()}
                    onClick={() => void act(async () => setDiscovery(await port.discover(query)))}
                  >
                    <Search size={16} />
                  </button>
                </div>
              </label>
              {contacts.map((contact) => (
                <button
                  key={contact.channel}
                  className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-muted"
                  disabled={contact.status !== 'approved'}
                  onClick={() => onOpen(contact.channel)}
                >
                  <Users size={18} />
                  <span className="flex-1 text-sm">{contact.displayName || contact.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {contact.status === 'approved' ? 'Message' : 'Request sent'}
                  </span>
                </button>
              ))}
              {discovery && (
                <div className="space-y-2 rounded-xl border border-border p-4">
                  <p className="text-sm font-medium">{discovery.name}</p>
                  <p className="text-xs text-muted-foreground">@{discovery.handle}</p>
                  {discovery.link ? (
                    <>
                      <p className="text-xs leading-5">
                        This profile shares an xNet link. Review the invitation before connecting.
                      </p>
                      <button
                        className={primaryButton}
                        disabled={busy}
                        onClick={() => void act(() => review(discovery.link!))}
                      >
                        Review shared link
                      </button>
                    </>
                  ) : (
                    <p className="text-xs leading-5 text-muted-foreground">
                      No current xNet link in this profile or its pinned post. Share your link with
                      them on Bluesky or another app.
                    </p>
                  )}
                </div>
              )}
              <section className="space-y-3 rounded-xl bg-muted/40 p-4">
                <h3 className="text-sm font-medium">Let people find you</h3>
                <p className="text-xs leading-5 text-muted-foreground">
                  Share a link on Bluesky, X, or anywhere you talk. You approve each new person
                  before they can message you.
                </p>
                <button
                  className={primaryButton}
                  disabled={busy}
                  onClick={() => void act(async () => showLink(await port.contactLink()))}
                >
                  <Link size={15} />
                  Get my chat link
                </button>
                {onProfile && (
                  <button
                    className="block text-xs underline underline-offset-4"
                    onClick={onProfile}
                  >
                    Your profile & social accounts
                  </button>
                )}
              </section>
              {!!state?.groups?.length && (
                <div className="space-y-1">
                  <h3 className="text-xs font-medium text-muted-foreground">Your groups</h3>
                  {state.groups.map((entry) => (
                    <button
                      key={entry.id}
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        setGroupId(entry.id)
                        setShared('')
                      }}
                    >
                      {entry.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {entry.members.length} members
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : tab === 'group' ? (
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault()
                void act(async () => {
                  const id = await port.createChatGroup({ name, access })
                  setGroupId(id)
                  setStatus('Group created. Invite your people when you’re ready.')
                  setName('')
                })
              }}
            >
              <label className="block space-y-2 text-sm">
                Group name
                <input
                  required
                  maxLength={80}
                  className={inputClass}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="A place for your people"
                />
              </label>
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium">Access</legend>
                {(['invite', 'approval', 'public'] as const).map((value) => (
                  <label
                    key={value}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${access === value ? 'border-foreground bg-muted/30' : 'border-border'}`}
                  >
                    <input
                      type="radio"
                      name="access"
                      className="mt-1 accent-black"
                      checked={access === value}
                      onChange={() => setAccess(value)}
                    />
                    <span>
                      <span className="block text-sm font-medium">{groupAccessLabel[value]}</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {groupAccessDescription[value]}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <p className="text-xs leading-5 text-muted-foreground">
                Start with one chat. Add channels later when you need separate topics.
              </p>
              <button className={`${primaryButton} w-full`} disabled={busy || !name.trim()}>
                Create group
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              <label className="block space-y-2 text-sm">
                Invitation or group link
                <textarea
                  className={`${inputClass} h-20 text-xs`}
                  value={link}
                  onChange={(event) => {
                    setLink(event.target.value)
                    setInspected(undefined)
                  }}
                  placeholder="Paste an xNet link"
                />
              </label>
              <button
                className={secondaryButton}
                disabled={busy || !link.trim()}
                onClick={() => void act(() => review(link))}
              >
                Review link
              </button>
              {inspected && (
                <div className="space-y-3 rounded-xl border border-border p-4">
                  <p className="font-medium">{inspected.name}</p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {inspected.access === 'public'
                      ? 'Read this public group now. Join when you want to post.'
                      : 'Your request shares your profile name and device identity. Messages stay private until the host approves.'}
                  </p>
                  <details className="text-xs text-muted-foreground">
                    <summary>Check xNet identity</summary>
                    <p className="mt-2 break-all">{inspected.did}</p>
                  </details>
                  <button
                    className={primaryButton}
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await port.join(link)
                        setRequestedChannel(inspected.channel)
                        setInspected(undefined)
                        setLink('')
                        setStatus(
                          inspected.access === 'public'
                            ? 'Opening public history. The host needs to be online.'
                            : 'Request sent. We’ll let you know when you’re approved.'
                        )
                      })
                    }
                  >
                    {inspected.access === 'public' ? 'View group' : 'Request to join'}
                  </button>
                </div>
              )}
            </div>
          )}
          {shared && (
            <div className="space-y-2 rounded-xl border border-border p-3">
              <textarea
                aria-label="Shareable xNet link"
                readOnly
                className={`${inputClass} h-16 text-xs`}
                value={shared}
              />
              <button
                className={secondaryButton}
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await navigator.clipboard.writeText(shared)
                    setCopied(true)
                  })
                }
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}{' '}
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <p className="text-xs leading-5 text-muted-foreground">
                {group?.access === 'invite'
                  ? 'One person · valid for one hour · approval required.'
                  : state?.sharedLinksReady === false
                    ? 'Valid for 24 hours · one new device on this relay.'
                    : state?.relay
                      ? 'Reusable for 24 hours · up to eight new devices on the relay.'
                      : 'Reusable for 24 hours · direct connections on this network.'}{' '}
                Keep xNet open to receive requests. This local preview uses app links.{' '}
                {state?.sharedLinksReady === false &&
                  'This relay supports one new person per link. Reusable links need the prepared relay update.'}
              </p>
            </div>
          )}
          {!group &&
            state?.contacts
              .filter((contact) => contact.status === 'requesting')
              .map((contact) => (
                <div
                  key={contact.channel}
                  className="space-y-2 rounded-xl border border-border p-3"
                >
                  <p className="text-sm font-medium">{contact.name}</p>
                  <p role="status" className="text-xs leading-5 text-muted-foreground">
                    {contact.error
                      ? `${contact.error} We’ll keep trying while xNet is open.`
                      : 'Request sent. Waiting for approval.'}
                  </p>
                  <button
                    className={secondaryButton}
                    disabled={busy}
                    onClick={() => void act(() => port.block(contact.channel))}
                  >
                    Cancel request
                  </button>
                </div>
              ))}
          {!!pending.length && (
            <section className="space-y-2 border-t border-border pt-4">
              <h3 className="text-sm font-medium">Requests · {pending.length}</h3>
              {pending.map((contact) => (
                <div key={contact.channel} className="space-y-2 rounded-xl bg-muted/40 p-3">
                  <p className="text-sm font-medium">{contact.displayName || contact.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {contact.groupId ? `Wants to join ${contact.name}` : 'Wants to message you'}
                  </p>
                  <details className="text-xs">
                    <summary>Check identity</summary>
                    <p className="mt-2 break-all">{contact.binding.did}</p>
                  </details>
                  <div className="flex gap-2">
                    <button
                      className={primaryButton}
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await port.approve(contact.channel)
                          setStatus('Request approved.')
                        })
                      }
                    >
                      Approve
                    </button>
                    <button
                      className={secondaryButton}
                      disabled={busy}
                      onClick={() => void act(() => port.block(contact.channel))}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}
          {group && (
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground"
              onClick={() => {
                setGroupId(undefined)
                setShared('')
                setTab('people')
              }}
            >
              <ArrowLeft size={14} />
              People and groups
            </button>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {status && (
            <p role="status" className="text-sm">
              {status}
            </p>
          )}
          {busy && (
            <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 size={14} className="animate-spin motion-reduce:animate-none" />
              Working…
            </p>
          )}
          <details className="border-t border-border pt-3 text-xs text-muted-foreground">
            <summary>Connection details</summary>
            <p className="mt-2 leading-5">
              {state?.relayReady
                ? 'Relay connected.'
                : state?.relay
                  ? 'Relay reconnecting.'
                  : 'Direct connections on this network.'}{' '}
              Groups need their host online. This preview supports eight members per group, text and
              Markdown; media and calls are still separate.
            </p>
            {state?.notice && (
              <p role="status" className="mt-2">
                {state.notice}
              </p>
            )}
            {state?.error && (
              <p role="alert" className="mt-2">
                {state.error}
              </p>
            )}
          </details>
        </ChatTabPanels>
      </Tabs>
    </Modal>
  )
}
