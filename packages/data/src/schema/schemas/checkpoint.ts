/**
 * CheckpointSchema — a named, pinned frontier (exploration 0329).
 *
 * A checkpoint is Google-Docs-style "named version" over any node set: it
 * records each member's position in the change log (a hash-anchored frontier,
 * optionally with a per-node Yjs snapshot ref for doc-bearing members) so the
 * Time Machine can jump to it, diff against it, restore to it, or fork a
 * draft from it. The checkpoint node's id owns pin-registry entries for every
 * referenced hash/snapshot, making the frontier immune to pruning; deleting
 * the checkpoint releases the pins.
 *
 * The frontier lives in a `json` property: it is bookkeeping written once at
 * creation, not collaboratively edited state.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { created, createdBy, json, relation, text } from '../properties'
import { spaceContributorAuthorization } from './space-authorization'

export const CHECKPOINT_SCHEMA_IRI = 'xnet://xnet.fyi/Checkpoint@1.0.0'

/** Mirror of `FrontierEntry` in @xnetjs/history (data cannot depend on it). */
export interface CheckpointFrontierEntry {
  hash: string
  yjsSnapshotRef?: string
}

export const CheckpointSchema = defineSchema({
  name: 'Checkpoint',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** User-given version name ("Draft sent to review", "Before the rewrite") */
    name: text({ required: true, maxLength: 200 }),

    /** Optional longer note shown in the Time Machine */
    note: text({ maxLength: 2000 }),

    /** Per-node frontier: nodeId -> { hash, yjsSnapshotRef? } */
    frontier: json<Record<string, CheckpointFrontierEntry>>({}),

    /** The scope this checkpoint was taken over (page, database, space, …) */
    scope: relation({}),

    /** Space containment (single-valued) — drives the authorization roles */
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const }),

    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined,
  // Checkpoints of shared content are visible to the space that content
  // lives in; contributors can create their own.
  authorization: spaceContributorAuthorization()
})

export type Checkpoint = InferNode<(typeof CheckpointSchema)['_properties']>
