/** Prototype namespace: these records never travel through the readable hub transport. */
export const PEER_PREFIX = 'iroh-'
export const isPeerRecord = (id: string): boolean => id.startsWith(PEER_PREFIX)
export const peerMessagePrefix = (channel: string, did: string): string =>
  `${channel}-message-${did}-`
export type PeerBinding = { endpoint: string; did: `did:key:${string}`; signature: string }
export type GroupAccess = 'invite' | 'approval' | 'public'
export const groupAccessLabel: Record<GroupAccess, string> = {
  invite: 'Invite only',
  approval: 'Approval required',
  public: 'Public'
}
export const groupAccessDescription: Record<GroupAccess, string> = {
  invite: 'Only people you invite can join. Messages are private.',
  approval: 'Anyone with the link can request to join. Messages stay private until approval.',
  public: 'Anyone with the link can read. Join to send messages.'
}
export type PeerChannel = { id: string; name: string }
export type PeerContact = {
  channel: string
  name: string
  binding: PeerBinding
  status: 'requesting' | 'pending' | 'approved' | 'blocked' | 'viewing'
  connection?: 'direct' | 'relay' | 'offline'
  error?: string
  deliveredAt?: number
  queued?: boolean
  displayName?: string
  groupId?: string
  invitationId?: string
}
export type PeerGroup = {
  id: string
  name: string
  owner: string
  members: string[]
  hosting: boolean
  names?: Record<string, string>
  access?: GroupAccess
  channels?: PeerChannel[]
}
export type PeerInvitation = {
  channel: string
  name: string
  did: string
  relay?: string
  access?: GroupAccess
  kind: 'direct' | 'group'
  expires: number
}
export type PeerDiscovery = { name: string; handle: string; url: string; link?: string }
export type PeerSnapshot = {
  enabled: boolean
  endpoint?: string
  relay?: string
  relayReady: boolean
  sharedLinksReady?: boolean
  notice?: string
  error?: string
  contacts: PeerContact[]
  invite?: string
  incomingLink?: string
  groups?: PeerGroup[]
}
export interface PeerChatPort {
  snapshot(): Promise<PeerSnapshot>
  enable(): Promise<void>
  createInvite(name: string): Promise<string>
  inspectInvite(link: string): Promise<PeerInvitation>
  join(link: string): Promise<string>
  approve(channel: string): Promise<void>
  block(channel: string): Promise<void>
  setDisplayName(name: string): Promise<void>
  createGroup(name: string): Promise<string>
  inviteToGroup(groupId: string): Promise<string>
  createChatGroup(input: { name: string; access: GroupAccess }): Promise<string>
  addChannel(input: { groupId: string; name: string }): Promise<string>
  setGroupAccess(input: { groupId: string; access: GroupAccess }): Promise<void>
  revokeLink(groupId: string): Promise<void>
  joinPublic(groupId: string): Promise<void>
  contactLink(): Promise<string>
  discover(handle: string): Promise<PeerDiscovery>
  subscribe(listener: () => void): () => void
}
