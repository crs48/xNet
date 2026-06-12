/**
 * useSocialFeedEnrichment — feed enrichment adapter backed by local
 * SocialEnrichment nodes and the hub /unfurl proxy.
 *
 * Lookups merge locally cached titles, descriptions, and thumbnails over
 * imported preview rows; requestMany feeds a rate-limited queue that
 * fetches metadata (and thumbnail bytes into the BlobStore) for the
 * previews currently on screen, once, and persists the result so every
 * later render works entirely from the local store.
 */
import type {
  SavedViewFeedEnrichmentAdapter,
  SavedViewFeedEnrichmentEntry,
  SavedViewVisualPreviewModel
} from '@xnetjs/react'
import { useMutate, useQuery, useXNet } from '@xnetjs/react'
import { createSocialEnrichmentId, SocialEnrichmentSchema } from '@xnetjs/social/schemas'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildEnrichmentNodeData,
  enrichmentTargetForPreview,
  socialEnrichmentKey,
  SocialEnrichmentQueue,
  type SocialEnrichmentTarget,
  type SocialUnfurlMetadataPayload
} from './social-feed-enrichment'

type EnrichmentRow = {
  id: string
  platform?: string
  platformContentId?: string
  status?: string
  title?: string
  description?: string
  authorName?: string
  thumbnailUrl?: string
  thumbnailBlobCid?: string
  attemptCount?: number
  metadataJson?: string
}

const ENRICHMENT_QUERY_LIMIT = 2000
const BLOB_URL_LOAD_BATCH = 200

function toHttpUrl(hubUrl: string): string {
  try {
    const url = new URL(hubUrl)
    if (url.protocol === 'ws:') url.protocol = 'http:'
    if (url.protocol === 'wss:') url.protocol = 'https:'
    return url.toString().replace(/\/$/, '')
  } catch {
    return hubUrl
  }
}

function thumbnailContentTypeFor(row: EnrichmentRow): string {
  try {
    const metadata = JSON.parse(row.metadataJson ?? '{}') as { thumbnailContentType?: string }
    return metadata.thumbnailContentType ?? 'image/jpeg'
  } catch {
    return 'image/jpeg'
  }
}

export function useSocialFeedEnrichment(): SavedViewFeedEnrichmentAdapter {
  const { hubUrl, getHubAuthToken, blobStore } = useXNet()
  const { mutate } = useMutate()
  const { data } = useQuery(SocialEnrichmentSchema, {
    orderBy: { fetchedAt: 'desc' },
    limit: ENRICHMENT_QUERY_LIMIT
  })
  const rows = data as unknown as EnrichmentRow[]
  const [blobUrlVersion, setBlobUrlVersion] = useState(0)
  const blobUrlsRef = useRef(new Map<string, string>())

  const rowsByKey = useMemo(() => {
    const map = new Map<string, EnrichmentRow>()
    for (const row of rows) {
      if (row.platform && row.platformContentId) {
        map.set(socialEnrichmentKey(row.platform, row.platformContentId), row)
      }
    }
    return map
  }, [rows])
  const rowsByKeyRef = useRef(rowsByKey)
  rowsByKeyRef.current = rowsByKey

  // Materialize object URLs for blob-cached thumbnails so feeds render
  // them without any network access.
  useEffect(() => {
    if (!blobStore) return

    const missing = rows
      .filter((row) => row.thumbnailBlobCid && !blobUrlsRef.current.has(row.thumbnailBlobCid))
      .slice(0, BLOB_URL_LOAD_BATCH)
    if (missing.length === 0) return

    let cancelled = false
    void (async () => {
      let added = false
      for (const row of missing) {
        const cid = row.thumbnailBlobCid as string
        if (!cid.startsWith('cid:blake3:')) continue
        const bytes = await blobStore.get(cid as `cid:blake3:${string}`).catch(() => null)
        if (cancelled) return
        if (!bytes || blobUrlsRef.current.has(cid)) continue

        const blob = new Blob([bytes as BlobPart], { type: thumbnailContentTypeFor(row) })
        blobUrlsRef.current.set(cid, URL.createObjectURL(blob))
        added = true
      }
      if (added && !cancelled) setBlobUrlVersion((version) => version + 1)
    })()

    return () => {
      cancelled = true
    }
  }, [blobStore, rows])

  const executorRef = useRef<(target: SocialEnrichmentTarget) => Promise<void>>(async () => {})
  executorRef.current = async (target) => {
    if (!hubUrl) return

    const httpUrl = toHttpUrl(hubUrl)
    const token = getHubAuthToken ? await getHubAuthToken().catch(() => '') : ''
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

    const response = await fetch(
      `${httpUrl}/unfurl/metadata?url=${encodeURIComponent(target.url)}&provider=${encodeURIComponent(target.platform)}`,
      { headers }
    )
    if (!response.ok) {
      throw new Error(`Unfurl request failed with ${response.status}`)
    }
    const payload = (await response.json()) as SocialUnfurlMetadataPayload

    let thumbnailBlobCid: string | undefined
    let thumbnailContentType: string | undefined
    const imageUrl = payload.metadata?.imageUrl
    if (payload.status === 'resolved' && imageUrl && blobStore) {
      const imageResponse = await fetch(
        `${httpUrl}/unfurl/image?url=${encodeURIComponent(imageUrl)}`,
        { headers }
      ).catch(() => null)

      if (imageResponse?.ok) {
        const bytes = new Uint8Array(await imageResponse.arrayBuffer())
        if (bytes.byteLength > 0) {
          thumbnailBlobCid = await blobStore.put(bytes)
          thumbnailContentType = imageResponse.headers.get('content-type') ?? undefined
        }
      }
    }

    const existing = rowsByKeyRef.current.get(target.key)
    const nodeData = buildEnrichmentNodeData({
      target,
      payload,
      attemptCount: (existing?.attemptCount ?? 0) + 1,
      fetchedAtMs: Date.now(),
      thumbnailBlobCid,
      thumbnailContentType
    })

    await mutate([
      existing
        ? { type: 'update', id: existing.id, data: nodeData }
        : {
            type: 'create',
            schema: SocialEnrichmentSchema,
            id: createSocialEnrichmentId(target.platform, target.platformContentId),
            data: nodeData
          }
    ])
  }

  // Created lazily on first use and recreated after unmount cleanup, so a
  // StrictMode double-mount never leaves a permanently disposed queue
  // behind in the surviving ref.
  const queueRef = useRef<SocialEnrichmentQueue | null>(null)
  const ensureQueue = (): SocialEnrichmentQueue => {
    queueRef.current ??= new SocialEnrichmentQueue((target) => executorRef.current(target))
    return queueRef.current
  }

  useEffect(() => {
    const blobUrls = blobUrlsRef.current

    return () => {
      queueRef.current?.dispose()
      queueRef.current = null
      for (const url of blobUrls.values()) URL.revokeObjectURL(url)
      blobUrls.clear()
    }
  }, [])

  return useMemo<SavedViewFeedEnrichmentAdapter>(() => {
    // blobUrlVersion invalidates lookups when new object URLs materialize.
    void blobUrlVersion

    const lookup = (preview: SavedViewVisualPreviewModel): SavedViewFeedEnrichmentEntry | null => {
      const target = enrichmentTargetForPreview(preview)
      if (!target) return null

      const row = rowsByKey.get(target.key)
      if (!row || row.status !== 'resolved') return null

      const blobUrl = row.thumbnailBlobCid
        ? blobUrlsRef.current.get(row.thumbnailBlobCid)
        : undefined

      return {
        title: row.title ?? null,
        description: row.description ?? null,
        authorName: row.authorName ?? null,
        thumbnailUrl: blobUrl ?? row.thumbnailUrl ?? null
      }
    }

    if (!hubUrl) {
      // Without a hub there is nothing to fetch; cached enrichment still
      // renders, new fetches resume when a hub session exists.
      return { lookup }
    }

    return {
      lookup,
      requestMany: (previews) => {
        const targets = previews
          .map((preview) => enrichmentTargetForPreview(preview))
          .filter((target): target is SocialEnrichmentTarget => Boolean(target))
          .filter((target) => !rowsByKeyRef.current.has(target.key))
        if (targets.length > 0) ensureQueue().enqueue(targets)
      }
    }
  }, [blobUrlVersion, hubUrl, rowsByKey])
}
