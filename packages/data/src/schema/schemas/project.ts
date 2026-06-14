/**
 * ProjectSchema - Lightweight grouping for tasks (Linear-style project).
 *
 * A Project is a *work-grouping*, not a security boundary: it has no members of
 * its own and inherits access from its home [[SpaceSchema|Space]] via the
 * `space` relation (exploration 0181). Deliberately thin: name/icon/status/lead
 * plus a collaborative brief. Milestones are now a sibling work-grouping
 * ([[MilestoneSchema]]); estimates/cycles remain out of scope (exploration 0161).
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, select, person, date, relation } from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

export const ProjectSchema = defineSchema({
  name: 'Project',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Project name */
    name: text({ required: true, maxLength: 200 }),

    /** Emoji or icon URL */
    icon: text({ maxLength: 500 }),

    /** Project lifecycle status */
    status: select({
      options: [
        { id: 'planned', name: 'Planned', color: 'gray' },
        { id: 'in-progress', name: 'In Progress', color: 'blue' },
        { id: 'paused', name: 'Paused', color: 'yellow' },
        { id: 'completed', name: 'Completed', color: 'green' },
        { id: 'cancelled', name: 'Cancelled', color: 'red' }
      ] as const,
      default: 'planned'
    }),

    /** Project lead */
    lead: person({}),

    /** Target completion date */
    targetDate: date({}),

    /** Canonical home; empty = Unfiled (exploration 0169) */
    folder: relation({ target: 'xnet://xnet.fyi/Folder@1.0.0' as const }),

    /** Order among folder siblings — fractional index */
    sortKey: text({ maxLength: 500 }),

    /** Workspace-wide labels, referenced by id (exploration 0169) */
    tags: relation({ target: 'xnet://xnet.fyi/Tag@1.0.0' as const, multiple: true }),

    /** Canonical SECURITY home; empty = personal/private (exploration 0179) */
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const }),

    /** Per-node visibility; `inherit` defers to the Space (exploration 0179) */
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
  document: 'yjs', // Collaborative project brief
  // Inherits access from its home Space (exploration 0181).
  authorization: spaceCascadeAuthorization()
})

/**
 * A Project node type (inferred from schema).
 */
export type Project = InferNode<(typeof ProjectSchema)['_properties']>
