import { describe, expect, it } from 'vitest'
import {
  approveStagedModerationWrite,
  materializeStagedModerationWrite,
  planStagedModerationWrites,
  rejectStagedModerationWrite,
  type StagedModerationWriteCandidate
} from '../src/staged-writes'

describe('staged moderation writes', () => {
  const candidate = (
    overrides: Partial<StagedModerationWriteCandidate> = {}
  ): StagedModerationWriteCandidate => ({
    targetId: 'node-1',
    targetSchema: 'xnet://xnet.fyi/Page',
    kind: 'moderation-label',
    value: 'slop',
    confidence: 0.86,
    sourceType: 'cloud-ai',
    sourceDID: 'did:key:ai-labeler',
    evidenceRefs: ['claim:claim-1:unsupported'],
    modelProvider: 'example-ai',
    modelName: 'safety-small',
    modelVersion: '2026-01',
    ...overrides
  })

  it('stages AI-generated moderation labels by default', () => {
    const plan = planStagedModerationWrites([candidate()], {}, { now: 1_000 })

    expect(plan.committed).toEqual([])
    expect(plan.rejected).toEqual([])
    expect(plan.staged).toHaveLength(1)
    expect(plan.staged[0]).toMatchObject({
      id: 'staged-write-1',
      status: 'staged',
      reviewRequired: true,
      reviewQueue: 'safety',
      stagedAt: 1_000
    })
    expect(plan.reviewTasks).toEqual([
      {
        id: 'review-staged-write-1',
        stagedWriteId: 'staged-write-1',
        targetId: 'node-1',
        queue: 'safety',
        priority: 70,
        reasons: ['ai-generated', 'moderation-label', 'source:cloud-ai', 'confidence:0.86']
      }
    ])
  })

  it('auto-commits explicitly allowed high-confidence deterministic writes', () => {
    const plan = planStagedModerationWrites(
      [
        candidate({
          sourceType: 'deterministic',
          confidence: 0.95,
          modelProvider: undefined,
          modelName: undefined,
          modelVersion: undefined
        })
      ],
      {},
      { now: 2_000 }
    )

    expect(plan.staged).toEqual([])
    expect(plan.committed).toHaveLength(1)
    expect(plan.materialized).toEqual([
      {
        targetId: 'node-1',
        targetSchema: 'xnet://xnet.fyi/Page',
        kind: 'moderation-label',
        value: 'slop',
        score: undefined,
        confidence: 0.95,
        sourceType: 'deterministic',
        sourceDID: 'did:key:ai-labeler',
        sourceWeight: 1,
        evidenceRefs: ['claim:claim-1:unsupported'],
        modelProvider: undefined,
        modelName: undefined,
        modelVersion: undefined,
        expiresAt: undefined
      }
    ])
  })

  it('requires explicit policy to auto-commit AI-generated candidates', () => {
    const plan = planStagedModerationWrites(
      [candidate({ confidence: 0.97 })],
      {
        autoCommitSources: ['cloud-ai'],
        requireReviewSources: [],
        autoCommitConfidence: 0.95
      },
      { now: 3_000 }
    )

    expect(plan.committed).toHaveLength(1)
    expect(plan.materialized[0]).toMatchObject({
      sourceType: 'cloud-ai',
      modelProvider: 'example-ai'
    })
  })

  it('rejects very low-confidence candidates before review task creation', () => {
    const plan = planStagedModerationWrites(
      [candidate({ confidence: 0.05 })],
      { minStageConfidence: 0.2 },
      { now: 4_000 }
    )

    expect(plan.staged).toEqual([])
    expect(plan.reviewTasks).toEqual([])
    expect(plan.rejected[0]).toMatchObject({
      status: 'rejected',
      reviewRequired: false
    })
  })

  it('approves or rejects staged writes through explicit reviewer transitions', () => {
    const [write] = planStagedModerationWrites([candidate()], {}, { now: 5_000 }).staged
    const approved = approveStagedModerationWrite(write, 'did:key:reviewer', { now: 6_000 })
    const rejected = rejectStagedModerationWrite(write, 'did:key:reviewer', 'not enough evidence', {
      now: 7_000
    })

    expect(approved).toMatchObject({
      status: 'committed',
      committedAt: 6_000,
      committedBy: 'did:key:reviewer',
      reviewRequired: false
    })
    expect(materializeStagedModerationWrite(approved)).toMatchObject({
      targetId: 'node-1',
      value: 'slop',
      confidence: 0.86
    })
    expect(rejected).toMatchObject({
      status: 'rejected',
      rejectedAt: 7_000,
      rejectedBy: 'did:key:reviewer',
      rejectionReason: 'not enough evidence'
    })
    expect(materializeStagedModerationWrite(rejected)).toBeNull()
  })

  it('routes quality signals to the quality review queue', () => {
    const plan = planStagedModerationWrites([
      candidate({
        kind: 'quality-signal',
        value: 'citation-coverage',
        score: 0.25,
        sourceType: 'local-ai'
      })
    ])

    expect(plan.staged[0]?.reviewQueue).toBe('quality')
    expect(plan.reviewTasks[0]?.reasons).toContain('quality-signal')
  })
})
