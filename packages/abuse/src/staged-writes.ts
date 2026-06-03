/**
 * Staged write flow for moderation and quality labels.
 */

import type { AbuseReviewQueue } from './types'

// ─── Types ─────────────────────────────────────────────────

export type StagedModerationSourceType =
  | 'deterministic'
  | 'local-ai'
  | 'cloud-ai'
  | 'human'
  | 'community-note'
  | 'policy-list'
  | 'hub'
  | 'crawler'

export type StagedModerationWriteKind = 'moderation-label' | 'quality-signal'

export type StagedModerationWriteStatus = 'staged' | 'committed' | 'rejected'

export type StagedModerationWriteCandidate = {
  id?: string
  targetId: string
  targetSchema?: string
  kind: StagedModerationWriteKind
  value: string
  score?: number
  confidence: number
  sourceType: StagedModerationSourceType
  sourceDID?: string
  sourceWeight?: number
  evidenceRefs?: readonly string[]
  modelProvider?: string
  modelName?: string
  modelVersion?: string
  expiresAt?: number
}

export type StagedModerationWritePolicy = {
  minStageConfidence?: number
  autoCommitConfidence?: number
  autoCommitSources?: readonly StagedModerationSourceType[]
  requireReviewSources?: readonly StagedModerationSourceType[]
  reviewQueueByKind?: Partial<Record<StagedModerationWriteKind, AbuseReviewQueue>>
  defaultSourceWeight?: number
  stagedExpiresInMs?: number
}

export type StagedModerationWrite = StagedModerationWriteCandidate & {
  id: string
  status: StagedModerationWriteStatus
  createdAt: number
  stagedAt?: number
  committedAt?: number
  committedBy?: string
  rejectedAt?: number
  rejectedBy?: string
  rejectionReason?: string
  reviewRequired: boolean
  reviewQueue?: AbuseReviewQueue
}

export type MaterializedModerationWrite = {
  targetId: string
  targetSchema?: string
  kind: StagedModerationWriteKind
  value: string
  score?: number
  confidence: number
  sourceType: StagedModerationSourceType
  sourceDID?: string
  sourceWeight: number
  evidenceRefs: readonly string[]
  modelProvider?: string
  modelName?: string
  modelVersion?: string
  expiresAt?: number
}

export type StagedModerationReviewTask = {
  id: string
  stagedWriteId: string
  targetId: string
  queue: AbuseReviewQueue
  priority: number
  reasons: readonly string[]
}

export type StagedModerationWritePlan = {
  staged: StagedModerationWrite[]
  committed: StagedModerationWrite[]
  rejected: StagedModerationWrite[]
  materialized: MaterializedModerationWrite[]
  reviewTasks: StagedModerationReviewTask[]
}

export type StagedModerationWriteOptions = {
  now?: number
}

// ─── Public API ────────────────────────────────────────────

export function planStagedModerationWrites(
  candidates: readonly StagedModerationWriteCandidate[],
  policy: StagedModerationWritePolicy = {},
  options: StagedModerationWriteOptions = {}
): StagedModerationWritePlan {
  const now = options.now ?? Date.now()
  const writes = candidates.map((candidate, index) =>
    createStagedModerationWrite(candidate, policy, now, index)
  )
  const staged = writes.filter((write) => write.status === 'staged')
  const committed = writes.filter((write) => write.status === 'committed')
  const rejected = writes.filter((write) => write.status === 'rejected')

  return {
    staged,
    committed,
    rejected,
    materialized: committed.flatMap((write) => materializeStagedModerationWrite(write) ?? []),
    reviewTasks: staged.map((write) => createReviewTaskForStagedWrite(write, now))
  }
}

export function approveStagedModerationWrite(
  write: StagedModerationWrite,
  reviewerDID: string,
  options: StagedModerationWriteOptions = {}
): StagedModerationWrite {
  const now = options.now ?? Date.now()
  return {
    ...write,
    status: 'committed',
    reviewRequired: false,
    committedAt: now,
    committedBy: reviewerDID
  }
}

export function rejectStagedModerationWrite(
  write: StagedModerationWrite,
  reviewerDID: string,
  reason: string,
  options: StagedModerationWriteOptions = {}
): StagedModerationWrite {
  const now = options.now ?? Date.now()
  return {
    ...write,
    status: 'rejected',
    reviewRequired: false,
    rejectedAt: now,
    rejectedBy: reviewerDID,
    rejectionReason: reason
  }
}

export function materializeStagedModerationWrite(
  write: StagedModerationWrite
): MaterializedModerationWrite | null {
  if (write.status !== 'committed') return null
  return {
    targetId: write.targetId,
    targetSchema: write.targetSchema,
    kind: write.kind,
    value: write.value,
    score: write.score,
    confidence: clamp(write.confidence, 0, 1),
    sourceType: write.sourceType,
    sourceDID: write.sourceDID,
    sourceWeight: clamp(write.sourceWeight ?? 1, 0, 10),
    evidenceRefs: [...(write.evidenceRefs ?? [])],
    modelProvider: write.modelProvider,
    modelName: write.modelName,
    modelVersion: write.modelVersion,
    expiresAt: write.expiresAt
  }
}

// ─── Helpers ───────────────────────────────────────────────

const DEFAULT_MIN_STAGE_CONFIDENCE = 0.15
const DEFAULT_AUTO_COMMIT_CONFIDENCE = 0.9
const DEFAULT_AUTO_COMMIT_SOURCES = ['deterministic', 'human', 'policy-list'] as const
const DEFAULT_REVIEW_SOURCES = ['local-ai', 'cloud-ai'] as const

function createStagedModerationWrite(
  candidate: StagedModerationWriteCandidate,
  policy: StagedModerationWritePolicy,
  now: number,
  index: number
): StagedModerationWrite {
  const confidence = clamp(candidate.confidence, 0, 1)
  const minStageConfidence = policy.minStageConfidence ?? DEFAULT_MIN_STAGE_CONFIDENCE
  const reviewRequired = requiresReview(candidate, policy)
  const status = resolveInitialStatus(candidate, confidence, reviewRequired, policy)
  const finalStatus = confidence < minStageConfidence ? 'rejected' : status
  const id = candidate.id ?? `staged-write-${index + 1}`

  return {
    ...candidate,
    id,
    confidence,
    sourceWeight: candidate.sourceWeight ?? policy.defaultSourceWeight ?? 1,
    status: finalStatus,
    createdAt: now,
    stagedAt: finalStatus === 'staged' ? now : undefined,
    committedAt: finalStatus === 'committed' ? now : undefined,
    reviewRequired: finalStatus === 'staged' && reviewRequired,
    reviewQueue:
      finalStatus === 'staged'
        ? (policy.reviewQueueByKind?.[candidate.kind] ?? defaultQueue(candidate))
        : undefined,
    expiresAt:
      candidate.expiresAt ??
      (finalStatus === 'staged' && policy.stagedExpiresInMs
        ? now + policy.stagedExpiresInMs
        : undefined)
  }
}

function resolveInitialStatus(
  candidate: StagedModerationWriteCandidate,
  confidence: number,
  reviewRequired: boolean,
  policy: StagedModerationWritePolicy
): StagedModerationWriteStatus {
  if (reviewRequired) return 'staged'
  const autoCommitSources = new Set(policy.autoCommitSources ?? DEFAULT_AUTO_COMMIT_SOURCES)
  const autoCommitConfidence = policy.autoCommitConfidence ?? DEFAULT_AUTO_COMMIT_CONFIDENCE
  return autoCommitSources.has(candidate.sourceType) && confidence >= autoCommitConfidence
    ? 'committed'
    : 'staged'
}

function requiresReview(
  candidate: StagedModerationWriteCandidate,
  policy: StagedModerationWritePolicy
): boolean {
  const reviewSources = new Set(policy.requireReviewSources ?? DEFAULT_REVIEW_SOURCES)
  return reviewSources.has(candidate.sourceType)
}

function createReviewTaskForStagedWrite(
  write: StagedModerationWrite,
  now: number
): StagedModerationReviewTask {
  const queue = write.reviewQueue ?? defaultQueue(write)
  return {
    id: `review-${write.id}`,
    stagedWriteId: write.id,
    targetId: write.targetId,
    queue,
    priority: reviewPriority(write, now),
    reasons: reviewReasons(write)
  }
}

function defaultQueue(write: Pick<StagedModerationWriteCandidate, 'kind'>): AbuseReviewQueue {
  return write.kind === 'quality-signal' ? 'quality' : 'safety'
}

function reviewPriority(write: StagedModerationWrite, now: number): number {
  const confidencePriority = Math.round(clamp(write.confidence, 0, 1) * 70)
  const expiryPriority = write.expiresAt && write.expiresAt < now + 24 * 60 * 60 * 1000 ? 20 : 0
  const cloudPriority = write.sourceType === 'cloud-ai' ? 10 : 0
  return clamp(confidencePriority + expiryPriority + cloudPriority, 0, 100)
}

function reviewReasons(write: StagedModerationWrite): string[] {
  return [
    write.sourceType === 'local-ai' || write.sourceType === 'cloud-ai' ? 'ai-generated' : null,
    write.kind === 'quality-signal' ? 'quality-signal' : 'moderation-label',
    `source:${write.sourceType}`,
    `confidence:${write.confidence.toFixed(2)}`
  ].filter((reason): reason is string => reason !== null)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
