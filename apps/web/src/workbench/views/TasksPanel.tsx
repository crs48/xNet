/**
 * Left-panel Tasks dashboard (replaces the bare My Tasks list).
 *
 * A personal mini-dashboard: pinned tasks, what you have in flight, a
 * short priority-ordered queue of your assignments (paginated), and the
 * projects you follow. Rows deep-link into the Tasks surface
 * (`/tasks?task=` opens the inline editor; `/tasks?project=` scopes the
 * board) and stay draggable onto canvases.
 */
import { Link } from '@tanstack/react-router'
import { CANVAS_INTERNAL_NODE_MIME, serializeCanvasInternalNodeDragData } from '@xnetjs/canvas'
import { ProjectSchema, TaskSchema } from '@xnetjs/data'
import { useIdentity, useQuery, useTasks } from '@xnetjs/react'
import {
  TaskStatusIcon,
  formatDueDate,
  setNodeTransfer,
  DUE_DATE_URGENCY_CLASS,
  cn
} from '@xnetjs/ui'
import { Folder } from 'lucide-react'
import { useMemo, useState, type DragEvent, type JSX, type ReactNode } from 'react'
import { useWorkbench } from '../state'
import { selectFollowedProjects, selectTasksDashboard, type PanelTask } from './tasks-panel-data'

const ASSIGNED_PAGE_SIZE = 3

type PanelTaskNode = PanelTask & { title?: unknown }

function setTaskDragData(event: DragEvent, task: PanelTaskNode): void {
  const title = typeof task.title === 'string' ? task.title : 'Task'
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

function PanelTaskRow({ task }: { task: PanelTaskNode }) {
  const due = formatDueDate(task.dueDate ?? null)

  return (
    <Link
      to="/tasks"
      search={{ task: task.id }}
      draggable
      onDragStart={(event) => setTaskDragData(event, task)}
      data-testid="tasks-panel-row"
      className="flex h-[26px] items-center gap-2 rounded-sm px-2 text-xs text-ink-2 no-underline transition-colors hover:bg-accent hover:text-ink-1 hover:no-underline"
      title={typeof task.title === 'string' ? task.title : undefined}
    >
      <TaskStatusIcon status={task.completed ? 'done' : task.status} size={12} />
      <span className={cn('min-w-0 flex-1 truncate', task.completed && 'line-through text-ink-3')}>
        {typeof task.title === 'string' && task.title ? task.title : 'Untitled task'}
      </span>
      {due.urgency !== 'none' && (
        <span className={cn('shrink-0 text-[10px]', DUE_DATE_URGENCY_CLASS[due.urgency])}>
          {due.label}
        </span>
      )}
    </Link>
  )
}

export function TasksDashboard(): JSX.Element {
  // `did` (not `identity?.did`): sessions restored from a stored author
  // DID have no in-memory identity object, and the panel must not blank.
  const { did } = useIdentity()
  const { data: tasks, loading } = useTasks({ includeCompleted: true })
  const { data: projects } = useQuery(ProjectSchema)
  const pinnedNodeIds = useWorkbench((state) => state.pinnedNodeIds)
  const [assignedShown, setAssignedShown] = useState(ASSIGNED_PAGE_SIZE)

  const { pinned, inProgress, assigned } = useMemo(
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

  const visibleAssigned = assigned.slice(0, assignedShown)
  const empty =
    pinned.length === 0 &&
    inProgress.length === 0 &&
    assigned.length === 0 &&
    followedProjects.length === 0

  if (empty) {
    return (
      <div className="px-2 py-2 text-xs text-ink-3" data-testid="tasks-panel-empty">
        <p className="m-0">Nothing on your plate.</p>
        <p className="m-0 mt-1">
          Tasks assigned to you, in progress, or pinned appear here — pin any task or project from
          its editor or the Explorer.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col" data-testid="tasks-panel-dashboard">
      {pinned.length > 0 && (
        <section>
          <SectionHeading>Pinned</SectionHeading>
          {pinned.map((task) => (
            <PanelTaskRow key={task.id} task={task} />
          ))}
        </section>
      )}

      {inProgress.length > 0 && (
        <section>
          <SectionHeading count={inProgress.length}>In progress</SectionHeading>
          {inProgress.map((task) => (
            <PanelTaskRow key={task.id} task={task} />
          ))}
        </section>
      )}

      <section>
        <SectionHeading count={assigned.length}>Assigned to me</SectionHeading>
        {assigned.length === 0 ? (
          <p className="m-0 px-2 pb-1 text-xs text-ink-3">No other open assignments.</p>
        ) : (
          <>
            {visibleAssigned.map((task) => (
              <PanelTaskRow key={task.id} task={task} />
            ))}
            {assigned.length > assignedShown && (
              <button
                type="button"
                data-testid="tasks-panel-show-more"
                onClick={() => setAssignedShown((shown) => shown + 5)}
                className="flex h-[24px] w-full items-center rounded-sm px-2 text-[11px] text-ink-3 transition-colors hover:bg-accent hover:text-ink-1"
              >
                Show more ({assigned.length - assignedShown} hidden)
              </button>
            )}
          </>
        )}
      </section>

      {followedProjects.length > 0 && (
        <section>
          <SectionHeading>Projects</SectionHeading>
          {followedProjects.map(({ project, openCount }) => (
            <Link
              key={project.id}
              to="/tasks"
              search={{ project: project.id }}
              data-testid="tasks-panel-project"
              className="flex h-[26px] items-center gap-2 rounded-sm px-2 text-xs text-ink-2 no-underline transition-colors hover:bg-accent hover:text-ink-1 hover:no-underline"
            >
              {typeof project.icon === 'string' && project.icon ? (
                <span className="w-[13px] shrink-0 text-center text-[11px] leading-none">
                  {project.icon}
                </span>
              ) : (
                <Folder size={13} strokeWidth={1.5} className="shrink-0 text-ink-3" />
              )}
              <span className="min-w-0 flex-1 truncate">
                {typeof project.name === 'string' && project.name
                  ? project.name
                  : 'Untitled project'}
              </span>
              {openCount > 0 && (
                <span className="shrink-0 text-[10px] text-ink-3">{openCount}</span>
              )}
            </Link>
          ))}
        </section>
      )}
    </div>
  )
}
