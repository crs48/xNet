/**
 * TaskChip - Compact inline projection of a Task node.
 *
 * Used for mentions, relation cells, and anywhere a task renders inside
 * other content. Always shows live node state; archived/missing tasks render
 * as a tombstone (never a crash, never a silent drop) per
 * docs/specs/PAGE_TASK_RECONCILIATION.md.
 */
import type { MouseEvent } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import { cn } from '../../utils'
import { TaskStatusIcon } from './TaskStatusIcon'
import {
  DUE_DATE_URGENCY_CLASS,
  formatDueDate,
  type TaskDisplayData,
  type TaskIntentHandlers
} from './types'

export interface TaskChipProps extends TaskIntentHandlers {
  task: TaskDisplayData | null
  /** Shown when task is null (dangling reference) */
  missingLabel?: string
  className?: string
}

export function TaskChip({
  task,
  missingLabel = 'Task removed',
  onToggleCompleted,
  onOpen,
  onRestore,
  className
}: TaskChipProps) {
  if (!task || task.deleted) {
    return (
      <span
        data-testid="task-chip-tombstone"
        className={cn(
          'inline-flex max-w-full items-center gap-1.5 rounded-md border border-dashed border-border',
          'bg-background-subtle px-2 py-0.5 text-xs text-foreground-muted line-through',
          className
        )}
      >
        <Trash2 className="h-3 w-3 shrink-0" aria-hidden />
        <span className="truncate">{task?.title ? task.title : missingLabel}</span>
        {task && onRestore && (
          <button
            type="button"
            className="ml-0.5 inline-flex items-center gap-0.5 rounded px-1 no-underline hover:bg-foreground/10 hover:text-foreground"
            onClick={(event: MouseEvent) => {
              event.stopPropagation()
              onRestore(task.id)
            }}
          >
            <RotateCcw className="h-3 w-3" aria-hidden />
            Restore
          </button>
        )}
      </span>
    )
  }

  const due = formatDueDate(task.dueDate)

  return (
    <span
      data-testid="task-chip"
      className={cn(
        'inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-md border border-border',
        'bg-background px-2 py-0.5 text-xs text-foreground transition-colors hover:bg-background-subtle',
        className
      )}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={() => onOpen?.(task.id)}
      onKeyDown={(event) => {
        if (onOpen && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          onOpen(task.id)
        }
      }}
    >
      <button
        type="button"
        className={cn(
          'inline-flex items-center rounded-full',
          onToggleCompleted ? 'cursor-pointer' : 'cursor-default'
        )}
        aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
        disabled={!onToggleCompleted}
        onClick={(event: MouseEvent) => {
          event.stopPropagation()
          onToggleCompleted?.(task.id, !task.completed)
        }}
      >
        <TaskStatusIcon status={task.completed ? 'done' : task.status} size={12} />
      </button>
      {task.shortId && (
        <span className="shrink-0 font-mono text-[10px] text-foreground-muted">{task.shortId}</span>
      )}
      <span className={cn('truncate', task.completed && 'text-foreground-muted line-through')}>
        {task.title || 'Untitled task'}
      </span>
      {due.urgency !== 'none' && !task.completed && (
        <span className={cn('shrink-0 text-[10px]', DUE_DATE_URGENCY_CLASS[due.urgency])}>
          {due.label}
        </span>
      )}
    </span>
  )
}
