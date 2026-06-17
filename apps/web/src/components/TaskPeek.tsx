/**
 * TaskPeek - Linear-style "Space to peek" preview.
 *
 * A lightweight, read-only floating card over the focused task: status,
 * priority, title, due date, assignees, and id. It follows keyboard focus —
 * j/k keep moving rows while the peek stays open — so the host re-renders it
 * with the newly focused task. Enter/click opens the full editor.
 */
import type { JSX } from 'react'
import {
  DIDAvatar,
  TaskPriorityIcon,
  TaskStatusIcon,
  formatDueDate,
  getTaskStatusMeta,
  type TaskDisplayData
} from '@xnetjs/ui'
import { CornerDownLeft } from 'lucide-react'

export interface TaskPeekProps {
  task: TaskDisplayData
  onOpen: (taskId: string) => void
  onClose: () => void
}

export function TaskPeek({ task, onOpen, onClose }: TaskPeekProps): JSX.Element {
  const statusMeta = getTaskStatusMeta(task.completed ? 'done' : task.status)
  const due = formatDueDate(task.dueDate)
  const assignees = task.assignees ?? []

  return (
    <div
      data-testid="task-peek"
      className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center"
    >
      <div
        className="pointer-events-auto w-full max-w-md rounded-xl border border-border bg-popover p-4 shadow-2xl"
        role="dialog"
        aria-label="Task preview"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-2 flex items-center gap-2 text-xs text-foreground-muted">
          <TaskStatusIcon status={task.completed ? 'done' : task.status} />
          <span className={statusMeta.colorClass}>{statusMeta.name}</span>
          <TaskPriorityIcon priority={task.priority} />
          {task.shortId && <span className="font-mono">{task.shortId}</span>}
          {due.urgency !== 'none' && <span className="ml-auto">{due.label}</span>}
        </div>

        <h2
          className={`text-base font-medium leading-snug text-foreground ${
            task.completed ? 'text-foreground-muted line-through' : ''
          }`}
        >
          {task.title || 'Untitled task'}
        </h2>

        {assignees.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5">
            {assignees.slice(0, 6).map((did) => (
              <DIDAvatar key={did} did={did} size={20} />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            onClose()
            onOpen(task.id)
          }}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-1.5 text-xs text-foreground-muted transition-colors hover:bg-accent hover:text-foreground"
        >
          Open task
          <CornerDownLeft size={12} aria-hidden />
        </button>
      </div>
    </div>
  )
}
