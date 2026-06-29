/**
 * Task Node Component
 *
 * Source-backed canvas projection of a canonical Task node. The canvas node
 * stores only `sourceNodeId` + layout; title/status/assignees/due date render
 * live from the Task node and edits write back through it, so the same task
 * stays consistent across pages, databases, and task views.
 *
 * Archived or missing tasks render as a tombstone with a restore affordance
 * (docs/specs/PAGE_TASK_RECONCILIATION.md).
 */

import type { CanvasTaskNode } from '../types'
import { TaskSchema, type TaskStatusId } from '@xnetjs/data'
import { useMutate, useNode } from '@xnetjs/react'
import { TaskCard, type TaskDisplayData } from '@xnetjs/ui'
import { memo, useCallback, useMemo } from 'react'

export interface TaskNodeProps {
  node: CanvasTaskNode
  /** Open the full task (peek panel / task view). Provided by the host app. */
  onOpenTask?: (taskId: string) => void
}

export const TaskNodeComponent = memo(function TaskNodeComponent({
  node,
  onOpenTask
}: TaskNodeProps) {
  const taskId = node.sourceNodeId ?? node.linkedNodeId ?? null
  const { restore } = useMutate()
  // The card renders node properties only; the collaborative description
  // Y.Doc is not needed at this LOD, so skip sync setup.
  const {
    data,
    loading,
    update: updateTask
  } = useNode(TaskSchema, taskId, {
    disableSync: true
  })

  const task = useMemo<TaskDisplayData | null>(() => {
    if (!data) return null

    return {
      id: data.id,
      title: typeof data.title === 'string' ? data.title : '',
      completed: Boolean(data.completed),
      status: typeof data.status === 'string' ? data.status : undefined,
      priority: typeof data.priority === 'string' ? data.priority : undefined,
      dueDate: typeof data.dueDate === 'number' ? data.dueDate : null,
      assignees: Array.isArray(data.assignees) ? data.assignees : [],
      referenceCount: Array.isArray(data.references) ? data.references.length : 0,
      deleted: Boolean(data.deleted)
    }
  }, [data])

  const handleToggleCompleted = useCallback(
    (_id: string, completed: boolean) => {
      void updateTask({
        completed,
        status: completed ? 'done' : 'todo'
      })
    },
    [updateTask]
  )

  const handleStatusChange = useCallback(
    (_id: string, status: string, completed: boolean) => {
      void updateTask({ status: status as TaskStatusId, completed })
    },
    [updateTask]
  )

  const handleRestore = useCallback(
    (id: string) => {
      void restore(id)
    },
    [restore]
  )

  if (loading && !task) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg border border-border bg-background text-xs text-foreground-muted">
        Loading task…
      </div>
    )
  }

  return (
    <TaskCard
      task={task}
      mode={node.properties.renderMode === 'mini' ? 'mini' : 'card'}
      onToggleCompleted={handleToggleCompleted}
      onStatusChange={handleStatusChange}
      onOpen={onOpenTask}
      onRestore={handleRestore}
      className="h-full w-full"
    />
  )
})
