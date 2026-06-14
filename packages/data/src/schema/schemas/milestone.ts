/**
 * MilestoneSchema - a thin work-grouping under a Project (exploration 0181).
 *
 * A milestone is a named stage with a target date that tasks point at (one per
 * task), used for filtering and progress — the GitHub/Linear model. It is NOT a
 * people-container: it has no members and inherits access from its home
 * [[SpaceSchema|Space]] via the `space` relation, exactly like its
 * [[ProjectSchema|Project]]. Deliberately minimal: name/status/targetDate plus a
 * collaborative note.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, select, date, relation } from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

export const MILESTONE_SCHEMA_IRI = 'xnet://xnet.fyi/Milestone@1.0.0'

export const MilestoneSchema = defineSchema({
  name: 'Milestone',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Milestone name */
    name: text({ required: true, maxLength: 200 }),

    /** Lifecycle status */
    status: select({
      options: [
        { id: 'upcoming', name: 'Upcoming', color: 'gray' },
        { id: 'active', name: 'Active', color: 'blue' },
        { id: 'done', name: 'Done', color: 'green' },
        { id: 'cancelled', name: 'Cancelled', color: 'red' }
      ] as const,
      default: 'upcoming'
    }),

    /** Target completion date */
    targetDate: date({}),

    /** The project this milestone belongs to */
    project: relation({ target: 'xnet://xnet.fyi/Project@1.0.0' as const, required: true }),

    /** Order among sibling milestones — fractional index */
    sortKey: text({ maxLength: 500 }),

    /** Canonical SECURITY home; empty = inherits via project (exploration 0181) */
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const }),

    /** Per-node visibility; `inherit` defers to the Space */
    visibility: select({
      options: [
        { id: 'inherit', name: 'Inherit', color: 'gray' },
        { id: 'private', name: 'Private', color: 'gray' },
        { id: 'unlisted', name: 'Unlisted', color: 'yellow' },
        { id: 'public', name: 'Public', color: 'green' }
      ] as const,
      default: 'inherit'
    })
  },
  document: 'yjs',
  // Inherits access from its home Space (exploration 0181).
  authorization: spaceCascadeAuthorization()
})

/**
 * A Milestone node type (inferred from schema).
 */
export type Milestone = InferNode<(typeof MilestoneSchema)['_properties']>
