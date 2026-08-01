/**
 * Enrichment targets and the mapping onto stored nodes.
 *
 * Moved out of `apps/web` (exploration 0419) so the desktop app gets the same
 * pipeline instead of a second implementation. Nothing here touches React or
 * the DOM — the surfaces differ, the rules do not.
 */

export type SocialEnrichmentTarget = {
  key: string
  platform: string
  platformContentId: string
  url: string
}

/** The fields an enrichment decision needs from a rendered preview. */
export type SocialEnrichmentPreviewLike = {
  platform?: string | null
  platformContentId?: string | null
  url?: string | null
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
 * canonical URL some provider can resolve.
 */
export function enrichmentTargetForPreview(
  preview: SocialEnrichmentPreviewLike
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
