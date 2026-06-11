/**
 * TasksView - the Linear-style Tasks surface.
 *
 * Tabs scope the global Task collection (All / My Tasks / Triage); the
 * list and board modes are projections of the same canonical Task nodes,
 * so edits here are instantly visible in pages, canvases, and database
 * cells (exploration 0161). Opening a task navigates to its host surface.
 */
import { useNavigate } from '@tanstack/react-router'
import {
  TASK_STATUS_CATEGORIES,
  TaskSchema,
  isCompletedTaskStatus,
  taskBranchName,
  type TaskStatusId
} from '@xnetjs/data'
import { getCommandRegistry } from '@xnetjs/plugins'
import { useIdentity, useMutate, useTasks } from '@xnetjs/react'
import { getTaskStatusMeta, type TaskDisplayData } from '@xnetjs/ui'
import { TaskBoard, TaskListGrouped, type TaskBoardStatusChange } from '@xnetjs/views'
import { Inbox, KanbanSquare, List, Plus, User } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { TaskMiniPalette } from './TaskMiniPalette'

const WORKFLOW_ORDER = Object.keys(TASK_STATUS_CATEGORIES) as TaskStatusId[]

const STATUS_OPTIONS = WORKFLOW_ORDER.map((status) => ({
  id: status,
  label: getTaskStatusMeta(status).name
}))

const PRIORITY_OPTIONS = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'urgent', label: 'Urgent' }
]

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
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null)
  const [miniPalette, setMiniPalette] = useState<'status' | 'priority' | null>(null)
  const quickAddRef = useRef<HTMLInputElement>(null)

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
      shortId: typeof task.shortId === 'string' ? task.shortId : null,
      sortKey: typeof task.sortKey === 'string' ? task.sortKey : null
    }))
  }, [visibleTasks])

  // Ordered ids matching the grouped-list render order (workflow groups,
  // then input order) so focus movement walks rows the way they look.
  const orderedTaskIds = useMemo(() => {
    const byStatus = new Map<TaskStatusId, string[]>(WORKFLOW_ORDER.map((s) => [s, []]))
    for (const task of displayTasks) {
      const status = (task.status ?? 'todo') as TaskStatusId
      ;(byStatus.get(status) ?? byStatus.get('todo'))?.push(task.id)
    }
    return WORKFLOW_ORDER.flatMap((status) => byStatus.get(status) ?? [])
  }, [displayTasks])

  const stateRef = useRef({ focusedTaskId, orderedTaskIds, miniPalette })
  stateRef.current = { focusedTaskId, orderedTaskIds, miniPalette }
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks

  // Surface scope: focus movement + quick capture, active while mounted.
  useEffect(() => {
    const registry = getCommandRegistry()
    const scope = registry.activateScope('surface:tasks')

    const moveFocus = (delta: 1 | -1) => {
      const { focusedTaskId: current, orderedTaskIds: ids } = stateRef.current
      if (ids.length === 0) return
      const index = current ? ids.indexOf(current) : -1
      const next = index === -1 ? (delta === 1 ? 0 : ids.length - 1) : index + delta
      setFocusedTaskId(ids[Math.max(0, Math.min(next, ids.length - 1))] ?? null)
    }

    const disposables = [
      registry.register({
        id: 'tasks.focusNext',
        title: 'Focus next task',
        scope: 'surface:tasks',
        key: 'j',
        run: () => moveFocus(1)
      }),
      registry.register({
        id: 'tasks.focusNext.arrow',
        title: 'Focus next task',
        scope: 'surface:tasks',
        key: 'down',
        run: () => moveFocus(1)
      }),
      registry.register({
        id: 'tasks.focusPrev',
        title: 'Focus previous task',
        scope: 'surface:tasks',
        key: 'k',
        run: () => moveFocus(-1)
      }),
      registry.register({
        id: 'tasks.focusPrev.arrow',
        title: 'Focus previous task',
        scope: 'surface:tasks',
        key: 'up',
        run: () => moveFocus(-1)
      }),
      registry.register({
        id: 'tasks.quickCreate',
        title: 'New task',
        scope: 'surface:tasks',
        key: 'c',
        run: () => quickAddRef.current?.focus()
      })
    ]

    return () => {
      for (const disposable of disposables) disposable.dispose()
      scope.dispose()
    }
  }, [])

  // Focused-task scope: single-key verbs acting on the highlighted row.
  useEffect(() => {
    if (!focusedTaskId) return

    const registry = getCommandRegistry()
    const scope = registry.activateScope('task-focused')

    const withFocused = (action: (taskId: string) => void) => () => {
      const { focusedTaskId: current, miniPalette: palette } = stateRef.current
      if (current && !palette) action(current)
    }

    const disposables = [
      registry.register({
        id: 'task.toggleCompleted',
        title: 'Toggle task completion',
        scope: 'task-focused',
        key: 'x',
        run: withFocused((taskId) => {
          const task = tasksRef.current.find((t) => t.id === taskId)
          handleToggleCompleted(taskId, !task?.completed)
        })
      }),
      registry.register({
        id: 'task.setStatus',
        title: 'Change task status…',
        scope: 'task-focused',
        key: 's',
        run: withFocused(() => setMiniPalette('status'))
      }),
      registry.register({
        id: 'task.setPriority',
        title: 'Change task priority…',
        scope: 'task-focused',
        key: 'p',
        run: withFocused(() => setMiniPalette('priority'))
      }),
      registry.register({
        id: 'task.open',
        title: 'Open task',
        scope: 'task-focused',
        key: 'enter',
        run: withFocused((taskId) => handleOpenTask(taskId))
      }),
      registry.register({
        id: 'task.copyBranchName',
        title: 'Copy git branch name',
        scope: 'task-focused',
        key: 'Mod-Shift-.',
        run: withFocused((taskId) => {
          const task = tasksRef.current.find((t) => t.id === taskId)
          if (!task) return
          const shortId = typeof task.shortId === 'string' && task.shortId ? task.shortId : taskId
          const branch = taskBranchName(shortId, typeof task.title === 'string' ? task.title : '')
          void navigator.clipboard?.writeText(branch)
        })
      })
    ]

    return () => {
      for (const disposable of disposables) disposable.dispose()
      scope.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(focusedTaskId)])

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
            focusedTaskId={focusedTaskId}
            onOpenTask={handleOpenTask}
            onToggleCompleted={handleToggleCompleted}
          />
        )}
      </div>

      {miniPalette && focusedTaskId && (
        <TaskMiniPalette
          title={miniPalette === 'status' ? 'Change status…' : 'Change priority…'}
          kind={miniPalette}
          options={miniPalette === 'status' ? STATUS_OPTIONS : PRIORITY_OPTIONS}
          onSelect={(optionId) => {
            if (miniPalette === 'status') {
              const status = optionId as TaskStatusId
              void update(TaskSchema, focusedTaskId, {
                status,
                completed: isCompletedTaskStatus(status)
              })
            } else {
              void update(TaskSchema, focusedTaskId, {
                priority: optionId as 'low' | 'medium' | 'high' | 'urgent'
              })
            }
          }}
          onClose={() => setMiniPalette(null)}
        />
      )}
    </div>
  )
}
