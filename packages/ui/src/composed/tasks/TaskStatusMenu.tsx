/**
 * TaskStatusMenu - the workflow-status glyph as an inline picker.
 *
 * The trigger is the TaskStatusIcon; clicking it opens a dropdown of every
 * workflow status rather than toggling completion, so a task's status is
 * editable in place wherever it renders (list rows, cards, inline chips) —
 * not just inside the detail editor. The chosen status carries its derived
 * `completed` flag so hosts stay one mutation call, mirroring the status
 * picker in TaskDetailForm.
 */
import type { MouseEvent } from 'react'
import { useRef, useState } from 'react'
import { useClickOutside } from '../../hooks/useClickOutside'
import { cn } from '../../utils'
import { TaskStatusIcon } from './TaskStatusIcon'
import { TASK_STATUS_META, isCompletedStatus, type TaskDisplayStatus } from './types'

/** Workflow order matches TASK_STATUS_META (triage → cancelled). */
const WORKFLOW_IDS = Object.keys(TASK_STATUS_META) as TaskDisplayStatus[]

export interface TaskStatusMenuProps {
  /** Current workflow status id */
  status?: string
  /** Completion flag — shows the done glyph when `status` is absent */
  completed?: boolean
  /** Pick a status; `completed` is derived from its workflow category */
  onPick: (status: string, completed: boolean) => void
  /** Glyph size (default 14, matching the row status glyph) */
  size?: number
  className?: string
}

export function TaskStatusMenu({
  status,
  completed = false,
  onPick,
  size = 14,
  className
}: TaskStatusMenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  useClickOutside(containerRef, () => setOpen(false), open)

  const current = status ?? (completed ? 'done' : 'todo')

  return (
    <div ref={containerRef} className={cn('relative inline-flex', className)}>
      <button
        type="button"
        data-testid="task-status-menu"
        aria-label="Change status"
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex shrink-0 items-center rounded-full"
        onClick={(event: MouseEvent) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
      >
        <TaskStatusIcon status={current} size={size} />
      </button>
      {open && (
        <div
          role="menu"
          data-testid="task-status-menu-panel"
          className="absolute left-0 top-full z-50 mt-1 w-44 rounded-md border border-border bg-background p-1 shadow-lg"
          onClick={(event: MouseEvent) => event.stopPropagation()}
        >
          {WORKFLOW_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="menuitemradio"
              aria-checked={id === current}
              onClick={(event: MouseEvent) => {
                event.stopPropagation()
                onPick(id, isCompletedStatus(id))
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground',
                id === current ? 'bg-background-subtle' : 'hover:bg-background-subtle'
              )}
            >
              <TaskStatusIcon status={id} size={13} />
              {TASK_STATUS_META[id].name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
