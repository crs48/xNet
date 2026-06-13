import { describe, expect, it } from 'vitest'
import {
  buildEnrichmentNodeData,
  enrichmentTargetForPreview,
  feedEnrichmentEntryFor,
  fetchEnrichmentForTarget,
  hubAuthHeaders,
  hubHttpUrlFor,
  loadMissingThumbnailBlobUrls,
  nextEnrichmentAttempt,
  resolveHubAuthToken,
  socialEnrichmentKey,
  SocialEnrichmentQueue,
  thumbnailContentTypeFor,
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

describe('hub url and header helpers', () => {
  it('converts websocket hub urls to http', () => {
    expect(hubHttpUrlFor('wss://hub.xnet.fyi')).toBe('https://hub.xnet.fyi')
    expect(hubHttpUrlFor('ws://localhost:4444/')).toBe('http://localhost:4444')
    expect(hubHttpUrlFor('not a url')).toBe('not a url')
  })

  it('builds bearer headers only when a token exists', () => {
    expect(hubAuthHeaders('tok')).toEqual({ Authorization: 'Bearer tok' })
    expect(hubAuthHeaders('')).toEqual({})
  })

  it('resolves hub auth tokens defensively', async () => {
    expect(await resolveHubAuthToken(undefined)).toBe('')
    expect(await resolveHubAuthToken(async () => 'tok')).toBe('tok')
    expect(
      await resolveHubAuthToken(async () => {
        throw new Error('no session')
      })
    ).toBe('')
  })

  it('counts enrichment attempts from the existing node', () => {
    expect(nextEnrichmentAttempt(undefined)).toBe(1)
    expect(nextEnrichmentAttempt({})).toBe(1)
    expect(nextEnrichmentAttempt({ attemptCount: 2 })).toBe(3)
  })
})

describe('feedEnrichmentEntryFor', () => {
  const row = {
    id: 'enrichment-1',
    status: 'resolved',
    title: 'Real Title',
    description: 'Desc',
    authorName: 'Channel',
    thumbnailUrl: 'https://i.ytimg.com/vi/abc/mqdefault.jpg',
    thumbnailBlobCid: 'cid:blake3:abc'
  }

  it('maps resolved rows preferring blob object urls', () => {
    expect(feedEnrichmentEntryFor(row, 'blob:local')).toEqual({
      title: 'Real Title',
      description: 'Desc',
      authorName: 'Channel',
      thumbnailUrl: 'blob:local'
    })
    expect(feedEnrichmentEntryFor(row, undefined)?.thumbnailUrl).toBe(row.thumbnailUrl)
  })

  it('hides unresolved rows from display', () => {
    expect(feedEnrichmentEntryFor(undefined, undefined)).toBeNull()
    expect(feedEnrichmentEntryFor({ ...row, status: 'unavailable' }, undefined)).toBeNull()
  })
})

describe('thumbnailContentTypeFor', () => {
  it('reads the stored content type with a jpeg fallback', () => {
    expect(thumbnailContentTypeFor({ metadataJson: '{"thumbnailContentType":"image/webp"}' })).toBe(
      'image/webp'
    )
    expect(thumbnailContentTypeFor({ metadataJson: undefined })).toBe('image/jpeg')
    expect(thumbnailContentTypeFor({ metadataJson: 'not json' })).toBe('image/jpeg')
  })
})

describe('fetchEnrichmentForTarget', () => {
  const resolvedPayload = {
    status: 'resolved',
    metadata: { title: 'Real Title', imageUrl: 'https://i.ytimg.com/vi/abc123/mqdefault.jpg' }
  }

  function fetchStub(routes: Record<string, Response | (() => Response)>): typeof fetch {
    return (async (input: RequestInfo | URL) => {
      const url = String(input)
      const matched = Object.entries(routes).find(([prefix]) => url.includes(prefix))
      if (!matched) throw new Error(`Unexpected fetch: ${url}`)
      const value = matched[1]
      return typeof value === 'function' ? value() : value.clone()
    }) as typeof fetch
  }

  it('fetches metadata and captures thumbnail bytes into the blob store', async () => {
    const stored: Uint8Array[] = []
    const result = await fetchEnrichmentForTarget({
      httpUrl: 'https://hub.example',
      headers: {},
      target,
      blobStore: {
        put: async (bytes) => {
          stored.push(bytes)
          return 'cid:blake3:stored'
        }
      },
      fetchImpl: fetchStub({
        '/unfurl/metadata': new Response(JSON.stringify(resolvedPayload), {
          headers: { 'Content-Type': 'application/json' }
        }),
        '/unfurl/image': new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'Content-Type': 'image/jpeg' }
        })
      })
    })

    expect(result.payload.metadata?.title).toBe('Real Title')
    expect(result.thumbnailBlobCid).toBe('cid:blake3:stored')
    expect(result.thumbnailContentType).toBe('image/jpeg')
    expect(stored[0]).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('skips thumbnail capture without a blob store or image, and survives image failures', async () => {
    const noBlobStore = await fetchEnrichmentForTarget({
      httpUrl: 'https://hub.example',
      headers: {},
      target,
      blobStore: null,
      fetchImpl: fetchStub({
        '/unfurl/metadata': new Response(JSON.stringify(resolvedPayload), {
          headers: { 'Content-Type': 'application/json' }
        })
      })
    })
    expect(noBlobStore.thumbnailBlobCid).toBeUndefined()

    const imageFails = await fetchEnrichmentForTarget({
      httpUrl: 'https://hub.example',
      headers: {},
      target,
      blobStore: { put: async () => 'cid:blake3:unused' },
      fetchImpl: fetchStub({
        '/unfurl/metadata': new Response(JSON.stringify(resolvedPayload), {
          headers: { 'Content-Type': 'application/json' }
        }),
        '/unfurl/image': () => new Response('nope', { status: 502 })
      })
    })
    expect(imageFails.payload.status).toBe('resolved')
    expect(imageFails.thumbnailBlobCid).toBeUndefined()
  })

  it('throws on failed metadata requests so the queue records the miss', async () => {
    await expect(
      fetchEnrichmentForTarget({
        httpUrl: 'https://hub.example',
        headers: {},
        target,
        blobStore: null,
        fetchImpl: fetchStub({ '/unfurl/metadata': () => new Response('nope', { status: 404 }) })
      })
    ).rejects.toThrow('Unfurl request failed with 404')
  })
})

describe('loadMissingThumbnailBlobUrls', () => {
  it('creates object urls for uncached blob cids only', async () => {
    const added = await loadMissingThumbnailBlobUrls({
      rows: [
        { id: 'a', thumbnailBlobCid: 'cid:blake3:one' },
        { id: 'b', thumbnailBlobCid: 'cid:blake3:cached' },
        { id: 'c', thumbnailBlobCid: 'not-a-cid' },
        { id: 'd' }
      ],
      blobStore: { get: async () => new Uint8Array([9]) },
      hasUrl: (cid) => cid === 'cid:blake3:cached',
      createUrl: () => 'blob:created'
    })

    expect([...added.entries()]).toEqual([['cid:blake3:one', 'blob:created']])
  })

  it('skips blobs that fail to load and stops when cancelled', async () => {
    const missing = await loadMissingThumbnailBlobUrls({
      rows: [{ id: 'a', thumbnailBlobCid: 'cid:blake3:gone' }],
      blobStore: { get: async () => null },
      hasUrl: () => false,
      createUrl: () => 'blob:never'
    })
    expect(missing.size).toBe(0)

    const cancelled = await loadMissingThumbnailBlobUrls({
      rows: [{ id: 'a', thumbnailBlobCid: 'cid:blake3:one' }],
      blobStore: { get: async () => new Uint8Array([1]) },
      hasUrl: () => false,
      createUrl: () => 'blob:never',
      isCancelled: () => true
    })
    expect(cancelled.size).toBe(0)
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
