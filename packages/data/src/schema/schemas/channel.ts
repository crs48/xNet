/**
 * ChannelSchema - Real-time conversation container (exploration 0167).
 *
 * One schema covers three kinds of conversation:
 * - 'channel': Slack/Zulip-style named channel
 * - 'dm':      direct conversation; node ID is derived deterministically
 *              from the sorted member DIDs (see @xnetjs/comms `dmChannelId`)
 *              so both sides materialize the same node without coordination
 * - 'voice':   Discord-style drop-in voice room (joining = joining the call)
 *
 * A channel may also be attached to any node via `target` (per-document
 * chat). Messages are separate ChatMessage nodes relating back to the
 * channel — never a CRDT log (see exploration 0167, Options A).
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { checkbox, created, createdBy, person, relation, select, text } from '../properties'

export const CHANNEL_KINDS = ['channel', 'dm', 'voice'] as const
export type ChannelKind = (typeof CHANNEL_KINDS)[number]

export const ChannelSchema = defineSchema({
  name: 'Channel',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Channel display name (DMs may leave this empty and render members) */
    name: text({ maxLength: 120 }),

    /** Conversation kind */
    kind: select({
      options: [
        { id: 'channel', name: 'Channel', color: 'blue' },
        { id: 'dm', name: 'Direct Message', color: 'green' },
        { id: 'voice', name: 'Voice Room', color: 'purple' }
      ] as const,
      required: true,
      default: 'channel'
    }),

    /** Member DIDs. Empty = open channel (anyone in the workspace). */
    members: person({ multiple: true }),

    /** Optional node this channel is attached to (per-document chat) */
    target: relation({}),

    /** Channel topic / description */
    topic: text({ maxLength: 500 }),

    /** Archived channels are hidden from the default list */
    archived: checkbox({ default: false }),

    /** Canonical home; empty = Unfiled (exploration 0169) */
    folder: relation({ target: 'xnet://xnet.fyi/Folder@1.0.0' as const }),

    /** Order among folder siblings — fractional index */
    sortKey: text({ maxLength: 500 }),

    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined
})

export type Channel = InferNode<(typeof ChannelSchema)['_properties']>
