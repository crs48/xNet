/**
 * TasksView - the Linear-style Tasks surface.
 *
 * Tabs scope the global Task collection (All / My Tasks / Triage); the
 * list and board modes are projections of the same canonical Task nodes,
 * so edits here are instantly visible in pages, canvases, and database
 * cells (exploration 0161). Clicking a task opens its inline editor
 * (title with @mention-to-assign, status, priority, due date, assignees);
 * `?task=` deep-links into that editor and `?project=` scopes the surface.
 */
import { useNavigate } from '@tanstack/react-router'
import {
  ProjectSchema,
  TASK_STATUS_CATEGORIES,
  TaskSchema,
  isCompletedTaskStatus,
  taskBranchName,
  type DID,
  type TaskStatusId
} from '@xnetjs/data'
import { getCommandRegistry } from '@xnetjs/plugins'
import { useIdentity, useMutate, useQuery, useTasks } from '@xnetjs/react'
import {
  DIDAvatar,
  MentionTextInput,
  getTaskStatusMeta,
  taskPersonLabel,
  type TaskDisplayData
} from '@xnetjs/ui'
import { TaskBoard, TaskListGrouped, type TaskBoardStatusChange } from '@xnetjs/views'
import { Inbox, KanbanSquare, List, Plus, User, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { useWorkspacePeople } from '../hooks/useWorkspacePeople'
import { useContextPanel, type ContextPanelSection } from '../workbench/context-panel'
import { TaskInlineEditor } from './TaskInlineEditor'
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

export interface TasksViewProps {
  /** Task whose inline editor opens on mount (`/tasks?task=`) */
  openTaskId?: string | null
  /** Scope the surface to one project (`/tasks?project=`) */
  projectId?: string | null
}

export function TasksView({ openTaskId = null, projectId = null }: TasksViewProps): JSX.Element {
  const navigate = useNavigate()
  // `did` (not `identity?.did`): restored sessions carry only the author
  // DID, and "My Tasks" must still scope to it.
  const { did } = useIdentity()
  const { create, update } = useMutate()
  const people = useWorkspacePeople()
  const [tab, setTab] = useState<TasksTab>('all')
  const [mode, setMode] = useState<TasksMode>('list')
  const [draft, setDraft] = useState('')
  const [draftAssignees, setDraftAssignees] = useState<string[]>([])
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [miniPalette, setMiniPalette] = useState<'status' | 'priority' | null>(null)
  const quickAddRef = useRef<HTMLInputElement>(null)

  const { data: tasks, loading } = useTasks({ includeCompleted: true })
  const { data: projects } = useQuery(ProjectSchema)

  // `?task=` deep link: focus + open the editor, then consume the param so
  // the same link works again later (sidebar rows navigate here).
  useEffect(() => {
    if (!openTaskId) return
    setFocusedTaskId(openTaskId)
    setEditingTaskId(openTaskId)
    void navigate({
      to: '/tasks',
      search: projectId ? { project: projectId } : {},
      replace: true
    })
  }, [navigate, openTaskId, projectId])

  const scopedProject = useMemo(
    () => (projectId ? (projects.find((project) => project.id === projectId) ?? null) : null),
    [projectId, projects]
  )

  const visibleTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (projectId && task.project !== projectId) return false
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
  }, [tasks, tab, did, projectId])

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

  const stateRef = useRef({ focusedTaskId, orderedTaskIds, editingTaskId, miniPalette })
  stateRef.current = { focusedTaskId, orderedTaskIds, editingTaskId, miniPalette }
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks

  // ─── Context panel: live task editor (0166) ───────────────────────────────
  const focusedTask = useMemo(
    () => tasks.find((task) => task.id === focusedTaskId) ?? null,
    [tasks, focusedTaskId]
  )
  const taskContextSections = useMemo<ContextPanelSection[]>(
    () => [
      {
        id: 'task-detail',
        title: 'Task',
        content: focusedTask ? (
          <div className="p-2">
            <TaskInlineEditor task={focusedTask} className="border-none p-0" />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-center text-xs text-ink-3">
            Focus a task (↑/↓) to edit it here.
          </div>
        )
      }
    ],
    [focusedTask]
  )
  useContextPanel('tasks', taskContextSections)

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
      const {
        focusedTaskId: current,
        editingTaskId: editing,
        miniPalette: palette
      } = stateRef.current
      if (current && !editing && !palette) action(current)
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
        id: 'task.edit',
        title: 'Edit task',
        scope: 'task-focused',
        key: 'enter',
        run: withFocused((taskId) => setEditingTaskId(taskId))
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

  const handleEditTask = (taskId: string) => {
    setFocusedTaskId(taskId)
    setEditingTaskId((current) => (current === taskId ? null : taskId))
  }

  const handleCreate = async () => {
    const title = draft.trim()
    if (!title) return

    setDraft('')
    setDraftAssignees([])
    const status: TaskStatusId = tab === 'triage' ? 'triage' : 'todo'
    const assignees =
      tab === 'mine' && did && !draftAssignees.includes(did)
        ? [...draftAssignees, did]
        : draftAssignees
    const [firstAssignee] = assignees
    await create(
      TaskSchema,
      {
        title,
        completed: isCompletedTaskStatus(status),
        status,
        source: 'api',
        ...(projectId ? { project: projectId } : {}),
        ...(firstAssignee ? { assignee: firstAssignee as DID, assignees: assignees as DID[] } : {})
      },
      generateTaskId()
    )
  }

  const editingTask = useMemo(
    () => (editingTaskId ? (tasks.find((task) => task.id === editingTaskId) ?? null) : null),
    [editingTaskId, tasks]
  )
  const editorInList =
    mode === 'list' && editingTaskId != null && visibleTasks.some((t) => t.id === editingTaskId)

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

        {scopedProject && (
          <span
            data-testid="tasks-project-chip"
            className="flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs text-foreground"
          >
            {scopedProject.icon ? `${scopedProject.icon} ` : ''}
            {scopedProject.name || 'Untitled project'}
            <button
              type="button"
              aria-label="Clear project filter"
              onClick={() => void navigate({ to: '/tasks', search: {}, replace: true })}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X size={11} />
            </button>
          </span>
        )}

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
        <Plus size={14} className="shrink-0 text-muted-foreground" />
        <MentionTextInput
          value={draft}
          onChange={setDraft}
          people={people.filter((person) => !draftAssignees.includes(person.did))}
          onMention={(mentioned) => setDraftAssignees((current) => [...current, mentioned])}
          onSubmit={() => void handleCreate()}
          inputRef={quickAddRef}
          placeholder={
            tab === 'triage' ? 'Add to triage… (@ to assign)' : 'Add a task… (@ to assign)'
          }
          data-testid="task-quick-add"
        />
        {draftAssignees.map((assignee) => (
          <span
            key={assignee}
            className="flex shrink-0 items-center gap-1 rounded-full border border-border py-0.5 pl-0.5 pr-1.5 text-xs text-foreground"
          >
            <DIDAvatar did={assignee} size={14} />
            {taskPersonLabel(people.find((person) => person.did === assignee) ?? { did: assignee })}
            <button
              type="button"
              aria-label="Remove pending assignee"
              onClick={() =>
                setDraftAssignees((current) => current.filter((existing) => existing !== assignee))
              }
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X size={10} />
            </button>
          </span>
        ))}
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
            onOpenTask={handleEditTask}
            onToggleCompleted={handleToggleCompleted}
          />
        ) : (
          <TaskListGrouped
            tasks={displayTasks}
            focusedTaskId={focusedTaskId}
            expandedTaskId={editingTaskId}
            renderTaskEditor={() =>
              editingTask ? (
                <TaskInlineEditor
                  task={editingTask}
                  autoFocusTitle
                  onClose={() => setEditingTaskId(null)}
                />
              ) : null
            }
            onOpenTask={handleEditTask}
            onToggleCompleted={handleToggleCompleted}
          />
        )}
      </div>

      {editingTask && !editorInList && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-32"
          data-testid="task-editor-overlay"
          onClick={() => setEditingTaskId(null)}
        >
          <div className="w-full max-w-lg" onClick={(event) => event.stopPropagation()}>
            <TaskInlineEditor
              task={editingTask}
              autoFocusTitle
              onClose={() => setEditingTaskId(null)}
              className="shadow-2xl"
            />
          </div>
        </div>
      )}

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
