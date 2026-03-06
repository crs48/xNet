/**
 * usePageTaskSync - Reconcile page task rows with Task nodes.
 *
 * Checklist items inside page editors remain the inline editing surface, while
 * Task nodes stay the canonical cross-surface records for querying and reuse.
 */
import type { InferCreateProps } from '@xnetjs/data'
import { ExternalReferenceSchema, TaskSchema } from '@xnetjs/data'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutate } from './useMutate'
import { useQuery } from './useQuery'

export interface PageTaskReferenceInput {
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

export interface PageTaskInput {
  taskId: string
  blockId: string
  title: string
  completed: boolean
  parentTaskId: string | null
  sortKey: string
  references: PageTaskReferenceInput[]
}

export interface UsePageTaskSyncOptions {
  pageId: string | null
  debounceMs?: number
}

export interface UsePageTaskSyncResult {
  handleTasksChange: (tasks: PageTaskInput[]) => void
  syncing: boolean
  error: Error | null
}

const DEFAULT_DEBOUNCE_MS = 250

type ExternalReferenceCreate = InferCreateProps<(typeof ExternalReferenceSchema)['_properties']>
type ExternalReferenceProvider = NonNullable<ExternalReferenceCreate['provider']>
type ExternalReferenceKind = NonNullable<ExternalReferenceCreate['kind']>
type TaskCreate = InferCreateProps<(typeof TaskSchema)['_properties']>
type TaskStatus = NonNullable<TaskCreate['status']>

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

function computeExternalReferenceId(taskId: string, reference: PageTaskReferenceInput): string {
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
  if (!currentStatus || currentStatus === 'done') return 'todo'
  return currentStatus
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

export function usePageTaskSync({
  pageId,
  debounceMs = DEFAULT_DEBOUNCE_MS
}: UsePageTaskSyncOptions): UsePageTaskSyncResult {
  const { create, update, remove, restore } = useMutate()
  const { data: existingTasks } = useQuery(TaskSchema, {
    where: { page: pageId ?? '__page_task_sync_disabled__' },
    includeDeleted: true
  })
  const taskSnapshotsRef = useRef<PageTaskInput[]>([])
  const [revision, setRevision] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const existingTaskMap = useMemo(() => {
    return new Map(existingTasks.map((task) => [task.id, task]))
  }, [existingTasks])

  const handleTasksChange = useCallback((tasks: PageTaskInput[]) => {
    taskSnapshotsRef.current = tasks
    setRevision((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!pageId) return

    let cancelled = false

    const timer = setTimeout(() => {
      const run = async () => {
        const currentTasks = taskSnapshotsRef.current
        const nextTaskIds = new Set(currentTasks.map((task) => task.taskId))
        const tasksToCreate: Array<{
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

        for (const task of currentTasks) {
          const existingTask = existingTaskMap.get(task.taskId)
          const referenceIds = task.references.map((reference) => {
            const id = computeExternalReferenceId(task.taskId, reference)

            referenceUpserts.push({
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
            tasksToCreate.push({
              id: task.taskId,
              data: {
                title: task.title,
                completed: task.completed,
                status: getNextStatus(undefined, task.completed),
                parent: task.parentTaskId ?? undefined,
                page: pageId,
                anchorBlockId: task.blockId,
                sortKey: task.sortKey,
                source: 'page',
                references: referenceIds
              }
            })
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

          if (existingTask.title !== task.title) updateData.title = task.title
          if (existingTask.completed !== task.completed) updateData.completed = task.completed
          if (existingTask.status !== nextStatus) updateData.status = nextStatus
          if ((existingTask.parent ?? null) !== task.parentTaskId) {
            updateData.parent = task.parentTaskId ?? undefined
          }
          if (existingTask.page !== pageId) updateData.page = pageId
          if (existingTask.anchorBlockId !== task.blockId) updateData.anchorBlockId = task.blockId
          if (existingTask.sortKey !== task.sortKey) updateData.sortKey = task.sortKey
          if (existingTask.source !== 'page') updateData.source = 'page'
          if (!arraysEqual(existingTask.references, referenceIds)) {
            updateData.references = referenceIds
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
          tasksToCreate.length === 0 &&
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
          for (const taskId of tasksToRestore) {
            await restore(taskId)
          }

          for (const task of tasksToCreate) {
            await create(TaskSchema, task.data, task.id)
          }

          for (const task of taskUpdates) {
            await update(TaskSchema, task.id, task.data)
          }

          for (const taskId of taskDeletes) {
            await remove(taskId)
          }

          for (const reference of referenceUpserts) {
            try {
              await update(ExternalReferenceSchema, reference.id, reference.data)
            } catch {
              await create(ExternalReferenceSchema, reference.data, reference.id)
            }
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
    pageId,
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
