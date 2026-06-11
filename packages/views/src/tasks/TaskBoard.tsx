/**
 * TaskBoard - Linear-style board over Task nodes, grouped by workflow
 * status. Dragging a card to another column updates the canonical Task
 * node's status (and a fresh end-of-column sortKey); completion is derived
 * from the status category, never stored independently.
 */
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { generateSortKey, isCompletedTaskStatus, type TaskStatusId } from '@xnetjs/data'
import { TaskCard, TaskStatusIcon, getTaskStatusMeta, type TaskDisplayData } from '@xnetjs/ui'
import React, { useMemo, useState } from 'react'
import { TASK_WORKFLOW_ORDER, groupTasksByStatus, sortTasksBySortKey } from './grouping'

export interface TaskBoardItem extends TaskDisplayData {
  sortKey?: string | null
}

export interface TaskBoardStatusChange {
  taskId: string
  status: TaskStatusId
  /** Derived from the status category — write both to the node */
  completed: boolean
  /** Fresh end-of-column fractional key */
  sortKey: string
}

export interface TaskBoardProps {
  tasks: TaskBoardItem[]
  /** Column order; defaults to the full workflow */
  statuses?: TaskStatusId[]
  onStatusChange: (change: TaskBoardStatusChange) => void
  onOpenTask?: (taskId: string) => void
  onToggleCompleted?: (taskId: string, completed: boolean) => void
}

const DEFAULT_STATUSES: TaskStatusId[] = TASK_WORKFLOW_ORDER

function DraggableTaskCard({
  task,
  onOpenTask,
  onToggleCompleted
}: {
  task: TaskBoardItem
  onOpenTask?: (taskId: string) => void
  onToggleCompleted?: (taskId: string, completed: boolean) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={isDragging ? 'opacity-40' : undefined}
    >
      <TaskCard task={task} onOpen={onOpenTask} onToggleCompleted={onToggleCompleted} />
    </div>
  )
}

function BoardColumn({
  status,
  tasks,
  onOpenTask,
  onToggleCompleted
}: {
  status: TaskStatusId
  tasks: TaskBoardItem[]
  onOpenTask?: (taskId: string) => void
  onToggleCompleted?: (taskId: string, completed: boolean) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}` })
  const meta = getTaskStatusMeta(status)

  return (
    <div
      ref={setNodeRef}
      data-testid={`task-board-column-${status}`}
      className={`flex w-64 shrink-0 flex-col gap-2 rounded-lg p-2 transition-colors ${
        isOver ? 'bg-background-subtle ring-1 ring-ring' : 'bg-background-subtle/50'
      }`}
    >
      <div className="flex items-center gap-1.5 px-1 text-xs font-medium text-foreground">
        <TaskStatusIcon status={status} size={12} />
        {meta.name}
        <span className="text-foreground-muted">{tasks.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {tasks.map((task) => (
          <DraggableTaskCard
            key={task.id}
            task={task}
            onOpenTask={onOpenTask}
            onToggleCompleted={onToggleCompleted}
          />
        ))}
      </div>
    </div>
  )
}

export function TaskBoard({
  tasks,
  statuses = DEFAULT_STATUSES,
  onStatusChange,
  onOpenTask,
  onToggleCompleted
}: TaskBoardProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)

  const columns = useMemo(() => {
    return groupTasksByStatus(tasks, statuses).map((group) => ({
      status: group.status,
      tasks: sortTasksBySortKey(group.tasks)
    }))
  }, [tasks, statuses])

  const activeTask = activeTaskId ? tasks.find((task) => task.id === activeTaskId) : null

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTaskId(String(event.active.id))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTaskId(null)
    const overId = event.over?.id
    if (typeof overId !== 'string' || !overId.startsWith('column:')) return

    const status = overId.slice('column:'.length) as TaskStatusId
    if (!statuses.includes(status)) return

    const taskId = String(event.active.id)
    const task = tasks.find((candidate) => candidate.id === taskId)
    if (!task || task.status === status) return

    const column = columns.find((candidate) => candidate.status === status)
    const lastKey = column?.tasks[column.tasks.length - 1]?.sortKey ?? undefined

    onStatusChange({
      taskId,
      status,
      completed: isCompletedTaskStatus(status),
      sortKey: generateSortKey(lastKey ?? undefined, undefined)
    })
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-full gap-3 overflow-x-auto p-3" data-testid="task-board">
        {columns.map((column) => (
          <BoardColumn
            key={column.status}
            status={column.status}
            tasks={column.tasks}
            onOpenTask={onOpenTask}
            onToggleCompleted={onToggleCompleted}
          />
        ))}
      </div>
      <DragOverlay>{activeTask ? <TaskCard task={activeTask} /> : null}</DragOverlay>
    </DndContext>
  )
}
