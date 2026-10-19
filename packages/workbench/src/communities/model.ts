import type { MutateOp } from '@xnetjs/react'
import { dmChannelId } from '@xnetjs/comms'
import { ChannelSchema, SpaceSchema, SpaceMembershipSchema, spaceMembershipId } from '@xnetjs/data'

export type Did = `did:key:${string}`
export type Audience = 'private' | 'unlisted' | 'public'
export type Section = 'messages' | 'people' | 'communities'
export const audienceLabel: Record<Audience, string> = {
  private: 'Members only',
  unlisted: 'Unlisted',
  public: 'Public'
}
export const audienceDescription: Record<Audience, string> = {
  private:
    'Intended for invited members. This preview still needs the private-community security work in 0478.',
  unlisted: 'Keep this community out of public listings. A conversation ID does not grant access.',
  public:
    'Intended for public reading. Public discovery depends on your host. Do not share private information.'
}
export function requireDid(value: string): Did {
  const did = value.trim()
  if (!/^did:key:z[1-9A-HJ-NP-Za-km-z]{20,}$/.test(did))
    throw new Error('Enter a complete xNet identity beginning with did:key:z.')
  return did as Did
}
export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || '?'
  )
}
export function shortDid(did: string): string {
  return `${did.slice(0, 13)}…${did.slice(-5)}`
}
export function bytesLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
/** Each new circle is a root security boundary. Visual grouping never grants access. */
export function conversationPlan(input: {
  name: string
  me: Did
  members: Did[]
  kind: 'dm' | 'group' | 'community' | 'organization'
  audience: Audience
  id: string
  description?: string
}): { channelId: string; operations: MutateOp[] } {
  const members = [...new Set([input.me, ...input.members])]
  if (input.kind === 'dm' && members.length !== 2)
    throw new Error('Choose one other person for a direct message.')
  const name = input.name.trim()
  if (!name || name.length > 120)
    throw new Error('Use a conversation name between 1 and 120 characters.')
  const channelId = input.kind === 'dm' ? dmChannelId(members) : `chat-${input.id}`
  const spaceId = `circle-${channelId}`
  const visibility = input.kind === 'dm' ? 'private' : input.audience
  return {
    channelId,
    operations: [
      {
        type: 'create',
        schema: SpaceSchema,
        id: spaceId,
        data: {
          name,
          kind:
            input.kind === 'organization'
              ? 'organization'
              : input.kind === 'community'
                ? 'community'
                : 'team',
          visibility,
          owners: [input.me],
          description: input.description
        }
      },
      ...members.map(
        (member): MutateOp => ({
          type: 'create',
          schema: SpaceMembershipSchema,
          id: spaceMembershipId(spaceId, member),
          data: {
            space: spaceId,
            member,
            role: member === input.me ? 'owner' : 'member',
            addedBy: input.me,
            addedAt: Date.now()
          }
        })
      ),
      {
        type: 'create',
        schema: ChannelSchema,
        id: channelId,
        data: {
          name: input.kind === 'community' || input.kind === 'organization' ? 'general' : name,
          kind: input.kind === 'dm' ? 'dm' : 'channel',
          members,
          space: spaceId,
          visibility: 'inherit',
          topic: input.description
        }
      }
    ]
  }
}
export function socialProfileUrl(
  provider: 'bluesky' | 'twitter',
  value: string
): { handle: string; url: string } {
  const raw = value.trim().replace(/^@/, '')
  let handle = raw
  if (raw.includes('://')) {
    const url = new URL(raw)
    const allowed = provider === 'bluesky' ? ['bsky.app'] : ['x.com', 'twitter.com']
    if (
      url.protocol !== 'https:' ||
      !allowed.includes(url.hostname) ||
      url.username ||
      url.password
    )
      throw new Error('Use a profile URL from the selected service.')
    handle =
      provider === 'bluesky'
        ? url.pathname.replace(/^\/profile\//, '').replace(/\/$/, '')
        : url.pathname.slice(1).replace(/\/$/, '')
  }
  const valid =
    provider === 'bluesky'
      ? /^(?=.{3,253}$)[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(handle)
      : /^[a-zA-Z0-9_]{1,15}$/.test(handle)
  if (!valid)
    throw new Error(
      provider === 'bluesky'
        ? 'Enter a Bluesky handle such as you.bsky.social.'
        : 'Enter an X handle using letters, numbers, or underscores.'
    )
  return {
    handle,
    url: provider === 'bluesky' ? `https://bsky.app/profile/${handle}` : `https://x.com/${handle}`
  }
}
