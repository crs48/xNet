/**
 * TaskListGrouped - Linear-style task list grouped by a Display-Options
 * dimension (status / priority / assignee / none).
 *
 * Pure projection: rows render live Task node state via TaskRow and emit
 * intents (toggle/open/select). `focusedTaskId` highlights the row keyboard
 * verbs act on (wired by the host's command layer); `selectedTaskIds` drives
 * multi-select. Group headers are sticky with a count badge and a hover
 * "+ add" affordance, mirroring Linear's grouped list.
 */
import { type TaskStatusId } from '@xnetjs/data'
import {
  ActionMenuList,
  ContextMenu,
  DIDAvatar,
  TaskPriorityIcon,
  TaskRow,
  TaskStatusIcon,
  getTaskStatusMeta,
  type Action,
  type TaskDisplayData,
  type TaskRowDensity
} from '@xnetjs/ui'
import { Check, ChevronDown, ChevronRight, Circle, Plus, SquareArrowOutUpRight } from 'lucide-react'
import React, { createElement, useMemo, useState } from 'react'
import {
  TASK_WORKFLOW_ORDER,
  buildTaskGroups,
  type TaskGroup,
  type TaskGroupBy,
  type TaskOrderBy
} from './grouping'

export interface TaskGroupRef {
  groupBy: TaskGroupBy
  key: string
}

export interface TaskListGroupedProps {
  tasks: TaskDisplayData[]
  /** Grouping dimension (default 'status') */
  groupBy?: TaskGroupBy
  /** Ordering within a group (default 'manual') */
  orderBy?: TaskOrderBy
  /** Status group order (status grouping); defaults to the full workflow */
  statuses?: TaskStatusId[]
  /** Resolve an assignee DID to a display label (assignee grouping) */
  assigneeLabel?: (did: string) => string
  /** Hide empty groups (default true) */
  hideEmptyGroups?: boolean
  /** Row density (default 'comfortable') */
  density?: TaskRowDensity
  focusedTaskId?: string | null
  /** Multi-selection (bulk edit) */
  selectedTaskIds?: ReadonlySet<string>
  onSelectTask?: (taskId: string, modifiers: { shiftKey: boolean; metaKey: boolean }) => void
  /** Quick-create in a group (renders a hover "+" on the group header) */
  onCreateInGroup?: (group: TaskGroupRef) => void
  onOpenTask?: (taskId: string) => void
  onToggleCompleted?: (taskId: string, completed: boolean) => void
  /** Change a row's status via the status-glyph dropdown (supersedes the
   * click-to-toggle behaviour of the glyph when wired). */
  onStatusChange?: (taskId: string, status: string, completed: boolean) => void
}

const DEFAULT_STATUSES: TaskStatusId[] = TASK_WORKFLOW_ORDER

function GroupHeaderLabel({
  group,
  assigneeLabel
}: {
  group: TaskGroup<TaskDisplayData>
  assigneeLabel?: (did: string) => string
}) {
  if (group.groupBy === 'status') {
    return (
      <>
        <TaskStatusIcon status={group.key} size={12} />
        {getTaskStatusMeta(group.key).name}
      </>
    )
  }
  if (group.groupBy === 'priority') {
    return (
      <>
        <TaskPriorityIcon priority={group.key} size={12} />
        {group.key.charAt(0).toUpperCase() + group.key.slice(1)}
      </>
    )
  }
  // assignee
  if (!group.key) return <span className="text-foreground-muted">No assignee</span>
  return (
    <>
      <DIDAvatar did={group.key} size={14} />
      {assigneeLabel?.(group.key) ?? group.key}
    </>
  )
}

export function TaskListGrouped({
  tasks,
  groupBy = 'status',
  orderBy = 'manual',
  statuses = DEFAULT_STATUSES,
  assigneeLabel,
  hideEmptyGroups = true,
  density = 'comfortable',
  focusedTaskId = null,
  selectedTaskIds,
  onSelectTask,
  onCreateInGroup,
  onOpenTask,
  onToggleCompleted,
  onStatusChange
}: TaskListGroupedProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const groups = useMemo(
    () => buildTaskGroups(tasks, { groupBy, orderBy, statuses, hideEmpty: hideEmptyGroups }),
    [tasks, groupBy, orderBy, statuses, hideEmptyGroups]
  )

  const toggleGroup = (key: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
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

  const flat = groupBy === 'none'

  return (
    <div className="flex flex-col" data-testid="task-list-grouped">
      {groups.map((group) => {
        const isCollapsed = !flat && collapsed.has(group.key)

        return (
          <div key={`${group.groupBy}:${group.key}`}>
            {!flat && (
              <div className="group/header sticky top-0 z-10 flex items-center gap-1.5 border-b border-border bg-background/95 px-3 py-1.5 text-xs font-medium text-foreground backdrop-blur">
                <button
                  type="button"
                  className="flex flex-1 items-center gap-1.5 text-left"
                  onClick={() => toggleGroup(group.key)}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3 w-3 text-foreground-muted" aria-hidden />
                  ) : (
                    <ChevronDown className="h-3 w-3 text-foreground-muted" aria-hidden />
                  )}
                  <GroupHeaderLabel group={group} assigneeLabel={assigneeLabel} />
                  <span className="rounded bg-background-muted px-1 text-[11px] tabular-nums text-foreground-muted">
                    {group.tasks.length}
                  </span>
                </button>
                {onCreateInGroup && (
                  <button
                    type="button"
                    aria-label={`Add task to ${group.key || 'group'}`}
                    className="rounded p-0.5 text-foreground-muted opacity-0 transition-opacity hover:bg-background-muted hover:text-foreground group-hover/header:opacity-100"
                    onClick={() => onCreateInGroup({ groupBy: group.groupBy, key: group.key })}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </div>
            )}
            {!isCollapsed && (
              <div className="flex flex-col px-1 py-0.5">
                {group.tasks.map((task) => {
                  const actions: Action[] = [
                    {
                      id: 'open',
                      label: 'Open',
                      icon: createElement(SquareArrowOutUpRight, { size: 14 }),
                      when: () => Boolean(onOpenTask),
                      run: () => onOpenTask?.(task.id)
                    },
                    {
                      id: 'toggle',
                      label: task.completed ? 'Mark as not done' : 'Mark as done',
                      icon: createElement(task.completed ? Circle : Check, { size: 14 }),
                      when: () => Boolean(onToggleCompleted),
                      run: () => onToggleCompleted?.(task.id, !task.completed)
                    }
                  ]
                  return (
                    <ContextMenu
                      key={task.id}
                      className="contents"
                      menu={<ActionMenuList actions={actions} />}
                    >
                      <TaskRow
                        task={task}
                        density={density}
                        focused={task.id === focusedTaskId}
                        selected={selectedTaskIds?.has(task.id)}
                        onSelect={onSelectTask}
                        onOpen={onOpenTask}
                        onToggleCompleted={onToggleCompleted}
                        onStatusChange={onStatusChange}
                      />
                    </ContextMenu>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
