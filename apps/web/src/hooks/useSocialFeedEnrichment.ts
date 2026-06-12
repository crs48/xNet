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
  fetchEnrichmentForTarget,
  feedEnrichmentEntryFor,
  hubAuthHeaders,
  hubHttpUrlFor,
  loadMissingThumbnailBlobUrls,
  nextEnrichmentAttempt,
  resolveHubAuthToken,
  socialEnrichmentKey,
  SocialEnrichmentQueue,
  type EnrichmentRowLike,
  type SocialEnrichmentTarget
} from './social-feed-enrichment'

type EnrichmentRow = EnrichmentRowLike & {
  platform?: string
  platformContentId?: string
  attemptCount?: number
}

const ENRICHMENT_QUERY_LIMIT = 2000

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

    let cancelled = false
    void loadMissingThumbnailBlobUrls({
      rows,
      blobStore,
      hasUrl: (cid) => blobUrlsRef.current.has(cid),
      createUrl: (blob) => URL.createObjectURL(blob),
      isCancelled: () => cancelled
    }).then((added) => {
      if (cancelled || added.size === 0) return
      for (const [cid, url] of added) blobUrlsRef.current.set(cid, url)
      setBlobUrlVersion((version) => version + 1)
    })

    return () => {
      cancelled = true
    }
  }, [blobStore, rows])

  const executorRef = useRef<(target: SocialEnrichmentTarget) => Promise<void>>(async () => {})
  executorRef.current = async (target) => {
    if (!hubUrl) return

    const token = await resolveHubAuthToken(getHubAuthToken)
    const result = await fetchEnrichmentForTarget({
      httpUrl: hubHttpUrlFor(hubUrl),
      headers: hubAuthHeaders(token),
      target,
      blobStore
    })

    const existing = rowsByKeyRef.current.get(target.key)
    const nodeData = buildEnrichmentNodeData({
      target,
      payload: result.payload,
      attemptCount: nextEnrichmentAttempt(existing),
      fetchedAtMs: Date.now(),
      thumbnailBlobCid: result.thumbnailBlobCid,
      thumbnailContentType: result.thumbnailContentType
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
      const blobUrl = row?.thumbnailBlobCid
        ? blobUrlsRef.current.get(row.thumbnailBlobCid)
        : undefined
      return feedEnrichmentEntryFor(row, blobUrl)
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
