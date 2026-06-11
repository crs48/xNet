/**
 * TaskViewSchema - A saved view over Task nodes (sibling of DatabaseView).
 *
 * Powers the Linear-style Tasks surface: list/board/triage/calendar/
 * timeline projections of the global task collection, with whole-value LWW
 * json properties for filters and sorts (same merge semantics as
 * DatabaseViewSchema). Views query Task nodes — they never own task data.
 */

import type { FilterGroup, SortConfig } from '../../database/view-types'
import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, relation, select, json } from '../properties'

export const TaskViewSchema = defineSchema({
  name: 'TaskView',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Display name */
    name: text({ required: true, maxLength: 200 }),

    /** View type */
    type: select({
      options: [
        { id: 'list', name: 'List' },
        { id: 'board', name: 'Board' },
        { id: 'triage', name: 'Triage' },
        { id: 'calendar', name: 'Calendar' },
        { id: 'timeline', name: 'Timeline' }
      ] as const,
      default: 'list'
    }),

    /** Filter tree (FilterGroup over Task properties) — whole-tree LWW */
    filters: json<FilterGroup>({}),

    /** Sort list (SortConfig[]) — whole-list LWW */
    sorts: json<SortConfig[]>({}),

    /** Group-by task property (e.g. 'status' | 'assignee' | 'priority') */
    groupBy: text({ maxLength: 100 }),

    /** Collapsed group keys */
    collapsedGroups: json<string[]>({}),

    /** Scope the view to a project (absent = workspace-wide) */
    project: relation({ target: 'xnet://xnet.fyi/Project@1.0.0' as const }),

    /** Fractional index for view tab ordering */
    sortKey: text({ required: true })
  }
})

/**
 * A TaskView node type (inferred from schema).
 */
export type TaskView = InferNode<(typeof TaskViewSchema)['_properties']>
