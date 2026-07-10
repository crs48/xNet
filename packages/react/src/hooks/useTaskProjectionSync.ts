/**
 * useTaskProjectionSync - Reconcile a surface's task items with Task nodes.
 *
 * Shared core behind usePageTaskSync (page checklists) and
 * useCanvasTaskSync (canvas checklist objects). The surface remains the
 * inline editing projection while Task nodes stay the canonical
 * cross-surface records. Reconciliation semantics are specified in
 * docs/specs/PAGE_TASK_RECONCILIATION.md (claim-or-create, archive on
 * removal, never hard-delete).
 */
import type { InferCreateProps } from '@xnetjs/data'
import { ExternalReferenceSchema, TaskSchema, isCompletedTaskStatus } from '@xnetjs/data'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutate } from './useMutate'
import { useQuery } from './useQuery'

export interface TaskProjectionReferenceInput {
  url: string
  provider: string | null
  kind: string | null
  refId: string | null
  title: string | null
  subtitle: string | null
  icon: string | null
  embedUrl: string | null
  metadata: string
}

export interface TaskProjectionInput {
  taskId: string
  /** Surface-specific anchor (page block id or canvas object id) */
  blockId: string
  title: string
  completed: boolean
  parentTaskId: string | null
  sortKey: string
  assignees: string[]
  dueDate: string | null
  references: TaskProjectionReferenceInput[]
}

export type TaskProjectionHost = 'page' | 'canvas'

export interface UseTaskProjectionSyncOptions {
  /** Which Task relation property anchors tasks to this surface */
  host: TaskProjectionHost
  /** The hosting node id (page id or canvas id); null disables sync */
  hostId: string | null
  debounceMs?: number
}

export interface UseTaskProjectionSyncResult {
  handleTasksChange: (tasks: TaskProjectionInput[]) => void
  syncing: boolean
  error: Error | null
}

const DEFAULT_DEBOUNCE_MS = 250

/**
 * Title the editor extraction falls back to for items with no text (see
 * `extractTaskBody` in @xnetjs/editor's page-tasks extension). Deleting an
 * item usually empties its text one transaction before the node is removed,
 * so a debounced snapshot can carry this placeholder for a task that still
 * has a real title — never let it overwrite one (exploration 0296).
 */
const UNTITLED_TASK_PLACEHOLDER = 'Untitled task'

type ExternalReferenceCreate = InferCreateProps<(typeof ExternalReferenceSchema)['_properties']>
type ExternalReferenceProvider = NonNullable<ExternalReferenceCreate['provider']>
type ExternalReferenceKind = NonNullable<ExternalReferenceCreate['kind']>
type TaskCreate = InferCreateProps<(typeof TaskSchema)['_properties']>
type TaskStatus = NonNullable<TaskCreate['status']>
type TaskAssignee = Exclude<TaskCreate['assignee'], undefined>
type TaskAssignees = NonNullable<TaskCreate['assignees']>

function arraysEqual(a: string[] | undefined, b: string[]): boolean {
  if (!Array.isArray(a)) return b.length === 0
  if (a.length !== b.length) return false

  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false
  }

  return true
}

function stableHash(input: string): string {
  let hash = 2166136261

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

function computeExternalReferenceId(
  taskId: string,
  reference: TaskProjectionReferenceInput
): string {
  const identity = [
    taskId,
    reference.provider ?? 'generic',
    reference.kind ?? 'link',
    reference.refId ?? '',
    reference.url
  ].join('|')

  return `external_reference_${stableHash(identity)}`
}

function getNextStatus(currentStatus: TaskStatus | undefined, completed: boolean): TaskStatus {
  if (completed) return 'done'
  // Un-completing any completed/cancelled-category status returns to todo;
  // active statuses (in-progress, in-review, triage, backlog) are preserved.
  if (!currentStatus || isCompletedTaskStatus(currentStatus)) return 'todo'
  return currentStatus
}

function isDid(value: string): value is TaskAssignee {
  return /^did:[a-z]+:[a-zA-Z0-9._:-]+$/.test(value)
}

function normalizeAssignees(assignees: string[]): TaskAssignees {
  return Array.from(new Set(assignees)).filter(isDid)
}

/**
 * "YYYY-MM-DD" → UTC-midnight ms. Mirrors the canonical `isoToDueDateMs`
 * contract in @xnetjs/ui (exploration 0172): the sync layer must not depend
 * on the UI kit, so the conversion is duplicated here and the shared
 * timezone invariant is enforced by tests in both packages. Keep UTC-only.
 */
function toDateTimestamp(date: string | null): number | undefined {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined

  const [year, month, day] = date.split('-').map(Number)
  const timestamp = Date.UTC(year, month - 1, day)
  if (Number.isNaN(timestamp)) return undefined

  const normalized = new Date(timestamp)
  if (
    normalized.getUTCFullYear() !== year ||
    normalized.getUTCMonth() !== month - 1 ||
    normalized.getUTCDate() !== day
  ) {
    return undefined
  }

  return timestamp
}

function normalizeProvider(provider: string | null): ExternalReferenceProvider {
  switch (provider) {
    case 'github':
    case 'figma':
    case 'youtube':
    case 'loom':
    case 'vimeo':
    case 'codesandbox':
    case 'spotify':
    case 'twitter':
    case 'instagram':
    case 'tiktok':
      return provider
    default:
      return 'generic'
  }
}

function normalizeKind(kind: string | null): ExternalReferenceKind {
  switch (kind) {
    case 'issue':
    case 'pull-request':
    case 'design':
    case 'video':
    case 'sandbox':
    case 'social':
    case 'audio':
      return kind
    default:
      return 'link'
  }
}

export function useTaskProjectionSync({
  host,
  hostId,
  debounceMs = DEFAULT_DEBOUNCE_MS
}: UseTaskProjectionSyncOptions): UseTaskProjectionSyncResult {
  const { create, update, remove, restore } = useMutate()
  const disabledHostId = `__${host}_task_sync_disabled__`
  const { data: existingTasks } = useQuery(TaskSchema, {
    where:
      host === 'page' ? { page: hostId ?? disabledHostId } : { canvas: hostId ?? disabledHostId },
    includeDeleted: true
  })
  const taskSnapshotsRef = useRef<TaskProjectionInput[]>([])
  // The host whose surface has published a snapshot. Reconciliation must not
  // run before the editor's first publish (an empty default snapshot would
  // archive every hosted task), nor against a previous host's snapshot after
  // navigation (exploration 0296).
  const snapshotHostRef = useRef<string | null>(null)
  const syncRunIdRef = useRef(0)
  const [revision, setRevision] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const existingTaskMap = useMemo(() => {
    return new Map(existingTasks.map((task) => [task.id, task]))
  }, [existingTasks])

  const handleTasksChange = useCallback(
    (tasks: TaskProjectionInput[]) => {
      taskSnapshotsRef.current = tasks
      snapshotHostRef.current = hostId
      setRevision((value) => value + 1)
    },
    [hostId]
  )

  useEffect(() => {
    if (!hostId) return
    if (snapshotHostRef.current !== hostId) return

    let cancelled = false

    const timer = setTimeout(() => {
      const run = async () => {
        const runId = syncRunIdRef.current + 1
        syncRunIdRef.current = runId
        const currentTasks = taskSnapshotsRef.current
        const nextTaskIds = new Set(currentTasks.map((task) => task.taskId))
        // Tasks unknown to this surface: either genuinely new (create) or
        // hosted elsewhere / previously archived (claim = restore + update).
        // See docs/specs/PAGE_TASK_RECONCILIATION.md.
        const tasksToClaimOrCreate: Array<{
          id: string
          data: TaskCreate
        }> = []
        const tasksToRestore: string[] = []
        const taskUpdates: Array<{ id: string; data: Record<string, unknown> }> = []
        const taskDeletes: string[] = []
        const referenceUpserts: Array<{
          id: string
          data: ExternalReferenceCreate
        }> = []

        const hostFields: Partial<TaskCreate> =
          host === 'page' ? { page: hostId, source: 'page' } : { canvas: hostId, source: 'canvas' }

        for (const task of currentTasks) {
          const existingTask = existingTaskMap.get(task.taskId)
          const assignees = normalizeAssignees(task.assignees)
          const dueDate = toDateTimestamp(task.dueDate)
          const primaryAssignee = assignees[0]
          const nextReferenceUpserts: Array<{
            id: string
            data: ExternalReferenceCreate
          }> = []
          const referenceIds = task.references.map((reference) => {
            const id = computeExternalReferenceId(task.taskId, reference)

            nextReferenceUpserts.push({
              id,
              data: {
                url: reference.url,
                provider: normalizeProvider(reference.provider),
                kind: normalizeKind(reference.kind),
                ...(reference.refId ? { refId: reference.refId } : {}),
                title: reference.title ?? reference.refId ?? reference.url,
                ...(reference.subtitle ? { subtitle: reference.subtitle } : {}),
                ...(reference.icon ? { icon: reference.icon } : {}),
                ...(reference.embedUrl ? { embedUrl: reference.embedUrl } : {}),
                metadata: reference.metadata
              }
            })

            return id
          })

          if (!existingTask) {
            tasksToClaimOrCreate.push({
              id: task.taskId,
              data: {
                title: task.title,
                completed: task.completed,
                status: getNextStatus(undefined, task.completed),
                parent: task.parentTaskId ?? undefined,
                ...hostFields,
                anchorBlockId: task.blockId,
                sortKey: task.sortKey,
                assignee: primaryAssignee,
                assignees,
                dueDate,
                references: referenceIds
              }
            })
            referenceUpserts.push(...nextReferenceUpserts)
            continue
          }

          if (existingTask.deleted) {
            tasksToRestore.push(task.taskId)
          }

          const nextStatus = getNextStatus(
            typeof existingTask.status === 'string'
              ? (existingTask.status as TaskStatus)
              : undefined,
            task.completed
          )

          const updateData: Record<string, unknown> = {}
          const nextDueDate = dueDate
          const nextPrimaryAssignee = primaryAssignee

          const placeholderOverRealTitle =
            task.title === UNTITLED_TASK_PLACEHOLDER &&
            typeof existingTask.title === 'string' &&
            existingTask.title.length > 0
          if (existingTask.title !== task.title && !placeholderOverRealTitle) {
            updateData.title = task.title
          }
          if (existingTask.completed !== task.completed) updateData.completed = task.completed
          if (existingTask.status !== nextStatus) updateData.status = nextStatus
          if ((existingTask.parent ?? null) !== task.parentTaskId) {
            updateData.parent = task.parentTaskId ?? undefined
          }
          if (host === 'page' && existingTask.page !== hostId) updateData.page = hostId
          if (host === 'canvas' && existingTask.canvas !== hostId) updateData.canvas = hostId
          if (existingTask.anchorBlockId !== task.blockId) updateData.anchorBlockId = task.blockId
          if (existingTask.sortKey !== task.sortKey) updateData.sortKey = task.sortKey
          if (existingTask.source !== host) updateData.source = host
          if (!arraysEqual(existingTask.assignees, assignees)) {
            updateData.assignees = assignees
          }
          if ((existingTask.assignee ?? undefined) !== nextPrimaryAssignee) {
            updateData.assignee = nextPrimaryAssignee
          }
          if ((existingTask.dueDate ?? undefined) !== nextDueDate) {
            updateData.dueDate = nextDueDate
          }
          if (!arraysEqual(existingTask.references, referenceIds)) {
            updateData.references = referenceIds
            referenceUpserts.push(...nextReferenceUpserts)
          }

          if (Object.keys(updateData).length > 0) {
            taskUpdates.push({
              id: task.taskId,
              data: updateData
            })
          }
        }

        for (const existingTask of existingTasks) {
          if (existingTask.deleted) continue
          if (nextTaskIds.has(existingTask.id)) continue

          taskDeletes.push(existingTask.id)
        }

        if (
          tasksToClaimOrCreate.length === 0 &&
          tasksToRestore.length === 0 &&
          taskUpdates.length === 0 &&
          taskDeletes.length === 0 &&
          referenceUpserts.length === 0
        ) {
          if (!cancelled) {
            setSyncing(false)
            setError(null)
          }
          return
        }

        if (!cancelled) {
          setSyncing(true)
          setError(null)
        }

        try {
          for (const reference of referenceUpserts) {
            if (cancelled || runId !== syncRunIdRef.current) return

            try {
              await update(ExternalReferenceSchema, reference.id, reference.data)
            } catch {
              await create(ExternalReferenceSchema, reference.data, reference.id)
            }
          }

          for (const taskId of tasksToRestore) {
            if (cancelled || runId !== syncRunIdRef.current) return
            await restore(taskId)
          }

          for (const task of tasksToClaimOrCreate) {
            if (cancelled || runId !== syncRunIdRef.current) return

            // Claim-or-create: restore succeeds iff the node exists anywhere
            // (possibly archived by its previous host surface). On success the
            // follow-up update moves it to this surface; on failure the task
            // is genuinely new and gets created with the provided id.
            let claimed = false
            try {
              await restore(task.id)
              claimed = true
            } catch {
              claimed = false
            }

            if (cancelled || runId !== syncRunIdRef.current) return

            if (claimed) {
              // The node lives elsewhere, so there is nothing local to diff
              // against — host fields and surface-authoritative layout must be
              // forced, but a placeholder title must not clobber a real title
              // we cannot see (exploration 0296).
              if (task.data.title === UNTITLED_TASK_PLACEHOLDER) {
                const { title: _title, ...dataWithoutTitle } = task.data
                await update(TaskSchema, task.id, dataWithoutTitle)
              } else {
                await update(TaskSchema, task.id, task.data)
              }
            } else {
              await create(TaskSchema, task.data, task.id)
            }
          }

          for (const task of taskUpdates) {
            if (cancelled || runId !== syncRunIdRef.current) return
            await update(TaskSchema, task.id, task.data)
          }

          for (const taskId of taskDeletes) {
            if (cancelled || runId !== syncRunIdRef.current) return
            await remove(taskId)
          }
          if (!cancelled) {
            setSyncing(false)
          }
        } catch (err) {
          if (!cancelled) {
            setSyncing(false)
            setError(err instanceof Error ? err : new Error(String(err)))
          }
        }
      }

      void run()
    }, debounceMs)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [
    create,
    debounceMs,
    existingTaskMap,
    existingTasks,
    host,
    hostId,
    remove,
    restore,
    revision,
    update
  ])

  return {
    handleTasksChange,
    syncing,
    error
  }
}
