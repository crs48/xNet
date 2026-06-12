/**
 * ProjectSchema - Lightweight grouping for tasks (Linear-style project).
 *
 * Deliberately thin: name/icon/status/lead plus a collaborative document
 * body for the project brief. Cycles, milestones, and estimates are
 * intentionally out of scope until the task primitive is everywhere
 * (exploration 0161).
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, select, person, date, relation } from '../properties'

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
    sortKey: text({ maxLength: 500 })
  },
  document: 'yjs' // Collaborative project brief
})

/**
 * A Project node type (inferred from schema).
 */
export type Project = InferNode<(typeof ProjectSchema)['_properties']>
