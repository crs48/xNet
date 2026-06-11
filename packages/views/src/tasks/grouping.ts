/**
 * Pure grouping for task views — shared by TaskBoard and TaskListGrouped
 * and benchmarked at 10k tasks (exploration 0161 perf budget: group-by
 * status < 150 ms).
 */
import type { TaskStatusId } from '@xnetjs/data'
import type { TaskDisplayData } from '@xnetjs/ui'

export const TASK_WORKFLOW_ORDER: TaskStatusId[] = [
  'triage',
  'backlog',
  'todo',
  'in-progress',
  'in-review',
  'done',
  'cancelled'
]

export interface TaskStatusGroup<T extends TaskDisplayData> {
  status: TaskStatusId
  tasks: T[]
}

/**
 * Bucket tasks into workflow-status groups in a single pass. Unknown
 * statuses fall back to the `todo` bucket (mirrors getTaskStatusMeta).
 */
export function groupTasksByStatus<T extends TaskDisplayData>(
  tasks: readonly T[],
  statuses: readonly TaskStatusId[] = TASK_WORKFLOW_ORDER
): Array<TaskStatusGroup<T>> {
  const byStatus = new Map<TaskStatusId, T[]>(statuses.map((status) => [status, []]))
  const fallback = byStatus.get('todo')

  for (const task of tasks) {
    const bucket = byStatus.get((task.status ?? 'todo') as TaskStatusId) ?? fallback
    bucket?.push(task)
  }

  return statuses.map((status) => ({ status, tasks: byStatus.get(status) ?? [] }))
}

/** Sort a column by fractional sortKey (id tie-break) without mutating. */
export function sortTasksBySortKey<T extends TaskDisplayData & { sortKey?: string | null }>(
  tasks: readonly T[]
): T[] {
  return [...tasks].sort((a, b) => {
    const aKey = a.sortKey ?? ''
    const bKey = b.sortKey ?? ''
    return aKey.localeCompare(bKey) || a.id.localeCompare(b.id)
  })
}
