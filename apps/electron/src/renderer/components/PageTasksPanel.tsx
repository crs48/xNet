import { useTasks } from '@xnetjs/react'
import { Calendar, CheckSquare2, ChevronDown, ChevronRight, Square, Users } from 'lucide-react'
import { useMemo, useState } from 'react'

interface PageTasksPanelProps {
  pageId: string
}

function formatDueDate(timestamp: number | undefined): string | null {
  if (typeof timestamp !== 'number') return null

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })
}

function isOverdue(timestamp: number | undefined, completed: boolean): boolean {
  return typeof timestamp === 'number' && !completed && timestamp < Date.now()
}

export function PageTasksPanel({ pageId }: PageTasksPanelProps) {
  const [expanded, setExpanded] = useState(true)
  const { data: tasks, loading } = useTasks({ pageId })

  const rows = useMemo(() => {
    return tasks.map((task) => ({
      ...task,
      depth: typeof task.sortKey === 'string' ? Math.max(task.sortKey.split('.').length - 1, 0) : 0
    }))
  }, [tasks])

  return (
    <div className="mt-8 border border-border rounded-lg overflow-hidden">
      <button
        className="w-full p-3 px-4 bg-secondary border-none cursor-pointer text-left"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        <h3 className="text-sm font-semibold text-foreground flex justify-between items-center m-0">
          <span>Tasks on this page ({tasks.length})</span>
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
            <p className="text-sm text-muted-foreground m-0">Loading tasks...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground m-0">
              Checklist items on this page will appear here.
            </p>
          ) : (
            <ul className="list-none m-0 p-0 space-y-1">
              {rows.map((task) => {
                const dueDateLabel = formatDueDate(task.dueDate)
                const overdue = isOverdue(task.dueDate, Boolean(task.completed))
                const assigneeCount = Array.isArray(task.assignees) ? task.assignees.length : 0

                return (
                  <li key={task.id}>
                    <div
                      className="flex items-start gap-2 rounded-md px-2 py-2 hover:bg-accent/40 transition-colors"
                      style={{ paddingLeft: `${task.depth * 18 + 8}px` }}
                    >
                      {task.completed ? (
                        <CheckSquare2 size={15} className="mt-0.5 text-primary flex-shrink-0" />
                      ) : (
                        <Square size={15} className="mt-0.5 text-muted-foreground flex-shrink-0" />
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
                          {dueDateLabel && (
                            <span
                              className={`inline-flex items-center gap-1 ${
                                overdue ? 'text-red-500' : 'text-muted-foreground'
                              }`}
                            >
                              <Calendar size={11} />
                              {dueDateLabel}
                            </span>
                          )}
                          {assigneeCount > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <Users size={11} />
                              {assigneeCount}
                            </span>
                          )}
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
