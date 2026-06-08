/**
 * Route-independent social import job progress state.
 */

export type SocialImportJobStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type SocialImportJobPhase =
  | 'probing'
  | 'staging'
  | 'checking'
  | 'writing'
  | 'indexing'
  | 'finalizing'

export type SocialImportJobMetrics = {
  recordsPerSecond: number
  lastCheckMs: number
  lastWriteMs: number
  lastProgressMs: number
  totalCheckMs: number
  totalWriteMs: number
  totalProgressMs: number
}

export type SocialImportJobCheckpoint = {
  bucketId: string | null
  sourcePath: string | null
  sourceRecordId: string | null
  processedRecords: number
  currentChunk: number
  updatedAt: number
}

export type SocialImportJobBucketCheckpoint = {
  bucketId: string
  processedRecords: number
  sourcePath: string | null
  sourceRecordId: string | null
  updatedAt: number
}

export type SocialImportJobCheckpointDraft = {
  bucketId: string
  sourcePath?: string | null
  sourceRecordId?: string | null
}

export type SocialImportJobCheckpointSnapshot = {
  checkpoint: SocialImportJobCheckpoint | null
  bucketCheckpoints: SocialImportJobBucketCheckpoint[]
}

export type SocialImportJobProgress = {
  jobId: string
  status: SocialImportJobStatus
  phase: SocialImportJobPhase
  platform: string
  archiveName: string
  totalRecords: number | null
  processedRecords: number
  created: number
  updated: number
  skipped: number
  warnings: number
  currentBucketId: string | null
  currentChunk: number
  totalChunks: number | null
  startedAt: number | null
  updatedAt: number
  completedAt: number | null
  error: string | null
  metrics: SocialImportJobMetrics | null
  checkpoint: SocialImportJobCheckpoint | null
  bucketCheckpoints: SocialImportJobBucketCheckpoint[]
}

export type CreateSocialImportJobInput = {
  platform: string
  archiveName: string
  totalRecords?: number | null
  totalChunks?: number | null
  warnings?: number
}

export type SocialImportJobPatch = Partial<
  Omit<SocialImportJobProgress, 'jobId' | 'platform' | 'archiveName'>
>

const SOCIAL_IMPORT_JOBS_STORAGE_KEY = 'xnet:social-import-jobs:v1'
const SOCIAL_IMPORT_JOBS_CHANNEL_NAME = 'xnet:social-import-jobs'
const MAX_PERSISTED_JOBS = 20

type PersistedSocialImportJobs = {
  jobs: SocialImportJobProgress[]
}

type SocialImportJobBroadcastMessage = {
  kind: 'social-import-job'
  job: SocialImportJobProgress
}

const subscribers = new Set<() => void>()
let jobsById: Map<string, SocialImportJobProgress> | null = null
let channel: BroadcastChannel | null | undefined

export function createSocialImportJob(input: CreateSocialImportJobInput): SocialImportJobProgress {
  const now = Date.now()
  const job: SocialImportJobProgress = {
    jobId: createSocialImportJobId(),
    status: 'queued',
    phase: 'checking',
    platform: input.platform,
    archiveName: input.archiveName,
    totalRecords: input.totalRecords ?? null,
    processedRecords: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    warnings: input.warnings ?? 0,
    currentBucketId: null,
    currentChunk: 0,
    totalChunks: input.totalChunks ?? null,
    startedAt: null,
    updatedAt: now,
    completedAt: null,
    error: null,
    metrics: null,
    checkpoint: null,
    bucketCheckpoints: []
  }

  upsertSocialImportJob(job, { broadcast: true })
  return job
}

export function updateSocialImportJob(
  jobId: string,
  patch: SocialImportJobPatch
): SocialImportJobProgress | null {
  const current = getSocialImportJobsById().get(jobId)
  if (!current) return null

  const now = Date.now()
  const next: SocialImportJobProgress = {
    ...current,
    ...patch,
    updatedAt: patch.updatedAt ?? now,
    completedAt:
      patch.completedAt ??
      (patch.status === 'completed' || patch.status === 'failed' || patch.status === 'cancelled'
        ? now
        : current.completedAt)
  }

  upsertSocialImportJob(next, { broadcast: true })
  return next
}

export function upsertSocialImportJobProgress(
  job: SocialImportJobProgress
): SocialImportJobProgress {
  const next: SocialImportJobProgress = {
    jobId: job.jobId,
    status: normalizeStatus(job.status),
    phase: normalizePhase(job.phase),
    platform: job.platform,
    archiveName: job.archiveName,
    totalRecords: typeof job.totalRecords === 'number' ? job.totalRecords : null,
    processedRecords: numberOrZero(job.processedRecords),
    created: numberOrZero(job.created),
    updated: numberOrZero(job.updated),
    skipped: numberOrZero(job.skipped),
    warnings: numberOrZero(job.warnings),
    currentBucketId: typeof job.currentBucketId === 'string' ? job.currentBucketId : null,
    currentChunk: numberOrZero(job.currentChunk),
    totalChunks: typeof job.totalChunks === 'number' ? job.totalChunks : null,
    startedAt: typeof job.startedAt === 'number' ? job.startedAt : null,
    updatedAt: typeof job.updatedAt === 'number' ? job.updatedAt : Date.now(),
    completedAt: typeof job.completedAt === 'number' ? job.completedAt : null,
    error: typeof job.error === 'string' ? job.error : null,
    metrics: normalizeMetrics(job.metrics),
    checkpoint: normalizeCheckpoint(job.checkpoint),
    bucketCheckpoints: normalizeBucketCheckpoints(job.bucketCheckpoints)
  }

  upsertSocialImportJob(next, { broadcast: true })
  return next
}

export function listSocialImportJobs(): SocialImportJobProgress[] {
  return [...getSocialImportJobsById().values()].sort(
    (left, right) => right.updatedAt - left.updatedAt
  )
}

export function subscribeSocialImportJobs(listener: () => void): () => void {
  getSocialImportJobsById()
  subscribers.add(listener)
  return () => {
    subscribers.delete(listener)
  }
}

export function clearCompletedSocialImportJobs(): void {
  const activeJobs = listSocialImportJobs().filter(
    (job) => job.status !== 'completed' && job.status !== 'failed' && job.status !== 'cancelled'
  )
  jobsById = new Map(activeJobs.map((job) => [job.jobId, job]))
  persistSocialImportJobs()
  notifySocialImportJobSubscribers()
}

function getSocialImportJobsById(): Map<string, SocialImportJobProgress> {
  if (!jobsById) {
    jobsById = new Map(readPersistedSocialImportJobs().map((job) => [job.jobId, job]))
    initializeSocialImportJobsChannel()
  }

  return jobsById
}

function upsertSocialImportJob(
  job: SocialImportJobProgress,
  options: { broadcast: boolean }
): void {
  const jobs = getSocialImportJobsById()
  jobs.set(job.jobId, job)

  const sortedJobs = [...jobs.values()].sort((left, right) => right.updatedAt - left.updatedAt)
  jobsById = new Map(sortedJobs.slice(0, MAX_PERSISTED_JOBS).map((item) => [item.jobId, item]))

  persistSocialImportJobs()
  notifySocialImportJobSubscribers()

  if (options.broadcast) {
    getSocialImportJobsChannel()?.postMessage({
      kind: 'social-import-job',
      job
    } satisfies SocialImportJobBroadcastMessage)
  }
}

function notifySocialImportJobSubscribers(): void {
  for (const subscriber of subscribers) subscriber()
}

function readPersistedSocialImportJobs(): SocialImportJobProgress[] {
  const storage = getSocialImportJobsStorage()
  if (!storage) return []

  try {
    const parsed = JSON.parse(
      storage.getItem(SOCIAL_IMPORT_JOBS_STORAGE_KEY) ?? '{"jobs":[]}'
    ) as PersistedSocialImportJobs
    return Array.isArray(parsed.jobs) ? parsed.jobs.flatMap(normalizePersistedSocialImportJob) : []
  } catch {
    return []
  }
}

function persistSocialImportJobs(): void {
  const storage = getSocialImportJobsStorage()
  if (!storage || !jobsById) return

  const jobs = [...jobsById.values()].sort((left, right) => right.updatedAt - left.updatedAt)
  storage.setItem(SOCIAL_IMPORT_JOBS_STORAGE_KEY, JSON.stringify({ jobs }))
}

function normalizePersistedSocialImportJob(value: unknown): SocialImportJobProgress[] {
  if (!isRecord(value)) return []
  if (typeof value.jobId !== 'string') return []
  if (typeof value.platform !== 'string') return []
  if (typeof value.archiveName !== 'string') return []

  const status = normalizeStatus(value.status)
  const restoredStatus =
    status === 'running' || status === 'queued'
      ? 'paused'
      : status === 'cancelled'
        ? 'cancelled'
        : status

  return [
    {
      jobId: value.jobId,
      status: restoredStatus,
      phase: normalizePhase(value.phase),
      platform: value.platform,
      archiveName: value.archiveName,
      totalRecords: typeof value.totalRecords === 'number' ? value.totalRecords : null,
      processedRecords: typeof value.processedRecords === 'number' ? value.processedRecords : 0,
      created: typeof value.created === 'number' ? value.created : 0,
      updated: typeof value.updated === 'number' ? value.updated : 0,
      skipped: typeof value.skipped === 'number' ? value.skipped : 0,
      warnings: typeof value.warnings === 'number' ? value.warnings : 0,
      currentBucketId: typeof value.currentBucketId === 'string' ? value.currentBucketId : null,
      currentChunk: typeof value.currentChunk === 'number' ? value.currentChunk : 0,
      totalChunks: typeof value.totalChunks === 'number' ? value.totalChunks : null,
      startedAt: typeof value.startedAt === 'number' ? value.startedAt : null,
      updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
      completedAt: typeof value.completedAt === 'number' ? value.completedAt : null,
      error:
        typeof value.error === 'string'
          ? value.error
          : restoredStatus === 'paused'
            ? 'Import progress was restored after a reload. Start the import again to continue safely.'
            : null,
      metrics: normalizeMetrics(value.metrics),
      checkpoint: normalizeCheckpoint(value.checkpoint),
      bucketCheckpoints: normalizeBucketCheckpoints(value.bucketCheckpoints)
    }
  ]
}

export function createSocialImportJobCheckpointAccumulator(): {
  add: (
    drafts: readonly SocialImportJobCheckpointDraft[],
    progress: { processedRecords: number; currentChunk: number; updatedAt?: number }
  ) => SocialImportJobCheckpointSnapshot
  snapshot: () => SocialImportJobCheckpointSnapshot
} {
  const buckets = new Map<string, SocialImportJobBucketCheckpoint>()
  let checkpoint: SocialImportJobCheckpoint | null = null

  const snapshot = (): SocialImportJobCheckpointSnapshot => ({
    checkpoint,
    bucketCheckpoints: [...buckets.values()].sort((left, right) =>
      left.bucketId.localeCompare(right.bucketId)
    )
  })

  return {
    add(drafts, progress) {
      const updatedAt = progress.updatedAt ?? Date.now()
      for (const draft of drafts) {
        const current = buckets.get(draft.bucketId)
        buckets.set(draft.bucketId, {
          bucketId: draft.bucketId,
          processedRecords: (current?.processedRecords ?? 0) + 1,
          sourcePath: draft.sourcePath ?? current?.sourcePath ?? null,
          sourceRecordId: draft.sourceRecordId ?? current?.sourceRecordId ?? null,
          updatedAt
        })
      }

      const lastDraft = drafts.at(-1)
      const lastSourceDraft = findLastSourceCheckpointDraft(drafts)
      checkpoint = {
        bucketId: lastSourceDraft?.bucketId ?? lastDraft?.bucketId ?? null,
        sourcePath: lastSourceDraft?.sourcePath ?? null,
        sourceRecordId: lastSourceDraft?.sourceRecordId ?? null,
        processedRecords: progress.processedRecords,
        currentChunk: progress.currentChunk,
        updatedAt
      }

      return snapshot()
    },
    snapshot
  }
}

function initializeSocialImportJobsChannel(): void {
  const activeChannel = getSocialImportJobsChannel()
  if (!activeChannel) return

  activeChannel.onmessage = (event: MessageEvent<SocialImportJobBroadcastMessage>) => {
    if (event.data?.kind !== 'social-import-job') return
    upsertSocialImportJob(event.data.job, { broadcast: false })
  }
}

function getSocialImportJobsChannel(): BroadcastChannel | null {
  if (channel !== undefined) return channel
  if (typeof BroadcastChannel === 'undefined') {
    channel = null
    return channel
  }

  channel = new BroadcastChannel(SOCIAL_IMPORT_JOBS_CHANNEL_NAME)
  return channel
}

function getSocialImportJobsStorage(): Storage | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

function createSocialImportJobId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `social-import:${crypto.randomUUID()}`
  }

  return `social-import:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

function normalizeStatus(value: unknown): SocialImportJobStatus {
  if (
    value === 'queued' ||
    value === 'running' ||
    value === 'paused' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'cancelled'
  ) {
    return value
  }

  return 'paused'
}

function normalizePhase(value: unknown): SocialImportJobPhase {
  if (
    value === 'probing' ||
    value === 'staging' ||
    value === 'checking' ||
    value === 'writing' ||
    value === 'indexing' ||
    value === 'finalizing'
  ) {
    return value
  }

  return 'checking'
}

function normalizeMetrics(value: unknown): SocialImportJobMetrics | null {
  if (!isRecord(value)) return null

  return {
    recordsPerSecond: numberOrZero(value.recordsPerSecond),
    lastCheckMs: numberOrZero(value.lastCheckMs),
    lastWriteMs: numberOrZero(value.lastWriteMs),
    lastProgressMs: numberOrZero(value.lastProgressMs),
    totalCheckMs: numberOrZero(value.totalCheckMs),
    totalWriteMs: numberOrZero(value.totalWriteMs),
    totalProgressMs: numberOrZero(value.totalProgressMs)
  }
}

function normalizeCheckpoint(value: unknown): SocialImportJobCheckpoint | null {
  if (!isRecord(value)) return null

  return {
    bucketId: typeof value.bucketId === 'string' ? value.bucketId : null,
    sourcePath: typeof value.sourcePath === 'string' ? value.sourcePath : null,
    sourceRecordId: typeof value.sourceRecordId === 'string' ? value.sourceRecordId : null,
    processedRecords: numberOrZero(value.processedRecords),
    currentChunk: numberOrZero(value.currentChunk),
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now()
  }
}

function normalizeBucketCheckpoints(value: unknown): SocialImportJobBucketCheckpoint[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    if (typeof item.bucketId !== 'string') return []

    return [
      {
        bucketId: item.bucketId,
        processedRecords: numberOrZero(item.processedRecords),
        sourcePath: typeof item.sourcePath === 'string' ? item.sourcePath : null,
        sourceRecordId: typeof item.sourceRecordId === 'string' ? item.sourceRecordId : null,
        updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now()
      }
    ]
  })
}

function findLastSourceCheckpointDraft(
  drafts: readonly SocialImportJobCheckpointDraft[]
): SocialImportJobCheckpointDraft | null {
  for (let index = drafts.length - 1; index >= 0; index -= 1) {
    const draft = drafts[index]
    if (draft.sourcePath || draft.sourceRecordId) return draft
  }
  return null
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
