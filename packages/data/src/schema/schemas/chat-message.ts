/**
 * ChatMessageSchema - A single chat message (exploration 0167).
 *
 * Messages follow the Comment pattern: each message is a small signed node
 * synced through the Change<T> protocol, not an entry in a CRDT log. This
 * avoids unbounded tombstone growth and gets offline delivery, signing, and
 * windowed pagination for free.
 *
 * - Threading is flat: `inReplyTo` always points at the thread root.
 * - Deletion is a soft tombstone (`redacted`) so threads keep their shape;
 *   reactions reuse the existing Reaction schema targeting the message.
 * - Mentions are a structured field (see mentions.ts), never parsed text.
 */

import type { InferNode } from '../types'
import type { MessageLinkPreview } from './link-preview'
import type { MessageMentions } from './mentions'
import { defineSchema } from '../define'
import { checkbox, created, createdBy, date, file, json, relation, text } from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

export const ChatMessageSchema = defineSchema({
  name: 'ChatMessage',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** The channel this message belongs to */
    channel: relation({ target: 'xnet://xnet.fyi/Channel@1.0.0' as const, required: true }),

    /** Message body in GitHub-flavored markdown */
    content: text({ required: true, maxLength: 10000 }),

    /** Thread root message (flat threading, like Comment.inReplyTo) */
    inReplyTo: relation({ target: 'xnet://xnet.fyi/ChatMessage@1.0.0' as const }),

    /** Optional file attachments */
    attachments: file({ multiple: true }),

    /** Structured mentions ({ dids, room? }) — populated by the composer */
    mentions: json<MessageMentions>({}),

    /** Whether the message has been edited */
    edited: checkbox({ default: false }),

    /** When the message was last edited */
    editedAt: date({}),

    /** Soft tombstone: content removed, message shell kept for thread shape */
    redacted: checkbox({ default: false }),

    /** Workspace-wide labels from inline #hashtag pills (exploration 0169) */
    tags: relation({ target: 'xnet://xnet.fyi/Tag@1.0.0' as const, multiple: true }),

    /** Node ids from the composer's [[ link picks (exploration 0170) */
    links: relation({ multiple: true }),

    /** Composer-resolved URL previews (0295) — never parsed from content */
    linkPreviews: json<MessageLinkPreview[]>({}),

    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined,
  // Inherits access from its home Space (exploration 0181/0192).
  authorization: spaceCascadeAuthorization('channel')
})

export type ChatMessage = InferNode<(typeof ChatMessageSchema)['_properties']>
