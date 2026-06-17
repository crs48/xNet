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

// ─── Generic grouping + ordering (Display Options, exploration 0198) ─────────

/** Dimension the Tasks list groups by. */
export type TaskGroupBy = 'status' | 'priority' | 'assignee' | 'none'

/** Ordering within a group. */
export type TaskOrderBy = 'manual' | 'priority' | 'due' | 'title' | 'created' | 'updated'

/** Priority rank for ordering/grouping (urgent first). */
export const PRIORITY_ORDER: ReadonlyArray<string> = ['urgent', 'high', 'medium', 'low']
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

export interface TaskGroup<T extends TaskDisplayData> {
  /** Group identity: status id, priority id, assignee DID, '' (unassigned), or 'all'. */
  key: string
  groupBy: TaskGroupBy
  tasks: T[]
}

/** First assignee DID, or '' when unassigned. */
function primaryAssignee(task: TaskDisplayData): string {
  const assignees = task.assignees ?? []
  return assignees.length > 0 ? String(assignees[0]) : ''
}

/** Stable, non-mutating order for a list of tasks. */
export function orderTasks<T extends TaskDisplayData>(
  tasks: readonly T[],
  orderBy: TaskOrderBy
): T[] {
  const arr = [...tasks]
  const tie = (a: T, b: T) => a.id.localeCompare(b.id)
  switch (orderBy) {
    case 'priority':
      return arr.sort(
        (a, b) =>
          (PRIORITY_RANK[a.priority ?? 'medium'] ?? 2) -
            (PRIORITY_RANK[b.priority ?? 'medium'] ?? 2) || tie(a, b)
      )
    case 'due':
      return arr.sort(
        (a, b) =>
          (a.dueDate ?? Number.POSITIVE_INFINITY) - (b.dueDate ?? Number.POSITIVE_INFINITY) ||
          tie(a, b)
      )
    case 'title':
      return arr.sort((a, b) => (a.title || '').localeCompare(b.title || '') || tie(a, b))
    case 'created':
      return arr.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0) || tie(a, b))
    case 'updated':
      return arr.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || tie(a, b))
    case 'manual':
    default:
      return arr.sort((a, b) => (a.sortKey ?? '').localeCompare(b.sortKey ?? '') || tie(a, b))
  }
}

export interface BuildTaskGroupsOptions {
  groupBy: TaskGroupBy
  orderBy?: TaskOrderBy
  /** Status group order (status grouping only) */
  statuses?: readonly TaskStatusId[]
  /** Assignee group order (assignee grouping); unlisted assignees append */
  assigneeOrder?: readonly string[]
  /** Drop groups with no tasks (default true) */
  hideEmpty?: boolean
}

/**
 * Build display groups for the task list. A single source of truth for the
 * "group by + order by" Display Options; `groupBy: 'none'` yields one group.
 */
export function buildTaskGroups<T extends TaskDisplayData>(
  tasks: readonly T[],
  options: BuildTaskGroupsOptions
): Array<TaskGroup<T>> {
  const { groupBy, orderBy = 'manual', statuses = TASK_WORKFLOW_ORDER, hideEmpty = true } = options
  const order = (group: T[]) => orderTasks(group, orderBy)

  if (groupBy === 'none') {
    return [{ key: 'all', groupBy, tasks: order([...tasks]) }]
  }

  const buckets = new Map<string, T[]>()
  const keyOf = (task: T): string =>
    groupBy === 'status'
      ? (task.status ?? 'todo')
      : groupBy === 'priority'
        ? (task.priority ?? 'medium')
        : primaryAssignee(task)

  for (const task of tasks) {
    const key = keyOf(task)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(task)
    else buckets.set(key, [task])
  }

  // Canonical key order per dimension, then any extras the data introduced.
  let keyOrder: string[]
  if (groupBy === 'status') keyOrder = [...statuses]
  else if (groupBy === 'priority') keyOrder = [...PRIORITY_ORDER]
  else keyOrder = [...(options.assigneeOrder ?? []), '']
  for (const key of buckets.keys()) {
    if (!keyOrder.includes(key)) keyOrder.push(key)
  }

  const groups = keyOrder.map((key) => ({
    key,
    groupBy,
    tasks: order(buckets.get(key) ?? [])
  }))
  return hideEmpty ? groups.filter((group) => group.tasks.length > 0) : groups
}
