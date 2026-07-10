/**
 * ChatService — message and channel operations (exploration 0167).
 *
 * Messages are signed nodes synced through the change log (the Comment
 * pattern), so "send" is just a node create; delivery, offline queueing,
 * and pagination come from the existing data layer. The service is a thin,
 * dependency-injected layer over any DataBridge-compatible store so it can
 * run on main thread, in tests, or in the worker.
 */

import {
  ChannelSchema,
  ChatMessageSchema,
  normalizeMentions,
  sanitizeLinkPreviews,
  type ChannelKind,
  type DefinedSchema,
  type InferCreateProps,
  type MessageLinkPreview,
  type MessageMentions,
  type PropertyBuilder
} from '@xnetjs/data'
import { dmChannelId, dmMembers } from './dm'

/** The subset of DataBridge the chat service needs (structurally satisfied). */
export interface ChatStore {
  create<P extends Record<string, PropertyBuilder>>(
    schema: DefinedSchema<P>,
    data: InferCreateProps<P>,
    id?: string
  ): Promise<unknown>
  update(nodeId: string, changes: Record<string, unknown>): Promise<unknown>
  get?(nodeId: string): Promise<unknown | null>
}

export interface CreateChannelInput {
  name: string
  kind?: ChannelKind
  members?: string[]
  /** Node this channel is attached to (per-document chat) */
  target?: string
  topic?: string
}

export interface SendMessageInput {
  channelId: string
  content: string
  mentions?: MessageMentions
  /** Tag node ids declared by the composer's #hashtag picks (0169) */
  tags?: string[]
  /** Node ids declared by the composer's [[ link picks (0170) */
  links?: string[]
  /** Composer-resolved URL previews (0295) — capped at composition time */
  linkPreviews?: MessageLinkPreview[]
  inReplyTo?: string
}

export async function createChannel(store: ChatStore, input: CreateChannelInput): Promise<unknown> {
  return store.create(ChannelSchema, {
    name: input.name,
    kind: input.kind ?? 'channel',
    members: input.members as Array<`did:key:${string}`> | undefined,
    target: input.target,
    topic: input.topic
  })
}

/**
 * Open (or create) the canonical DM channel between the given DIDs.
 * Returns the deterministic channel ID either way.
 */
export async function ensureDmChannel(
  store: ChatStore,
  dids: string[]
): Promise<{ channelId: string; created: boolean }> {
  const channelId = dmChannelId(dids)
  const existing = store.get ? await store.get(channelId) : null
  if (existing) return { channelId, created: false }

  try {
    const members = dmMembers(dids) as Array<`did:key:${string}`>
    await store.create(ChannelSchema, { kind: 'dm', members }, channelId)
    return { channelId, created: true }
  } catch {
    // Lost a local race or the node already exists — deterministic ID means
    // whatever exists IS the channel we wanted.
    return { channelId, created: false }
  }
}

export async function sendMessage(store: ChatStore, input: SendMessageInput): Promise<unknown> {
  const content = input.content.trim()
  if (!content) throw new Error('Cannot send an empty message')
  return store.create(ChatMessageSchema, {
    channel: input.channelId,
    content,
    mentions: normalizeMentions(input.mentions),
    tags: input.tags?.length ? input.tags : undefined,
    links: input.links?.length ? input.links : undefined,
    linkPreviews: input.linkPreviews?.length ? sanitizeLinkPreviews(input.linkPreviews) : undefined,
    inReplyTo: input.inReplyTo
  })
}

/**
 * Replace a message's stored link previews (0295) — the author removing a
 * card. Content is untouched, so this does not mark the message edited.
 */
export async function setMessageLinkPreviews(
  store: ChatStore,
  messageId: string,
  previews: MessageLinkPreview[] | null
): Promise<unknown> {
  const sanitized = previews ? sanitizeLinkPreviews(previews) : []
  return store.update(messageId, { linkPreviews: sanitized.length ? sanitized : null })
}

export async function editMessage(
  store: ChatStore,
  messageId: string,
  content: string,
  mentions?: MessageMentions
): Promise<unknown> {
  return store.update(messageId, {
    content: content.trim(),
    mentions: normalizeMentions(mentions) ?? null,
    edited: true,
    editedAt: Date.now()
  })
}

/** Soft tombstone: keep the message shell so threads keep their shape. */
export async function redactMessage(store: ChatStore, messageId: string): Promise<unknown> {
  return store.update(messageId, {
    content: '',
    mentions: null,
    linkPreviews: null,
    redacted: true
  })
}

/** Query options for the latest window of a channel's history. */
export function channelHistoryQuery(
  channelId: string,
  limit = 50
): { where: { channel: string }; orderBy: { createdAt: 'desc' }; limit: number } {
  return { where: { channel: channelId }, orderBy: { createdAt: 'desc' }, limit }
}

/** Stable chronological ordering: createdAt, then node ID as tiebreak. */
export function compareMessages(
  a: { createdAt?: number; id: string },
  b: { createdAt?: number; id: string }
): number {
  const delta = (a.createdAt ?? 0) - (b.createdAt ?? 0)
  if (delta !== 0) return delta
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
