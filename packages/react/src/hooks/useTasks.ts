/**
 * useTasks - Task-specific query helpers built on top of useQuery.
 */
import type { InferCreateProps } from '@xnetjs/data'
import { TaskSchema } from '@xnetjs/data'
import { useMemo } from 'react'
import { useQuery, type FlatNode } from './useQuery'

type TaskNode = FlatNode<(typeof TaskSchema)['_properties']>
type TaskStatus = NonNullable<InferCreateProps<(typeof TaskSchema)['_properties']>['status']>

export interface UseTasksOptions {
  pageId?: string | null
  assigneeDid?: string | null
  includeCompleted?: boolean
  statuses?: TaskStatus[]
  parentTaskId?: string | null
  dueDateFilter?: 'any' | 'overdue' | 'today' | 'next-7-days' | 'none'
}

export interface TaskTreeItem {
  task: TaskNode
  depth: number
  children: TaskTreeItem[]
}

export interface UseTasksResult {
  data: TaskNode[]
  tree: TaskTreeItem[]
  loading: boolean
  error: Error | null
  reload: () => void
}

function compareOptionalNumbers(a: number | undefined, b: number | undefined): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return a - b
}

function sortTasks(tasks: TaskNode[], pageScoped: boolean): TaskNode[] {
  return [...tasks].sort((a, b) => {
    if (pageScoped) {
      const aKey = typeof a.sortKey === 'string' ? a.sortKey : ''
      const bKey = typeof b.sortKey === 'string' ? b.sortKey : ''
      return aKey.localeCompare(bKey) || a.id.localeCompare(b.id)
    }

    if (a.completed !== b.completed) {
      return Number(a.completed) - Number(b.completed)
    }

    const dueDateComparison = compareOptionalNumbers(
      typeof a.dueDate === 'number' ? a.dueDate : undefined,
      typeof b.dueDate === 'number' ? b.dueDate : undefined
    )
    if (dueDateComparison !== 0) return dueDateComparison

    const updatedAtComparison = b.updatedAt - a.updatedAt
    if (updatedAtComparison !== 0) return updatedAtComparison

    const aKey = typeof a.sortKey === 'string' ? a.sortKey : ''
    const bKey = typeof b.sortKey === 'string' ? b.sortKey : ''
    const aTitle = a.title ?? ''
    const bTitle = b.title ?? ''
    return aKey.localeCompare(bKey) || aTitle.localeCompare(bTitle) || a.id.localeCompare(b.id)
  })
}

function matchesAssignee(task: TaskNode, assigneeDid: string | null | undefined): boolean {
  if (!assigneeDid) return true
  if (typeof task.assignee === 'string' && task.assignee === assigneeDid) return true
  return Array.isArray(task.assignees) && task.assignees.map(String).includes(assigneeDid)
}

function matchesStatus(task: TaskNode, statuses: TaskStatus[] | undefined): boolean {
  if (!statuses || statuses.length === 0) return true
  return typeof task.status === 'string' && statuses.includes(task.status as TaskStatus)
}

function matchesParent(task: TaskNode, parentTaskId: string | null | undefined): boolean {
  if (parentTaskId === undefined) return true
  return (task.parent ?? null) === parentTaskId
}

function getStartOfUtcDay(timestamp: number): number {
  const date = new Date(timestamp)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function matchesDueDate(task: TaskNode, dueDateFilter: UseTasksOptions['dueDateFilter']): boolean {
  if (!dueDateFilter || dueDateFilter === 'any') return true

  const dueDate = typeof task.dueDate === 'number' ? task.dueDate : undefined
  if (dueDateFilter === 'none') return dueDate == null
  if (dueDate == null) return false

  const todayStart = getStartOfUtcDay(Date.now())
  const dueDay = getStartOfUtcDay(dueDate)

  switch (dueDateFilter) {
    case 'overdue':
      return dueDay < todayStart
    case 'today':
      return dueDay === todayStart
    case 'next-7-days':
      return dueDay >= todayStart && dueDay <= todayStart + 6 * 24 * 60 * 60 * 1000
    default:
      return true
  }
}

function buildTaskTree(tasks: TaskNode[]): TaskTreeItem[] {
  const treeById = new Map<string, TaskTreeItem>()
  const roots: TaskTreeItem[] = []

  for (const task of tasks) {
    treeById.set(task.id, {
      task,
      depth: 0,
      children: []
    })
  }

  for (const task of tasks) {
    const current = treeById.get(task.id)
    if (!current) continue

    const parentId = task.parent ?? null
    const parent = parentId ? treeById.get(parentId) : undefined

    if (!parent) {
      roots.push(current)
      continue
    }

    current.depth = parent.depth + 1
    parent.children.push(current)
  }

  return roots
}

export function useTasks({
  pageId,
  assigneeDid,
  includeCompleted = true,
  statuses,
  parentTaskId,
  dueDateFilter = 'any'
}: UseTasksOptions = {}): UseTasksResult {
  const query = useQuery(
    TaskSchema,
    pageId
      ? {
          where: { page: pageId }
        }
      : {}
  )

  const tasks = useMemo(() => {
    const filtered = query.data.filter((task) => {
      if (!includeCompleted && task.completed) return false
      if (!matchesAssignee(task, assigneeDid)) return false
      if (!matchesStatus(task, statuses)) return false
      if (!matchesParent(task, parentTaskId)) return false
      if (!matchesDueDate(task, dueDateFilter)) return false
      return true
    })

    return sortTasks(filtered, Boolean(pageId))
  }, [assigneeDid, dueDateFilter, includeCompleted, pageId, parentTaskId, query.data, statuses])

  const tree = useMemo(() => buildTaskTree(tasks), [tasks])

  return {
    data: tasks,
    tree,
    loading: query.loading,
    error: query.error,
    reload: query.reload
  }
}
