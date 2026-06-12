/**
 * @xnetjs/react - Pure helpers for rendering a page's task tree as a
 * flat list of rows. Shared by the in-page task panel and host apps
 * that render page tasks in their own chrome (e.g. the web context
 * panel).
 */
import type { TaskTreeItem } from '../hooks/useTasks'

export type RenderableTaskRow = {
  id: string
  title: string
  completed: boolean
  dueDate: number | undefined
  depth: number
  assigneeCount: number
}

export function flattenTaskTree(items: TaskTreeItem[], depth = 0): RenderableTaskRow[] {
  return items.flatMap((item) => [
    {
      id: item.task.id,
      title: item.task.title ?? 'Untitled task',
      completed: Boolean(item.task.completed),
      dueDate: typeof item.task.dueDate === 'number' ? item.task.dueDate : undefined,
      depth,
      assigneeCount: Array.isArray(item.task.assignees) ? item.task.assignees.length : 0
    },
    ...flattenTaskTree(item.children, depth + 1)
  ])
}

export function formatTaskDueDate(timestamp: number | undefined): string | null {
  if (typeof timestamp !== 'number') return null

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })
}

function getStartOfUtcDay(timestamp: number): number {
  const date = new Date(timestamp)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

export function isTaskOverdue(timestamp: number | undefined, completed: boolean): boolean {
  if (typeof timestamp !== 'number' || completed) return false
  return getStartOfUtcDay(timestamp) < getStartOfUtcDay(Date.now())
}
