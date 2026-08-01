/**
 * @xnetjs/social — the resumable publish queue (0420 WP1).
 *
 * A PDS sustains roughly 11,700 creates/day, so publishing is a trickle, not a
 * batch: a 2,000-edge run takes hours and WILL be interrupted. Two properties
 * follow, and both are load-bearing:
 *
 * - **Resumable.** Progress is the publish map, which is written after every
 *   successful record. Re-running the same selection re-publishes only what is
 *   missing.
 * - **Loud about incompleteness.** A run that stopped at record 900 of 2,000
 *   reports `published: 900, staged: 1100` — never "done". Per the repo's error
 *   rule, a truncated run is not a completed one, and the four states here
 *   (`staged` / `published` / `failed` / `withdrawn`) stay distinguishable all
 *   the way to the UI.
 *
 * The queue owns no clock and no randomness of its own: `sleep`, `now` and
 * `jitter` are injected so tests run instantly and deterministically, which is
 * the only way a backoff policy ever gets tested at all.
 */

import type { RemoteBookmark } from './rkey'
import type { PublishState, PublishableEdge, PublishedEdge } from './types'
import { projectRecord } from '@xnetjs/data'
import { AFFINITY_NSID, BOOKMARK_NSID } from './constants'
import { interactionToAffinity, interactionToBookmark } from './lenses'
import { affinityRkey } from './rkey'

/** The subset of a PDS session this pipeline needs. Injected, so tests use fakes. */
export interface RepoWriter {
  /** The repo being written to. */
  did: string
  /** `com.atproto.repo.createRecord` — returns the assigned uri/cid. */
  createRecord(input: {
    collection: string
    record: Record<string, unknown>
  }): Promise<{ uri: string; cid: string }>
  /** `com.atproto.repo.putRecord` — for collections with a deterministic rkey. */
  putRecord(input: {
    collection: string
    rkey: string
    record: Record<string, unknown>
  }): Promise<{ uri: string; cid: string }>
  /** `com.atproto.repo.deleteRecord`. */
  deleteRecord(input: { collection: string; rkey: string }): Promise<void>
  /** Existing records in a collection, for `reconcile`. */
  listRecords(collection: string): Promise<RemoteBookmark[]>
}

export interface PublishRunOptions {
  /** Also write the `fyi.xnet.social.affinity` extension record. */
  includeAffinity?: boolean
  /** Stop after this many successful writes (a per-session budget). */
  limit?: number
  /** Consecutive failures after which the run stops rather than hammering the PDS. */
  maxConsecutiveFailures?: number
  /** Base delay between writes, milliseconds. */
  baseDelayMs?: number
  /** Injected for tests: no wall clock, no `Math.random`, no real waiting. */
  sleep?: (ms: number) => Promise<void>
  now?: () => string
  jitter?: () => number
  /** Called after every state change, so a UI can show progress live. */
  onProgress?: (progress: PublishProgress) => void
  /** Abort a run in flight (the user closed the dialog, the app is quitting). */
  signal?: { aborted: boolean }
}

export interface PublishProgress {
  published: number
  staged: number
  failed: number
  total: number
}

export interface PublishRunResult extends PublishProgress {
  /** New map entries from this run, to merge into the stored map. */
  written: PublishedEdge[]
  /** Per-edge outcome. `staged` here means "not reached" — the run is unfinished. */
  states: Map<string, PublishState>
  /** First error per failed edge, for the UI to explain rather than swallow. */
  errors: Map<string, string>
  /** True only when every selected edge is `published`. */
  complete: boolean
  /** Why the run stopped early, when it did. */
  stoppedBecause?: 'limit' | 'aborted' | 'consecutive-failures'
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Delay before the nth consecutive failure's retry, capped so a long run cannot
 * stall indefinitely on a PDS that is simply down.
 */
export function backoffMs(base: number, consecutiveFailures: number, jitter: number): number {
  const exponential = base * 2 ** Math.min(consecutiveFailures, 6)
  return Math.round(Math.min(exponential, 60_000) * (0.5 + jitter))
}

/**
 * Publish a selected bucket, skipping anything already in the map.
 *
 * `already` is the reconciled publish map. Edges present in it are counted as
 * published and never rewritten — that skip IS the idempotence guarantee, and
 * it is why `reconcile()` must run before this function, not after.
 */
export async function runPublish(
  edges: readonly PublishableEdge[],
  already: ReadonlyMap<string, PublishedEdge>,
  writer: RepoWriter,
  options: PublishRunOptions = {}
): Promise<PublishRunResult> {
  const {
    includeAffinity = false,
    limit = Number.POSITIVE_INFINITY,
    maxConsecutiveFailures = 5,
    baseDelayMs = 250,
    sleep = defaultSleep,
    now = () => new Date().toISOString(),
    jitter = Math.random,
    onProgress,
    signal
  } = options

  const states = new Map<string, PublishState>()
  const errors = new Map<string, string>()
  const written: PublishedEdge[] = []
  let published = 0
  let failed = 0
  let consecutiveFailures = 0
  let stoppedBecause: PublishRunResult['stoppedBecause']

  // Everything starts `staged`. An edge that never gets reached keeps that
  // state, which is exactly the honest answer for an interrupted run.
  for (const edge of edges) states.set(edge.nodeId, 'staged')

  const progress = (): PublishProgress => ({
    published,
    failed,
    staged: edges.length - published - failed,
    total: edges.length
  })

  for (const edge of edges) {
    if (already.has(edge.nodeId)) {
      states.set(edge.nodeId, 'published')
      published++
      onProgress?.(progress())
      continue
    }
    if (signal?.aborted) {
      stoppedBecause = 'aborted'
      break
    }
    if (published >= limit) {
      stoppedBecause = 'limit'
      break
    }

    const node = toNodeProperties(edge)
    try {
      const bookmark = await writer.createRecord({
        collection: BOOKMARK_NSID,
        record: projectRecord(interactionToBookmark, node)
      })

      let affinity: { uri: string; cid: string } | undefined
      if (includeAffinity) {
        affinity = await writer.putRecord({
          collection: AFFINITY_NSID,
          rkey: affinityRkey(edge.nodeId),
          record: projectRecord(interactionToAffinity, { ...node, bookmarkUri: bookmark.uri })
        })
      }

      written.push({
        nodeId: edge.nodeId,
        uri: bookmark.uri,
        cid: bookmark.cid,
        affinityUri: affinity?.uri,
        publishedAt: now()
      })
      states.set(edge.nodeId, 'published')
      published++
      consecutiveFailures = 0
      onProgress?.(progress())
      if (baseDelayMs > 0) await sleep(Math.round(baseDelayMs * (0.5 + jitter())))
    } catch (err) {
      states.set(edge.nodeId, 'failed')
      errors.set(edge.nodeId, err instanceof Error ? err.message : String(err))
      failed++
      consecutiveFailures++
      onProgress?.(progress())
      if (consecutiveFailures >= maxConsecutiveFailures) {
        stoppedBecause = 'consecutive-failures'
        break
      }
      await sleep(backoffMs(baseDelayMs, consecutiveFailures, jitter()))
    }
  }

  return {
    ...progress(),
    written,
    states,
    errors,
    complete: published === edges.length && failed === 0,
    stoppedBecause
  }
}

/**
 * Withdraw published edges.
 *
 * Withdrawal is not retraction. `deleteRecord` edits the user's own repo; it
 * does not reach firehose archives, third-party appviews, or anyone's cache.
 * Every surface that offers this must say so in those words — the function
 * cannot enforce that, but the comment is here so nobody implements the UI
 * believing otherwise.
 */
export async function runWithdraw(
  entries: readonly PublishedEdge[],
  writer: RepoWriter
): Promise<{ withdrawn: string[]; failed: Map<string, string> }> {
  const withdrawn: string[] = []
  const failed = new Map<string, string>()
  for (const entry of entries) {
    const rkey = entry.uri.split('/').pop()
    if (!rkey) {
      failed.set(entry.nodeId, `unparseable at-uri: ${entry.uri}`)
      continue
    }
    try {
      await writer.deleteRecord({ collection: BOOKMARK_NSID, rkey })
      if (entry.affinityUri) {
        await writer.deleteRecord({
          collection: AFFINITY_NSID,
          rkey: affinityRkey(entry.nodeId)
        })
      }
      withdrawn.push(entry.nodeId)
    } catch (err) {
      failed.set(entry.nodeId, err instanceof Error ? err.message : String(err))
    }
  }
  return { withdrawn, failed }
}

/** The property bag the lenses read. Kept here so the shape has one owner. */
export function toNodeProperties(edge: PublishableEdge): Record<string, unknown> {
  return {
    platform: edge.platform,
    interactionKind: edge.interactionKind,
    privacyClass: edge.privacyClass,
    targetUrl: edge.targetUrl,
    platformContentId: edge.platformContentId,
    observedAt: edge.occurredAt,
    tags: edge.tags ?? []
  }
}
