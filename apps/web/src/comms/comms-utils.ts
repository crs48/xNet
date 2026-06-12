/**
 * Pure helpers behind the comms UI (0167/0168) — kept out of components so
 * they stay covered by tests and the components stay thin wiring.
 */
import type { PeerPresence, UserCard } from '@xnetjs/comms'

export interface ProfileEntry {
  did: string
  name?: string
  avatar?: string
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
    avatar: profile?.avatar as string | undefined,
    color: colorForDid(did)
  }
}

/** Profiles deduped by DID, newest first wins. */
export function dedupeProfiles(
  nodes: Array<Record<string, unknown>> | null | undefined
): ProfileEntry[] {
  const seen = new Map<string, ProfileEntry>()
  for (const node of nodes ?? []) {
    const did = node.did as string | undefined
    if (!did || seen.has(did)) continue
    seen.set(did, {
      did,
      name: node.displayName as string | undefined,
      avatar: node.avatar as string | undefined
    })
  }
  return [...seen.values()]
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
}

/** Mention picker candidates: profiles ∪ live presence roster, minus self. */
export function mergeMentionables(
  profiles: ProfileEntry[],
  peers: PeerPresence[],
  meDid: string
): Mentionable[] {
  const byDid = new Map<string, Mentionable>()
  for (const profile of profiles) {
    byDid.set(profile.did, { did: profile.did, label: displayName(profile.did, profiles) })
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
  byDid.delete(meDid)
  return [...byDid.values()]
}

/** Form values for the profile editor (empty strings for absent fields). */
export function profileFormValues(profile: Record<string, unknown> | null | undefined): {
  name: string
  emoji: string
  message: string
} {
  return {
    name: (profile?.displayName as string | undefined) ?? '',
    emoji: (profile?.statusEmoji as string | undefined) ?? '',
    message: (profile?.statusMessage as string | undefined) ?? ''
  }
}

/** Flip every track of a kind; returns the resulting enabled state. */
export function toggleTrackKind(tracks: Array<{ enabled: boolean }>): boolean {
  for (const track of tracks) track.enabled = !track.enabled
  return tracks[0]?.enabled ?? false
}
