import { describe, expect, it } from 'vitest'
import {
  claimNextCanvasPreviewJob,
  completeCanvasPreviewJob,
  createCanvasPreviewQueueState,
  enqueueCanvasPreviewJob,
  failCanvasPreviewJob,
  getCanvasPreviewJobKey
} from '../preview/queue'

describe('canvas preview queue', () => {
  it('deduplicates jobs by tier, source node, source version, and content hash', () => {
    const sourceRef = {
      nodeId: 'media-1',
      schemaId: 'xnet://xnet.fyi/MediaAsset@1.0.0',
      version: 3,
      contentHash: 'hash-a'
    }
    const firstJob = {
      objectId: 'canvas-a',
      objectKind: 'media' as const,
      tier: 'thumbnail' as const,
      sourceRef,
      priority: 1,
      enqueuedAt: 10
    }
    const duplicateJob = {
      ...firstJob,
      objectId: 'canvas-b',
      priority: 5,
      enqueuedAt: 20
    }
    const updatedSourceJob = {
      ...firstJob,
      objectId: 'canvas-c',
      sourceRef: {
        ...sourceRef,
        contentHash: 'hash-b'
      },
      enqueuedAt: 30
    }

    const state = [firstJob, duplicateJob, updatedSourceJob].reduce(
      (queue, job) => enqueueCanvasPreviewJob(queue, job),
      createCanvasPreviewQueueState()
    )

    expect(getCanvasPreviewJobKey(firstJob)).toBe(
      'preview:thumbnail:media-1:xnet://xnet.fyi/MediaAsset@1.0.0:3:hash-a'
    )
    expect(Object.keys(state.jobs)).toHaveLength(2)
    expect(state.order).toEqual([
      getCanvasPreviewJobKey(firstJob),
      getCanvasPreviewJobKey(updatedSourceJob)
    ])
    expect(state.jobs[getCanvasPreviewJobKey(firstJob)]).toMatchObject({
      objectId: 'canvas-b',
      priority: 5,
      status: 'queued',
      attempts: 0
    })
  })

  it('claims queued jobs by priority and stable enqueue order', () => {
    const state = [
      {
        objectId: 'older-low-priority',
        objectKind: 'media' as const,
        tier: 'thumbnail' as const,
        priority: 1,
        enqueuedAt: 10
      },
      {
        objectId: 'newer-high-priority',
        objectKind: 'media' as const,
        tier: 'thumbnail' as const,
        priority: 10,
        enqueuedAt: 20
      },
      {
        objectId: 'older-high-priority',
        objectKind: 'media' as const,
        tier: 'thumbnail' as const,
        priority: 10,
        enqueuedAt: 15
      }
    ].reduce((queue, job) => enqueueCanvasPreviewJob(queue, job), createCanvasPreviewQueueState())

    const claimed = claimNextCanvasPreviewJob(state, 100)

    expect(claimed.job).toMatchObject({
      objectId: 'older-high-priority',
      status: 'generating',
      attempts: 1,
      updatedAt: 100
    })
    expect(claimed.state.jobs[claimed.job?.key ?? '']?.status).toBe('generating')
  })

  it('removes completed jobs and requeues failed jobs until attempts are exhausted', () => {
    const queued = enqueueCanvasPreviewJob(createCanvasPreviewQueueState(), {
      objectId: 'media-1',
      objectKind: 'media',
      tier: 'thumbnail',
      sourceRef: {
        nodeId: 'source-1',
        version: 1,
        contentHash: 'hash-1'
      },
      enqueuedAt: 10
    })
    const firstClaim = claimNextCanvasPreviewJob(queued, 20)
    const firstFailure = failCanvasPreviewJob(firstClaim.state, firstClaim.job?.key ?? '', {
      error: new Error('Renderer unavailable'),
      maxAttempts: 2,
      now: 30
    })
    const secondClaim = claimNextCanvasPreviewJob(firstFailure, 40)
    const secondFailure = failCanvasPreviewJob(secondClaim.state, secondClaim.job?.key ?? '', {
      error: 'Still unavailable',
      maxAttempts: 2,
      now: 50
    })

    expect(firstFailure.jobs[firstClaim.job?.key ?? '']).toMatchObject({
      status: 'queued',
      attempts: 1,
      error: 'Renderer unavailable'
    })
    expect(secondFailure.jobs[secondClaim.job?.key ?? '']).toMatchObject({
      status: 'error',
      attempts: 2,
      error: 'Still unavailable'
    })

    const completed = completeCanvasPreviewJob(secondFailure, secondClaim.job?.key ?? '')
    expect(completed.jobs).toEqual({})
    expect(completed.order).toEqual([])
  })
})
