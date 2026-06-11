/**
 * TaskListGrouped - Linear-style task list grouped by workflow status.
 *
 * Pure projection: rows render live Task node state via TaskRow and emit
 * intents (toggle/open). `focusedTaskId` highlights the row keyboard verbs
 * act on (wired by the host's command layer).
 */
import { type TaskStatusId } from '@xnetjs/data'
import { TaskRow, TaskStatusIcon, getTaskStatusMeta, type TaskDisplayData } from '@xnetjs/ui'
import { ChevronDown, ChevronRight } from 'lucide-react'
import React, { useMemo, useState } from 'react'

export interface TaskListGroupedProps {
  tasks: TaskDisplayData[]
  /** Group order; defaults to the full workflow */
  statuses?: TaskStatusId[]
  /** Hide empty groups (default true) */
  hideEmptyGroups?: boolean
  focusedTaskId?: string | null
  onOpenTask?: (taskId: string) => void
  onToggleCompleted?: (taskId: string, completed: boolean) => void
}

const DEFAULT_STATUSES: TaskStatusId[] = [
  'triage',
  'backlog',
  'todo',
  'in-progress',
  'in-review',
  'done',
  'cancelled'
]

export function TaskListGrouped({
  tasks,
  statuses = DEFAULT_STATUSES,
  hideEmptyGroups = true,
  focusedTaskId = null,
  onOpenTask,
  onToggleCompleted
}: TaskListGroupedProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const groups = useMemo(() => {
    const byStatus = new Map<TaskStatusId, TaskDisplayData[]>(statuses.map((s) => [s, []]))

    for (const task of tasks) {
      const status = (task.status ?? 'todo') as TaskStatusId
      const group = byStatus.get(status) ?? byStatus.get('todo')
      group?.push(task)
    }

    return statuses
      .map((status) => ({ status, tasks: byStatus.get(status) ?? [] }))
      .filter((group) => !hideEmptyGroups || group.tasks.length > 0)
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
            <button
              type="button"
              className="flex w-full items-center gap-1.5 bg-background-subtle/60 px-3 py-1.5 text-xs font-medium text-foreground"
              onClick={() => toggleGroup(group.status)}
            >
              {isCollapsed ? (
                <ChevronRight className="h-3 w-3" aria-hidden />
              ) : (
                <ChevronDown className="h-3 w-3" aria-hidden />
              )}
              <TaskStatusIcon status={group.status} size={12} />
              {meta.name}
              <span className="text-foreground-muted">{group.tasks.length}</span>
            </button>
            {!isCollapsed && (
              <div className="flex flex-col px-1 py-0.5">
                {group.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    focused={task.id === focusedTaskId}
                    onOpen={onOpenTask}
                    onToggleCompleted={onToggleCompleted}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
