/**
 * TaskSchema - Built-in task/to-do type.
 *
 * Tasks are a common pattern, so we provide a built-in schema.
 * Users can create their own task-like schemas with different properties.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, checkbox, select, date, person, relation } from '../properties'

export const TaskSchema = defineSchema({
  name: 'Task',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Task title */
    title: text({ required: true, maxLength: 500 }),

    /** Whether the task is completed */
    completed: checkbox({ default: false }),

    /** Task status */
    status: select({
      options: [
        { id: 'todo', name: 'To Do', color: 'gray' },
        { id: 'in-progress', name: 'In Progress', color: 'blue' },
        { id: 'done', name: 'Done', color: 'green' },
        { id: 'cancelled', name: 'Cancelled', color: 'red' }
      ] as const,
      default: 'todo'
    }),

    /** Task priority */
    priority: select({
      options: [
        { id: 'low', name: 'Low', color: 'gray' },
        { id: 'medium', name: 'Medium', color: 'yellow' },
        { id: 'high', name: 'High', color: 'orange' },
        { id: 'urgent', name: 'Urgent', color: 'red' }
      ] as const,
      default: 'medium'
    }),

    /** Due date */
    dueDate: date({}),

    /** Assigned person (legacy single assignee for compatibility) */
    assignee: person({}),

    /** Assigned people */
    assignees: person({ multiple: true }),

    /** Parent task (for subtasks) */
    parent: relation({ target: 'xnet://xnet.fyi/Task' as const }),

    /** Page that currently hosts this task */
    page: relation({ target: 'xnet://xnet.fyi/Page@1.0.0' as const }),

    /** Surface-specific block anchor inside the page document */
    anchorBlockId: text({ maxLength: 500 }),

    /** Stable sibling order key for cross-view projections */
    sortKey: text({ maxLength: 500 }),

    /** Where this task was created */
    source: select({
      options: [
        { id: 'page', name: 'Page' },
        { id: 'database', name: 'Database' },
        { id: 'canvas', name: 'Canvas' },
        { id: 'automation', name: 'Automation' },
        { id: 'api', name: 'API' }
      ] as const,
      default: 'page'
    }),

    /** Structured external references related to this task */
    references: relation({
      target: 'xnet://xnet.fyi/ExternalReference@1.0.0' as const,
      multiple: true
    })
  },
  document: 'yjs' // Collaborative Y.Doc for description
})

/**
 * A Task node type (inferred from schema).
 */
export type Task = InferNode<(typeof TaskSchema)['_properties']>
