/**
 * Where enrichment metadata actually comes from.
 *
 * Exploration 0170 found that CORS, not product design, dictates this layer:
 * YouTube's oEmbed, Instagram and X all refuse a browser fetch, so the hub has
 * to proxy them. TikTok is the exception — its oEmbed endpoint sends CORS
 * headers, so the client can ask it directly.
 *
 * That exception is worth taking rather than routing everything through the
 * hub for symmetry, because it is the only path that works with **no hub at
 * all**. A desktop user with a purely local workspace gets TikTok titles and
 * thumbnails; before this, they got nothing.
 *
 * Thumbnail *bytes* are a separate question from thumbnail *URLs*. The CDN
 * that serves them does not send CORS headers, so bytes still need the hub —
 * and when there is no hub we keep the URL and let the image element fetch it,
 * which is the same request the page would make anyway.
 */

import type { SocialEnrichmentTarget, SocialUnfurlMetadataPayload } from './targets'

const TIKTOK_OEMBED_ENDPOINT = 'https://www.tiktok.com/oembed'

/** Platforms whose oEmbed endpoint is reachable from a browser. */
export const DIRECT_OEMBED_PLATFORMS: readonly string[] = ['tiktok']

export function supportsDirectOEmbed(platform: string): boolean {
  return DIRECT_OEMBED_PLATFORMS.includes(platform)
}

/** The subset of the TikTok oEmbed response we read. */
type TikTokOEmbedResponse = {
  title?: string
  author_name?: string
  author_url?: string
  thumbnail_url?: string
  provider_name?: string
}

export function tiktokOEmbedUrl(contentUrl: string): string {
  const url = new URL(TIKTOK_OEMBED_ENDPOINT)
  url.searchParams.set('url', contentUrl)
  return url.toString()
}

/**
 * Fetch TikTok metadata straight from the client.
 *
 * Returns the same payload shape the hub's `/unfurl/metadata` produces, so the
 * caller does not branch on where the metadata came from — only on whether it
 * arrived.
 */
export async function fetchTikTokOEmbed(input: {
  target: SocialEnrichmentTarget
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}): Promise<SocialUnfurlMetadataPayload> {
  const fetchImpl = input.fetchImpl ?? fetch

  let response: Response
  try {
    response = await fetchImpl(
      tiktokOEmbedUrl(input.target.url),
      input.signal ? { signal: input.signal } : {}
    )
  } catch (error) {
    return {
      status: 'error',
      reason: error instanceof Error ? error.message : 'oEmbed request threw'
    }
  }

  if (response.status === 404) {
    return { status: 'unavailable', reason: 'video not found' }
  }
  if (!response.ok) {
    const blocked = response.status === 403 || response.status === 429
    return {
      status: blocked ? 'blocked' : 'error',
      reason: `oEmbed request failed with ${response.status}`
    }
  }

  let body: TikTokOEmbedResponse
  try {
    body = (await response.json()) as TikTokOEmbedResponse
  } catch {
    return { status: 'error', reason: 'oEmbed response was not JSON' }
  }

  // A 200 with no title is TikTok's way of saying the video is gone or
  // private. Treating it as resolved would write an enrichment node that
  // renders as a blank card forever.
  if (!body.title && !body.thumbnail_url) {
    return { status: 'unavailable', reason: 'oEmbed returned no metadata' }
  }

  return {
    status: 'resolved',
    metadata: {
      title: body.title ?? null,
      description: null,
      imageUrl: body.thumbnail_url ?? null,
      authorName: body.author_name ?? null,
      providerName: body.provider_name ?? 'TikTok',
      source: 'oembed',
      sourceUrl: input.target.url
    }
  }
}

export type EnrichmentFetchResult = {
  payload: SocialUnfurlMetadataPayload
  thumbnailBlobCid?: string
  thumbnailContentType?: string
}

export type BlobPutSink = { put(data: Uint8Array): Promise<string> }

/**
 * Capture a thumbnail into the blob store through the hub's image proxy.
 *
 * Returns nothing rather than throwing when the image cannot be captured: a
 * missing local copy degrades to loading the URL directly, which is a slower
 * card, not a broken one.
 */
async function captureThumbnail(input: {
  httpUrl: string
  headers: Record<string, string>
  imageUrl: string
  blobStore: BlobPutSink
  fetchImpl: typeof fetch
}): Promise<{ thumbnailBlobCid?: string; thumbnailContentType?: string }> {
  const response = await input
    .fetchImpl(`${input.httpUrl}/unfurl/image?url=${encodeURIComponent(input.imageUrl)}`, {
      headers: input.headers
    })
    .catch(() => null)
  if (!response?.ok) return {}

  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength === 0) return {}

  return {
    thumbnailBlobCid: await input.blobStore.put(bytes),
    thumbnailContentType: response.headers.get('content-type') ?? undefined
  }
}

export type FetchEnrichmentInput = {
  target: SocialEnrichmentTarget
  blobStore: BlobPutSink | null
  /** Hub base URL. When absent, only direct-oEmbed platforms can resolve. */
  httpUrl?: string
  headers?: Record<string, string>
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

/**
 * Resolve metadata for one target.
 *
 * Direct oEmbed first where it works, hub proxy otherwise. With no hub and no
 * direct path the result is an explicit `unavailable` rather than a silent
 * no-op, so the queue records the attempt and does not spin on it.
 */
export async function fetchEnrichmentForTarget(
  input: FetchEnrichmentInput
): Promise<EnrichmentFetchResult> {
  const fetchImpl = input.fetchImpl ?? fetch
  const headers = input.headers ?? {}

  if (supportsDirectOEmbed(input.target.platform)) {
    const payload = await fetchTikTokOEmbed({
      target: input.target,
      fetchImpl,
      ...(input.signal ? { signal: input.signal } : {})
    })

    const imageUrl = payload.metadata?.imageUrl
    if (payload.status !== 'resolved' || !imageUrl || !input.blobStore || !input.httpUrl) {
      return { payload }
    }

    return {
      payload,
      ...(await captureThumbnail({
        httpUrl: input.httpUrl,
        headers,
        imageUrl,
        blobStore: input.blobStore,
        fetchImpl
      }))
    }
  }

  if (!input.httpUrl) {
    return {
      payload: {
        status: 'unavailable',
        reason: `no hub available to unfurl ${input.target.platform}`
      }
    }
  }

  const response = await fetchImpl(
    `${input.httpUrl}/unfurl/metadata?url=${encodeURIComponent(input.target.url)}&provider=${encodeURIComponent(input.target.platform)}`,
    { headers }
  )
  if (!response.ok) {
    throw new Error(`Unfurl request failed with ${response.status}`)
  }
  const payload = (await response.json()) as SocialUnfurlMetadataPayload

  const imageUrl = payload.metadata?.imageUrl
  if (payload.status !== 'resolved' || !imageUrl || !input.blobStore) {
    return { payload }
  }

  return {
    payload,
    ...(await captureThumbnail({
      httpUrl: input.httpUrl,
      headers,
      imageUrl,
      blobStore: input.blobStore,
      fetchImpl
    }))
  }
}

/**
 * Materialize object URLs for blob-cached thumbnails that are not in the
 * cache yet. Returns the new cid → object URL entries.
 */
export type ThumbnailBlobRow = {
  thumbnailBlobCid?: string
  metadataJson?: string
}

export async function loadMissingThumbnailBlobUrls(input: {
  rows: readonly ThumbnailBlobRow[]
  blobStore: { get(cid: `cid:blake3:${string}`): Promise<Uint8Array | null> }
  hasUrl: (cid: string) => boolean
  createUrl: (blob: Blob) => string
  contentTypeFor: (row: ThumbnailBlobRow) => string
  limit?: number
  isCancelled?: () => boolean
}): Promise<Map<string, string>> {
  const added = new Map<string, string>()
  const missing = input.rows
    .filter((row) => row.thumbnailBlobCid && !input.hasUrl(row.thumbnailBlobCid))
    .slice(0, input.limit ?? 200)

  for (const row of missing) {
    const cid = row.thumbnailBlobCid as string
    if (!cid.startsWith('cid:blake3:') || added.has(cid)) continue

    const bytes = await input.blobStore.get(cid as `cid:blake3:${string}`).catch(() => null)
    if (input.isCancelled?.()) return added
    if (!bytes) continue

    const blob = new Blob([bytes as BlobPart], { type: input.contentTypeFor(row) })
    added.set(cid, input.createUrl(blob))
  }

  return added
}
