/**
 * Tasks property handler — relation → Task (multiple) with an inline
 * checklist cell.
 *
 * The cell value is a string[] of canonical Task node ids. Task state
 * (title/completed/status) always renders live from the nodes and edits
 * write through to them, so the same task stays consistent in pages,
 * canvases, and task views. Removing an id here is an unlink (the node is
 * untouched); archived/missing tasks render as tombstones
 * (docs/specs/PAGE_TASK_RECONCILIATION.md).
 */

import type { PropertyHandler, PropertyEditorProps } from '../types.js'
import { TaskSchema } from '@xnetjs/data'
import { useMutate, useQuery } from '@xnetjs/react'
import { TaskChip, type TaskDisplayData } from '@xnetjs/ui'
import React, { useMemo, useRef, useState } from 'react'

function generateTaskId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `task_${globalThis.crypto.randomUUID()}`
  }

  return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function useTaskDisplayMap(taskIds: string[]): Map<string, TaskDisplayData> {
  const { data: tasks } = useQuery(TaskSchema, { includeDeleted: true })

  return useMemo(() => {
    const wanted = new Set(taskIds)
    const map = new Map<string, TaskDisplayData>()

    for (const task of tasks) {
      if (!wanted.has(task.id)) continue
      map.set(task.id, {
        id: task.id,
        title: typeof task.title === 'string' ? task.title : '',
        completed: Boolean(task.completed),
        status: typeof task.status === 'string' ? task.status : undefined,
        priority: typeof task.priority === 'string' ? task.priority : undefined,
        dueDate: typeof task.dueDate === 'number' ? task.dueDate : null,
        assignees: Array.isArray(task.assignees) ? task.assignees : [],
        deleted: Boolean(task.deleted)
      })
    }

    return map
  }, [tasks, taskIds])
}

function TaskChecklistCell({ taskIds }: { taskIds: string[] }) {
  const taskMap = useTaskDisplayMap(taskIds)
  const doneCount = taskIds.filter((id) => taskMap.get(id)?.completed).length

  return (
    <div className="flex w-full items-center gap-1 overflow-hidden">
      <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
        {doneCount}/{taskIds.length}
      </span>
      <div className="flex flex-1 gap-1 overflow-hidden">
        {taskIds.slice(0, 3).map((id) => (
          <TaskChip key={id} task={taskMap.get(id) ?? null} />
        ))}
        {taskIds.length > 3 && (
          <span className="shrink-0 self-center text-xs text-gray-500 dark:text-gray-400">
            +{taskIds.length - 3}
          </span>
        )}
      </div>
    </div>
  )
}

function TaskChecklistEditor({ value, onChange, onBlur, disabled }: PropertyEditorProps<string[]>) {
  const rootRef = useRef<HTMLDivElement>(null)
  const taskIds = useMemo(() => (Array.isArray(value) ? value : []), [value])
  const taskMap = useTaskDisplayMap(taskIds)
  const { create, update, restore } = useMutate()
  const [draft, setDraft] = useState('')

  const toggleTask = (taskId: string, completed: boolean) => {
    void update(TaskSchema, taskId, {
      completed,
      status: completed ? 'done' : 'todo'
    })
  }

  const unlinkTask = (taskId: string) => {
    onChange(taskIds.filter((id) => id !== taskId))
  }

  const addTask = async () => {
    const title = draft.trim()
    if (!title) return

    const taskId = generateTaskId()
    setDraft('')
    onChange([...taskIds, taskId])
    await create(
      TaskSchema,
      {
        title,
        completed: false,
        status: 'todo',
        source: 'database'
      },
      taskId
    )
  }

  return (
    <div
      ref={rootRef}
      className="flex w-full flex-col gap-1 p-1"
      onBlur={(event) => {
        const next = event.relatedTarget
        if (next instanceof Node && rootRef.current?.contains(next)) return
        onBlur?.()
      }}
    >
      {taskIds.map((id) => {
        const task = taskMap.get(id) ?? null

        return (
          <div key={id} className="group flex items-center gap-1.5">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 shrink-0 cursor-pointer"
              checked={Boolean(task?.completed)}
              disabled={disabled || !task || task.deleted}
              onChange={(event) => toggleTask(id, event.target.checked)}
              aria-label={task?.completed ? 'Mark incomplete' : 'Mark complete'}
            />
            <span className="min-w-0 flex-1">
              <TaskChip
                task={task}
                onRestore={task?.deleted ? (taskId) => void restore(taskId) : undefined}
              />
            </span>
            {!disabled && (
              <button
                type="button"
                className="shrink-0 text-gray-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => unlinkTask(id)}
                aria-label="Unlink task"
              >
                ×
              </button>
            )}
          </div>
        )
      })}

      {!disabled && (
        <input
          type="text"
          value={draft}
          autoFocus={taskIds.length === 0}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void addTask()
            }
          }}
          placeholder="Add task…"
          className="min-w-0 border-none bg-transparent px-0.5 py-0.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
        />
      )}
    </div>
  )
}

export const taskChecklistHandler: PropertyHandler<string[]> = {
  // Cell value is a relation (Task node ids); 'tasks' is the column type key.
  type: 'relation',

  render(value) {
    const taskIds = Array.isArray(value) ? value : []

    if (taskIds.length === 0) {
      return <span className="text-gray-400 dark:text-gray-500 italic">Empty</span>
    }

    return <TaskChecklistCell taskIds={taskIds} />
  },

  compare(a, b) {
    const aLen = Array.isArray(a) ? a.length : 0
    const bLen = Array.isArray(b) ? b.length : 0
    return aLen - bLen
  },

  filterOperators: ['isEmpty', 'isNotEmpty'],

  applyFilter(value, operator) {
    const taskIds = Array.isArray(value) ? value : []
    switch (operator) {
      case 'isEmpty':
        return taskIds.length === 0
      case 'isNotEmpty':
        return taskIds.length > 0
      default:
        return true
    }
  },

  Editor: TaskChecklistEditor
}
