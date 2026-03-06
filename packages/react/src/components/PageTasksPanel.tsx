/**
 * @xnetjs/react - Shared page task panel
 */
import { Calendar, CheckSquare2, ChevronDown, ChevronRight, Square, Users } from 'lucide-react'
import { useMemo, useState, type JSX } from 'react'
import { useTasks, type TaskTreeItem } from '../hooks/useTasks'

export type PageTasksPanelProps = {
  pageId: string
}

type RenderableTaskRow = {
  id: string
  title: string
  completed: boolean
  dueDate: number | undefined
  depth: number
  assigneeCount: number
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

function isOverdue(timestamp: number | undefined, completed: boolean): boolean {
  if (typeof timestamp !== 'number' || completed) return false
  return getStartOfUtcDay(timestamp) < getStartOfUtcDay(Date.now())
}

function flattenTree(items: TaskTreeItem[], depth = 0): RenderableTaskRow[] {
  return items.flatMap((item) => [
    {
      id: item.task.id,
      title: item.task.title ?? 'Untitled task',
      completed: Boolean(item.task.completed),
      dueDate: typeof item.task.dueDate === 'number' ? item.task.dueDate : undefined,
      depth,
      assigneeCount: Array.isArray(item.task.assignees) ? item.task.assignees.length : 0
    },
    ...flattenTree(item.children, depth + 1)
  ])
}

export function PageTasksPanel({ pageId }: PageTasksPanelProps): JSX.Element {
  const [expanded, setExpanded] = useState(true)
  const { tree, loading } = useTasks({ pageId })

  const rows = useMemo(() => flattenTree(tree), [tree])

  return (
    <div className="mt-8 overflow-hidden rounded-lg border border-border">
      <button
        className="w-full cursor-pointer border-none bg-secondary p-3 px-4 text-left"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        <h3 className="m-0 flex items-center justify-between text-sm font-semibold text-foreground">
          <span>Tasks on this page ({rows.length})</span>
          {expanded ? (
            <ChevronDown size={16} className="text-muted-foreground" />
          ) : (
            <ChevronRight size={16} className="text-muted-foreground" />
          )}
        </h3>
      </button>

      {expanded && (
        <div className="p-3">
          {loading ? (
            <p className="m-0 text-sm text-muted-foreground">Loading tasks...</p>
          ) : rows.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">
              Checklist items on this page will appear here.
            </p>
          ) : (
            <ul className="m-0 list-none space-y-1 p-0">
              {rows.map((task) => {
                const dueDateLabel = formatDueDate(task.dueDate)
                const overdue = isOverdue(task.dueDate, task.completed)

                return (
                  <li key={task.id}>
                    <div
                      className="flex items-start gap-2 rounded-md px-2 py-2 transition-colors hover:bg-accent/40"
                      style={{ paddingLeft: `${task.depth * 18 + 8}px` }}
                    >
                      {task.completed ? (
                        <CheckSquare2 size={15} className="mt-0.5 flex-shrink-0 text-primary" />
                      ) : (
                        <Square size={15} className="mt-0.5 flex-shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div
                          className={`text-sm ${
                            task.completed
                              ? 'line-through text-muted-foreground'
                              : 'text-foreground'
                          }`}
                        >
                          {task.title}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          {dueDateLabel ? (
                            <span
                              className={`inline-flex items-center gap-1 ${
                                overdue ? 'text-red-500' : 'text-muted-foreground'
                              }`}
                            >
                              <Calendar size={11} />
                              {dueDateLabel}
                            </span>
                          ) : null}
                          {task.assigneeCount > 0 ? (
                            <span className="inline-flex items-center gap-1">
                              <Users size={11} />
                              {task.assigneeCount}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
