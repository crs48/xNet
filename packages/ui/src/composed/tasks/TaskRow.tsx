/**
 * TaskRow - List-row projection of a Task node (Linear-style).
 *
 * Used by task list views, My Tasks, Triage, and page task panels. Supports
 * a `focused` state for keyboard-driven flows: the keyboard layer moves
 * focus between rows and single-key verbs act on the focused task.
 */
import type { MouseEvent } from 'react'
import { Link2 } from 'lucide-react'
import { DIDAvatar } from '../../components/DIDAvatar'
import { cn } from '../../utils'
import { TaskGithubBadges } from './TaskGithubBadges'
import { TaskPriorityIcon, TaskStatusIcon } from './TaskStatusIcon'
import {
  DUE_DATE_URGENCY_CLASS,
  formatDueDate,
  type TaskDisplayData,
  type TaskIntentHandlers
} from './types'

export interface TaskRowProps extends TaskIntentHandlers {
  task: TaskDisplayData
  /** Keyboard focus (not DOM focus): highlighted row that verbs act on */
  focused?: boolean
  /** Indentation level for subtask trees */
  depth?: number
  className?: string
}

const MAX_AVATARS = 3

export function TaskRow({
  task,
  focused = false,
  depth = 0,
  onToggleCompleted,
  onOpen,
  className
}: TaskRowProps) {
  const due = formatDueDate(task.dueDate)
  const assignees = task.assignees ?? []

  return (
    <div
      data-testid="task-row"
      data-task-id={task.id}
      data-focused={focused || undefined}
      className={cn(
        'group flex h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm',
        'transition-colors hover:bg-background-subtle',
        focused && 'bg-background-subtle ring-1 ring-ring',
        className
      )}
      style={depth > 0 ? { paddingLeft: depth * 20 + 8 } : undefined}
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
      <button
        type="button"
        className="inline-flex shrink-0 items-center rounded-full"
        aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
        disabled={!onToggleCompleted}
        onClick={(event: MouseEvent) => {
          event.stopPropagation()
          onToggleCompleted?.(task.id, !task.completed)
        }}
      >
        <TaskStatusIcon status={task.completed ? 'done' : task.status} />
      </button>

      <TaskPriorityIcon priority={task.priority} />

      {task.shortId && (
        <span className="shrink-0 font-mono text-xs text-foreground-muted">{task.shortId}</span>
      )}

      <span
        className={cn(
          'min-w-0 flex-1 truncate text-foreground',
          task.completed && 'text-foreground-muted line-through'
        )}
      >
        {task.title || 'Untitled task'}
      </span>

      <TaskGithubBadges github={task.github} />

      {typeof task.referenceCount === 'number' && task.referenceCount > 0 && (
        <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-foreground-muted">
          <Link2 className="h-3 w-3" aria-hidden />
          {task.referenceCount}
        </span>
      )}

      {due.urgency !== 'none' && (
        <span className={cn('shrink-0 text-xs', DUE_DATE_URGENCY_CLASS[due.urgency])}>
          {due.label}
        </span>
      )}

      {assignees.length > 0 && (
        <span className="flex shrink-0 -space-x-1.5">
          {assignees.slice(0, MAX_AVATARS).map((did) => (
            <span key={did} className="rounded-full ring-2 ring-background">
              <DIDAvatar did={did} size={18} />
            </span>
          ))}
          {assignees.length > MAX_AVATARS && (
            <span className="z-10 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-background-subtle px-1 text-[10px] text-foreground-muted ring-2 ring-background">
              +{assignees.length - MAX_AVATARS}
            </span>
          )}
        </span>
      )}
    </div>
  )
}
