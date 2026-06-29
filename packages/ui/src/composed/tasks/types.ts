/**
 * Shared task display contracts.
 *
 * Presentational only: these components render the canonical Task node's
 * state and emit intents (toggle, open, restore). They never own task data —
 * every surface binds them to the same node via its own query layer, which is
 * what makes a task feel like one live object everywhere.
 * See docs/specs/PAGE_TASK_RECONCILIATION.md.
 */

/** Status ids understood by the renderers. Includes forward-compatible
 * category-based states (triage/backlog) ahead of the schema upgrade. */
export type TaskDisplayStatus =
  | 'triage'
  | 'backlog'
  | 'todo'
  | 'in-progress'
  | 'in-review'
  | 'done'
  | 'cancelled'

export type TaskDisplayPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface TaskDisplayData {
  id: string
  title: string
  completed: boolean
  status?: TaskDisplayStatus | (string & NonNullable<unknown>)
  priority?: TaskDisplayPriority | (string & NonNullable<unknown>)
  /** UTC ms timestamp */
  dueDate?: number | null
  /** Assignee DIDs */
  assignees?: string[]
  /** Human-readable identifier, e.g. "XN-142" */
  shortId?: string | null
  /** Fractional ordering key (manual order) */
  sortKey?: string | null
  /** Node create time (ms) — for ordering */
  createdAt?: number
  /** Node update time (ms) — for ordering */
  updatedAt?: number
  /** Count of linked external references (PRs, issues, designs) */
  referenceCount?: number
  /** Live GitHub state mirrored from linked references */
  github?: TaskGithubState
  /** Archived (soft-deleted) — renders as a tombstone */
  deleted?: boolean
}

/** PR/review/CI state mirrored onto the task from GitHub webhooks. */
export interface TaskGithubState {
  prState?: 'open' | 'draft' | 'merged' | 'closed'
  reviewState?: 'approved' | 'changes-requested'
  ciState?: 'pending' | 'passing' | 'failing'
}

/**
 * Derive a task's GitHub display state from its ExternalReference nodes.
 * Reference `metadata` is the JSON the hub webhook pipeline maintains
 * ({ prState, reviewState, ciState }); the most recently updated
 * pull-request reference wins.
 */
export function githubStateFromReferences(
  references: ReadonlyArray<{
    kind?: string | null
    metadata?: string | null
    updatedAt?: number
  }>
): TaskGithubState | undefined {
  const prRefs = references
    .filter((reference) => reference.kind === 'pull-request' && reference.metadata)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))

  for (const reference of prRefs) {
    try {
      const metadata = JSON.parse(reference.metadata ?? '{}') as Record<string, unknown>
      const state: TaskGithubState = {}

      if (
        metadata.prState === 'open' ||
        metadata.prState === 'draft' ||
        metadata.prState === 'merged' ||
        metadata.prState === 'closed'
      ) {
        state.prState = metadata.prState
      }
      if (metadata.reviewState === 'approved' || metadata.reviewState === 'changes-requested') {
        state.reviewState = metadata.reviewState
      }
      if (
        metadata.ciState === 'pending' ||
        metadata.ciState === 'passing' ||
        metadata.ciState === 'failing'
      ) {
        state.ciState = metadata.ciState
      }

      if (Object.keys(state).length > 0) return state
    } catch {
      // Malformed metadata never breaks rendering.
    }
  }

  return undefined
}

export interface TaskIntentHandlers {
  /** Toggle completion. Absent = read-only checkbox. */
  onToggleCompleted?: (taskId: string, completed: boolean) => void
  /**
   * Change the task's workflow status. When wired, the status glyph becomes a
   * dropdown of every status (rather than a complete/incomplete toggle), so a
   * task's status is editable in place wherever it renders. The chosen status
   * carries its derived `completed` flag so hosts stay one mutation call —
   * matching TaskDetailForm's status picker. Takes precedence over
   * `onToggleCompleted` for the status glyph when both are supplied.
   */
  onStatusChange?: (taskId: string, status: string, completed: boolean) => void
  /** Open the full task (peek/detail). The "open original" affordance. */
  onOpen?: (taskId: string) => void
  /** Restore an archived task from its tombstone. */
  onRestore?: (taskId: string) => void
}

export interface TaskStatusMeta {
  id: TaskDisplayStatus
  name: string
  /** Workflow category — `completed` is derived from this, never stored twice */
  category: 'triage' | 'backlog' | 'unstarted' | 'started' | 'completed' | 'cancelled'
  /** Tailwind text color class for the status icon */
  colorClass: string
}

export const TASK_STATUS_META: Record<TaskDisplayStatus, TaskStatusMeta> = {
  triage: { id: 'triage', name: 'Triage', category: 'triage', colorClass: 'text-warning' },
  backlog: {
    id: 'backlog',
    name: 'Backlog',
    category: 'backlog',
    colorClass: 'text-foreground-muted'
  },
  todo: { id: 'todo', name: 'To Do', category: 'unstarted', colorClass: 'text-foreground-muted' },
  'in-progress': {
    id: 'in-progress',
    name: 'In Progress',
    category: 'started',
    colorClass: 'text-info'
  },
  'in-review': {
    id: 'in-review',
    name: 'In Review',
    category: 'started',
    colorClass: 'text-success'
  },
  done: { id: 'done', name: 'Done', category: 'completed', colorClass: 'text-success' },
  cancelled: {
    id: 'cancelled',
    name: 'Cancelled',
    category: 'cancelled',
    colorClass: 'text-foreground-muted'
  }
}

export function getTaskStatusMeta(status: string | undefined): TaskStatusMeta {
  return TASK_STATUS_META[(status ?? 'todo') as TaskDisplayStatus] ?? TASK_STATUS_META.todo
}

/** Whether a status counts as completed (drives the derived checkbox). */
export function isCompletedStatus(status: string | undefined): boolean {
  const category = getTaskStatusMeta(status).category
  return category === 'completed' || category === 'cancelled'
}

export type DueDateUrgency = 'overdue' | 'today' | 'upcoming' | 'none'

export interface DueDateInfo {
  label: string
  urgency: DueDateUrgency
}

/** Format a UTC due-date timestamp relative to `now` (defaults to wall clock). */
export function formatDueDate(dueDate: number | null | undefined, now = Date.now()): DueDateInfo {
  if (dueDate == null) return { label: '', urgency: 'none' }

  const due = new Date(dueDate)
  const current = new Date(now)
  const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())
  const today = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate())
  const diffDays = Math.round((dueDay - today) / 86_400_000)

  const label = due.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  })

  if (diffDays < 0) return { label, urgency: 'overdue' }
  if (diffDays === 0) return { label: 'Today', urgency: 'today' }
  return { label, urgency: 'upcoming' }
}

export const DUE_DATE_URGENCY_CLASS: Record<DueDateUrgency, string> = {
  overdue: 'text-destructive',
  today: 'text-warning',
  upcoming: 'text-foreground-muted',
  none: 'text-foreground-muted'
}
