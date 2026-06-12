/**
 * Pure selection logic for the left-panel Tasks dashboard.
 *
 * The panel is a personal triage view: pinned tasks first, then what you
 * have in flight, then a short priority-ordered queue of everything else
 * assigned to you, then the projects you follow. "Following" a project
 * means pinning it in the Explorer, leading it, or having open tasks in
 * it — there is no separate follow primitive.
 */
import { getTaskStatusCategory } from '@xnetjs/data'

export interface PanelTask {
  id: string
  completed?: boolean
  status?: string
  priority?: string
  dueDate?: number
  assignee?: string
  assignees?: readonly string[]
  project?: string
  updatedAt: number
}

export interface PanelProject {
  id: string
  lead?: string
}

export interface TasksDashboardSelection<T extends PanelTask> {
  pinned: T[]
  inProgress: T[]
  assigned: T[]
}

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

function priorityRank(priority: string | undefined): number {
  return PRIORITY_RANK[priority ?? 'medium'] ?? 2
}

/** Priority first, then nearest due date (undated last), then recency. */
export function compareByUrgency(a: PanelTask, b: PanelTask): number {
  const rank = priorityRank(a.priority) - priorityRank(b.priority)
  if (rank !== 0) return rank
  const aDue = a.dueDate ?? Number.POSITIVE_INFINITY
  const bDue = b.dueDate ?? Number.POSITIVE_INFINITY
  if (aDue !== bDue) return aDue - bDue
  return b.updatedAt - a.updatedAt
}

export function isAssignedTo(task: PanelTask, did: string | null): boolean {
  if (!did) return false
  if (task.assignee === did) return true
  return Array.isArray(task.assignees) && task.assignees.includes(did)
}

/**
 * Split tasks into the dashboard's three task sections. A task appears in
 * exactly one: pinned wins, then in-flight (started category), then the
 * remaining open assignments.
 */
export function selectTasksDashboard<T extends PanelTask>(
  tasks: readonly T[],
  did: string | null,
  pinnedNodeIds: readonly string[]
): TasksDashboardSelection<T> {
  const pinnedIds = new Set(pinnedNodeIds)
  const pinned: T[] = []
  const inProgress: T[] = []
  const assigned: T[] = []

  for (const task of tasks) {
    if (pinnedIds.has(task.id)) {
      pinned.push(task)
      continue
    }
    if (task.completed || !isAssignedTo(task, did)) continue
    if (getTaskStatusCategory(task.status) === 'started') {
      inProgress.push(task)
    } else {
      assigned.push(task)
    }
  }

  pinned.sort(compareByUrgency)
  inProgress.sort(compareByUrgency)
  assigned.sort(compareByUrgency)
  return { pinned, inProgress, assigned }
}

export interface FollowedProject<P extends PanelProject> {
  project: P
  /** Open (incomplete) tasks in the project, anyone's */
  openCount: number
}

/** True when no section has anything to show (renders the hint state). */
export function isDashboardEmpty(
  selection: TasksDashboardSelection<PanelTask>,
  followedProjects: ReadonlyArray<FollowedProject<PanelProject>>
): boolean {
  return (
    selection.pinned.length === 0 &&
    selection.inProgress.length === 0 &&
    selection.assigned.length === 0 &&
    followedProjects.length === 0
  )
}

/** Projects you pinned, lead, or have open tasks in — with open counts. */
export function selectFollowedProjects<P extends PanelProject>(
  projects: readonly P[],
  tasks: readonly PanelTask[],
  did: string | null,
  pinnedNodeIds: readonly string[]
): Array<FollowedProject<P>> {
  const pinnedIds = new Set(pinnedNodeIds)
  const openByProject = new Map<string, number>()
  const myProjects = new Set<string>()

  for (const task of tasks) {
    if (!task.project || task.completed) continue
    openByProject.set(task.project, (openByProject.get(task.project) ?? 0) + 1)
    if (isAssignedTo(task, did)) myProjects.add(task.project)
  }

  return projects
    .filter(
      (project) =>
        pinnedIds.has(project.id) || (did && project.lead === did) || myProjects.has(project.id)
    )
    .map((project) => ({ project, openCount: openByProject.get(project.id) ?? 0 }))
    .sort((a, b) => b.openCount - a.openCount)
}
