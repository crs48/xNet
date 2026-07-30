/**
 * Tasks section for the Right Panel — a flat, monochrome list of the
 * page's checklist items. The document keeps only the prose; what is
 * *about* the page lives here (0166). Clicking an item expands the same
 * inline editor used on the Tasks surface. Doc-owned fields (title, due
 * date, assignees) are locked for hosted tasks since the BlockNote
 * migration retired the live-editor write-through (0312) — edit them in
 * the document itself.
 */
import {
  flattenTaskTree,
  formatTaskDueDate,
  isTaskOverdue,
  useTasks,
  type RenderableTaskRow
} from '@xnetjs/react'
import { Calendar, CheckSquare2, Square, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { TaskInlineEditor, type TaskNode } from './TaskInlineEditor'

export function PageTasksSection({ pageId }: { pageId: string }) {
  const { data: tasks, tree, loading } = useTasks({ pageId })
  const rows = useMemo(() => flattenTaskTree(tree), [tree])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const tasksById = useMemo(() => {
    return new Map<string, TaskNode>(tasks.map((task) => [task.id, task]))
  }, [tasks])

  if (loading) {
    return <p className="m-0 p-3 text-xs text-ink-3">Loading tasks…</p>
  }
  if (rows.length === 0) {
    return <p className="m-0 p-3 text-xs text-ink-3">Checklist items on this page appear here.</p>
  }
  return (
    <ul className="m-0 list-none p-1.5">
      {rows.map((row) => {
        const expandedTask = row.id === expandedId ? tasksById.get(row.id) : undefined
        return (
          <PageTaskRow
            key={row.id}
            row={row}
            expanded={Boolean(expandedTask)}
            onToggleExpanded={() =>
              setExpandedId((current) => (current === row.id ? null : row.id))
            }
          >
            {expandedTask && (
              <TaskInlineEditor
                task={expandedTask}
                onClose={() => setExpandedId(null)}
                className="mt-1"
              />
            )}
          </PageTaskRow>
        )
      })}
    </ul>
  )
}

function PageTaskRow({
  row,
  expanded,
  onToggleExpanded,
  children
}: {
  row: RenderableTaskRow
  expanded: boolean
  onToggleExpanded: () => void
  children?: React.ReactNode
}) {
  const Glyph = row.completed ? CheckSquare2 : Square
  return (
    <li>
      <button
        type="button"
        data-testid="page-task-row"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
        style={{ paddingLeft: `${row.depth * 14 + 8}px` }}
      >
        <Glyph size={14} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-3" />
        <div className="min-w-0 flex-1">
          <div
            className={`truncate text-[13px] ${
              row.completed ? 'text-ink-3 line-through' : 'text-ink-1'
            }`}
          >
            {row.title}
          </div>
          <PageTaskMeta row={row} />
        </div>
      </button>
      {children && <div className="px-1 pb-1">{children}</div>}
    </li>
  )
}

function PageTaskMeta({ row }: { row: RenderableTaskRow }) {
  const dueDateLabel = formatTaskDueDate(row.dueDate)
  if (!dueDateLabel && row.assigneeCount === 0) return null

  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-3">
      <TaskDueDate row={row} label={dueDateLabel} />
      <TaskAssigneeCount count={row.assigneeCount} />
    </div>
  )
}

function TaskDueDate({ row, label }: { row: RenderableTaskRow; label: string | null }) {
  if (!label) return null
  const overdue = isTaskOverdue(row.dueDate, row.completed)
  return (
    <span className={`inline-flex items-center gap-1 ${overdue ? 'text-destructive' : ''}`}>
      <Calendar size={11} />
      {label}
    </span>
  )
}

function TaskAssigneeCount({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span className="inline-flex items-center gap-1">
      <Users size={11} />
      {count}
    </span>
  )
}
