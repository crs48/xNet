/**
 * Pure task filtering for the Linear-style filter bar (exploration 0198).
 *
 * A filter is a set of per-field value lists. Within a field the values OR
 * together (status is todo OR in-progress); across fields they AND (status
 * matches AND assignee matches). Operates on node-shaped tasks so it can run
 * before the display projection (labels/assignees live on the node).
 */

export type TaskFilterField = 'status' | 'priority' | 'assignee' | 'label'

export type TaskFilter = Record<TaskFilterField, string[]>

export const TASK_FILTER_FIELDS: TaskFilterField[] = ['status', 'priority', 'assignee', 'label']

export const EMPTY_TASK_FILTER: TaskFilter = {
  status: [],
  priority: [],
  assignee: [],
  label: []
}

/** Node shape the filter reads (loose on purpose — matches Task nodes). */
export interface FilterableTask {
  status?: unknown
  priority?: unknown
  assignee?: unknown
  assignees?: unknown
  tags?: unknown
}

export function isTaskFilterActive(filter: TaskFilter): boolean {
  return TASK_FILTER_FIELDS.some((field) => filter[field].length > 0)
}

export function taskFilterCount(filter: TaskFilter): number {
  return TASK_FILTER_FIELDS.reduce((sum, field) => sum + filter[field].length, 0)
}

function asStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (value == null) return []
  return [String(value)]
}

/** Add a value to a field (idempotent). */
export function addFilterValue(
  filter: TaskFilter,
  field: TaskFilterField,
  value: string
): TaskFilter {
  if (filter[field].includes(value)) return filter
  return { ...filter, [field]: [...filter[field], value] }
}

/** Remove a value from a field. */
export function removeFilterValue(
  filter: TaskFilter,
  field: TaskFilterField,
  value: string
): TaskFilter {
  return { ...filter, [field]: filter[field].filter((existing) => existing !== value) }
}

function matchesField(task: FilterableTask, field: TaskFilterField, wanted: string[]): boolean {
  if (wanted.length === 0) return true
  switch (field) {
    case 'status':
      return wanted.includes(String(task.status ?? 'todo'))
    case 'priority':
      return wanted.includes(String(task.priority ?? 'medium'))
    case 'assignee': {
      const assignees = new Set([...asStrings(task.assignees), ...asStrings(task.assignee)])
      return wanted.some((did) => assignees.has(did))
    }
    case 'label': {
      const tags = new Set(asStrings(task.tags))
      return wanted.some((tagId) => tags.has(tagId))
    }
  }
}

export function applyTaskFilter<T extends FilterableTask>(
  tasks: readonly T[],
  filter: TaskFilter
): T[] {
  if (!isTaskFilterActive(filter)) return [...tasks]
  return tasks.filter((task) =>
    TASK_FILTER_FIELDS.every((field) => matchesField(task, field, filter[field]))
  )
}
