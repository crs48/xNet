/**
 * Pure logic behind useSocialFeedEnrichment: keying previews to
 * enrichment nodes, mapping hub unfurl responses onto node properties,
 * and a rate-limited fetch queue so feeds enrich visible items first
 * without hammering the hub or upstream providers.
 */
import type { SavedViewVisualPreviewModel } from '@xnetjs/react'

export type SocialEnrichmentTarget = {
  key: string
  platform: string
  platformContentId: string
  url: string
}

export type SocialUnfurlMetadataPayload = {
  status?: string
  reason?: string
  metadata?: {
    title?: string | null
    subtitle?: string | null
    description?: string | null
    imageUrl?: string | null
    providerName?: string | null
    authorName?: string | null
    source?: string | null
    sourceUrl?: string | null
  } | null
}

export type SocialEnrichmentNodeData = {
  platform: string
  platformContentId: string
  canonicalUrl: string
  status: 'resolved' | 'unavailable' | 'blocked' | 'error'
  title?: string
  description?: string
  authorName?: string
  thumbnailUrl?: string
  thumbnailBlobCid?: string
  source?: string
  fetchedAt: number
  attemptCount: number
  lastError?: string
  metadataJson?: string
}

export function socialEnrichmentKey(platform: string, platformContentId: string): string {
  return `${platform}:${platformContentId}`
}

/**
 * A preview is enrichable when it maps to a platform content node with a
 * canonical URL the hub can unfurl.
 */
export function enrichmentTargetForPreview(
  preview: Pick<SavedViewVisualPreviewModel, 'platform' | 'platformContentId' | 'url'>
): SocialEnrichmentTarget | null {
  if (!preview.platformContentId || !preview.url) return null
  if (!preview.platform || preview.platform === 'generic') return null

  return {
    key: socialEnrichmentKey(preview.platform, preview.platformContentId),
    platform: preview.platform,
    platformContentId: preview.platformContentId,
    url: preview.url
  }
}

function cleanString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

const ENRICHMENT_STATUSES = ['resolved', 'unavailable', 'blocked', 'error'] as const

function enrichmentStatusFor(status: string | undefined): SocialEnrichmentNodeData['status'] {
  const known = ENRICHMENT_STATUSES.find((candidate) => candidate === status)
  return known ?? 'unavailable'
}

const ENRICHMENT_SOURCES = ['oembed', 'open-graph'] as const

function enrichmentSourceFor(source: string | null | undefined): string | undefined {
  return ENRICHMENT_SOURCES.find((candidate) => candidate === source)
}

function assignDefined<K extends keyof SocialEnrichmentNodeData>(
  data: SocialEnrichmentNodeData,
  key: K,
  value: SocialEnrichmentNodeData[K] | undefined
): void {
  if (value !== undefined) data[key] = value
}

export function buildEnrichmentNodeData(input: {
  target: SocialEnrichmentTarget
  payload: SocialUnfurlMetadataPayload
  attemptCount: number
  fetchedAtMs: number
  thumbnailBlobCid?: string
  thumbnailContentType?: string
}): SocialEnrichmentNodeData {
  const status = enrichmentStatusFor(input.payload.status)
  const metadata = input.payload.metadata ?? null

  const data: SocialEnrichmentNodeData = {
    platform: input.target.platform,
    platformContentId: input.target.platformContentId,
    canonicalUrl: input.target.url,
    status,
    fetchedAt: input.fetchedAtMs,
    attemptCount: input.attemptCount
  }

  assignDefined(data, 'title', cleanString(metadata?.title))
  assignDefined(data, 'description', cleanString(metadata?.description))
  assignDefined(data, 'authorName', cleanString(metadata?.authorName))
  assignDefined(data, 'thumbnailUrl', cleanString(metadata?.imageUrl))
  assignDefined(data, 'thumbnailBlobCid', input.thumbnailBlobCid)
  assignDefined(data, 'source', enrichmentSourceFor(metadata?.source))
  if (status !== 'resolved') {
    assignDefined(data, 'lastError', cleanString(input.payload.reason))
  }
  if (input.thumbnailContentType) {
    data.metadataJson = JSON.stringify({ thumbnailContentType: input.thumbnailContentType })
  }

  return data
}

export type EnrichmentRowLike = {
  id: string
  status?: string
  title?: string
  description?: string
  authorName?: string
  thumbnailUrl?: string
  thumbnailBlobCid?: string
  metadataJson?: string
}

export type FeedEnrichmentEntry = {
  title: string | null
  description: string | null
  authorName: string | null
  thumbnailUrl: string | null
}

/** Map a resolved enrichment node onto display fields for a feed card. */
export function feedEnrichmentEntryFor(
  row: EnrichmentRowLike | undefined,
  blobUrl: string | undefined
): FeedEnrichmentEntry | null {
  if (!row || row.status !== 'resolved') return null

  return {
    title: row.title ?? null,
    description: row.description ?? null,
    authorName: row.authorName ?? null,
    thumbnailUrl: blobUrl ?? row.thumbnailUrl ?? null
  }
}

export function thumbnailContentTypeFor(row: Pick<EnrichmentRowLike, 'metadataJson'>): string {
  try {
    const metadata = JSON.parse(row.metadataJson ?? '{}') as { thumbnailContentType?: string }
    return metadata.thumbnailContentType ?? 'image/jpeg'
  } catch {
    return 'image/jpeg'
  }
}

export function hubHttpUrlFor(hubUrl: string): string {
  try {
    const url = new URL(hubUrl)
    if (url.protocol === 'ws:') url.protocol = 'http:'
    if (url.protocol === 'wss:') url.protocol = 'https:'
    return url.toString().replace(/\/$/, '')
  } catch {
    return hubUrl
  }
}

export function hubAuthHeaders(token: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function resolveHubAuthToken(
  getToken: (() => Promise<string>) | undefined
): Promise<string> {
  if (!getToken) return ''
  return getToken().catch(() => '')
}

export function nextEnrichmentAttempt(existing: { attemptCount?: number } | undefined): number {
  return (existing?.attemptCount ?? 0) + 1
}

export type EnrichmentFetchResult = {
  payload: SocialUnfurlMetadataPayload
  thumbnailBlobCid?: string
  thumbnailContentType?: string
}

/**
 * Fetch unfurled metadata for a target through the hub and, when a
 * thumbnail is available, capture its bytes into the blob store so the
 * feed can render it without any later network access.
 */
export async function fetchEnrichmentForTarget(input: {
  httpUrl: string
  headers: Record<string, string>
  target: SocialEnrichmentTarget
  blobStore: { put(data: Uint8Array): Promise<string> } | null
  fetchImpl?: typeof fetch
}): Promise<EnrichmentFetchResult> {
  const fetchImpl = input.fetchImpl ?? fetch
  const response = await fetchImpl(
    `${input.httpUrl}/unfurl/metadata?url=${encodeURIComponent(input.target.url)}&provider=${encodeURIComponent(input.target.platform)}`,
    { headers: input.headers }
  )
  if (!response.ok) {
    throw new Error(`Unfurl request failed with ${response.status}`)
  }
  const payload = (await response.json()) as SocialUnfurlMetadataPayload

  const imageUrl = payload.metadata?.imageUrl
  if (payload.status !== 'resolved' || !imageUrl || !input.blobStore) {
    return { payload }
  }

  const imageResponse = await fetchImpl(
    `${input.httpUrl}/unfurl/image?url=${encodeURIComponent(imageUrl)}`,
    { headers: input.headers }
  ).catch(() => null)
  if (!imageResponse?.ok) {
    return { payload }
  }

  const bytes = new Uint8Array(await imageResponse.arrayBuffer())
  if (bytes.byteLength === 0) {
    return { payload }
  }

  return {
    payload,
    thumbnailBlobCid: await input.blobStore.put(bytes),
    thumbnailContentType: imageResponse.headers.get('content-type') ?? undefined
  }
}

/**
 * Materialize object URLs for blob-cached thumbnails that are not in the
 * cache yet. Returns the new cid → object URL entries.
 */
export async function loadMissingThumbnailBlobUrls(input: {
  rows: readonly EnrichmentRowLike[]
  blobStore: { get(cid: `cid:blake3:${string}`): Promise<Uint8Array | null> }
  hasUrl: (cid: string) => boolean
  createUrl: (blob: Blob) => string
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

    const blob = new Blob([bytes as BlobPart], { type: thumbnailContentTypeFor(row) })
    added.set(cid, input.createUrl(blob))
  }

  return added
}

const DEFAULT_ENRICHMENT_INTERVAL_MS = 500

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Session-scoped fetch queue. Each key is attempted at most once per
 * session; pacing keeps provider traffic at a polite trickle while the
 * first screen of a feed still enriches within seconds.
 */
export class SocialEnrichmentQueue {
  private pending: SocialEnrichmentTarget[] = []
  private seen = new Set<string>()
  private running = false
  private disposed = false

  constructor(
    private readonly executor: (target: SocialEnrichmentTarget) => Promise<void>,
    private readonly intervalMs = DEFAULT_ENRICHMENT_INTERVAL_MS,
    private readonly delayFn: (ms: number) => Promise<void> = defaultDelay
  ) {}

  /** Keys that already have enrichment nodes never enter the queue. */
  markKnown(keys: Iterable<string>): void {
    for (const key of keys) this.seen.add(key)
  }

  enqueue(targets: readonly SocialEnrichmentTarget[]): void {
    if (this.disposed) return

    for (const target of targets) {
      if (this.seen.has(target.key)) continue
      this.seen.add(target.key)
      this.pending.push(target)
    }

    void this.pump()
  }

  get pendingCount(): number {
    return this.pending.length
  }

  dispose(): void {
    this.disposed = true
    this.pending = []
  }

  private async pump(): Promise<void> {
    if (this.running) return
    this.running = true

    try {
      while (!this.disposed && this.pending.length > 0) {
        const target = this.pending.shift()
        if (!target) break

        try {
          await this.executor(target)
        } catch {
          // The executor records failures on the enrichment node; a key
          // that threw stays in `seen` so this session will not retry it.
        }

        if (this.pending.length > 0) {
          await this.delayFn(this.intervalMs + Math.floor(Math.random() * 200))
        }
      }
    } finally {
      this.running = false
    }
  }
}
