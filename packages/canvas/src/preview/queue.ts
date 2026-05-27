/**
 * Preview worker queue keyed by source version and content hash.
 */

import type { CanvasPreviewSourceRef, CanvasPreviewTier } from './model'
import type { CanvasObjectKind } from '../types'

export type CanvasPreviewQueueJobStatus = 'queued' | 'generating' | 'error'

export type CanvasPreviewQueueJobInput = {
  objectId: string
  objectKind: CanvasObjectKind
  tier: CanvasPreviewTier
  sourceRef?: CanvasPreviewSourceRef
  priority?: number
  enqueuedAt?: number
}

export type CanvasPreviewQueueJob = Required<
  Pick<CanvasPreviewQueueJobInput, 'objectId' | 'objectKind' | 'tier' | 'priority'>
> &
  Pick<CanvasPreviewQueueJobInput, 'sourceRef'> & {
    key: string
    status: CanvasPreviewQueueJobStatus
    attempts: number
    enqueuedAt: number
    updatedAt: number
    error?: string
  }

export type CanvasPreviewQueueState = {
  jobs: Record<string, CanvasPreviewQueueJob>
  order: string[]
}

export type CanvasPreviewQueueClaimResult = {
  state: CanvasPreviewQueueState
  job: CanvasPreviewQueueJob | null
}

export type CanvasPreviewQueueFailureOptions = {
  error: unknown
  maxAttempts?: number
  now?: number
}

const DEFAULT_MAX_ATTEMPTS = 3

function stringifyPreviewKeyPart(value: string | number | undefined, fallback: string): string {
  return value === undefined ? fallback : String(value)
}

function normalizeQueueState(state?: CanvasPreviewQueueState): CanvasPreviewQueueState {
  return (
    state ?? {
      jobs: {},
      order: []
    }
  )
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function sortQueueCandidates(jobs: readonly CanvasPreviewQueueJob[]): CanvasPreviewQueueJob[] {
  return [...jobs].sort((a, b) => {
    const priorityDelta = b.priority - a.priority
    if (priorityDelta !== 0) {
      return priorityDelta
    }

    const enqueuedDelta = a.enqueuedAt - b.enqueuedAt
    if (enqueuedDelta !== 0) {
      return enqueuedDelta
    }

    return a.key.localeCompare(b.key)
  })
}

function omitQueueJob(
  jobs: Record<string, CanvasPreviewQueueJob>,
  key: string
): Record<string, CanvasPreviewQueueJob> {
  return Object.fromEntries(Object.entries(jobs).filter(([candidateKey]) => candidateKey !== key))
}

export function createCanvasPreviewQueueState(): CanvasPreviewQueueState {
  return normalizeQueueState()
}

export function getCanvasPreviewJobKey(input: CanvasPreviewQueueJobInput): string {
  const source = input.sourceRef
  const sourceId = source?.nodeId ?? input.objectId
  const sourceSchema = source?.schemaId ?? input.objectKind

  return [
    'preview',
    input.tier,
    sourceId,
    sourceSchema,
    stringifyPreviewKeyPart(source?.version, '0'),
    stringifyPreviewKeyPart(source?.contentHash, 'none')
  ].join(':')
}

export function enqueueCanvasPreviewJob(
  state: CanvasPreviewQueueState | undefined,
  input: CanvasPreviewQueueJobInput
): CanvasPreviewQueueState {
  const current = normalizeQueueState(state)
  const key = getCanvasPreviewJobKey(input)
  const existing = current.jobs[key]
  const enqueuedAt = input.enqueuedAt ?? Date.now()
  const priority = input.priority ?? 0

  if (existing) {
    return {
      jobs: {
        ...current.jobs,
        [key]: {
          ...existing,
          objectId: input.objectId,
          objectKind: input.objectKind,
          sourceRef: input.sourceRef,
          priority: Math.max(existing.priority, priority),
          status: existing.status === 'generating' ? 'generating' : 'queued',
          error: undefined,
          updatedAt: enqueuedAt
        }
      },
      order: current.order
    }
  }

  return {
    jobs: {
      ...current.jobs,
      [key]: {
        key,
        objectId: input.objectId,
        objectKind: input.objectKind,
        tier: input.tier,
        sourceRef: input.sourceRef,
        priority,
        status: 'queued',
        attempts: 0,
        enqueuedAt,
        updatedAt: enqueuedAt
      }
    },
    order: [...current.order, key]
  }
}

export function claimNextCanvasPreviewJob(
  state: CanvasPreviewQueueState | undefined,
  now = Date.now()
): CanvasPreviewQueueClaimResult {
  const current = normalizeQueueState(state)
  const nextJob = sortQueueCandidates(
    current.order
      .map((key) => current.jobs[key])
      .filter((job): job is CanvasPreviewQueueJob => job !== undefined && job.status === 'queued')
  )[0]

  if (!nextJob) {
    return {
      state: current,
      job: null
    }
  }

  const claimedJob: CanvasPreviewQueueJob = {
    ...nextJob,
    status: 'generating',
    attempts: nextJob.attempts + 1,
    updatedAt: now
  }

  return {
    state: {
      jobs: {
        ...current.jobs,
        [claimedJob.key]: claimedJob
      },
      order: current.order
    },
    job: claimedJob
  }
}

export function completeCanvasPreviewJob(
  state: CanvasPreviewQueueState | undefined,
  key: string
): CanvasPreviewQueueState {
  const current = normalizeQueueState(state)
  if (!current.jobs[key]) {
    return current
  }

  return {
    jobs: omitQueueJob(current.jobs, key),
    order: current.order.filter((candidate) => candidate !== key)
  }
}

export function failCanvasPreviewJob(
  state: CanvasPreviewQueueState | undefined,
  key: string,
  options: CanvasPreviewQueueFailureOptions
): CanvasPreviewQueueState {
  const current = normalizeQueueState(state)
  const job = current.jobs[key]
  if (!job) {
    return current
  }

  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const updatedAt = options.now ?? Date.now()
  const status: CanvasPreviewQueueJobStatus = job.attempts >= maxAttempts ? 'error' : 'queued'

  return {
    jobs: {
      ...current.jobs,
      [key]: {
        ...job,
        status,
        error: normalizeErrorMessage(options.error),
        updatedAt
      }
    },
    order: current.order
  }
}

export function cancelCanvasPreviewJob(
  state: CanvasPreviewQueueState | undefined,
  key: string
): CanvasPreviewQueueState {
  return completeCanvasPreviewJob(state, key)
}
