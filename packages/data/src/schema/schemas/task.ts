/**
 * TaskSchema - Built-in task/to-do type.
 *
 * Tasks are a common pattern, so we provide a built-in schema.
 * Users can create their own task-like schemas with different properties.
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { text, checkbox, select, date, person, relation } from '../properties'
import { spaceCascadeAuthorization } from './space-authorization'

export const TaskSchema = defineSchema({
  name: 'Task',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Task title */
    title: text({ required: true, maxLength: 500 }),

    /**
     * Human-readable identifier, e.g. "XN-142". Allocated from hub-issued
     * per-device blocks (see task-identifiers.ts) so offline mints never
     * collide. Pattern-matched in branch names / commit messages / PR text
     * by the GitHub integration.
     */
    shortId: text({ maxLength: 20 }),

    /** Whether the task is completed */
    completed: checkbox({ default: false }),

    /**
     * Task workflow status.
     *
     * Statuses belong to categories (TASK_STATUS_CATEGORIES); `completed`
     * is derivable from the category (isCompletedTaskStatus) so checkboxes
     * stay one-tap everywhere. The original four statuses are unchanged;
     * triage/backlog/in-review are additive (no version bump needed).
     */
    status: select({
      options: [
        { id: 'triage', name: 'Triage', color: 'yellow' },
        { id: 'backlog', name: 'Backlog', color: 'gray' },
        { id: 'todo', name: 'To Do', color: 'gray' },
        { id: 'in-progress', name: 'In Progress', color: 'blue' },
        { id: 'in-review', name: 'In Review', color: 'green' },
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

    /** Project this task belongs to */
    project: relation({ target: 'xnet://xnet.fyi/Project@1.0.0' as const }),

    /** Milestone within the project this task targets (one per task) */
    milestone: relation({ target: 'xnet://xnet.fyi/Milestone@1.0.0' as const }),

    /** Page that currently hosts this task */
    page: relation({ target: 'xnet://xnet.fyi/Page@1.0.0' as const }),

    /** Canvas that currently hosts this task (canvas-sourced tasks) */
    canvas: relation({ target: 'xnet://xnet.fyi/Canvas@1.0.0' as const }),

    /** Surface-specific anchor: block id inside the page document, or the
     * hosting canvas object id for canvas-sourced tasks */
    anchorBlockId: text({ maxLength: 500 }),

    /** Stable sibling order key for cross-view projections */
    sortKey: text({ maxLength: 500 }),

    /** Workspace-wide labels, referenced by id (exploration 0169) */
    tags: relation({ target: 'xnet://xnet.fyi/Tag@1.0.0' as const, multiple: true }),

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
    }),

    /** Canonical folder home for uniform filing; empty = Unfiled (0190) */
    folder: relation({ target: 'xnet://xnet.fyi/Folder@1.0.0' as const }),

    /**
     * Optional habit/metric this task tracks — completing the task can log an
     * observation against the metric (cross-domain integration, 0190).
     */
    metric: relation({ target: 'xnet://xnet.fyi/Metric@1.0.0' as const }),

    /** Optional experiment this task belongs to (cross-domain, 0190). */
    experiment: relation({ target: 'xnet://xnet.fyi/Experiment@1.0.0' as const }),

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
  document: 'yjs', // Collaborative Y.Doc for description
  // Inherits access from its home Space (exploration 0181).
  authorization: spaceCascadeAuthorization()
})

/**
 * A Task node type (inferred from schema).
 */
export type Task = InferNode<(typeof TaskSchema)['_properties']>

/**
 * Workflow categories. UI/automation reason about categories, not
 * individual status ids, so custom per-project states can join a category
 * later without touching consumers.
 */
export type TaskStatusCategory =
  | 'triage'
  | 'backlog'
  | 'unstarted'
  | 'started'
  | 'completed'
  | 'cancelled'

export type TaskStatusId =
  | 'triage'
  | 'backlog'
  | 'todo'
  | 'in-progress'
  | 'in-review'
  | 'done'
  | 'cancelled'

export const TASK_STATUS_CATEGORIES: Record<TaskStatusId, TaskStatusCategory> = {
  triage: 'triage',
  backlog: 'backlog',
  todo: 'unstarted',
  'in-progress': 'started',
  'in-review': 'started',
  done: 'completed',
  cancelled: 'cancelled'
}

export function getTaskStatusCategory(status: string | undefined): TaskStatusCategory {
  return TASK_STATUS_CATEGORIES[(status ?? 'todo') as TaskStatusId] ?? 'unstarted'
}

/**
 * Derive the `completed` checkbox from a workflow status. Stored
 * `completed` is a mirror of this derivation — never diverge them.
 */
export function isCompletedTaskStatus(status: string | undefined): boolean {
  const category = getTaskStatusCategory(status)
  return category === 'completed' || category === 'cancelled'
}
