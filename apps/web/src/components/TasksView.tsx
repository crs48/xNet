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
  Sheet,
  SheetContent,
  TaskPriorityIcon,
  TaskStatusIcon,
  formatDueDate,
  getTaskStatusMeta,
  taskPersonLabel,
  type TaskDisplayData
} from '@xnetjs/ui'
import {
  TaskBoard,
  TaskListGrouped,
  buildTaskGroups,
  type TaskBoardStatusChange,
  type TaskGroupRef
} from '@xnetjs/views'
import { CalendarDays, Hash, Inbox, KanbanSquare, List, Plus, User, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { useWorkspacePeople } from '../hooks/useWorkspacePeople'
import { useWorkspaceTags } from '../hooks/useWorkspaceTags'
import { useContextPanel, type ContextPanelSection } from '../workbench/context-panel'
import { DraftSwitcher } from '../workbench/drafts/DraftSwitcher'
import { ProjectHeader } from './ProjectHeader'
import {
  EMPTY_TASK_FILTER,
  applyTaskFilter,
  type TaskFilter,
  type TaskFilterField
} from './task-filter'
import { TaskBulkBar } from './TaskBulkBar'
import { TaskDisplayOptions, type TaskDisplaySettings } from './TaskDisplayOptions'
import { TaskDueDatePalette } from './TaskDueDatePalette'
import { TaskFilterBar, type FilterValueOption } from './TaskFilterBar'
import { TaskInlineEditor } from './TaskInlineEditor'
import { TaskMiniPalette } from './TaskMiniPalette'
import { TaskPeek } from './TaskPeek'
import { TaskSidebar } from './TaskSidebar'

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

// Display Options persist locally (a lightweight saved-view; node-backed
// SavedView is a follow-up — see exploration 0198).
const DISPLAY_STORAGE_KEY = 'xnet:tasks:display'
const DEFAULT_DISPLAY: TaskDisplaySettings = {
  groupBy: 'status',
  orderBy: 'manual',
  density: 'comfortable',
  showCompleted: true
}

function loadDisplaySettings(): TaskDisplaySettings {
  if (typeof window === 'undefined') return DEFAULT_DISPLAY
  try {
    const raw = window.localStorage.getItem(DISPLAY_STORAGE_KEY)
    if (!raw) return DEFAULT_DISPLAY
    return { ...DEFAULT_DISPLAY, ...(JSON.parse(raw) as Partial<TaskDisplaySettings>) }
  } catch {
    return DEFAULT_DISPLAY
  }
}

function saveDisplaySettings(settings: TaskDisplaySettings): void {
  try {
    window.localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Silent fail (incognito, etc.)
  }
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
  const { create, update, mutate, remove } = useMutate()
  const people = useWorkspacePeople()
  const { suggestions: tagOptions, getOrCreateTag } = useWorkspaceTags()
  const [tab, setTab] = useState<TasksTab>('all')
  const [mode, setMode] = useState<TasksMode>('list')
  const [draft, setDraft] = useState('')
  const [draftAssignees, setDraftAssignees] = useState<string[]>([])
  const [draftTags, setDraftTags] = useState<string[]>([])
  const [draftDue, setDraftDue] = useState<number | null>(null)
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [miniPalette, setMiniPalette] = useState<
    'status' | 'priority' | 'dueDate' | 'assignee' | 'label' | null
  >(null)
  // Display Options (grouping/ordering/density/show-completed), persisted.
  const [display, setDisplay] = useState<TaskDisplaySettings>(() => loadDisplaySettings())
  const [displayOpen, setDisplayOpen] = useState(false)
  // Filter bar.
  const [filter, setFilter] = useState<TaskFilter>(EMPTY_TASK_FILTER)
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  // Multi-select (bulk edit). `anchorId` is the shift-range pivot.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set())
  const [anchorId, setAnchorId] = useState<string | null>(null)
  const [peekOpen, setPeekOpen] = useState(false)
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

  useEffect(() => saveDisplaySettings(display), [display])

  const scopedProject = useMemo(
    () => (projectId ? (projects.find((project) => project.id === projectId) ?? null) : null),
    [projectId, projects]
  )

  const visibleTasks = useMemo(() => {
    const scoped = tasks.filter((task) => {
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
    const completedHidden = display.showCompleted
      ? scoped
      : scoped.filter(
          (task) =>
            !(
              task.completed ||
              (typeof task.status === 'string' && isCompletedTaskStatus(task.status))
            )
        )
    return applyTaskFilter(completedHidden, filter)
  }, [tasks, tab, did, projectId, filter, display.showCompleted])

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
      sortKey: typeof task.sortKey === 'string' ? task.sortKey : null,
      createdAt: typeof task.createdAt === 'number' ? task.createdAt : undefined,
      updatedAt: typeof task.updatedAt === 'number' ? task.updatedAt : undefined
    }))
  }, [visibleTasks])

  // Ordered ids matching the grouped-list render order (current grouping +
  // ordering) so focus movement walks rows the way they look.
  const orderedTaskIds = useMemo(
    () =>
      buildTaskGroups(displayTasks, {
        groupBy: display.groupBy,
        orderBy: display.orderBy
      }).flatMap((group) => group.tasks.map((task) => task.id)),
    [displayTasks, display.groupBy, display.orderBy]
  )

  const stateRef = useRef({
    focusedTaskId,
    orderedTaskIds,
    editingTaskId,
    miniPalette,
    selectedIds,
    anchorId,
    peekOpen
  })
  stateRef.current = {
    focusedTaskId,
    orderedTaskIds,
    editingTaskId,
    miniPalette,
    selectedIds,
    anchorId,
    peekOpen
  }
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
            <div className="flex justify-end pb-1">
              <DraftSwitcher nodeId={focusedTask.id} />
            </div>
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
      }),
      registry.register({
        id: 'tasks.selectAll',
        title: 'Select all tasks',
        scope: 'surface:tasks',
        key: 'Mod-a',
        run: () => setSelectedIds(new Set(stateRef.current.orderedTaskIds))
      }),
      registry.register({
        id: 'tasks.filter',
        title: 'Filter tasks…',
        scope: 'surface:tasks',
        key: 'f',
        run: () => setFilterMenuOpen(true)
      }),
      registry.register({
        id: 'tasks.display',
        title: 'Display options…',
        scope: 'surface:tasks',
        key: 'v',
        run: () => setDisplayOpen((open) => !open)
      }),
      registry.register({
        id: 'tasks.clearOrPeekClose',
        title: 'Clear selection / close peek',
        scope: 'surface:tasks',
        key: 'escape',
        when: () => stateRef.current.peekOpen || stateRef.current.selectedIds.size > 0,
        run: () => {
          if (stateRef.current.peekOpen) {
            setPeekOpen(false)
            return
          }
          setSelectedIds(new Set())
          setAnchorId(null)
        }
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
        id: 'task.select',
        title: 'Select task',
        scope: 'task-focused',
        key: 'x',
        run: withFocused((taskId) => toggleSelect(taskId))
      }),
      registry.register({
        id: 'task.peek',
        title: 'Peek task',
        scope: 'task-focused',
        key: 'space',
        run: withFocused(() => setPeekOpen((open) => !open))
      }),
      registry.register({
        id: 'task.setStatus',
        title: 'Change task status…',
        scope: 'task-focused',
        key: 's',
        run: withFocused(() => setMiniPalette('status'))
      }),
      registry.register({
        id: 'task.assignMe',
        title: 'Assign to me',
        scope: 'task-focused',
        key: 'i',
        when: () => Boolean(did),
        run: withFocused(() => {
          if (did) bulkAddAssignee(did as DID)
        })
      }),
      registry.register({
        id: 'task.assign',
        title: 'Assign task…',
        scope: 'task-focused',
        key: 'a',
        run: withFocused(() => setMiniPalette('assignee'))
      }),
      registry.register({
        id: 'task.label',
        title: 'Add label…',
        scope: 'task-focused',
        key: 'l',
        run: withFocused(() => setMiniPalette('label'))
      }),
      registry.register({
        id: 'task.rename',
        title: 'Rename task',
        scope: 'task-focused',
        key: 'r',
        run: withFocused((taskId) => setEditingTaskId(taskId))
      }),
      registry.register({
        id: 'task.copyId',
        title: 'Copy task id',
        scope: 'task-focused',
        key: 'Mod-.',
        run: withFocused((taskId) => {
          const task = tasksRef.current.find((t) => t.id === taskId)
          const shortId = typeof task?.shortId === 'string' && task.shortId ? task.shortId : taskId
          void navigator.clipboard?.writeText(shortId)
        })
      }),
      registry.register({
        id: 'task.setPriority',
        title: 'Change task priority…',
        scope: 'task-focused',
        key: 'p',
        run: withFocused(() => setMiniPalette('priority'))
      }),
      registry.register({
        id: 'task.setDueDate',
        title: 'Set task due date…',
        scope: 'task-focused',
        key: 'd',
        run: withFocused(() => setMiniPalette('dueDate'))
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

  // List-row status-glyph dropdown: change a task's workflow status in place
  // (the glyph opens a status picker instead of toggling completion).
  const handleRowStatusChange = (taskId: string, status: string, completed: boolean) => {
    void update(TaskSchema, taskId, {
      status: status as TaskStatusId,
      completed
    })
  }

  const handleEditTask = (taskId: string) => {
    setFocusedTaskId(taskId)
    setEditingTaskId((current) => (current === taskId ? null : taskId))
  }

  // Linear's group-header "+": create a task already in that group (status /
  // priority / assignee) and open it for naming.
  const handleCreateInGroup = async (group: TaskGroupRef) => {
    const id = generateTaskId()
    const status: TaskStatusId =
      group.groupBy === 'status'
        ? (group.key as TaskStatusId)
        : tab === 'triage'
          ? 'triage'
          : 'todo'
    const assignees =
      group.groupBy === 'assignee' && group.key ? [group.key] : tab === 'mine' && did ? [did] : []
    await create(
      TaskSchema,
      {
        title: '',
        completed: isCompletedTaskStatus(status),
        status,
        source: 'api',
        ...(group.groupBy === 'priority'
          ? { priority: group.key as 'low' | 'medium' | 'high' | 'urgent' }
          : {}),
        ...(projectId ? { project: projectId } : {}),
        ...(assignees.length
          ? { assignee: assignees[0] as DID, assignees: assignees as DID[] }
          : {})
      },
      id
    )
    setFocusedTaskId(id)
    setEditingTaskId(id)
  }

  // ─── Multi-select + bulk edit (Linear `x` / shift-click / ⌘A) ─────────────
  const toggleSelect = (
    taskId: string,
    modifiers: { shiftKey: boolean; metaKey: boolean } = { shiftKey: false, metaKey: false }
  ) => {
    // Read pivot + order from the ref so keyboard and click paths agree.
    const { anchorId: anchor, orderedTaskIds: ids } = stateRef.current
    setFocusedTaskId(taskId)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (modifiers.shiftKey && anchor) {
        const from = ids.indexOf(anchor)
        const to = ids.indexOf(taskId)
        if (from !== -1 && to !== -1) {
          const [lo, hi] = from < to ? [from, to] : [to, from]
          for (const id of ids.slice(lo, hi + 1)) next.add(id)
        } else {
          next.add(taskId)
        }
      } else if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
    if (!modifiers.shiftKey) setAnchorId(taskId)
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
    setAnchorId(null)
  }

  /** Tasks a bulk action targets: the selection, else the focused task. */
  const bulkTargets = (): string[] => {
    const { selectedIds: sel, focusedTaskId: focused } = stateRef.current
    if (sel.size > 0) return [...sel]
    return focused ? [focused] : []
  }

  const bulkUpdate = (data: Record<string, unknown>) => {
    const ids = bulkTargets()
    if (ids.length === 0) return
    if (ids.length === 1) {
      void update(TaskSchema, ids[0], data as never)
      return
    }
    void mutate(ids.map((id) => ({ type: 'update' as const, id, data })))
  }

  const bulkSetStatus = (status: TaskStatusId) =>
    bulkUpdate({ status, completed: isCompletedTaskStatus(status) })

  const bulkSetPriority = (priority: 'low' | 'medium' | 'high' | 'urgent') =>
    bulkUpdate({ priority })

  // Add a DID to each target's assignees (keeps existing assignees).
  const bulkAddAssignee = (assignee: DID) => {
    const ops = bulkTargets().map((id) => {
      const task = tasksRef.current.find((t) => t.id === id)
      const current = Array.isArray(task?.assignees) ? task.assignees.map(String) : []
      const assignees = current.includes(assignee) ? current : [...current, assignee]
      return { type: 'update' as const, id, data: { assignees, assignee: assignees[0] } }
    })
    if (ops.length === 1) void update(TaskSchema, ops[0].id, ops[0].data as never)
    else if (ops.length > 1) void mutate(ops)
  }

  const bulkAddTag = (tagId: string) => {
    const ops = bulkTargets().map((id) => {
      const task = tasksRef.current.find((t) => t.id === id)
      const current = Array.isArray(task?.tags) ? task.tags.map(String) : []
      const tags = current.includes(tagId) ? current : [...current, tagId]
      return { type: 'update' as const, id, data: { tags } }
    })
    if (ops.length === 1) void update(TaskSchema, ops[0].id, ops[0].data as never)
    else if (ops.length > 1) void mutate(ops)
  }

  const bulkDelete = () => {
    // Component delete = remove(id); a mutate delete op is a silent no-op here.
    void Promise.all(bulkTargets().map((id) => remove(id)))
    clearSelection()
    setPeekOpen(false)
  }

  const handleCreate = async () => {
    const title = draft.trim()
    if (!title) return

    setDraft('')
    setDraftAssignees([])
    setDraftTags([])
    setDraftDue(null)
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
        ...(firstAssignee ? { assignee: firstAssignee as DID, assignees: assignees as DID[] } : {}),
        ...(draftTags.length ? { tags: draftTags } : {}),
        ...(draftDue != null ? { dueDate: draftDue } : {})
      },
      generateTaskId()
    )
  }

  const editingTask = useMemo(
    () => (editingTaskId ? (tasks.find((task) => task.id === editingTaskId) ?? null) : null),
    [editingTaskId, tasks]
  )
  const peekDisplayTask = useMemo(
    () => (focusedTaskId ? (displayTasks.find((t) => t.id === focusedTaskId) ?? null) : null),
    [focusedTaskId, displayTasks]
  )

  const assigneeLabel = useMemo(() => {
    const byDid = new Map(people.map((person) => [person.did, taskPersonLabel(person)]))
    return (did: string) => byDid.get(did) ?? did
  }, [people])

  const filterOptions = useMemo<Record<TaskFilterField, FilterValueOption[]>>(
    () => ({
      status: STATUS_OPTIONS.map((option) => ({
        id: option.id,
        label: option.label,
        icon: <TaskStatusIcon status={option.id} size={13} />
      })),
      priority: PRIORITY_OPTIONS.map((option) => ({
        id: option.id,
        label: option.label,
        icon: <TaskPriorityIcon priority={option.id} size={13} />
      })),
      assignee: people.map((person) => ({
        id: person.did,
        label: taskPersonLabel(person),
        icon: <DIDAvatar did={person.did} size={16} />
      })),
      label: tagOptions.map((tag) => ({
        id: tag.id,
        label: tag.name,
        icon: <Hash size={13} className="text-muted-foreground" />
      }))
    }),
    [people, tagOptions]
  )

  const tabs: Array<{ id: TasksTab; label: string; icon: JSX.Element }> = [
    { id: 'all', label: 'All Tasks', icon: <List size={13} /> },
    { id: 'mine', label: 'My Tasks', icon: <User size={13} /> },
    { id: 'triage', label: 'Triage', icon: <Inbox size={13} /> }
  ]

  const selectView = (next: TasksTab) => {
    setTab(next)
    if (projectId) void navigate({ to: '/tasks', search: {}, replace: true })
  }

  const createProject = () =>
    void create(ProjectSchema, { name: 'New project' }).then((p) => {
      if (p?.id) void navigate({ to: '/tasks', search: { project: p.id } })
    })

  return (
    <div className="flex h-full" data-testid="tasks-view">
      <TaskSidebar
        className="hidden md:flex"
        view={tab}
        activeProjectId={projectId}
        projects={projects}
        onSelectView={selectView}
        onSelectProject={(id) => void navigate({ to: '/tasks', search: { project: id } })}
        onCreateProject={createProject}
      />

      <div className="flex min-w-0 flex-1 flex-col" data-testid="tasks-main">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <div className="flex items-center gap-1 md:hidden">
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

          <div className="ml-auto flex items-center gap-1" data-tasks-view-toggle>
            {!projectId && (
              <button
                type="button"
                onClick={createProject}
                className="mr-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
              >
                <Plus size={13} /> Project
              </button>
            )}
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

        {projectId && <ProjectHeader projectId={projectId} />}

        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
          <TaskFilterBar
            filter={filter}
            onChange={setFilter}
            options={filterOptions}
            menuOpen={filterMenuOpen}
            onMenuOpenChange={setFilterMenuOpen}
          />
          {mode === 'list' && (
            <div className="ml-auto">
              <TaskDisplayOptions
                settings={display}
                onChange={(patch) => setDisplay((current) => ({ ...current, ...patch }))}
                open={displayOpen}
                onOpenChange={setDisplayOpen}
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Plus size={14} className="shrink-0 text-muted-foreground" />
          <MentionTextInput
            value={draft}
            onChange={setDraft}
            people={people.filter((person) => !draftAssignees.includes(person.did))}
            onMention={(mentioned) => setDraftAssignees((current) => [...current, mentioned])}
            tags={tagOptions.filter((tag) => !draftTags.includes(tag.id))}
            onTag={(tagId) => setDraftTags((current) => [...current, tagId])}
            onCreateTag={(name) => {
              void getOrCreateTag(name).then((tag) => {
                if (tag) setDraftTags((current) => [...current, tag.id])
              })
            }}
            onDueDate={(ms) => setDraftDue(ms)}
            onSubmit={() => void handleCreate()}
            inputRef={quickAddRef}
            placeholder={
              tab === 'triage'
                ? 'Add to triage… (@ assign · # tag · due date)'
                : 'Add a task… (@ assign · # tag · type a due date)'
            }
            data-testid="task-quick-add"
          />
          {draftDue != null && (
            <span className="flex shrink-0 items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-xs text-foreground">
              <CalendarDays size={12} className="text-muted-foreground" />
              {formatDueDate(draftDue).label}
              <button
                type="button"
                aria-label="Remove pending due date"
                onClick={() => setDraftDue(null)}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X size={10} />
              </button>
            </span>
          )}
          {draftTags.map((tagId) => (
            <span
              key={tagId}
              className="flex shrink-0 items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-xs text-foreground"
            >
              <Hash size={11} className="text-muted-foreground" />
              {tagOptions.find((tag) => tag.id === tagId)?.name ?? 'tag'}
              <button
                type="button"
                aria-label="Remove pending tag"
                onClick={() => setDraftTags((current) => current.filter((id) => id !== tagId))}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X size={10} />
              </button>
            </span>
          ))}
          {draftAssignees.map((assignee) => (
            <span
              key={assignee}
              className="flex shrink-0 items-center gap-1 rounded-full border border-border py-0.5 pl-0.5 pr-1.5 text-xs text-foreground"
            >
              <DIDAvatar did={assignee} size={14} />
              {taskPersonLabel(
                people.find((person) => person.did === assignee) ?? { did: assignee }
              )}
              <button
                type="button"
                aria-label="Remove pending assignee"
                onClick={() =>
                  setDraftAssignees((current) =>
                    current.filter((existing) => existing !== assignee)
                  )
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
              onCardStatusChange={handleRowStatusChange}
            />
          ) : (
            <TaskListGrouped
              tasks={displayTasks}
              groupBy={display.groupBy}
              orderBy={display.orderBy}
              density={display.density}
              assigneeLabel={assigneeLabel}
              focusedTaskId={focusedTaskId}
              selectedTaskIds={selectedIds}
              onSelectTask={toggleSelect}
              onCreateInGroup={(group) => void handleCreateInGroup(group)}
              onOpenTask={handleEditTask}
              onToggleCompleted={handleToggleCompleted}
              onStatusChange={handleRowStatusChange}
            />
          )}
        </div>

        {/* Linear-style detail slide-over: the list stays visible behind it. */}
        <Sheet
          open={Boolean(editingTask)}
          onOpenChange={(open) => {
            if (!open) setEditingTaskId(null)
          }}
        >
          {editingTask && (
            <SheetContent
              side="right"
              hideClose
              className="w-full overflow-y-auto p-0 sm:max-w-lg"
              data-testid="task-detail-sheet"
            >
              <div className="flex justify-end px-4 pt-3">
                <DraftSwitcher nodeId={editingTask.id} />
              </div>
              <TaskInlineEditor
                task={editingTask}
                autoFocusTitle
                onClose={() => setEditingTaskId(null)}
                className="border-none"
              />
            </SheetContent>
          )}
        </Sheet>

        {selectedIds.size > 0 && (
          <TaskBulkBar
            count={selectedIds.size}
            onStatus={() => setMiniPalette('status')}
            onPriority={() => setMiniPalette('priority')}
            onAssignMe={() => did && bulkAddAssignee(did as DID)}
            onDelete={bulkDelete}
            onClear={clearSelection}
          />
        )}

        {peekOpen && peekDisplayTask && (
          <div className="fixed inset-0 z-40" onClick={() => setPeekOpen(false)}>
            <TaskPeek
              task={peekDisplayTask}
              onOpen={(taskId) => {
                setPeekOpen(false)
                handleEditTask(taskId)
              }}
              onClose={() => setPeekOpen(false)}
            />
          </div>
        )}

        {(miniPalette === 'status' || miniPalette === 'priority') &&
          (focusedTaskId || selectedIds.size > 0) && (
            <TaskMiniPalette
              title={miniPalette === 'status' ? 'Change status…' : 'Change priority…'}
              kind={miniPalette}
              options={miniPalette === 'status' ? STATUS_OPTIONS : PRIORITY_OPTIONS}
              onSelect={(optionId) => {
                if (miniPalette === 'status') {
                  bulkSetStatus(optionId as TaskStatusId)
                } else {
                  bulkSetPriority(optionId as 'low' | 'medium' | 'high' | 'urgent')
                }
              }}
              onClose={() => setMiniPalette(null)}
            />
          )}

        {miniPalette === 'assignee' && (focusedTaskId || selectedIds.size > 0) && (
          <TaskMiniPalette
            title="Assign to…"
            kind="generic"
            options={people.map((person) => ({
              id: person.did,
              label: taskPersonLabel(person),
              icon: <DIDAvatar did={person.did} size={16} />
            }))}
            onSelect={(personId) => bulkAddAssignee(personId as DID)}
            onClose={() => setMiniPalette(null)}
          />
        )}

        {miniPalette === 'label' && (focusedTaskId || selectedIds.size > 0) && (
          <TaskMiniPalette
            title="Add label…"
            kind="generic"
            options={tagOptions.map((tag) => ({
              id: tag.id,
              label: tag.name,
              icon: <Hash size={13} className="text-muted-foreground" />
            }))}
            onSelect={(tagId) => bulkAddTag(tagId)}
            onClose={() => setMiniPalette(null)}
          />
        )}

        {miniPalette === 'dueDate' && (focusedTaskId || selectedIds.size > 0) && (
          <TaskDueDatePalette
            onSelect={(dueDate) => bulkUpdate({ dueDate: dueDate ?? undefined })}
            onClose={() => setMiniPalette(null)}
          />
        )}
      </div>
    </div>
  )
}
