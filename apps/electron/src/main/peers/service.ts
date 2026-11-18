import type { GroupManifest, GroupDescriptor } from './groups'
import type { Cursor, Invite, WireChange, SignedPeerProfile } from './protocol'
import type { BiStream, Connection, WatchHandle } from '@number0/iroh'
import type { PeerBinding, PeerContact, PeerSnapshot } from '@xnetjs/workbench/peer-chat'
import { randomBytes, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  renameSync
} from 'node:fs'
import { join } from 'node:path'
import {
  Endpoint,
  EndpointId,
  EndpointAddr,
  EndpointTicket,
  RelayMode,
  SecretKey
} from '@number0/iroh'
import { net, safeStorage } from 'electron'
import { getPeerChanges } from '../data-process-manager'
import { getOrCreateIdentitySeed } from '../identity-seed'
import { groupChannels, messageChannel, signGroup, validateGroup } from './groups'
import { readHomeRelayUpdate } from './native-events'
import {
  ALPN,
  MAX_FRAME,
  createBinding,
  validateBinding,
  validateChange,
  decodeInvite,
  encodeInvite,
  signInvite,
  inviteChannel,
  equalSecret,
  relayUrl,
  deadline,
  signPeerProfile,
  validatePeerProfile
} from './protocol'

const endpointHex = (id: EndpointId): string => Buffer.from(id.toBytes()).toString('hex')
type Contact = PeerContact & {
  received?: { day: string; bytes: number }
  ticket: string
  cursor: Cursor
  invite?: Invite
  profile?: SignedPeerProfile
  group?: GroupDescriptor
  groupCursors?: Record<string, Cursor>
}
type State = {
  port?: number
  version: 1
  enabled: boolean
  contacts: Contact[]
  invite?: Invite
  profile?: SignedPeerProfile
  links?: Record<string, Invite>
  groups?: Record<string, GroupManifest>
  groupProfiles?: Record<string, Record<string, SignedPeerProfile>>
}
export type StoreOperation = {
  contact: PeerContact
  me: string
  changes: WireChange[]
  group?: GroupManifest
}
type Packet =
  | {
      kind: 'join'
      participate?: boolean
      invite: Invite
      binding: PeerBinding
      ticket: string
      profile?: SignedPeerProfile
      group?: GroupManifest
      profiles?: Record<string, SignedPeerProfile>
    }
  | {
      kind: 'sync'
      channel: string
      ticket: string
      changes: WireChange[]
      profile?: SignedPeerProfile
      group?: GroupManifest
      profiles?: Record<string, SignedPeerProfile>
    }
type Response = {
  status: 'pending' | 'approved' | 'synced' | 'removed' | 'viewing'
  hashes?: string[]
  profile?: SignedPeerProfile
  group?: GroupManifest
  profiles?: Record<string, SignedPeerProfile>
}

async function writeFrame(stream: BiStream, value: unknown): Promise<void> {
  const bytes = Buffer.from(JSON.stringify(value))
  if (bytes.length > MAX_FRAME) throw new Error('Peer frame is too large.')
  await stream.send.writeAll(Array.from(bytes))
  await stream.send.finish()
}
async function readFrame(stream: BiStream): Promise<unknown> {
  return JSON.parse(Buffer.from(await stream.recv.readToEnd(MAX_FRAME)).toString()) as unknown
}

export class PeerChatService {
  private state: State
  private endpoint?: Endpoint
  private relayWatcher?: WatchHandle
  private starting?: Promise<void>
  private timer?: ReturnType<typeof setTimeout>
  private closed = false
  private accepting?: Promise<void>
  private ticking?: Promise<void>
  private incoming = 0
  private binding?: PeerBinding
  private transportKey?: SecretKey
  private error?: string
  private relayReady = false
  private sharedLinksReady?: boolean
  private relayHealthy?: boolean
  private healthCheckedAt = 0
  private connectionNotice?: string
  private readonly directory: string
  private readonly did: string
  private readonly path: string
  private readonly relay?: string
  private readonly connections = new Set<Connection>()
  private readonly lastExchange = new Map<string, number>()
  private readonly receiveTimes = new Map<string, { since: number; count: number }>()
  private membershipTail: Promise<unknown> = Promise.resolve()
  private updateMembership<T>(work: () => Promise<T>): Promise<T> {
    const result = this.membershipTail.then(work)
    // Keep the queue usable after a rejected mutation; its caller still receives the rejection.
    this.membershipTail = result.catch(() => {})
    return result
  }
  constructor(
    private readonly options: {
      directory: string
      seed: Uint8Array
      relay?: string
      changed: () => void
      apply: (operation: StoreOperation) => Promise<void>
      read?: typeof getPeerChanges
    }
  ) {
    this.did = createBinding(options.seed, '0'.repeat(64)).did
    this.directory = join(options.directory, 'peer-chat')
    this.path = join(this.directory, 'state.json')
    mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    this.relay = options.relay ? relayUrl(options.relay) : undefined
    this.state = { version: 1, enabled: false, contacts: [] }
    if (existsSync(this.path)) {
      const file = JSON.parse(readFileSync(this.path, 'utf8')) as {
        encrypted: boolean
        data: string
      }
      const data = file.encrypted
        ? safeStorage.decryptString(Buffer.from(file.data, 'base64'))
        : file.data
      const state = JSON.parse(data) as State
      if (
        state.version !== 1 ||
        typeof state.enabled !== 'boolean' ||
        !Array.isArray(state.contacts) ||
        state.contacts.length > 32 ||
        (state.port !== undefined &&
          (!Number.isInteger(state.port) || state.port < 1024 || state.port > 65535))
      )
        throw new Error('Peer settings are unreadable. Restore a backup; do not reset identity.')
      for (const contact of state.contacts) {
        validateBinding(contact.binding)
        if (
          !/^iroh-[a-f0-9-]{36}$/.test(contact.channel) ||
          !['requesting', 'pending', 'approved', 'blocked', 'viewing'].includes(contact.status) ||
          !Number.isSafeInteger(contact.cursor?.lamport) ||
          typeof contact.cursor.hash !== 'string'
        )
          throw new Error('Peer contact state is unreadable.')
        contact.connection = 'offline'
      }
      this.state = state
      for (const group of Object.values(state.groups ?? {})) validateGroup(group, group)
    }
  }
  private save(): void {
    const data = JSON.stringify(this.state)
    const encrypted = safeStorage.isEncryptionAvailable()
    const file = JSON.stringify({
      encrypted,
      data: encrypted ? safeStorage.encryptString(data).toString('base64') : data
    })
    const temporary = this.path + '.tmp'
    const fd = openSync(temporary, 'w', 0o600)
    try {
      writeFileSync(fd, file)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(temporary, this.path)
    const dir = openSync(this.directory, 'r')
    try {
      fsyncSync(dir)
    } finally {
      closeSync(dir)
    }
    this.options.changed()
  }
  snapshot(): PeerSnapshot {
    return {
      enabled: this.state.enabled,
      endpoint: this.binding?.endpoint,
      relay: this.relay,
      relayReady: this.relayReady && this.relayHealthy !== false,
      sharedLinksReady: this.sharedLinksReady ?? !this.relay,
      notice: this.connectionNotice,
      error:
        this.relayHealthy === false
          ? 'Relay unavailable. Nearby devices can still connect directly.'
          : this.error,
      groups: Object.values(this.state.groups ?? {}).map((group) => ({
        id: group.id,
        name: group.name,
        owner: group.owner,
        members: [...group.members],
        hosting: group.owner === this.did,
        access: group.access ?? 'invite',
        channels: groupChannels(group),
        names: Object.fromEntries(
          Object.entries(this.groupProfiles(group)).map(([did, profile]) => [did, profile.name])
        )
      })),
      contacts: this.state.contacts.map(
        ({
          ticket: _ticket,
          cursor: _cursor,
          invite: _invite,
          received: _received,
          profile: _profile,
          group: _group,
          groupCursors: _groupCursors,
          ...contact
        }) => contact
      ),
      invite:
        this.state.invite && this.state.invite.expires > Date.now()
          ? encodeInvite(this.state.invite)
          : undefined
    }
  }
  async resume(): Promise<void> {
    if (this.state.enabled) await this.enable()
  }
  setDisplayName(name: string): void {
    if (this.state.profile?.name === name.trim()) return
    this.state.profile = signPeerProfile(this.options.seed, name)
    this.lastExchange.clear()
    this.save()
  }
  private receiveProfile(contact: Contact, raw: unknown): void {
    if (raw === undefined) return // Compatible with older text-only peers.
    const profile = validatePeerProfile(raw, contact.binding.did)
    if (contact.profile && contact.profile.updatedAt >= profile.updatedAt) return
    contact.profile = profile
    contact.displayName = profile.name
    this.lastExchange.clear()
    this.save()
  }
  private groupProfiles(group: GroupManifest): Record<string, SignedPeerProfile> {
    return Object.fromEntries(
      group.members.flatMap((did) => {
        const profiles = [
          this.state.groupProfiles?.[group.id]?.[did],
          ...(did === this.did ? [this.state.profile] : []),
          ...this.state.contacts
            .filter((contact) => contact.binding.did === did)
            .map((contact) => contact.profile)
        ]
          .filter((profile): profile is SignedPeerProfile => !!profile)
          .sort((a, b) => b.updatedAt - a.updatedAt)
        return profiles[0] ? [[did, profiles[0]]] : []
      })
    )
  }
  private receiveGroupProfiles(contact: Contact, raw: unknown): void {
    if (raw === undefined) return
    const group = this.groupFor(contact)
    if (
      !group ||
      contact.binding.did !== group.owner ||
      group.owner === this.did ||
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw) ||
      Object.keys(raw).length > group.members.length
    )
      throw new Error('Unexpected group profiles.')
    const next = { ...this.state.groupProfiles?.[group.id] }
    let changed = false
    for (const [did, value] of Object.entries(raw)) {
      if (!group.members.includes(did)) throw new Error('Profile is outside this group.')
      const profile = validatePeerProfile(value, did)
      if (!next[did] || next[did].updatedAt < profile.updatedAt) {
        next[did] = profile
        changed = true
      }
    }
    if (changed) {
      this.state.groupProfiles = { ...this.state.groupProfiles, [group.id]: next }
      this.save()
    }
  }
  private groupFor(contact: Contact): GroupManifest | undefined {
    return contact.group ? this.state.groups?.[contact.group.id] : undefined
  }
  private acceptGroup(contact: Contact, raw: unknown): void {
    if (!contact.group) {
      if (raw !== undefined) throw new Error('A direct message cannot grant group access.')
      return
    }
    // Only this group's pinned owner can change membership. Members send no authority claims.
    if (contact.group.owner === this.binding!.did) return
    if (contact.binding.did !== contact.group.owner) throw new Error('Group host identity changed.')
    const group = validateGroup(raw, contact.group)
    if (!group.members.includes(this.binding!.did) && group.access !== 'public')
      throw new Error('You are not a member of this group.')
    const previous = this.groupFor(contact)
    if (
      previous &&
      (group.owner !== previous.owner ||
        group.revision < previous.revision ||
        (group.revision === previous.revision && group.signature !== previous.signature))
    )
      throw new Error('Group membership was rolled back or changed without a new revision.')
    if (!previous || previous.revision < group.revision) {
      this.state.groups = { ...this.state.groups, [group.id]: group }
      this.save()
    }
  }
  private async project(contact: Contact, changes: WireChange[] = []): Promise<void> {
    await this.options.apply({
      contact: {
        ...contact,
        name: contact.group ? contact.name : (contact.displayName ?? contact.name)
      },
      me: this.binding!.did,
      changes,
      group: this.groupFor(contact)
    })
  }
  async createGroup(name: string): Promise<string> {
    return this.createChatGroup({ name, access: 'invite' })
  }
  async createChatGroup(input: {
    name: string
    access: 'invite' | 'approval' | 'public'
  }): Promise<string> {
    if (!input || !['invite', 'approval', 'public'].includes(input.access))
      throw new Error('Choose a group access setting.')
    return this.updateMembership(() => this.createGroupNow(input.name, input.access))
  }
  async addChannel(input: { groupId: string; name: string }): Promise<string> {
    return this.updateMembership(async () => {
      const group = this.ownedGroup(input.groupId)
      const name = typeof input.name === 'string' ? input.name.trim() : ''
      if (!name || name.length > 80) throw new Error('Choose a channel name of 1–80 characters.')
      const existing = groupChannels(group)
      const channels = existing.map((channel, index) =>
        existing.length === 1 && index === 0 ? { ...channel, name: 'General' } : channel
      )
      if (channels.some((channel) => channel.name.toLowerCase() === name.toLowerCase()))
        throw new Error('A channel with that name already exists.')
      const id = `${group.id}-channel-${randomUUID()}`
      await this.replaceGroup(
        signGroup(this.options.seed, {
          ...group,
          revision: group.revision + 1,
          access: group.access ?? 'invite',
          channels: [...channels, { id, name }]
        })
      )
      return id
    })
  }
  private ownedGroup(id: string): GroupManifest {
    const group = this.state.groups?.[id]
    if (!group || group.owner !== this.did)
      throw new Error('Only the group host can change this group.')
    return group
  }
  private async replaceGroup(group: GroupManifest): Promise<void> {
    await this.options.apply({
      contact: {
        channel: group.id,
        name: group.name,
        binding: this.binding!,
        status: 'approved',
        groupId: group.id
      },
      me: this.did,
      group,
      changes: []
    })
    this.state.groups = { ...this.state.groups, [group.id]: group }
    this.lastExchange.clear()
    this.save()
  }
  async setGroupAccess(input: {
    groupId: string
    access: 'invite' | 'approval' | 'public'
  }): Promise<void> {
    return this.updateMembership(async () => {
      const group = this.ownedGroup(input.groupId)
      if (!['invite', 'approval', 'public'].includes(input.access))
        throw new Error('Invalid access setting.')
      if ((group.access === 'public') !== (input.access === 'public'))
        throw new Error(
          'Create a separate group to change public visibility. Existing history keeps its original audience.'
        )
      await this.replaceGroup(
        signGroup(this.options.seed, {
          ...group,
          revision: group.revision + 1,
          access: input.access,
          channels: groupChannels(group)
        })
      )
      await this.revokeLink(group.id)
    })
  }
  async revokeLink(id: string): Promise<void> {
    if (id !== 'contact') this.ownedGroup(id)
    if (this.state.links) delete this.state.links[id]
    if ((this.state.invite?.group?.id ?? 'contact') === id) this.state.invite = undefined
    this.save()
  }
  async contactLink(): Promise<string> {
    return this.sharedLink('contact', this.state.profile?.name.slice(0, 80) ?? 'Chat with me')
  }
  private async sharedLink(scope: string, name: string, group?: GroupManifest): Promise<string> {
    await this.enable()
    if (this.relay && this.sharedLinksReady === undefined) {
      const response = await net.fetch(new URL('capabilities', this.relay).href, {
        redirect: 'error',
        signal: AbortSignal.timeout(10000)
      })
      if (response.status === 404) this.sharedLinksReady = false
      else {
        if (!response.ok)
          throw new Error('Cannot check this relay’s link support. Try again shortly.')
        const value = (await response.json()) as { reusableAdmissions?: boolean }
        this.sharedLinksReady = value.reusableAdmissions === true
      }
    }
    const previous = this.state.links?.[scope]
    if (previous && previous.expires > Date.now() + 60_000) return encodeInvite(previous)
    const link = await this.createInvite(
      name,
      group,
      group?.access === 'public' ? 'public' : group ? 'approval' : 'contact'
    )
    this.state.links = { ...this.state.links, [scope]: this.state.invite! }
    this.save()
    return link
  }
  async joinPublic(groupId: string): Promise<void> {
    const contact = this.state.contacts.find(
      (entry) => entry.groupId === groupId && entry.status === 'viewing'
    )
    if (!contact?.invite) throw new Error('Open a current public link to join this group.')
    const result = await this.request(contact, {
      kind: 'join',
      participate: true,
      invite: contact.invite,
      binding: this.binding!,
      ticket: this.ticket(),
      profile: this.state.profile
    })
    if (result.status !== 'approved') throw new Error('The group could not accept your membership.')
    contact.status = 'approved'
    await this.project(contact)
    this.save()
  }
  private async createGroupNow(
    name: string,
    access: 'invite' | 'approval' | 'public'
  ): Promise<string> {
    if (typeof name !== 'string' || !name.trim() || name.length > 80)
      throw new Error('Choose a group name of 1–80 characters.')
    if (Object.keys(this.state.groups ?? {}).length >= 16)
      throw new Error('This preview supports 16 groups.')
    await this.enable()
    const id = `iroh-${randomUUID()}`
    const group = signGroup(this.options.seed, {
      id,
      name: name.trim(),
      revision: 1,
      members: [this.binding!.did],
      access,
      channels: [{ id, name: name.trim() }]
    })
    await this.options.apply({
      contact: {
        channel: id,
        name: group.name,
        binding: this.binding!,
        status: 'approved',
        groupId: id
      },
      me: this.binding!.did,
      changes: [],
      group
    })
    this.state.groups = { ...this.state.groups, [id]: group }
    this.save()
    return id
  }
  async inviteToGroup(id: string): Promise<string> {
    await this.enable()
    const group = this.state.groups?.[id]
    if (!group || group.owner !== this.binding!.did)
      throw new Error('Only the group host can invite people.')
    if (group.access === 'approval' || group.access === 'public')
      return this.sharedLink(id, group.name, group)
    if (group.members.length >= 8) throw new Error('This preview supports eight people per group.')
    return this.createInvite(group.name, group)
  }
  async enable(admission?: Invite['admission']): Promise<void> {
    if (this.closed) throw new Error('Peer transport is shutting down.')
    if (this.endpoint) return
    this.starting ??= this.start(admission)
      .catch((error) => {
        this.error = String(error)
        this.state.enabled = false
        this.save()
        throw error
      })
      .finally(() => {
        this.starting = undefined
      })
    return this.starting
  }
  private async start(admission?: Invite['admission']): Promise<void> {
    const transportSeed = getOrCreateIdentitySeed(this.directory, safeStorage, {
      profile: 'peer-transport',
      testMode: false
    }).seed
    this.transportKey = SecretKey.fromBytes(Array.from(transportSeed))
    this.binding = createBinding(this.options.seed, endpointHex(this.transportKey.public()))
    if (this.relay) await this.register(admission)
    const bind = async (port: number) => {
      const builder = Endpoint.builder()
      builder.applyMinimal()
      builder.secretKey(Array.from(transportSeed))
      builder.alpns([ALPN])
      builder.bindAddr(`0.0.0.0:${port}`)
      builder.relayMode(this.relay ? RelayMode.customFromUrls([this.relay]) : RelayMode.disabled())
      return builder.bind()
    }
    try {
      this.endpoint = await bind(this.state.port ?? 0)
    } catch (cause) {
      if (!this.state.port || !/Address already in use|EADDRINUSE/.test(String(cause))) throw cause
      this.endpoint = await bind(0)
      this.connectionNotice =
        'The previous network port is occupied. xNet is using a new port; share a fresh link if a nearby contact cannot reconnect.'
    }
    const port = Number(
      this.endpoint
        .boundSockets()
        .find((address) => address.startsWith('0.0.0.0:'))
        ?.split(':')
        .at(-1)
    )
    if (!Number.isInteger(port) || port < 1024 || port > 65535)
      throw new Error('The peer endpoint did not report a usable listening port.')
    this.state.port = port
    this.binding = createBinding(this.options.seed, endpointHex(this.endpoint.id()))
    this.state.enabled = true
    this.save()
    if (this.relay) {
      this.relayWatcher = this.endpoint.watchHomeRelay((...args: unknown[]) => {
        if (this.closed) return
        try {
          this.relayReady = readHomeRelayUpdate(args).includes(this.relay!)
          this.error = this.relayReady ? undefined : 'Relay unavailable. Waiting for reconnection.'
        } catch (cause) {
          this.relayReady = false
          this.error = cause instanceof Error ? cause.message : String(cause)
        }
        this.options.changed()
      })
    }
    this.accepting = this.acceptLoop().catch((cause: unknown) => {
      if (!this.closed) {
        this.error = String(cause)
        this.options.changed()
      }
    })
    this.schedule(0)
  }
  private async register(admission?: Invite['admission']): Promise<void> {
    if (!this.relay || !this.transportKey || !this.binding) return
    const timestamp = Date.now()
    const message = `xnet/relay-register/1\n${this.binding.endpoint}\n${timestamp}`
    const signature = this.transportKey.sign(Array.from(Buffer.from(message))).toString()
    // Use Chromium's network stack: it honors desktop proxy/DNS settings, unlike
    // the bundled Node 20 fetch implementation on some IPv6 networks.
    const result = await net.fetch(new URL('register', this.relay).href, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ endpoint: this.binding.endpoint, timestamp, signature, admission })
    })
    if (!result.ok)
      throw new Error(
        `Relay admission failed (${result.status}). An invitation from an admitted friend or operator setup is required.`
      )
  }
  private ticket(): string {
    if (!this.endpoint) throw new Error('Peer transport is not running.')
    const addr = this.endpoint.addr()
    return EndpointTicket.fromAddr(
      new EndpointAddr(this.endpoint.id(), this.relay, addr.directAddresses().slice(0, 16))
    ).toString()
  }
  private checkTicket(ticket: string, binding: PeerBinding): EndpointAddr {
    if (typeof ticket !== 'string' || ticket.length > 4096) throw new Error('Invalid peer address.')
    const addr = EndpointTicket.fromString(ticket).endpointAddr()
    if (endpointHex(addr.id()) !== binding.endpoint)
      throw new Error('Invitation address does not match its identity.')
    const relay = addr.relayUrl()
    if (relay && relayUrl(relay) !== this.relay)
      throw new Error(
        'This invitation uses a different relay. Configure the same trusted relay first.'
      )
    if (addr.directAddresses().length > 16) throw new Error('Too many peer addresses.')
    return addr
  }
  inspectInvite(link: string): import('@xnetjs/workbench/peer-chat').PeerInvitation {
    const invite = decodeInvite(link)
    const addr = this.checkTicket(invite.ticket, invite.binding)
    return {
      channel: invite.group?.id ?? inviteChannel(invite, this.did),
      name: invite.name,
      did: invite.binding.did,
      relay: addr.relayUrl() ?? undefined,
      access:
        invite.access === 'public'
          ? 'public'
          : invite.access === 'approval'
            ? 'approval'
            : 'invite',
      kind: invite.group ? 'group' : 'direct',
      expires: invite.expires
    }
  }
  async createInvite(
    name: string,
    group?: GroupDescriptor,
    access?: 'contact' | 'approval' | 'public'
  ): Promise<string> {
    if (typeof name !== 'string' || !name.trim() || name.length > 80)
      throw new Error('Choose a conversation name of 1–80 characters.')
    await this.enable()
    if (this.state.contacts.length >= 32)
      throw new Error('This prototype supports 32 peer contacts.')
    const expires = Date.now() + (access ? 24 : 1) * 3600_000
    const reusableAdmission = !!access && this.sharedLinksReady !== false
    const nonce = randomBytes(32).toString('hex')
    const parent = this.binding!.endpoint
    const admission = this.relay
      ? {
          parent,
          nonce,
          expires,
          ...(reusableAdmission ? { maxUses: 8 } : {}),
          signature: this.endpoint!.secretKey()
            .sign(
              Array.from(
                Buffer.from(
                  reusableAdmission
                    ? `xnet/relay-invite/2\n${parent}\n${nonce}\n${expires}\n8`
                    : `xnet/relay-invite/1\n${parent}\n${nonce}\n${expires}`
                )
              )
            )
            .toString()
        }
      : undefined
    let invite: Invite = {
      version: access ? 3 : group ? 2 : 1,
      ...(access ? { access } : {}),
      channel: `iroh-${randomUUID()}`,
      name: name.trim(),
      binding: this.binding!,
      ticket: this.ticket(),
      secret: randomBytes(32).toString('hex'),
      expires,
      admission,
      ...(group ? { group: { id: group.id, name: group.name, owner: group.owner } } : {})
    }
    if (access) invite = signInvite(invite, this.options.seed)
    this.state.invite = invite
    this.save()
    return encodeInvite(invite)
  }
  async join(link: string): Promise<string> {
    const invite = decodeInvite(link)
    this.checkTicket(invite.ticket, invite.binding)
    await this.enable(invite.admission)
    if (invite.binding.endpoint === this.binding!.endpoint)
      throw new Error('This is your own invitation. Send it to a friend.')
    const known = this.state.contacts.find(
      (contact) =>
        contact.status === 'approved' &&
        contact.binding.did === invite.binding.did &&
        contact.binding.endpoint === invite.binding.endpoint &&
        contact.groupId === invite.group?.id
    )
    if (known) {
      known.ticket = invite.ticket
      known.invitationId = invite.channel
      this.lastExchange.delete(known.channel)
      this.save()
      this.schedule(0)
      return known.groupId ?? known.channel
    }
    const channel = inviteChannel(invite, this.did)
    const existing = this.state.contacts.find((c) => c.channel === channel)
    if (existing) {
      if (
        existing.binding.did !== invite.binding.did ||
        existing.binding.endpoint !== invite.binding.endpoint
      )
        throw new Error('This conversation already belongs to a different contact.')
      if (existing.status === 'blocked') throw new Error('This contact is disconnected.')
      // A crash after saving the contact but before consuming the invitation is safe to retry.
      return existing.groupId ?? existing.channel
    }
    if (this.state.contacts.length >= 32)
      throw new Error('This prototype supports 32 peer contacts.')
    this.state.contacts.push({
      channel,
      invitationId: invite.channel,
      name: invite.name,
      binding: invite.binding,
      status: 'requesting',
      ticket: invite.ticket,
      cursor: { lamport: 0, hash: '' },
      invite,
      ...(invite.group ? { group: invite.group, groupId: invite.group.id } : {})
    })
    this.save()
    this.schedule(0)
    return invite.group?.id ?? channel
  }
  async approve(channel: string): Promise<void> {
    return this.updateMembership(() => this.approveNow(channel))
  }
  private async approveNow(channel: string): Promise<void> {
    if (
      this.state.contacts.some(
        (contact) => contact.channel === channel && contact.status === 'approved'
      )
    )
      return
    const contact = this.state.contacts.find((c) => c.channel === channel && c.status === 'pending')
    if (!contact) throw new Error('No pending invitation.')
    if (contact.group) {
      const previous = this.groupFor(contact)
      if (!previous || previous.owner !== this.binding!.did)
        throw new Error('Only the host can approve group membership.')
      const members = [...new Set([...previous.members, contact.binding.did])]
      const group = signGroup(this.options.seed, {
        ...previous,
        members,
        revision: previous.revision + 1
      })
      await this.options.apply({ contact, me: this.binding!.did, changes: [], group })
      this.state.groups = { ...this.state.groups, [group.id]: group }
      this.lastExchange.clear()
    } else await this.project(contact)
    contact.status = 'approved'
    this.save()
  }
  async block(channel: string): Promise<void> {
    return this.updateMembership(() => this.blockNow(channel))
  }
  private async blockNow(channel: string): Promise<void> {
    const contact = this.state.contacts.find((c) => c.channel === channel)
    if (!contact) throw new Error('Unknown peer.')
    contact.status = 'blocked'
    contact.connection = 'offline'
    contact.error = undefined
    contact.queued = false
    contact.invite = undefined
    const group = this.groupFor(contact)
    if (group?.owner === this.binding!.did) {
      this.state.groups = {
        ...this.state.groups,
        [group.id]: signGroup(this.options.seed, {
          ...group,
          revision: group.revision + 1,
          members: group.members.filter((did) => did !== contact.binding.did)
        })
      }
      for (const connection of this.state.contacts) {
        if (connection.groupId === group.id && connection.binding.did === contact.binding.did)
          connection.status = 'blocked'
      }
      this.lastExchange.clear()
    }
    if (this.state.invite?.channel === channel) this.state.invite = undefined
    for (const connection of this.connections)
      if (endpointHex(connection.remoteId()) === contact.binding.endpoint) connection.close(1n, [])
    this.save()
    if (group?.owner === this.binding!.did) await this.project(contact)
  }
  private async handle(remote: string, raw: unknown): Promise<Response> {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid peer packet.')
    const packet = raw as Packet
    if (packet.kind === 'join') {
      const binding = validateBinding(packet.binding, remote)
      this.checkTicket(packet.ticket, binding)
      const invite = [this.state.invite, ...Object.values(this.state.links ?? {})].find(
        (entry) => entry?.channel === packet.invite?.channel
      )
      if (
        !invite ||
        invite.expires <= Date.now() ||
        packet.invite?.channel !== invite.channel ||
        !equalSecret(invite.secret, packet.invite.secret)
      )
        throw new Error('Invitation is expired, revoked, or already used.')
      const channel = inviteChannel(invite, binding.did)
      let contact = this.state.contacts.find((c) => c.channel === channel)
      if (
        contact &&
        (contact.binding.endpoint !== remote ||
          contact.binding.did !== binding.did ||
          contact.status === 'blocked')
      )
        throw new Error('Invitation is already claimed.')
      if (!contact) {
        if (this.state.contacts.length >= 32) throw new Error('Contact limit reached.')
        contact = {
          channel,
          name: invite.name,
          binding,
          ticket: packet.ticket,
          status: 'pending',
          cursor: { lamport: 0, hash: '' },
          ...(invite.group ? { group: invite.group, groupId: invite.group.id } : {})
        }
        this.state.contacts.push(contact)
        this.save()
      }
      this.receiveProfile(contact, packet.profile)
      if (
        invite.access === 'public' ||
        (invite.group && this.state.groups?.[invite.group.id]?.access === 'public')
      ) {
        const group = this.groupFor(contact)
        if (!group || group.access !== 'public') throw new Error('This group is no longer public.')
        if (contact.status !== 'approved' && packet.participate) {
          contact.status = 'pending'
          await this.approve(contact.channel)
        } else if (contact.status === 'pending') {
          contact.status = 'viewing'
          this.save()
        }
      }
      return {
        status:
          contact.status === 'approved'
            ? 'approved'
            : contact.status === 'viewing'
              ? 'viewing'
              : 'pending',
        profile: this.state.profile,
        ...(['approved', 'viewing'].includes(contact.status)
          ? {
              group: this.groupFor(contact),
              profiles: this.groupFor(contact)
                ? this.groupProfiles(this.groupFor(contact)!)
                : undefined
            }
          : {})
      }
    }
    if (packet.kind !== 'sync' || !Array.isArray(packet.changes) || packet.changes.length > 3)
      throw new Error('Invalid sync request.')
    if (
      this.state.contacts.some(
        (contact) =>
          contact.channel === packet.channel &&
          contact.binding.endpoint === remote &&
          contact.status === 'blocked'
      )
    )
      return { status: 'removed' }
    const contact = this.state.contacts.find(
      (c) =>
        c.channel === packet.channel &&
        c.binding.endpoint === remote &&
        ['approved', 'viewing'].includes(c.status)
    )
    if (!contact) throw new Error('This device has no permission for that conversation.')
    this.acceptGroup(contact, packet.group)
    this.receiveGroupProfiles(contact, packet.profiles)
    const group = this.groupFor(contact)
    if (
      group &&
      group.access !== 'public' &&
      (!group.members.includes(contact.binding.did) || !group.members.includes(this.binding!.did))
    )
      throw new Error('Group membership was removed.')
    if (contact.status === 'viewing' && group?.owner === this.did && packet.changes.length)
      throw new Error('Join the group before sending messages.')
    this.receiveProfile(contact, packet.profile)
    this.checkTicket(packet.ticket, contact.binding)
    if (contact.ticket !== packet.ticket) {
      contact.ticket = packet.ticket
      this.save()
    }
    for (const change of packet.changes) {
      const author =
        group && contact.binding.did === group.owner ? change.authorDID : contact.binding.did
      if (group && !group.members.includes(author))
        throw new Error('This author is not a group member.')
      validateChange(change, messageChannel(group, contact.channel, change.payload.nodeId), author)
    }
    const day = new Date().toISOString().slice(0, 10)
    const bytes =
      (contact.received?.day === day ? contact.received.bytes : 0) +
      Buffer.byteLength(JSON.stringify(packet.changes))
    if (bytes > 2 * 1024 * 1024)
      throw new Error('Daily peer receive limit reached. Delivery will resume tomorrow.')
    if (packet.changes.length) {
      contact.received = { day, bytes }
      this.save()
    }
    await this.project(contact, packet.changes)
    return {
      status: 'synced',
      hashes: packet.changes.map((c) => c.hash),
      profile: this.state.profile,
      group,
      profiles: group?.owner === this.did ? this.groupProfiles(group) : undefined
    }
  }
  private async acceptLoop(): Promise<void> {
    while (!this.closed && this.endpoint) {
      const incoming = await this.endpoint.acceptNext()
      if (!incoming) return
      if (this.incoming >= 4) {
        incoming.refuse()
        continue
      }
      this.incoming++
      void (async () => {
        let connection: Connection | undefined
        try {
          let abandoned = false
          connection = await deadline(
            (async () => {
              const accepted = await (await incoming.accept()).connect()
              if (abandoned || this.closed) {
                accepted.close(1n, [])
                throw new Error('Incoming peer connection was cancelled.')
              }
              return accepted
            })(),
            5000,
            () => {
              abandoned = true
            }
          )
          const peer = endpointHex(connection.remoteId())
          const previous = this.receiveTimes.get(peer)
          const window =
            previous && Date.now() - previous.since < 1000
              ? previous
              : { since: Date.now(), count: 0 }
          if (++window.count > 8) throw new Error('Peer request rate exceeded.')
          if (this.receiveTimes.size > 128) this.receiveTimes.clear()
          this.receiveTimes.set(peer, window)
          this.connections.add(connection)
          connection.setMaxConcurrentUniStreams(0n)
          connection.setMaxConcurrentBiStreams(1n)
          connection.setReceiveWindow(BigInt(MAX_FRAME * 2))
          const current = connection
          await deadline(
            (async () => {
              const stream = await current.acceptBi()
              const response = await this.handle(peer, await readFrame(stream))
              await writeFrame(stream, response)
              // Wait for acknowledgement before closing QUIC: FIN alone is not delivery.
              await stream.send.stopped()
            })(),
            10000,
            () => current.close(1n, [])
          )
        } catch (cause) {
          // The initiator sees a failed exchange and retains its durable outbox cursor.
          if (connection && !this.closed)
            console.warn(
              '[peer-chat] exchange rejected:',
              cause instanceof Error ? cause.message : String(cause)
            )
        } finally {
          if (connection) {
            connection.close(0n, [])
            this.connections.delete(connection)
          }
          this.incoming--
        }
      })()
    }
  }
  private async request(contact: Contact, packet: Packet): Promise<Response> {
    if (!this.endpoint) throw new Error('Peer transport is offline.')
    const addr = this.checkTicket(contact.ticket, contact.binding)
    let abandoned = false
    const connection = await deadline(
      this.endpoint.connect(addr, ALPN).then((value) => {
        if (abandoned || this.closed) {
          value.close(1n, [])
          throw new Error('Peer connection was cancelled.')
        }
        return value
      }),
      10000,
      () => {
        abandoned = true
      }
    )
    this.connections.add(connection)
    try {
      return await deadline(
        (async () => {
          if (packet.kind === 'sync') {
            const currentGroup = this.groupFor(contact)
            if (
              !['approved', 'viewing'].includes(contact.status) ||
              (currentGroup &&
                currentGroup.access !== 'public' &&
                !currentGroup.members.includes(contact.binding.did))
            )
              throw new Error('This connection no longer has permission.')
            if (currentGroup) {
              packet.group = currentGroup
              packet.profiles =
                currentGroup.owner === this.did ? this.groupProfiles(currentGroup) : undefined
              if (packet.changes.some((change) => !currentGroup.members.includes(change.authorDID)))
                throw new Error(
                  'Group membership changed before delivery. Retrying with the current membership.'
                )
            }
          }
          const stream = await connection.openBi()
          await writeFrame(stream, packet)
          const response = (await readFrame(stream)) as Response
          if (
            !response ||
            !['pending', 'approved', 'synced', 'removed', 'viewing'].includes(response.status)
          )
            throw new Error('Invalid peer response.')
          if (response.status === 'removed') {
            await this.block(contact.channel)
            throw new Error(
              contact.group
                ? 'This group connection was ended. Previously received messages remain on this device.'
                : 'Your contact ended this connection. Previously received messages remain on this device.'
            )
          }
          if (response.status !== 'pending') this.acceptGroup(contact, response.group)
          this.receiveGroupProfiles(contact, response.profiles)
          this.receiveProfile(contact, response.profile)
          contact.connection = connection.paths().some((p) => p.isSelected && p.isIp)
            ? 'direct'
            : 'relay'
          this.lastExchange.set(contact.channel, Date.now())
          return response
        })(),
        12000,
        () => connection.close(1n, [])
      )
    } finally {
      connection.close(0n, [])
      this.connections.delete(connection)
    }
  }
  private schedule(ms: number): void {
    if (this.closed || this.timer) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.ticking = this.tick()
    }, ms)
  }
  private async tick(): Promise<void> {
    try {
      if (this.relay && Date.now() - this.healthCheckedAt > 30000) {
        this.healthCheckedAt = Date.now()
        try {
          const health = await net.fetch(new URL('healthz', this.relay).href, {
            redirect: 'error',
            signal: AbortSignal.timeout(3000)
          })
          this.relayHealthy = health.ok
        } catch {
          this.relayHealthy = false
        }
      }
      const contacts = this.state.contacts.filter((c) =>
        ['requesting', 'approved', 'viewing'].includes(c.status)
      )
      for (let offset = 0; offset < contacts.length; offset += 4) {
        if (this.closed) return
        await Promise.all(
          contacts.slice(offset, offset + 4).map(async (contact) => {
            try {
              if (contact.status === 'requesting' && contact.invite) {
                if (contact.invite.expires <= Date.now())
                  throw new Error('Invitation expired. Ask your friend for a new invitation.')
                const result = await this.request(contact, {
                  kind: 'join',
                  invite: contact.invite,
                  binding: this.binding!,
                  ticket: this.ticket(),
                  profile: this.state.profile
                })
                if (result.status === 'approved' || result.status === 'viewing') {
                  await this.project(contact)
                  contact.status = result.status
                  if (result.status === 'approved') contact.invite = undefined
                  this.save()
                }
              } else if (contact.status === 'approved' || contact.status === 'viewing') {
                const group = this.groupFor(contact)
                if (
                  contact.group &&
                  (!group ||
                    (group.access !== 'public' &&
                      (!group.members.includes(this.binding!.did) ||
                        !group.members.includes(contact.binding.did))))
                )
                  throw new Error('Group membership is no longer active.')
                const authors =
                  group?.owner === this.binding!.did
                    ? group.members.filter((did) => did !== contact.binding.did)
                    : contact.status === 'viewing'
                      ? []
                      : [this.binding!.did]
                const changes = (
                  await Promise.all(
                    (group ? groupChannels(group) : [{ id: contact.channel }]).flatMap(
                      ({ id: channel }) =>
                        authors.map((author) =>
                          (this.options.read ?? getPeerChanges)(
                            channel,
                            author,
                            group
                              ? (contact.groupCursors?.[`${channel}:${author}`] ??
                                  (channel === group.id
                                    ? contact.groupCursors?.[author]
                                    : undefined) ?? { lamport: 0, hash: '' })
                              : contact.cursor
                          )
                        )
                    )
                  )
                )
                  .flat()
                  .sort((a, b) => a.lamport - b.lamport || a.hash.localeCompare(b.hash))
                  .slice(0, 3)
                for (const change of changes) {
                  if (!authors.includes(change.authorDID))
                    throw new Error('Outbox author is outside this conversation.')
                  validateChange(
                    change,
                    messageChannel(group, contact.channel, change.payload.nodeId),
                    change.authorDID
                  )
                }
                contact.queued = changes.length > 0
                // Poll the local outbox frequently, but avoid a QUIC handshake
                // every three seconds for an idle chat on a metered relay.
                if (
                  !changes.length &&
                  Date.now() - (this.lastExchange.get(contact.channel) ?? 0) < 30000
                )
                  return
                const result = await this.request(contact, {
                  kind: 'sync',
                  channel: contact.channel,
                  ticket: this.ticket(),
                  profile: this.state.profile,
                  group,
                  profiles: group?.owner === this.did ? this.groupProfiles(group) : undefined,
                  changes
                })
                if (
                  result.status !== 'synced' ||
                  JSON.stringify(result.hashes) !== JSON.stringify(changes.map((c) => c.hash))
                )
                  throw new Error('Peer did not acknowledge the saved messages.')
                const last = changes.at(-1)
                if (last) {
                  if (group) {
                    for (const change of changes)
                      contact.groupCursors = {
                        ...contact.groupCursors,
                        [`${messageChannel(group, contact.channel, change.payload.nodeId)}:${change.authorDID}`]:
                          { lamport: change.lamport, hash: change.hash }
                      }
                  } else contact.cursor = { lamport: last.lamport, hash: last.hash }
                  contact.deliveredAt = Date.now()
                  contact.queued = changes.length === 3
                  this.save()
                }
              }
              contact.error = undefined
            } catch (cause) {
              contact.connection = 'offline'
              contact.error = cause instanceof Error ? cause.message : String(cause)
            }
          })
        )
      }
    } finally {
      this.options.changed()
      this.schedule(3000)
    }
  }
  async close(): Promise<void> {
    this.closed = true
    clearTimeout(this.timer)
    // A pending admission request/bind still owns an endpoint; close it too.
    await this.starting?.catch(() => undefined)
    this.relayWatcher?.stop()
    for (const connection of this.connections) connection.close(0n, [])
    await this.endpoint?.close()
    await Promise.allSettled([this.accepting, this.ticking])
    this.relayWatcher = undefined
    this.endpoint = undefined
    this.connections.clear()
  }
}
