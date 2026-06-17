/**
 * TaskRow - List-row projection of a Task node (Linear-style).
 *
 * Used by task list views, My Tasks, Triage, and page task panels. Supports
 * a `focused` state for keyboard-driven flows: the keyboard layer moves
 * focus between rows and single-key verbs act on the focused task. When
 * `onSelect` is wired the row also gains a Linear-style hover/selection
 * checkbox at the left edge for multi-select + bulk edit.
 */
import type { MouseEvent } from 'react'
import { Check, Link2 } from 'lucide-react'
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

/** Row density — comfortable (default) ≈ 36px, compact ≈ 30px. */
export type TaskRowDensity = 'comfortable' | 'compact'

export interface TaskRowProps extends TaskIntentHandlers {
  task: TaskDisplayData
  /** Keyboard focus (not DOM focus): highlighted row that verbs act on */
  focused?: boolean
  /** Part of the current multi-selection (bulk edit) */
  selected?: boolean
  /** Wire to enable the left-edge selection checkbox + selection styling */
  onSelect?: (taskId: string, modifiers: { shiftKey: boolean; metaKey: boolean }) => void
  /** Row density (default 'comfortable') */
  density?: TaskRowDensity
  /** Indentation level for subtask trees */
  depth?: number
  className?: string
}

const MAX_AVATARS = 3

const DENSITY_HEIGHT: Record<TaskRowDensity, string> = {
  comfortable: 'h-9',
  compact: 'h-[30px]'
}

export function TaskRow({
  task,
  focused = false,
  selected = false,
  onSelect,
  density = 'comfortable',
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
      data-selected={selected || undefined}
      aria-selected={onSelect ? selected : undefined}
      className={cn(
        'group flex cursor-pointer items-center gap-2 rounded-md px-2 text-sm',
        DENSITY_HEIGHT[density],
        'transition-colors duration-150 hover:bg-background-subtle',
        focused && 'bg-background-subtle ring-1 ring-ring',
        selected && 'bg-accent ring-1 ring-ring',
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
      {onSelect && (
        <button
          type="button"
          data-testid="task-row-select"
          aria-label={selected ? 'Deselect task' : 'Select task'}
          aria-pressed={selected}
          className={cn(
            'inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border',
            'transition-colors',
            selected
              ? 'border-ring bg-ring text-background'
              : 'border-border text-transparent opacity-0 group-hover:opacity-100'
          )}
          onClick={(event: MouseEvent) => {
            event.stopPropagation()
            onSelect(task.id, { shiftKey: event.shiftKey, metaKey: event.metaKey || event.ctrlKey })
          }}
        >
          <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden />
        </button>
      )}

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
