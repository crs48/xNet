import { Link } from '@tanstack/react-router'
import { PageSchema } from '@xnetjs/data'
import { useIdentity, useQuery, useTasks } from '@xnetjs/react'
import { Calendar, CheckSquare2, ChevronDown, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'

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

export function MyTasksPanel() {
  const { identity } = useIdentity()
  const did = identity?.did ?? null
  const [expanded, setExpanded] = useState(true)
  const { data: tasks, loading } = useTasks({ assigneeDid: did, includeCompleted: false })
  const { data: pages } = useQuery(PageSchema, { limit: 200 })

  const pageTitles = useMemo(() => {
    return new Map(pages.map((page) => [page.id, page.title || 'Untitled']))
  }, [pages])

  if (!did) return null

  const visibleTasks = tasks.slice(0, 8)

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded((value) => !value)}
        className="w-full flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="uppercase font-medium tracking-wider">My Tasks</span>
        <span className="ml-auto opacity-50">{tasks.length}</span>
      </button>

      {expanded && (
        <div className="mt-1 space-y-1">
          {loading ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">Loading assigned tasks...</div>
          ) : visibleTasks.length === 0 ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              No incomplete tasks are assigned to you.
            </div>
          ) : (
            visibleTasks.map((task) => {
              const dueDateLabel = formatDueDate(task.dueDate)
              const overdue = isOverdue(task.dueDate, Boolean(task.completed))
              const pageId = typeof task.page === 'string' ? task.page : null
              const pageTitle = pageId ? pageTitles.get(pageId) : null
              const content = (
                <div
                  className="flex items-start gap-2 px-2 py-2 rounded-md transition-colors hover:bg-accent/50"
                  title={task.title}
                >
                  <CheckSquare2 size={14} className="mt-0.5 text-primary flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-foreground truncate">{task.title}</div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      {pageTitle && <span className="truncate">{pageTitle}</span>}
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
                    </div>
                  </div>
                </div>
              )

              return pageId ? (
                <Link key={task.id} to="/doc/$docId" params={{ docId: pageId }} className="block">
                  {content}
                </Link>
              ) : (
                <div key={task.id}>{content}</div>
              )
            })
          )}

          {tasks.length > visibleTasks.length && (
            <div className="px-2 py-1 text-[11px] text-muted-foreground">
              Showing {visibleTasks.length} of {tasks.length} tasks.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
