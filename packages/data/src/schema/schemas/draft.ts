/**
 * DraftSchema — a writable branch forked from a frontier (exploration 0329).
 *
 * A draft is Patchwork-style "creative privacy": a set of copy-on-write
 * clones of live nodes, edited freely (by a human or an agent) behind a
 * store-level overlay, reviewed as a three-way diff, and merged back as one
 * merger-signed squash batch. The draft node itself is bookkeeping: the
 * member map (original → clone + fork points), status, and merge provenance.
 *
 * Deliberately absent (Upwelling's hardest-won lesson): a parent-draft
 * relation. Drafts never nest — sub-drafts made the model incomprehensible.
 *
 * Clones are ordinary private nodes; the draft node's id owns pin-registry
 * entries for every fork point so pruning cannot delete the merge base.
 */

import type { InferNode } from '../types'
import { presets } from '../../auth'
import { defineSchema } from '../define'
import { checkbox, created, createdBy, json, relation, select, text } from '../properties'

export const DRAFT_SCHEMA_IRI = 'xnet://xnet.fyi/Draft@1.0.0'

/**
 * One member's fork bookkeeping: the clone written to, the original's chain
 * position at fork (the three-way merge base, pinned), and — for doc-bearing
 * members — the Yjs state vector at fork (base64; the post-fork delta on
 * merge is `Y.encodeStateAsUpdate(cloneDoc, forkStateVector)`) plus an
 * optional fork-time snapshot ref (the review diff baseline, pinned).
 */
export interface DraftEntry {
  cloneId: string
  forkedAtHash: string
  forkedAtYjsStateVector?: string
  forkYjsSnapshotRef?: string
  mergedAtHash?: string
}

/** Node ids created inside the draft (promoted to main on merge). */
export interface DraftProvenance {
  /** Clone ids merged, keyed by original id. */
  merged: Record<string, string>
  /** Hashes of the originals' heads after the merge batch. */
  mergedAtHashes: Record<string, string>
  /** DIDs that authored changes inside the draft (blame recovery). */
  contributors: string[]
  /** Wall time of the merge. */
  mergedAt: number
}

export const DraftSchema = defineSchema({
  name: 'Draft',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Upwelling: titles that signal intent prevent conflicts */
    name: text({ required: true, maxLength: 200 }),

    status: select({
      options: [
        { id: 'open', name: 'Open', color: 'blue' },
        { id: 'merged', name: 'Merged', color: 'green' },
        { id: 'discarded', name: 'Discarded', color: 'gray' }
      ] as const,
      required: true,
      default: 'open'
    }),

    /** The host node/scope being drafted (page, board, database, …) */
    target: relation({}),

    /** original nodeId -> fork bookkeeping */
    entries: json<Record<string, DraftEntry>>({}),

    /** Draft-born node ids (no original; promoted on merge) */
    created: json<string[]>({}),

    /** Original ids deleted inside the draft (tombstoned on merge) */
    deletedIds: json<string[]>({}),

    /**
     * P4 request surfacing: the draft author asks for a review; the
     * Inbox/Requests surface lists open drafts with this flag set.
     */
    reviewRequested: checkbox({ default: false }),

    /** Written once at merge: what the squash carried and who authored it */
    mergeProvenance: json<DraftProvenance>({}),

    /** Surfaces the draft in Requests for a human merge decision (P4) */
    reviewRequested: checkbox({ default: false }),

    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined,
  // Creative privacy by construction: creator-only until shared (P5).
  authorization: presets.private()
})

export type Draft = InferNode<(typeof DraftSchema)['_properties']>
