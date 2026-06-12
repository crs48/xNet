import { describe, expect, it } from 'vitest'
import {
  buildEnrichmentNodeData,
  enrichmentTargetForPreview,
  socialEnrichmentKey,
  SocialEnrichmentQueue,
  type SocialEnrichmentTarget
} from './social-feed-enrichment'

const target: SocialEnrichmentTarget = {
  key: socialEnrichmentKey('youtube', 'abc123'),
  platform: 'youtube',
  platformContentId: 'abc123',
  url: 'https://www.youtube.com/watch?v=abc123'
}

describe('enrichmentTargetForPreview', () => {
  it('keys enrichable previews by platform content id', () => {
    expect(
      enrichmentTargetForPreview({
        platform: 'youtube',
        platformContentId: 'abc123',
        url: 'https://www.youtube.com/watch?v=abc123'
      })
    ).toEqual(target)
  })

  it('skips previews without a platform content id, url, or platform', () => {
    expect(
      enrichmentTargetForPreview({ platform: 'youtube', url: 'https://youtube.com/watch?v=x' })
    ).toBeNull()
    expect(
      enrichmentTargetForPreview({ platform: 'youtube', platformContentId: 'abc123' })
    ).toBeNull()
    expect(
      enrichmentTargetForPreview({
        platform: 'generic',
        platformContentId: 'abc123',
        url: 'https://example.com'
      })
    ).toBeNull()
  })
})

describe('buildEnrichmentNodeData', () => {
  it('maps resolved unfurl payloads onto enrichment node properties', () => {
    const data = buildEnrichmentNodeData({
      target,
      payload: {
        status: 'resolved',
        metadata: {
          title: ' Example Video ',
          description: 'A description.',
          authorName: 'Example Channel',
          imageUrl: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
          source: 'oembed'
        }
      },
      attemptCount: 1,
      fetchedAtMs: 1_750_000_000_000,
      thumbnailBlobCid: 'cid:blake3:feed',
      thumbnailContentType: 'image/jpeg'
    })

    expect(data).toEqual({
      platform: 'youtube',
      platformContentId: 'abc123',
      canonicalUrl: target.url,
      status: 'resolved',
      title: 'Example Video',
      description: 'A description.',
      authorName: 'Example Channel',
      thumbnailUrl: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
      thumbnailBlobCid: 'cid:blake3:feed',
      source: 'oembed',
      fetchedAt: 1_750_000_000_000,
      attemptCount: 1,
      metadataJson: JSON.stringify({ thumbnailContentType: 'image/jpeg' })
    })
  })

  it('records failure statuses with their reasons', () => {
    const data = buildEnrichmentNodeData({
      target,
      payload: { status: 'unavailable', reason: 'oEmbed request failed with 404' },
      attemptCount: 2,
      fetchedAtMs: 1
    })

    expect(data.status).toBe('unavailable')
    expect(data.lastError).toBe('oEmbed request failed with 404')
    expect(data.attemptCount).toBe(2)
    expect(data.title).toBeUndefined()
  })

  it('treats unknown statuses as unavailable', () => {
    expect(
      buildEnrichmentNodeData({ target, payload: {}, attemptCount: 1, fetchedAtMs: 1 }).status
    ).toBe('unavailable')
    expect(
      buildEnrichmentNodeData({
        target,
        payload: { status: 'error' },
        attemptCount: 1,
        fetchedAtMs: 1
      }).status
    ).toBe('error')
  })
})

describe('SocialEnrichmentQueue', () => {
  it('executes each key once with pacing between fetches', async () => {
    const executed: string[] = []
    const delays: number[] = []
    const queue = new SocialEnrichmentQueue(
      async (next) => {
        executed.push(next.key)
      },
      100,
      async (ms) => {
        delays.push(ms)
      }
    )

    const second = { ...target, key: 'youtube:def456', platformContentId: 'def456' }
    queue.enqueue([target, second, target])
    queue.enqueue([second])
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(executed).toEqual([target.key, second.key])
    expect(delays.length).toBe(1)
    expect(delays[0]).toBeGreaterThanOrEqual(100)
  })

  it('never re-queues keys marked as known', async () => {
    const executed: string[] = []
    const queue = new SocialEnrichmentQueue(async (next) => {
      executed.push(next.key)
    })

    queue.markKnown([target.key])
    queue.enqueue([target])
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(executed).toEqual([])
    expect(queue.pendingCount).toBe(0)
  })

  it('does not retry keys whose executor failed', async () => {
    let attempts = 0
    const queue = new SocialEnrichmentQueue(async () => {
      attempts += 1
      throw new Error('network down')
    })

    queue.enqueue([target])
    await new Promise((resolve) => setTimeout(resolve, 0))
    queue.enqueue([target])
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(attempts).toBe(1)
  })

  it('stops executing after dispose', async () => {
    const executed: string[] = []
    const queue = new SocialEnrichmentQueue(async (next) => {
      executed.push(next.key)
    })

    queue.dispose()
    queue.enqueue([target])
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(executed).toEqual([])
  })
})
