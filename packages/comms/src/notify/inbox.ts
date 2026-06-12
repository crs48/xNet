/**
 * Inbox derivations and triage transforms (exploration 0168).
 *
 * Pure functions over InboxItems + the user-owned InboxState JSON fields.
 * Triage follows the canonical machine: unread → read → done, orthogonal
 * saved, snoozed-until-T. Mentions persist until explicitly acknowledged
 * even when the channel watermark advances (the Zulip hybrid).
 */

import type { InboxItem } from './types'
import {
  DEFAULT_CHANNEL_TIER,
  type ChannelNotifyTier,
  type InboxItemTriage,
  type InboxWatermark,
  type NotificationPrefs
} from '@xnetjs/data'

/** The InboxState JSON fields the derivations read (all optional). */
export interface InboxStateData {
  watermarks?: Record<string, InboxWatermark>
  ackedMentions?: string[]
  items?: Record<string, InboxItemTriage>
  prefs?: NotificationPrefs
}

const MENTION_REASONS = new Set(['mention', 'room-mention'])

/** Keep ackedMentions bounded; oldest acks fall off first. */
export const MAX_ACKED_MENTIONS = 500

// ─── Item state ──────────────────────────────────────────────────────────────

export function isSnoozed(triage: InboxItemTriage | undefined, now: number): boolean {
  return Boolean(triage?.snoozedUntil && triage.snoozedUntil > now)
}

/** Open = still demands attention (not done, not currently snoozed). */
export function isItemOpen(item: InboxItem, state: InboxStateData, now: number): boolean {
  const triage = state.items?.[item.sourceId]
  if (triage?.state === 'done') return false
  if (isSnoozed(triage, now)) return false
  return true
}

/** Whether an item is past the channel watermark (i.e. read by scrolling). */
export function isPastWatermark(item: InboxItem, state: InboxStateData): boolean {
  const mark = item.contextId ? state.watermarks?.[item.contextId] : undefined
  return mark !== undefined && item.at <= mark.at
}

/** Unread = open, not watermark-read; mentions also need an explicit ack. */
export function isUnread(item: InboxItem, state: InboxStateData, now: number): boolean {
  if (!isItemOpen(item, state, now)) return false
  if (MENTION_REASONS.has(item.reason)) {
    return !state.ackedMentions?.includes(item.sourceId)
  }
  return !isPastWatermark(item, state)
}

// ─── Badges ──────────────────────────────────────────────────────────────────

export interface BadgeCounts {
  /** Red number: unread mentions + DMs (high-signal) */
  mentions: number
  /** Dot: any other unread activity */
  activity: boolean
}

const HIGH_SIGNAL = new Set(['mention', 'room-mention', 'dm', 'assigned', 'call-missed'])

export function deriveBadges(items: InboxItem[], state: InboxStateData, now: number): BadgeCounts {
  let mentions = 0
  let activity = false
  for (const item of items) {
    if (!isUnread(item, state, now)) continue
    if (HIGH_SIGNAL.has(item.reason)) mentions += 1
    else activity = true
  }
  return { mentions, activity }
}

/** Unread message count for one channel's chat badge. */
export function unreadCount(
  messages: Array<{ id: string; createdAt?: number; createdBy?: string }>,
  watermark: InboxWatermark | undefined,
  me: string
): number {
  const since = watermark?.at ?? 0
  return messages.filter((m) => (m.createdAt ?? 0) > since && m.createdBy !== me).length
}

// ─── Preferences ─────────────────────────────────────────────────────────────

export function channelTier(
  prefs: NotificationPrefs | undefined,
  channelId: string
): ChannelNotifyTier {
  return prefs?.channels?.[channelId] ?? DEFAULT_CHANNEL_TIER
}

const PIERCES_MUTE = new Set(['mention', 'dm', 'call-missed'])
const ALERTS_AT_MENTIONS_TIER = new Set(['room-mention', 'assigned', 'reply', 'comment', 'keyword'])

/**
 * Whether an item should *alert* (toast/OS notification) — mutes and tiers
 * apply at delivery, never at derivation: muted items still land in the
 * inbox, they just stay quiet. Direct mentions pierce channel mutes.
 */
export function shouldAlert(item: InboxItem, prefs: NotificationPrefs | undefined): boolean {
  if (PIERCES_MUTE.has(item.reason)) return true
  const tier = item.contextId ? channelTier(prefs, item.contextId) : DEFAULT_CHANNEL_TIER
  if (tier === 'muted') return false
  if (tier === 'all') return true
  return ALERTS_AT_MENTIONS_TIER.has(item.reason)
}

/** Parse 'HH:MM' to minutes-since-midnight; NaN-safe. */
function parseHhMm(value: string): number {
  const [h, m] = value.split(':').map((part) => Number.parseInt(part, 10))
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}

/** Whether the local time falls inside the DND window (handles overnight). */
export function isInDnd(prefs: NotificationPrefs | undefined, date: Date): boolean {
  const dnd = prefs?.dnd
  if (!dnd) return false
  const minutes = date.getHours() * 60 + date.getMinutes()
  const start = parseHhMm(dnd.start)
  const end = parseHhMm(dnd.end)
  if (start === end) return false
  if (start < end) return minutes >= start && minutes < end
  return minutes >= start || minutes < end
}

// ─── Triage transforms (return sparse field updates for store.update) ───────

export function withTriage(
  state: InboxStateData,
  sourceId: string,
  triage: InboxItemTriage | null
): Pick<InboxStateData, 'items'> {
  const items = { ...(state.items ?? {}) }
  if (triage === null) delete items[sourceId]
  else items[sourceId] = triage
  return { items }
}

export function withWatermark(
  state: InboxStateData,
  channelId: string,
  at: number,
  nodeId?: string
): Pick<InboxStateData, 'watermarks'> {
  const current = state.watermarks?.[channelId]
  if (current && current.at >= at) return { watermarks: state.watermarks ?? {} }
  return { watermarks: { ...(state.watermarks ?? {}), [channelId]: { at, nodeId } } }
}

export function withAckedMention(
  state: InboxStateData,
  sourceId: string
): Pick<InboxStateData, 'ackedMentions'> {
  const existing = state.ackedMentions ?? []
  if (existing.includes(sourceId)) return { ackedMentions: existing }
  const next = [...existing, sourceId]
  return { ackedMentions: next.slice(Math.max(0, next.length - MAX_ACKED_MENTIONS)) }
}
