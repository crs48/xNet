/**
 * TasksView - the Linear-style Tasks surface.
 *
 * Tabs scope the global Task collection (All / My Tasks / Triage); the
 * list and board modes are projections of the same canonical Task nodes,
 * so edits here are instantly visible in pages, canvases, and database
 * cells (exploration 0161). Opening a task navigates to its host surface.
 */
import { useNavigate } from '@tanstack/react-router'
import { TaskSchema, isCompletedTaskStatus, type TaskStatusId } from '@xnetjs/data'
import { useIdentity, useMutate, useTasks } from '@xnetjs/react'
import { type TaskDisplayData } from '@xnetjs/ui'
import { TaskBoard, TaskListGrouped, type TaskBoardStatusChange } from '@xnetjs/views'
import { Inbox, KanbanSquare, List, Plus, User } from 'lucide-react'
import { useMemo, useState, type JSX } from 'react'

type TasksTab = 'all' | 'mine' | 'triage'
type TasksMode = 'list' | 'board'

function generateTaskId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `task_${globalThis.crypto.randomUUID()}`
  }

  return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function TasksView(): JSX.Element {
  const navigate = useNavigate()
  const { identity } = useIdentity()
  const did = identity?.did ?? null
  const { create, update } = useMutate()
  const [tab, setTab] = useState<TasksTab>('all')
  const [mode, setMode] = useState<TasksMode>('list')
  const [draft, setDraft] = useState('')

  const { data: tasks, loading } = useTasks({ includeCompleted: true })

  const visibleTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (tab === 'mine') {
        if (!did) return false
        const assignees = Array.isArray(task.assignees) ? task.assignees.map(String) : []
        if (task.assignee !== did && !assignees.includes(did)) return false
      }
      if (tab === 'triage') {
        return task.status === 'triage'
      }
      return true
    })
  }, [tasks, tab, did])

  const displayTasks = useMemo<Array<TaskDisplayData & { sortKey?: string | null }>>(() => {
    return visibleTasks.map((task) => ({
      id: task.id,
      title: typeof task.title === 'string' ? task.title : '',
      completed: Boolean(task.completed),
      status: typeof task.status === 'string' ? task.status : undefined,
      priority: typeof task.priority === 'string' ? task.priority : undefined,
      dueDate: typeof task.dueDate === 'number' ? task.dueDate : null,
      assignees: Array.isArray(task.assignees) ? task.assignees.map(String) : [],
      referenceCount: Array.isArray(task.references) ? task.references.length : 0,
      sortKey: typeof task.sortKey === 'string' ? task.sortKey : null
    }))
  }, [visibleTasks])

  const handleToggleCompleted = (taskId: string, completed: boolean) => {
    void update(TaskSchema, taskId, {
      completed,
      status: completed ? 'done' : 'todo'
    })
  }

  const handleStatusChange = (change: TaskBoardStatusChange) => {
    void update(TaskSchema, change.taskId, {
      status: change.status,
      completed: change.completed,
      sortKey: change.sortKey
    })
  }

  const handleOpenTask = (taskId: string) => {
    const task = tasks.find((candidate) => candidate.id === taskId)
    if (!task) return

    if (typeof task.page === 'string' && task.page) {
      void navigate({ to: '/doc/$docId', params: { docId: task.page } })
      return
    }

    if (typeof task.canvas === 'string' && task.canvas) {
      void navigate({ to: '/canvas/$canvasId', params: { canvasId: task.canvas } })
    }
  }

  const handleCreate = async () => {
    const title = draft.trim()
    if (!title) return

    setDraft('')
    const status: TaskStatusId = tab === 'triage' ? 'triage' : 'todo'
    await create(
      TaskSchema,
      {
        title,
        completed: isCompletedTaskStatus(status),
        status,
        source: 'api',
        ...(tab === 'mine' && did ? { assignee: did, assignees: [did] } : {})
      },
      generateTaskId()
    )
  }

  const tabs: Array<{ id: TasksTab; label: string; icon: JSX.Element }> = [
    { id: 'all', label: 'All Tasks', icon: <List size={13} /> },
    { id: 'mine', label: 'My Tasks', icon: <User size={13} /> },
    { id: 'triage', label: 'Triage', icon: <Inbox size={13} /> }
  ]

  return (
    <div className="flex h-full flex-col" data-testid="tasks-view">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1">
          {tabs.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors ${
                tab === id
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMode('list')}
            aria-label="List view"
            className={`rounded-md p-1.5 transition-colors ${
              mode === 'list' ? 'bg-accent text-foreground' : 'text-muted-foreground'
            }`}
          >
            <List size={14} />
          </button>
          <button
            type="button"
            onClick={() => setMode('board')}
            aria-label="Board view"
            className={`rounded-md p-1.5 transition-colors ${
              mode === 'board' ? 'bg-accent text-foreground' : 'text-muted-foreground'
            }`}
          >
            <KanbanSquare size={14} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Plus size={14} className="text-muted-foreground" />
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void handleCreate()
            }
          }}
          placeholder={tab === 'triage' ? 'Add to triage…' : 'Add a task…'}
          className="flex-1 border-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
            Loading tasks…
          </div>
        ) : mode === 'board' ? (
          <TaskBoard
            tasks={displayTasks}
            onStatusChange={handleStatusChange}
            onOpenTask={handleOpenTask}
            onToggleCompleted={handleToggleCompleted}
          />
        ) : (
          <TaskListGrouped
            tasks={displayTasks}
            onOpenTask={handleOpenTask}
            onToggleCompleted={handleToggleCompleted}
          />
        )}
      </div>
    </div>
  )
}
