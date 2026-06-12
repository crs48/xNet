/**
 * Left-panel Tasks dashboard (replaces the bare My Tasks list).
 *
 * A personal mini-dashboard: pinned tasks, what you have in flight, a
 * short priority-ordered queue of your assignments (paginated), and the
 * projects you follow. Rows deep-link into the Tasks surface
 * (`/tasks?task=` opens the inline editor; `/tasks?project=` scopes the
 * board) and stay draggable onto canvases.
 */
import type { DragEvent, JSX, ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { CANVAS_INTERNAL_NODE_MIME, serializeCanvasInternalNodeDragData } from '@xnetjs/canvas'
import { ProjectSchema, TaskSchema } from '@xnetjs/data'
import { useIdentity, useQuery, useTasks } from '@xnetjs/react'
import {
  DUE_DATE_URGENCY_CLASS,
  TaskStatusIcon,
  cn,
  formatDueDate,
  setNodeTransfer
} from '@xnetjs/ui'
import { Folder } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useWorkbench } from '../state'
import {
  isDashboardEmpty,
  selectFollowedProjects,
  selectTasksDashboard,
  type FollowedProject,
  type PanelTask
} from './tasks-panel-data'

const ASSIGNED_PAGE_SIZE = 3
const ASSIGNED_PAGE_STEP = 5

type PanelTaskNode = PanelTask & { title?: unknown }
type PanelProjectNode = { id: string; name?: unknown; icon?: unknown; lead?: string }

function panelTitle(value: unknown, fallback: string): string {
  return typeof value === 'string' && value ? value : fallback
}

function setTaskDragData(event: DragEvent, task: PanelTaskNode): void {
  const title = panelTitle(task.title, 'Task')
  event.dataTransfer.effectAllowed = 'copyMove'
  setNodeTransfer(event, {
    nodeId: task.id,
    nodeType: 'task',
    title,
    schemaId: TaskSchema._schemaId,
    sourceContext: 'task'
  })
  event.dataTransfer.setData(
    CANVAS_INTERNAL_NODE_MIME,
    serializeCanvasInternalNodeDragData({
      nodeId: task.id,
      schemaId: TaskSchema._schemaId,
      title
    })
  )
}

function SectionHeading({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <div className="flex items-center px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-ink-3">
      {children}
      {typeof count === 'number' && <span className="ml-auto normal-case">{count}</span>}
    </div>
  )
}

function PanelDueLabel({ task }: { task: PanelTaskNode }) {
  const due = formatDueDate(task.dueDate ?? null)
  if (due.urgency === 'none') return null
  return (
    <span className={cn('shrink-0 text-[10px]', DUE_DATE_URGENCY_CLASS[due.urgency])}>
      {due.label}
    </span>
  )
}

function PanelTaskRow({ task }: { task: PanelTaskNode }) {
  const title = panelTitle(task.title, 'Untitled task')

  return (
    <Link
      to="/tasks"
      search={{ task: task.id }}
      draggable
      onDragStart={(event) => setTaskDragData(event, task)}
      data-testid="tasks-panel-row"
      className="flex h-[26px] items-center gap-2 rounded-sm px-2 text-xs text-ink-2 no-underline transition-colors hover:bg-accent hover:text-ink-1 hover:no-underline"
      title={title}
    >
      <TaskStatusIcon status={task.completed ? 'done' : task.status} size={12} />
      <span className={cn('min-w-0 flex-1 truncate', task.completed && 'line-through text-ink-3')}>
        {title}
      </span>
      <PanelDueLabel task={task} />
    </Link>
  )
}

function TaskSection({
  title,
  tasks,
  count
}: {
  title: string
  tasks: PanelTaskNode[]
  count?: number
}) {
  if (tasks.length === 0) return null
  return (
    <section>
      <SectionHeading count={count}>{title}</SectionHeading>
      {tasks.map((task) => (
        <PanelTaskRow key={task.id} task={task} />
      ))}
    </section>
  )
}

function AssignedSection({ tasks }: { tasks: PanelTaskNode[] }) {
  const [shown, setShown] = useState(ASSIGNED_PAGE_SIZE)

  return (
    <section>
      <SectionHeading count={tasks.length}>Assigned to me</SectionHeading>
      {tasks.length === 0 ? (
        <p className="m-0 px-2 pb-1 text-xs text-ink-3">No other open assignments.</p>
      ) : (
        <>
          {tasks.slice(0, shown).map((task) => (
            <PanelTaskRow key={task.id} task={task} />
          ))}
          {tasks.length > shown && (
            <button
              type="button"
              data-testid="tasks-panel-show-more"
              onClick={() => setShown((current) => current + ASSIGNED_PAGE_STEP)}
              className="flex h-[24px] w-full items-center rounded-sm px-2 text-[11px] text-ink-3 transition-colors hover:bg-accent hover:text-ink-1"
            >
              Show more ({tasks.length - shown} hidden)
            </button>
          )}
        </>
      )}
    </section>
  )
}

function ProjectIcon({ icon }: { icon: unknown }) {
  if (typeof icon === 'string' && icon) {
    return <span className="w-[13px] shrink-0 text-center text-[11px] leading-none">{icon}</span>
  }
  return <Folder size={13} strokeWidth={1.5} className="shrink-0 text-ink-3" />
}

function ProjectRow({ project, openCount }: FollowedProject<PanelProjectNode>) {
  return (
    <Link
      to="/tasks"
      search={{ project: project.id }}
      data-testid="tasks-panel-project"
      className="flex h-[26px] items-center gap-2 rounded-sm px-2 text-xs text-ink-2 no-underline transition-colors hover:bg-accent hover:text-ink-1 hover:no-underline"
    >
      <ProjectIcon icon={project.icon} />
      <span className="min-w-0 flex-1 truncate">
        {panelTitle(project.name, 'Untitled project')}
      </span>
      {openCount > 0 && <span className="shrink-0 text-[10px] text-ink-3">{openCount}</span>}
    </Link>
  )
}

function ProjectsSection({ projects }: { projects: Array<FollowedProject<PanelProjectNode>> }) {
  if (projects.length === 0) return null
  return (
    <section>
      <SectionHeading>Projects</SectionHeading>
      {projects.map(({ project, openCount }) => (
        <ProjectRow key={project.id} project={project} openCount={openCount} />
      ))}
    </section>
  )
}

function EmptyDashboard() {
  return (
    <div className="px-2 py-2 text-xs text-ink-3" data-testid="tasks-panel-empty">
      <p className="m-0">Nothing on your plate.</p>
      <p className="m-0 mt-1">
        Tasks assigned to you, in progress, or pinned appear here — pin any task or project from its
        editor or the Explorer.
      </p>
    </div>
  )
}

export function TasksDashboard(): JSX.Element {
  // `did` (not `identity?.did`): sessions restored from a stored author
  // DID have no in-memory identity object, and the panel must not blank.
  const { did } = useIdentity()
  const { data: tasks, loading } = useTasks({ includeCompleted: true })
  const { data: projects } = useQuery(ProjectSchema)
  const pinnedNodeIds = useWorkbench((state) => state.pinnedNodeIds)

  const selection = useMemo(
    () => selectTasksDashboard(tasks, did, pinnedNodeIds),
    [tasks, did, pinnedNodeIds]
  )
  const followedProjects = useMemo(
    () => selectFollowedProjects(projects, tasks, did, pinnedNodeIds),
    [projects, tasks, did, pinnedNodeIds]
  )

  if (loading) {
    return <p className="m-0 px-2 py-2 text-xs text-ink-3">Loading tasks…</p>
  }
  if (isDashboardEmpty(selection, followedProjects)) {
    return <EmptyDashboard />
  }

  return (
    <div className="flex flex-col" data-testid="tasks-panel-dashboard">
      <TaskSection title="Pinned" tasks={selection.pinned} />
      <TaskSection
        title="In progress"
        tasks={selection.inProgress}
        count={selection.inProgress.length}
      />
      <AssignedSection tasks={selection.assigned} />
      <ProjectsSection projects={followedProjects} />
    </div>
  )
}
