/**
 * The publish transition (exploration 0362).
 *
 * Publishing is not a flag flip. It assigns a permanent URL and pins the
 * version readers see, so this module owns the two decisions that are hard to
 * take back:
 *
 * 1. **Slug assignment** — unique within the publication, and *sticky*: once a
 *    post has a slug it is never silently regenerated, because the slug is a
 *    promise to every inbound link.
 * 2. **Frontier pinning** — the published version is a frontier snapshot
 *    (0329). Editing the live page does not move it; re-publishing does.
 *
 * Pure functions over plain records: no store, no I/O. The caller applies the
 * returned patch through whatever write path it already has.
 */
import { isValidSlug, uniqueSlug } from './slug'

/**
 * One node's position in a frontier (exploration 0329).
 *
 * Structurally the same shape as `FrontierEntry` in `@xnetjs/history`, redeclared
 * here rather than imported so `@xnetjs/publish` keeps its single `yjs`
 * dependency and stays runnable in a bare static build. The `yjsSnapshotRef` is
 * what makes the pin real for prose: without it a frontier pins only the record
 * lane, and a published post's body would drift with every edit.
 */
export type FrontierEntry = {
  /** Change hash to view the record lane at. */
  hash: string
  /** `<nodeId>@<timestamp>` ref into the Yjs snapshot store, when the node has a document lane. */
  yjsSnapshotRef?: string
}

/** A frontier: per-node, hash-anchored positions. */
export type Frontier = Record<string, FrontierEntry>

/** The publishing-relevant subset of a Page node. */
export type PostRecord = {
  id: string
  title: string
  slug?: string
  excerpt?: string
  publishedAt?: number | string
  canonicalUrl?: string
  publishedFrontier?: Frontier
}

/** Fields to write back after a publish/unpublish. */
export type PostPatch = Partial<
  Pick<PostRecord, 'slug' | 'excerpt' | 'publishedAt' | 'publishedFrontier'>
>

export type PublishInput = {
  post: PostRecord
  /** Slugs already used in this publication, excluding this post's own. */
  takenSlugs: Iterable<string>
  /** Current frontier of the post's document, pinned as the published version. */
  frontier: Frontier
  /** Publish timestamp. Passed in, never read from the clock, so this is pure. */
  now: number
  /** Generated excerpt, used only when the post has no authored one. */
  excerpt?: string
}

export type PublishResult = {
  patch: PostPatch
  /** True when this call assigns `publishedAt` for the first time. */
  isFirstPublish: boolean
  /** Warnings the caller should surface rather than swallow. */
  warnings: string[]
}

/**
 * Compute the patch that publishes (or re-publishes) a post.
 *
 * Re-publishing keeps the original `publishedAt` — the date a reader cites is
 * the date it first appeared, not the last time a typo was fixed — and moves
 * only the frontier.
 */
export function publishPost(input: PublishInput): PublishResult {
  const { post, frontier, now } = input
  const warnings: string[] = []
  const patch: PostPatch = {}

  const existing = post.slug?.trim()
  if (existing) {
    // Sticky: an already-assigned slug is never regenerated, even if the
    // title changed. Renaming a live URL is a deliberate act, not a side
    // effect of editing a heading.
    if (!isValidSlug(existing)) {
      warnings.push(
        `slug "${existing}" is not URL-safe; publish it under a corrected slug before sharing links`
      )
    }
  } else {
    patch.slug = uniqueSlug(post.title, input.takenSlugs)
  }

  const isFirstPublish = post.publishedAt === undefined || post.publishedAt === null
  if (isFirstPublish) patch.publishedAt = now

  // The pin: what readers see until the next publish (0329). Entries are
  // copied too, so a later mutation of the caller's frontier cannot rewrite
  // history for an already-published post.
  patch.publishedFrontier = Object.fromEntries(
    Object.entries(frontier).map(([nodeId, entry]) => [nodeId, { ...entry }])
  )

  if (!post.excerpt?.trim() && input.excerpt?.trim()) patch.excerpt = input.excerpt.trim()

  if (Object.keys(frontier).length === 0) {
    warnings.push('empty frontier: the published version pins no changes')
  }

  return { patch, isFirstPublish, warnings }
}

/**
 * Compute the patch that unpublishes a post.
 *
 * Clears `publishedAt` (the draft signal) but **keeps the slug**, so
 * re-publishing later restores the same URL rather than minting a new one and
 * orphaning inbound links.
 */
export function unpublishPost(): PostPatch {
  return { publishedAt: undefined, publishedFrontier: undefined }
}

/**
 * Frontier equality — whether the live document has moved past what readers see.
 *
 * Used to show "edited since publish" without diffing content.
 */
export function frontierEquals(a: Frontier | undefined, b: Frontier | undefined): boolean {
  if (!a || !b) return a === b
  const aKeys = Object.keys(a).sort()
  const bKeys = Object.keys(b).sort()
  if (aKeys.length !== bKeys.length) return false
  // Compare entry *contents*: FrontierEntry is an object, so `===` here would
  // be reference equality and every reloaded frontier would look different.
  return aKeys.every(
    (k, i) =>
      bKeys[i] === k &&
      a[k].hash === b[k].hash &&
      (a[k].yjsSnapshotRef ?? '') === (b[k].yjsSnapshotRef ?? '')
  )
}

/** True when the post has unpublished edits pending. */
export function hasUnpublishedChanges(post: PostRecord, current: Frontier): boolean {
  if (post.publishedAt === undefined) return false
  return !frontierEquals(post.publishedFrontier, current)
}

/**
 * Collect the slugs already in use in a publication, excluding one post.
 *
 * Uniqueness is scoped to the publication, not the workspace: two publications
 * may both have a post at `/hello`.
 */
export function takenSlugsFor(posts: PostRecord[], excludeId?: string): Set<string> {
  const out = new Set<string>()
  for (const post of posts) {
    if (post.id === excludeId) continue
    const slug = post.slug?.trim()
    if (slug) out.add(slug)
  }
  return out
}
