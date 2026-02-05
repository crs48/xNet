/**
 * CommentSchema - Universal comment type following the Universal Social Primitives pattern.
 *
 * Comments use a schema-agnostic `target` relation, meaning one Comment schema works
 * for all content types (Pages, Tasks, Database records, Canvas objects, etc.).
 *
 * Threading is flat: all replies point directly to the root comment (not nested).
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import {
  text,
  checkbox,
  select,
  date,
  person,
  relation,
  file,
  created,
  createdBy
} from '../properties'

export const CommentSchema = defineSchema({
  name: 'Comment',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    // ─── Universal Targeting (schema-agnostic relation) ────────────────────────

    /** The Node this comment is on (any schema - Page, Task, Database, Canvas, etc.) */
    target: relation({ required: true }),

    /** Schema IRI of the target Node (optimization hint, not enforced) */
    targetSchema: text({}),

    // ─── Threading (flat - all replies point to root) ──────────────────────────

    /** Root comment ID for threading (null = this IS the root) */
    inReplyTo: relation({}),

    // ─── Anchor Data (polymorphic positioning) ─────────────────────────────────

    /** Type of anchor point */
    anchorType: select({
      options: [
        { id: 'text', name: 'Text Selection', color: 'blue' },
        { id: 'cell', name: 'Database Cell', color: 'green' },
        { id: 'row', name: 'Database Row', color: 'green' },
        { id: 'column', name: 'Database Column', color: 'green' },
        { id: 'canvas-position', name: 'Canvas Position', color: 'purple' },
        { id: 'canvas-object', name: 'Canvas Object', color: 'purple' },
        { id: 'node', name: 'Whole Node', color: 'gray' }
      ] as const,
      required: true,
      default: 'node'
    }),

    /** JSON-encoded anchor position data */
    anchorData: text({ required: true }),

    // ─── Content ───────────────────────────────────────────────────────────────

    /** Comment body in GitHub-flavored markdown (stored as plain text) */
    content: text({ required: true, maxLength: 10000 }),

    /** Optional file attachments */
    attachments: file({ multiple: true }),

    // ─── Pseudo Reply-To (for UI, not structural threading) ────────────────────

    /** DID of user being replied to (UI hint) */
    replyToUser: person({}),

    /** Comment ID being referenced (for "in reply to" display) */
    replyToCommentId: relation({}),

    // ─── Thread State (on root comment only) ───────────────────────────────────

    /** Whether the thread has been resolved */
    resolved: checkbox({ default: false }),

    /** Who resolved the thread */
    resolvedBy: person({}),

    /** When the thread was resolved */
    resolvedAt: date({}),

    // ─── Edit State ────────────────────────────────────────────────────────────

    /** Whether the comment has been edited */
    edited: checkbox({ default: false }),

    /** When the comment was last edited */
    editedAt: date({}),

    // ─── Auto-populated Metadata ───────────────────────────────────────────────

    createdAt: created(),
    createdBy: createdBy()
  },

  // Comments are plain text + markdown, no collaborative Y.Doc needed
  document: undefined
})

/**
 * A Comment node type (inferred from schema).
 */
export type Comment = InferNode<(typeof CommentSchema)['_properties']>
