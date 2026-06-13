/**
 * Notifier rules — one evaluation per applied change (exploration 0168).
 *
 * Each rule is a small pure predicate; the first match wins, in priority
 * order: mention > dm > assigned > reply > comment > room-mention > keyword.
 * Own changes never notify. "Assigned" is an *edge*, not a state: it fires
 * only when a change adds the user to assignees, so re-syncs and unrelated
 * edits never re-notify.
 */

import type { InboxItem, NotificationReason, NotifierContext, NotifierEvent } from './types'
import { mentionsInclude, type MessageMentions } from '@xnetjs/data'
import { isDmChannelId } from '../chat/dm'

const CHAT_MESSAGE_SCHEMA = 'xnet://xnet.fyi/ChatMessage@1.0.0'
const COMMENT_SCHEMA = 'xnet://xnet.fyi/Comment@1.0.0'
const TASK_SCHEMA = 'xnet://xnet.fyi/Task@1.0.0'
const MESSAGE_REQUEST_SCHEMA = 'xnet://xnet.fyi/MessageRequest@1.0.0'
const CONNECTION_WAVE_SCHEMA = 'xnet://xnet.fyi/social/ConnectionWave@1.0.0'

type NodeShape = Record<string, unknown>

function getMentions(node: NodeShape | null): MessageMentions | undefined {
  return (node?.mentions as MessageMentions | undefined) ?? undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function assigneeDids(node: NodeShape | null): string[] {
  if (!node) return []
  const multiple = Array.isArray(node.assignees) ? (node.assignees as string[]) : []
  const single = asString(node.assignee)
  return single ? [...multiple, single] : multiple
}

function isMessageLike(schemaId: string | undefined): boolean {
  return schemaId === CHAT_MESSAGE_SCHEMA || schemaId === COMMENT_SCHEMA
}

/** The container node used for grouping/deep links. */
function contextOf(node: NodeShape): string | undefined {
  return asString(node.channel) ?? asString(node.target)
}

function preview(node: NodeShape): string | undefined {
  const content =
    asString(node.content) ?? asString(node.firstMessagePreview) ?? asString(node.title)
  return content ? content.slice(0, 140) : undefined
}

function isDmChannel(channelId: string | undefined, ctx: NotifierContext): boolean {
  if (!channelId) return false
  return isDmChannelId(channelId) || ctx.getChannelKind?.(channelId) === 'dm'
}

function matchesKeyword(node: NodeShape, keywords: string[] | undefined): boolean {
  const content = asString(node.content)?.toLowerCase()
  if (!content || !keywords?.length) return false
  return keywords.some((k) => k && content.includes(k.toLowerCase()))
}

// ─── Individual rules (node, previous, ctx) → reason | null ─────────────────

function mentionReason(
  node: NodeShape,
  previous: NodeShape | null,
  ctx: NotifierContext
): NotificationReason | null {
  const schemaId = asString(node.schemaId)
  if (!isMessageLike(schemaId)) return null
  const added =
    mentionsInclude(getMentions(node), ctx.me) && !mentionsInclude(getMentions(previous), ctx.me)
  return added ? 'mention' : null
}

function dmReason(
  node: NodeShape,
  previous: NodeShape | null,
  ctx: NotifierContext
): NotificationReason | null {
  if (asString(node.schemaId) !== CHAT_MESSAGE_SCHEMA || previous !== null) return null
  return isDmChannel(asString(node.channel), ctx) ? 'dm' : null
}

function assignedReason(
  node: NodeShape,
  previous: NodeShape | null,
  ctx: NotifierContext
): NotificationReason | null {
  if (asString(node.schemaId) !== TASK_SCHEMA) return null
  const isNowAssigned = assigneeDids(node).includes(ctx.me)
  const wasAssigned = assigneeDids(previous).includes(ctx.me)
  return isNowAssigned && !wasAssigned ? 'assigned' : null
}

function replyReason(
  node: NodeShape,
  previous: NodeShape | null,
  ctx: NotifierContext
): NotificationReason | null {
  if (!isMessageLike(asString(node.schemaId)) || previous !== null) return null
  const root = asString(node.inReplyTo)
  return root && ctx.isMyThread?.(root) ? 'reply' : null
}

function commentReason(
  node: NodeShape,
  previous: NodeShape | null,
  ctx: NotifierContext
): NotificationReason | null {
  if (asString(node.schemaId) !== COMMENT_SCHEMA || previous !== null) return null
  const target = asString(node.target)
  return target && ctx.isMyNode?.(target) ? 'comment' : null
}

function roomMentionReason(node: NodeShape, previous: NodeShape | null): NotificationReason | null {
  if (asString(node.schemaId) !== CHAT_MESSAGE_SCHEMA || previous !== null) return null
  return getMentions(node)?.room === true ? 'room-mention' : null
}

function keywordReason(
  node: NodeShape,
  previous: NodeShape | null,
  ctx: NotifierContext
): NotificationReason | null {
  if (!isMessageLike(asString(node.schemaId)) || previous !== null) return null
  return matchesKeyword(node, ctx.keywords) ? 'keyword' : null
}

/** A pending first-contact message request addressed to me (0176/0177). */
function messageRequestReason(
  node: NodeShape,
  previous: NodeShape | null,
  ctx: NotifierContext
): NotificationReason | null {
  if (asString(node.schemaId) !== MESSAGE_REQUEST_SCHEMA || previous !== null) return null
  const status = asString(node.status) ?? 'pending'
  return asString(node.recipient) === ctx.me && status === 'pending' ? 'message-request' : null
}

/** A pending wave addressed to me — the receiving side of the double opt-in (0174). */
function connectionRequestReason(
  node: NodeShape,
  previous: NodeShape | null,
  ctx: NotifierContext
): NotificationReason | null {
  if (asString(node.schemaId) !== CONNECTION_WAVE_SCHEMA || previous !== null) return null
  const status = asString(node.status) ?? 'pending'
  return asString(node.toDid) === ctx.me && status === 'pending' ? 'connection-request' : null
}

const RULES = [
  mentionReason,
  dmReason,
  messageRequestReason,
  connectionRequestReason,
  assignedReason,
  replyReason,
  commentReason,
  roomMentionReason,
  keywordReason
] as const

/**
 * Evaluate one applied change. Returns the InboxItem it produces, or null.
 */
export function evaluateChange(event: NotifierEvent, ctx: NotifierContext): InboxItem | null {
  const { change, node, previousNode } = event
  if (!node || change.authorDID === ctx.me) return null
  if (node.redacted === true || node.deleted === true) return null

  for (const rule of RULES) {
    const reason = rule(node, previousNode, ctx)
    if (reason) {
      return {
        sourceId: String(node.id),
        reason,
        contextId: contextOf(node),
        actor: change.authorDID,
        at: change.wallTime ?? (node.createdAt as number | undefined) ?? Date.now(),
        preview: preview(node),
        schemaId: asString(node.schemaId)
      }
    }
  }
  return null
}
