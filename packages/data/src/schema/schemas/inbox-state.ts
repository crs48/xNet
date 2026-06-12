/**
 * InboxStateSchema - User-owned, private notification state (exploration 0168).
 *
 * One node per (user, workspace), authored only by that user's DID and synced
 * across *their* devices through the normal change log. It is never written
 * into shared rooms — the MSC2285 lesson: read state syncs O(own devices),
 * not O(room members), and never leaks attention to peers.
 *
 * The inbox itself is a derived view over the local change log; this node
 * holds only what cannot be derived:
 * - per-channel last-read watermarks (Zulip hybrid: watermark + explicit
 *   un-acked mention set, so "mark all read" can't swallow mentions)
 * - triage state (done/saved/snoozed) keyed by source change/node ID
 * - notification preferences (tiers, mutes, DND, keywords)
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { created, createdBy, json, person } from '../properties'

/** Last-read position for one channel/source. */
export interface InboxWatermark {
  /** Wall-clock createdAt of the newest read message */
  at: number
  /** Node ID of the newest read message (tie-break / deep link) */
  nodeId?: string
}

/** Triage state for a single inbox item, keyed by source node ID. */
export interface InboxItemTriage {
  state?: 'done' | 'saved'
  /** Epoch ms; item returns to unread when reached */
  snoozedUntil?: number
}

/** Per-channel notification tier. */
export type ChannelNotifyTier = 'all' | 'mentions' | 'muted'

export interface NotificationPrefs {
  /** Per-channel overrides; absent = default ('mentions') */
  channels?: Record<string, ChannelNotifyTier>
  /** Quiet hours in local time, e.g. { start: '22:00', end: '08:00' } */
  dnd?: { start: string; end: string }
  /** Keyword alerts evaluated client-side */
  keywords?: string[]
  /** Disable OS-level notifications entirely (inbox still accumulates) */
  silenceDesktop?: boolean
}

export const DEFAULT_CHANNEL_TIER: ChannelNotifyTier = 'mentions'

export const InboxStateSchema = defineSchema({
  name: 'InboxState',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** The user this state belongs to (must match createdBy) */
    owner: person({ required: true }),

    /** channelId → last-read watermark */
    watermarks: json<Record<string, InboxWatermark>>({}),

    /** Source node IDs of explicitly acknowledged mentions */
    ackedMentions: json<string[]>({}),

    /** Source node ID → triage state (sparse; absence = unread/read derived) */
    items: json<Record<string, InboxItemTriage>>({}),

    /** Notification preferences */
    prefs: json<NotificationPrefs>({}),

    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined
})

export type InboxState = InferNode<(typeof InboxStateSchema)['_properties']>

/** Deterministic node ID for a user's inbox state in a workspace. */
export function inboxStateNodeId(did: string): string {
  // DIDs contain ':' which is fine in node IDs; prefix keeps it greppable.
  return `inbox-${did}`
}
