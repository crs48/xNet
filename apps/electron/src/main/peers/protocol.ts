import type { GroupDescriptor } from './groups'
import type { NodeChange } from '@xnetjs/data'
import type { PeerBinding } from '@xnetjs/workbench/peer-chat'
import { createHash, timingSafeEqual } from 'node:crypto'
import { sign, verify } from '@xnetjs/crypto'
import { ChatMessageSchema } from '@xnetjs/data'
import { identityFromPrivateKey, parseDID } from '@xnetjs/identity'
import { verifyChangeHash, verifyChange } from '@xnetjs/sync'
import { peerMessagePrefix } from '@xnetjs/workbench/peer-chat'

export const ALPN = Array.from(Buffer.from('xnet/peer-chat/1'))
export const MAX_FRAME = 64 * 1024
export const MAX_TEXT = 4000
export type Cursor = { lamport: number; hash: string }
export type WireChange = Omit<NodeChange, 'signature'> & { signature: number[] }
export type SignedPeerProfile = { name: string; updatedAt: number; signature: string }
const profileBytes = (profile: Pick<SignedPeerProfile, 'name' | 'updatedAt'>, did: string) =>
  Buffer.from(JSON.stringify(['xnet/peer-profile/1', did, profile.name, profile.updatedAt]))
export function signPeerProfile(
  seed: Uint8Array,
  name: string,
  now = Date.now()
): SignedPeerProfile {
  const value = { name: name.trim(), updatedAt: now }
  if (!value.name || value.name.length > 120) throw new Error('Choose a name of 1–120 characters.')
  return {
    ...value,
    signature: Buffer.from(
      sign(profileBytes(value, identityFromPrivateKey(seed).did), seed)
    ).toString('hex')
  }
}
export function validatePeerProfile(
  raw: unknown,
  did: string,
  now = Date.now()
): SignedPeerProfile {
  const profile = raw as SignedPeerProfile | null
  if (
    !profile ||
    typeof profile.name !== 'string' ||
    !profile.name.trim() ||
    profile.name.length > 120 ||
    !Number.isSafeInteger(profile.updatedAt) ||
    profile.updatedAt <= 0 ||
    profile.updatedAt > now + 60_000 ||
    typeof profile.signature !== 'string' ||
    !/^[a-f0-9]{128}$/.test(profile.signature) ||
    !verify(
      profileBytes(profile, did),
      Buffer.from(profile.signature, 'hex'),
      parseDID(did as `did:key:${string}`)
    )
  )
    throw new Error('The peer profile signature is invalid.')
  return { name: profile.name, updatedAt: profile.updatedAt, signature: profile.signature }
}
export type Invite = {
  version: 1 | 2 | 3
  access?: 'contact' | 'approval' | 'public'
  signature?: string
  channel: string
  name: string
  secret: string
  expires: number
  binding: PeerBinding
  ticket: string
  admission?: {
    parent: string
    nonce: string
    expires: number
    signature: string
    maxUses?: number
  }
  group?: GroupDescriptor
}
export const bindingBytes = (endpoint: string, did: string): Uint8Array =>
  Buffer.from(`xnet/peer-binding/1\n${endpoint}\n${did}`)
export function createBinding(seed: Uint8Array, endpoint: string): PeerBinding {
  const did = identityFromPrivateKey(seed).did
  return {
    endpoint,
    did,
    signature: Buffer.from(sign(bindingBytes(endpoint, did), seed)).toString('hex')
  }
}
export function validateBinding(raw: unknown, endpoint?: string): PeerBinding {
  const value = raw as Partial<PeerBinding> | null
  if (
    !value ||
    typeof value.endpoint !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.endpoint) ||
    typeof value.did !== 'string' ||
    !value.did.startsWith('did:key:') ||
    value.did.length > 100 ||
    typeof value.signature !== 'string' ||
    !/^[a-f0-9]{128}$/.test(value.signature) ||
    (endpoint && value.endpoint !== endpoint)
  )
    throw new Error('Invalid peer identity binding.')
  if (
    !verify(
      bindingBytes(value.endpoint, value.did),
      Buffer.from(value.signature, 'hex'),
      parseDID(value.did)
    )
  )
    throw new Error('The peer identity signature is invalid.')
  return value as PeerBinding
}
export function relayUrl(raw: string): string {
  const url = new URL(raw)
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost'
  if (
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('Use an HTTPS relay origin (or localhost for development).')
  return url.origin + '/'
}
export function decodeInvite(link: string, now = Date.now()): Invite {
  if (typeof link !== 'string' || link.length > 12000) throw new Error('Invalid invitation link.')
  const url = new URL(link.trim())
  const native =
    url.protocol === 'xnet:' && url.hostname === 'peer' && (!url.pathname || url.pathname === '/')
  const web = url.origin === 'https://xnet.fyi' && ['/join', '/join/'].includes(url.pathname)
  if ((!native && !web) || url.username || url.password || url.port || url.search)
    throw new Error('Use an xNet invitation from xnet.fyi/join or xnet://peer.')
  const value = JSON.parse(Buffer.from(url.hash.slice(1), 'base64url').toString()) as Invite
  if (
    ![1, 2, 3].includes(value.version) ||
    !/^iroh-[a-f0-9-]{36}$/.test(value.channel) ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.length > 80 ||
    !/^[a-f0-9]{64}$/.test(value.secret) ||
    !Number.isSafeInteger(value.expires) ||
    value.expires <= now ||
    value.expires > now + 24 * 3600_000 ||
    typeof value.ticket !== 'string' ||
    value.ticket.length > 4096
  )
    throw new Error('This invitation is invalid or expired. Ask for a new one.')
  validateBinding(value.binding)
  if (value.version === 2 || (value.version === 3 && value.access !== 'contact')) {
    if (
      !value.group ||
      !/^iroh-[a-f0-9-]{36}$/.test(value.group.id) ||
      value.group.id === value.channel ||
      value.group.owner !== value.binding.did ||
      value.group.name !== value.name
    )
      throw new Error('Invalid group invitation.')
  } else if (value.group !== undefined) throw new Error('Use a version 2 group invitation.')
  if (value.version === 3) {
    if (
      !['contact', 'approval', 'public'].includes(value.access ?? '') ||
      typeof value.signature !== 'string' ||
      !/^[a-f0-9]{128}$/.test(value.signature) ||
      !verify(inviteBytes(value), Buffer.from(value.signature, 'hex'), parseDID(value.binding.did))
    )
      throw new Error('The shared link signature is invalid.')
  }
  return value
}
const inviteBytes = (invite: Invite): Buffer => {
  return Buffer.from(
    JSON.stringify([
      'xnet/peer-link/3',
      invite.version,
      invite.channel,
      invite.name,
      invite.secret,
      invite.expires,
      invite.binding.endpoint,
      invite.binding.did,
      invite.binding.signature,
      invite.ticket,
      invite.access,
      invite.group ? [invite.group.id, invite.group.name, invite.group.owner] : null,
      invite.admission
        ? [
            invite.admission.parent,
            invite.admission.nonce,
            invite.admission.expires,
            invite.admission.signature,
            invite.admission.maxUses ?? null
          ]
        : null
    ])
  )
}
export const signInvite = (invite: Invite, seed: Uint8Array): Invite => ({
  ...invite,
  signature: Buffer.from(sign(inviteBytes(invite), seed)).toString('hex')
})
export function inviteChannel(invite: Invite, requester: string): string {
  if (invite.version !== 3) return invite.channel
  const hash = createHash('sha256')
    .update(`xnet/request/1:${invite.channel}:${requester}`)
    .digest('hex')
  return `iroh-${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`
}
export const encodeInvite = (invite: Invite): string =>
  `xnet://peer#${Buffer.from(JSON.stringify(invite)).toString('base64url')}`
export const encodeWebInvite = (invite: Invite): string =>
  `https://xnet.fyi/join#${Buffer.from(JSON.stringify(invite)).toString('base64url')}`
export const equalSecret = (a: string, b: unknown): boolean =>
  typeof b === 'string' &&
  /^[a-f0-9]{64}$/.test(b) &&
  timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
export function validateChange(raw: unknown, channel: string, did: string): NodeChange {
  if (!raw || typeof raw !== 'object' || Buffer.byteLength(JSON.stringify(raw)) > 16000)
    throw new Error('Invalid or oversized chat change.')
  const c = raw as WireChange
  const p = c.payload
  if (
    typeof c.id !== 'string' ||
    c.id.length > 100 ||
    c.type !== 'node-change' ||
    !p ||
    typeof p.nodeId !== 'string' ||
    !p.nodeId.startsWith(peerMessagePrefix(channel, did)) ||
    p.nodeId.length > 220 ||
    c.authorDID !== did ||
    (p.schemaId && p.schemaId !== ChatMessageSchema._schemaId) ||
    !Number.isSafeInteger(c.lamport) ||
    c.lamport < 0 ||
    !Number.isSafeInteger(c.wallTime) ||
    !Array.isArray(c.signature) ||
    c.signature.length !== 64 ||
    c.signature.some((n) => !Number.isInteger(n) || n < 0 || n > 255) ||
    !p.properties ||
    typeof p.properties !== 'object' ||
    Array.isArray(p.properties)
  )
    throw new Error('Chat change is outside this peer’s permission.')
  for (const [key, value] of Object.entries(p.properties)) {
    if (key === 'channel' && value === channel) continue
    if (key === 'content' && typeof value === 'string' && value.length <= MAX_TEXT) continue
    if (['redacted', 'edited'].includes(key) && typeof value === 'boolean') continue
    if (
      key === 'inReplyTo' &&
      typeof value === 'string' &&
      value.startsWith(channel + '-message-') &&
      value.length <= 220
    )
      continue
    throw new Error(`Peer chat does not support the property: ${key}`)
  }
  if (p.schemaId && p.properties.channel !== channel)
    throw new Error('A new message must name its conversation.')
  const change = { ...c, signature: new Uint8Array(c.signature) }
  if (!verifyChangeHash(change) || !verifyChange(change, parseDID(did as `did:key:${string}`)))
    throw new Error('The chat change signature is invalid.')
  return change
}
export async function deadline<T>(
  promise: Promise<T>,
  ms = 12000,
  cancel?: () => void
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          cancel?.()
          reject(new Error('The peer did not respond. Messages remain saved on this device.'))
        }, ms)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}
