/**
 * @xnetjs/react - Embedded task collection renderer
 */
import { useMemo, type JSX } from 'react'
import { useTasks, type TaskTreeItem } from '../hooks/useTasks'

export type TaskCollectionEmbedProps = {
  currentPageId: string | null
  currentDid: string | null
  scope: 'current-page' | 'all'
  assignee: 'any' | 'me'
  dueDate: 'any' | 'overdue' | 'today' | 'next-7-days' | 'none'
  status: 'open' | 'done' | 'all'
  showHierarchy: boolean
}

interface RenderableTaskRow {
  id: string
  title: string
  completed: boolean
  dueDate: number | undefined
  depth: number
}

function formatDueDate(timestamp: number | undefined): string | null {
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

function flattenTree(items: TaskTreeItem[], depth = 0): RenderableTaskRow[] {
  return items.flatMap((item) => [
    {
      id: item.task.id,
      title: item.task.title ?? 'Untitled task',
      completed: Boolean(item.task.completed),
      dueDate: typeof item.task.dueDate === 'number' ? item.task.dueDate : undefined,
      depth
    },
    ...flattenTree(item.children, depth + 1)
  ])
}

export function TaskCollectionEmbed({
  currentPageId,
  currentDid,
  scope,
  assignee,
  dueDate,
  status,
  showHierarchy
}: TaskCollectionEmbedProps): JSX.Element {
  const pageId = scope === 'current-page' ? currentPageId : undefined
  const assigneeDid = assignee === 'me' ? currentDid : undefined
  const statuses = status === 'done' ? (['done'] as const) : undefined
  const includeCompleted = status !== 'open'
  const { data, tree, loading } = useTasks({
    pageId,
    assigneeDid,
    includeCompleted,
    statuses: statuses ? [...statuses] : undefined,
    dueDateFilter: dueDate
  })

  const rows = useMemo<RenderableTaskRow[]>(() => {
    if (showHierarchy) return flattenTree(tree)

    return data.map((task) => ({
      id: task.id,
      title: task.title ?? 'Untitled task',
      completed: Boolean(task.completed),
      dueDate: typeof task.dueDate === 'number' ? task.dueDate : undefined,
      depth: 0
    }))
  }, [data, showHierarchy, tree])

  if (scope === 'current-page' && !currentPageId) {
    return <div className="p-4 text-sm text-muted-foreground">This view needs a page context.</div>
  }

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading tasks...</div>
  }

  if (rows.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No tasks match the saved filters for this view.
      </div>
    )
  }

  return (
    <div className="p-3">
      <ul className="m-0 list-none space-y-1 p-0">
        {rows.map((task) => {
          const dueDateLabel = formatDueDate(task.dueDate)
          const overdue =
            typeof task.dueDate === 'number' &&
            !task.completed &&
            getStartOfUtcDay(task.dueDate) < getStartOfUtcDay(Date.now())

          return (
            <li key={task.id}>
              <div
                className="flex items-start gap-2 rounded-lg px-2 py-2 hover:bg-accent/40"
                style={{ paddingLeft: `${task.depth * 18 + 8}px` }}
              >
                <span className={task.completed ? 'text-primary' : 'text-muted-foreground'}>
                  {task.completed ? '\u2611' : '\u2610'}
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className={
                      task.completed
                        ? 'truncate text-sm text-muted-foreground line-through'
                        : 'truncate text-sm text-foreground'
                    }
                  >
                    {task.title}
                  </div>
                  {dueDateLabel ? (
                    <div
                      className={
                        overdue
                          ? 'mt-1 text-[11px] text-red-500'
                          : 'mt-1 text-[11px] text-muted-foreground'
                      }
                    >
                      {dueDateLabel}
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
