/**
 * Tasks section for the Right Panel — a flat, monochrome list of the
 * page's checklist items. The document keeps only the prose; what is
 * *about* the page lives here (0166).
 */
import {
  flattenTaskTree,
  formatTaskDueDate,
  isTaskOverdue,
  useTasks,
  type RenderableTaskRow
} from '@xnetjs/react'
import { Calendar, CheckSquare2, Square, Users } from 'lucide-react'
import { useMemo } from 'react'

export function PageTasksSection({ pageId }: { pageId: string }) {
  const { tree, loading } = useTasks({ pageId })
  const rows = useMemo(() => flattenTaskTree(tree), [tree])

  if (loading) {
    return <p className="m-0 p-3 text-xs text-ink-3">Loading tasks…</p>
  }
  if (rows.length === 0) {
    return <p className="m-0 p-3 text-xs text-ink-3">Checklist items on this page appear here.</p>
  }
  return (
    <ul className="m-0 list-none p-1.5">
      {rows.map((row) => (
        <PageTaskRow key={row.id} row={row} />
      ))}
    </ul>
  )
}

function PageTaskRow({ row }: { row: RenderableTaskRow }) {
  const Glyph = row.completed ? CheckSquare2 : Square
  return (
    <li>
      <div
        className="flex items-start gap-2 rounded-md px-2 py-1.5"
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
      </div>
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
