/**
 * Pure helpers behind the comms UI (0167/0168) — kept out of components so
 * they stay covered by tests and the components stay thin wiring.
 */
import type { PeerPresence, UserCard } from '@xnetjs/comms'

export interface ProfileEntry {
  did: string
  name?: string
  avatar?: string
  /** Optional workspace-unique @handle (0172) */
  handle?: string
}

/**
 * Only render avatar sources we trust in an <img>: small inline images
 * (`data:image/*`), web URLs, and session-local object URLs. Profiles sync
 * from other peers, so anything else (javascript:, file:, …) is dropped and
 * the caller falls back to the DIDAvatar identicon.
 */
export function safeAvatarSrc(src: string | undefined | null): string | undefined {
  const value = src?.trim()
  if (!value) return undefined
  const lower = value.toLowerCase()
  if (lower.startsWith('data:image/')) return value
  if (lower.startsWith('https://') || lower.startsWith('http://')) return value
  if (lower.startsWith('blob:')) return value
  return undefined
}

/** Lowercase slug a raw handle input; '' means unusable. */
export function normalizeHandle(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 32)
}

/** True when `handle` is already used by a different DID in the workspace. */
export function isHandleTaken(handle: string, did: string, profiles: ProfileEntry[]): boolean {
  const normalized = normalizeHandle(handle)
  if (!normalized) return false
  return profiles.some((p) => p.did !== did && p.handle === normalized)
}

/** How to render a mention: @handle when set, else the display name. */
export function mentionLabel(did: string, profiles: ProfileEntry[]): string {
  const profile = profiles.find((p) => p.did === did)
  return profile?.handle?.trim() || displayName(did, profiles)
}

const USER_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4']

export function colorForDid(did: string): string {
  const hash = did.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return USER_COLORS[hash % USER_COLORS.length]
}

/** Resolve a DID to a short human label. */
export function displayName(did: string, profiles: ProfileEntry[]): string {
  const profile = profiles.find((p) => p.did === did)
  return profile?.name?.trim() || `${did.slice(8, 14)}…`
}

/** The local user's presence card from their DID + optional profile node. */
export function userCardFrom(did: string, profile: Record<string, unknown> | undefined): UserCard {
  return {
    did,
    name: profile?.displayName as string | undefined,
    avatar: safeAvatarSrc(profile?.avatar as string | undefined),
    color: colorForDid(did)
  }
}

/**
 * Profiles deduped by DID, newest first wins — with a trust preference:
 * a SELF-authored profile (`createdBy` === subject `did`, the only kind the
 * hub lets through a profile room) always beats a foreign-authored one, so a
 * peer with write access to a shared doc can't override someone's identity
 * by injecting a Profile node for their DID. Foreign-authored profiles still
 * fill DIDs that have no self-authored one (e.g. seeded demo people).
 */
export function dedupeProfiles(
  nodes: Array<Record<string, unknown>> | null | undefined
): ProfileEntry[] {
  const seen = new Map<string, { entry: ProfileEntry; self: boolean }>()
  for (const node of nodes ?? []) {
    const did = node.did as string | undefined
    if (!did) continue
    const createdBy = node.createdBy as string | undefined
    const self = !createdBy || createdBy === did
    const existing = seen.get(did)
    // Keep the existing entry unless a self-authored one supersedes a
    // foreign-authored one (input is newest-first within each class).
    if (existing && (existing.self || !self)) continue
    seen.set(did, {
      self,
      entry: {
        did,
        name: node.displayName as string | undefined,
        avatar: safeAvatarSrc(node.avatar as string | undefined),
        handle: (node.handle as string | undefined)?.trim() || undefined
      }
    })
  }
  return [...seen.values()].map((item) => item.entry)
}

export interface ChannelEntry {
  id: string
  name?: string
  kind?: string
  members?: string[]
  topic?: string
}

/** Display label for a channel row or header (DMs show the other members). */
export function channelLabel(channel: ChannelEntry, me: string, profiles: ProfileEntry[]): string {
  if (channel.kind === 'dm') {
    const others = (channel.members ?? []).filter((m) => m !== me)
    const label = others.map((did) => displayName(did, profiles)).join(', ')
    if (label) return label
  }
  return channel.name?.trim() || 'untitled'
}

/** Header model for the channel tab. */
export function channelHeaderModel(
  channel: Record<string, unknown> | null | undefined,
  me: string,
  profiles: ProfileEntry[]
): { kind: string; label: string; topic?: string } {
  const entry: ChannelEntry = {
    id: String(channel?.id ?? ''),
    name: channel?.name as string | undefined,
    kind: (channel?.kind as string | undefined) ?? 'channel',
    members: channel?.members as string[] | undefined,
    topic: channel?.topic as string | undefined
  }
  return {
    kind: entry.kind ?? 'channel',
    label: channelLabel(entry, me, profiles),
    topic: entry.topic?.trim() || undefined
  }
}

export interface Mentionable {
  label: string
  did: string
  /** Optional @handle, also matched by the picker filter (0172) */
  handle?: string
  /** The current user — listed last and labelled as such */
  isSelf?: boolean
}

/** Mention picker candidates: profiles ∪ live presence roster, self last. */
export function mergeMentionables(
  profiles: ProfileEntry[],
  peers: PeerPresence[],
  meDid: string
): Mentionable[] {
  const byDid = new Map<string, Mentionable>()
  for (const profile of profiles) {
    byDid.set(profile.did, {
      did: profile.did,
      label: displayName(profile.did, profiles),
      handle: profile.handle
    })
  }
  for (const peer of peers) {
    const user = peer.user
    if (user?.did && !byDid.has(user.did)) {
      byDid.set(user.did, {
        did: user.did,
        label: user.name?.trim() || `${user.did.slice(8, 14)}…`
      })
    }
  }
  // Self stays mentionable (typing your own new @handle should find you),
  // but sits last so it never crowds out collaborators.
  const self = byDid.get(meDid)
  byDid.delete(meDid)
  const others = [...byDid.values()]
  return self ? [...others, { ...self, isSelf: true }] : others
}

/** Form values for the profile editor (empty strings for absent fields). */
export function profileFormValues(profile: Record<string, unknown> | null | undefined): {
  name: string
  handle: string
  emoji: string
  message: string
} {
  return {
    name: (profile?.displayName as string | undefined) ?? '',
    handle: (profile?.handle as string | undefined) ?? '',
    emoji: (profile?.statusEmoji as string | undefined) ?? '',
    message: (profile?.statusMessage as string | undefined) ?? ''
  }
}

/** Flip every track of a kind; returns the resulting enabled state. */
export function toggleTrackKind(tracks: Array<{ enabled: boolean }>): boolean {
  for (const track of tracks) track.enabled = !track.enabled
  return tracks[0]?.enabled ?? false
}
