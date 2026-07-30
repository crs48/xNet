/**
 * Pure projections from raw Task nodes to what the inline editor needs.
 * Kept free of React so the host-authority rules stay unit-testable.
 */
import type { UseTasksResult } from '@xnetjs/react'
import type { TaskDisplayData } from '@xnetjs/ui'

export type TaskNode = UseTasksResult['data'][number]

/** Project the raw Task node onto the shared display contract. */
export function toTaskDisplayData(task: TaskNode): TaskDisplayData {
  return {
    id: task.id,
    title: typeof task.title === 'string' ? task.title : '',
    completed: Boolean(task.completed),
    status: typeof task.status === 'string' ? task.status : undefined,
    priority: typeof task.priority === 'string' ? task.priority : undefined,
    dueDate: typeof task.dueDate === 'number' ? task.dueDate : null,
    assignees: Array.isArray(task.assignees) ? task.assignees.map(String) : [],
    referenceCount: Array.isArray(task.references) ? task.references.length : 0,
    shortId: typeof task.shortId === 'string' ? task.shortId : null
  }
}

export interface TaskHostInfo {
  pageId: string | null
  canvasId: string | null
  sourceLabel: string | null
  /** Hosted checklist tasks mirror title/assignees/dueDate from their
   * host document; node-side writes would be overwritten by the next
   * snapshot (PAGE_TASK_RECONCILIATION.md). */
  hostOwned: boolean
}

export function taskHostInfo(task: Pick<TaskNode, 'page' | 'canvas'>): TaskHostInfo {
  const pageId = typeof task.page === 'string' && task.page ? task.page : null
  const canvasId = typeof task.canvas === 'string' && task.canvas ? task.canvas : null
  return {
    pageId,
    canvasId,
    sourceLabel: pageId ? 'Open page' : canvasId ? 'Open canvas' : null,
    hostOwned: Boolean(pageId || canvasId)
  }
}
