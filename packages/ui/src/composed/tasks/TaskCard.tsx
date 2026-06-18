/**
 * TaskCard - Card projection of a Task node for boards and canvases.
 *
 * `mode="card"` is the board/canvas default; `mode="mini"` is a condensed
 * variant for zoomed-out canvas LOD tiers. Archived tasks render the same
 * tombstone treatment as TaskChip so a dangling canvas card is obvious and
 * restorable instead of stale.
 */
import type { MouseEvent } from 'react'
import { Link2, RotateCcw, Trash2 } from 'lucide-react'
import { DIDAvatar } from '../../components/DIDAvatar'
import { cn } from '../../utils'
import { TaskGithubBadges } from './TaskGithubBadges'
import { TaskPriorityIcon, TaskStatusIcon } from './TaskStatusIcon'
import {
  DUE_DATE_URGENCY_CLASS,
  formatDueDate,
  getTaskStatusMeta,
  type TaskDisplayData,
  type TaskIntentHandlers
} from './types'

export type TaskCardMode = 'card' | 'mini'

export interface TaskCardProps extends TaskIntentHandlers {
  task: TaskDisplayData | null
  mode?: TaskCardMode
  /** Keyboard focus highlight (board navigation) */
  focused?: boolean
  missingLabel?: string
  className?: string
}

export function TaskCard({
  task,
  mode = 'card',
  focused = false,
  missingLabel = 'Task removed',
  onToggleCompleted,
  onOpen,
  onRestore,
  className
}: TaskCardProps) {
  if (!task || task.deleted) {
    return (
      <div
        data-testid="task-card-tombstone"
        className={cn(
          'flex items-center gap-2 rounded-lg border border-dashed border-border',
          'bg-background-subtle px-3 py-2 text-sm text-foreground-muted',
          className
        )}
      >
        <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate line-through">
          {task?.title ? task.title : missingLabel}
        </span>
        {task && onRestore && (
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-foreground/10 hover:text-foreground"
            onClick={(event: MouseEvent) => {
              event.stopPropagation()
              onRestore(task.id)
            }}
          >
            <RotateCcw className="h-3 w-3" aria-hidden />
            Restore
          </button>
        )}
      </div>
    )
  }

  const due = formatDueDate(task.dueDate)
  const statusMeta = getTaskStatusMeta(task.completed ? 'done' : task.status)
  const assignees = task.assignees ?? []

  if (mode === 'mini') {
    return (
      <div
        data-testid="task-card-mini"
        data-task-id={task.id}
        className={cn(
          'flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1',
          'text-xs text-foreground transition-colors hover:bg-background-subtle',
          focused && 'ring-1 ring-ring',
          className
        )}
        onClick={() => onOpen?.(task.id)}
      >
        <TaskStatusIcon status={task.completed ? 'done' : task.status} size={11} />
        <span className={cn('truncate', task.completed && 'text-foreground-muted line-through')}>
          {task.title || 'Untitled task'}
        </span>
      </div>
    )
  }

  return (
    <div
      data-testid="task-card"
      data-task-id={task.id}
      data-focused={focused || undefined}
      className={cn(
        'group flex cursor-pointer flex-col gap-2 rounded-lg border border-border bg-background p-3',
        'transition-colors duration-normal hover:bg-background-subtle',
        focused && 'ring-1 ring-ring',
        className
      )}
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(task.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          onOpen?.(task.id)
        }
      }}
    >
      <div className="flex items-center gap-2">
        {task.shortId && (
          <span className="font-mono text-xs text-foreground-muted">{task.shortId}</span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          <TaskPriorityIcon priority={task.priority} size={13} />
        </span>
      </div>

      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 inline-flex shrink-0 items-center rounded-full"
          aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
          disabled={!onToggleCompleted}
          onClick={(event: MouseEvent) => {
            event.stopPropagation()
            onToggleCompleted?.(task.id, !task.completed)
          }}
        >
          <TaskStatusIcon status={task.completed ? 'done' : task.status} />
        </button>
        <span
          className={cn(
            'min-w-0 flex-1 text-sm font-medium leading-snug text-foreground',
            task.completed && 'text-foreground-muted line-through'
          )}
        >
          {task.title || 'Untitled task'}
        </span>
      </div>

      <div className="flex items-center gap-2 text-xs text-foreground-muted">
        <span className={statusMeta.colorClass}>{statusMeta.name}</span>
        <TaskGithubBadges github={task.github} />
        {typeof task.referenceCount === 'number' && task.referenceCount > 0 && (
          <span className="inline-flex items-center gap-0.5">
            <Link2 className="h-3 w-3" aria-hidden />
            {task.referenceCount}
          </span>
        )}
        {due.urgency !== 'none' && (
          <span className={DUE_DATE_URGENCY_CLASS[due.urgency]}>{due.label}</span>
        )}
        {assignees.length > 0 && (
          <span className="ml-auto flex -space-x-1.5">
            {assignees.slice(0, 3).map((did) => (
              <span key={did} className="rounded-full ring-2 ring-background">
                <DIDAvatar did={did} size={16} />
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  )
}
