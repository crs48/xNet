/**
 * TaskListGrouped - Linear-style task list grouped by workflow status.
 *
 * Pure projection: rows render live Task node state via TaskRow and emit
 * intents (toggle/open/select). `focusedTaskId` highlights the row keyboard
 * verbs act on (wired by the host's command layer); `selectedTaskIds` drives
 * multi-select. Group headers are sticky with a count badge and a hover
 * "+ add" affordance, mirroring Linear's grouped list.
 */
import { type TaskStatusId } from '@xnetjs/data'
import {
  TaskRow,
  TaskStatusIcon,
  getTaskStatusMeta,
  type TaskDisplayData,
  type TaskRowDensity
} from '@xnetjs/ui'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import React, { useMemo, useState } from 'react'
import { TASK_WORKFLOW_ORDER, groupTasksByStatus } from './grouping'

export interface TaskListGroupedProps {
  tasks: TaskDisplayData[]
  /** Group order; defaults to the full workflow */
  statuses?: TaskStatusId[]
  /** Hide empty groups (default true) */
  hideEmptyGroups?: boolean
  /** Row density (default 'comfortable') */
  density?: TaskRowDensity
  focusedTaskId?: string | null
  /** Multi-selection (bulk edit) */
  selectedTaskIds?: ReadonlySet<string>
  onSelectTask?: (taskId: string, modifiers: { shiftKey: boolean; metaKey: boolean }) => void
  /** Quick-create in a group (renders a hover "+" on the group header) */
  onCreateInGroup?: (status: TaskStatusId) => void
  /** Task whose row expands to show `renderTaskEditor` beneath it */
  expandedTaskId?: string | null
  /** Inline editor for the expanded row (host-provided) */
  renderTaskEditor?: (task: TaskDisplayData) => React.ReactNode
  onOpenTask?: (taskId: string) => void
  onToggleCompleted?: (taskId: string, completed: boolean) => void
}

const DEFAULT_STATUSES: TaskStatusId[] = TASK_WORKFLOW_ORDER

export function TaskListGrouped({
  tasks,
  statuses = DEFAULT_STATUSES,
  hideEmptyGroups = true,
  density = 'comfortable',
  focusedTaskId = null,
  selectedTaskIds,
  onSelectTask,
  onCreateInGroup,
  expandedTaskId = null,
  renderTaskEditor,
  onOpenTask,
  onToggleCompleted
}: TaskListGroupedProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const groups = useMemo(() => {
    return groupTasksByStatus(tasks, statuses).filter(
      (group) => !hideEmptyGroups || group.tasks.length > 0
    )
  }, [tasks, statuses, hideEmptyGroups])

  const toggleGroup = (status: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(status)) {
        next.delete(status)
      } else {
        next.add(status)
      }
      return next
    })
  }

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-sm text-foreground-muted">
        No tasks yet
      </div>
    )
  }

  return (
    <div className="flex flex-col" data-testid="task-list-grouped">
      {groups.map((group) => {
        const meta = getTaskStatusMeta(group.status)
        const isCollapsed = collapsed.has(group.status)

        return (
          <div key={group.status}>
            <div className="group/header sticky top-0 z-10 flex items-center gap-1.5 border-b border-border bg-background/95 px-3 py-1.5 text-xs font-medium text-foreground backdrop-blur">
              <button
                type="button"
                className="flex flex-1 items-center gap-1.5 text-left"
                onClick={() => toggleGroup(group.status)}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3 w-3 text-foreground-muted" aria-hidden />
                ) : (
                  <ChevronDown className="h-3 w-3 text-foreground-muted" aria-hidden />
                )}
                <TaskStatusIcon status={group.status} size={12} />
                {meta.name}
                <span className="rounded bg-background-muted px-1 text-[11px] tabular-nums text-foreground-muted">
                  {group.tasks.length}
                </span>
              </button>
              {onCreateInGroup && (
                <button
                  type="button"
                  aria-label={`Add task to ${meta.name}`}
                  className="rounded p-0.5 text-foreground-muted opacity-0 transition-opacity hover:bg-background-muted hover:text-foreground group-hover/header:opacity-100"
                  onClick={() => onCreateInGroup(group.status)}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </div>
            {!isCollapsed && (
              <div className="flex flex-col px-1 py-0.5">
                {group.tasks.map((task) => (
                  <React.Fragment key={task.id}>
                    <TaskRow
                      task={task}
                      density={density}
                      focused={task.id === focusedTaskId}
                      selected={selectedTaskIds?.has(task.id)}
                      onSelect={onSelectTask}
                      onOpen={onOpenTask}
                      onToggleCompleted={onToggleCompleted}
                    />
                    {task.id === expandedTaskId && renderTaskEditor && (
                      <div className="px-1 pb-1.5 pt-0.5">{renderTaskEditor(task)}</div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
