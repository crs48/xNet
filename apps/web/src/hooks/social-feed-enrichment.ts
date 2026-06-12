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

export function buildEnrichmentNodeData(input: {
  target: SocialEnrichmentTarget
  payload: SocialUnfurlMetadataPayload
  attemptCount: number
  fetchedAtMs: number
  thumbnailBlobCid?: string
  thumbnailContentType?: string
}): SocialEnrichmentNodeData {
  const status =
    input.payload.status === 'resolved' ||
    input.payload.status === 'unavailable' ||
    input.payload.status === 'blocked'
      ? input.payload.status
      : input.payload.status === 'error'
        ? 'error'
        : 'unavailable'
  const metadata = input.payload.metadata
  const source =
    metadata?.source === 'oembed' || metadata?.source === 'open-graph' ? metadata.source : undefined

  return {
    platform: input.target.platform,
    platformContentId: input.target.platformContentId,
    canonicalUrl: input.target.url,
    status,
    ...(cleanString(metadata?.title) ? { title: cleanString(metadata?.title) } : {}),
    ...(cleanString(metadata?.description)
      ? { description: cleanString(metadata?.description) }
      : {}),
    ...(cleanString(metadata?.authorName) ? { authorName: cleanString(metadata?.authorName) } : {}),
    ...(cleanString(metadata?.imageUrl) ? { thumbnailUrl: cleanString(metadata?.imageUrl) } : {}),
    ...(input.thumbnailBlobCid ? { thumbnailBlobCid: input.thumbnailBlobCid } : {}),
    ...(source ? { source } : {}),
    fetchedAt: input.fetchedAtMs,
    attemptCount: input.attemptCount,
    ...(status !== 'resolved' && cleanString(input.payload.reason)
      ? { lastError: cleanString(input.payload.reason) }
      : {}),
    ...(input.thumbnailContentType
      ? { metadataJson: JSON.stringify({ thumbnailContentType: input.thumbnailContentType }) }
      : {})
  }
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
