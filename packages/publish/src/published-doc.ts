/**
 * Which document does a reader actually see? (exploration 0362, D2)
 *
 * `publishedFrontier` records the version at publish time, but recording a pin
 * is not the same as honouring it. This module is the seam that honours it:
 * given a post and a way to fetch a Yjs snapshot, it returns the `Y.Doc` to
 * render — the pinned snapshot when there is one, the live document otherwise.
 *
 * The snapshot store lives in `@xnetjs/history`, which depends on `@xnetjs/data`.
 * Importing it here would drag the whole data layer into a package whose point
 * is to run in a bare static build, so the resolver is **injected**. The static
 * build passes one backed by an export; a hub route passes one backed by
 * `DocumentHistoryEngine`.
 */
import type { Frontier, PostRecord } from './pipeline'
import type * as Y from 'yjs'

/**
 * Fetch the Yjs document for a snapshot ref (`<nodeId>@<timestamp>`).
 *
 * Returns `null` when the snapshot is gone — pruned past the history horizon,
 * or never captured. Callers must treat that as a real condition, not an error.
 */
export type SnapshotResolver = (ref: string) => Promise<Y.Doc | null> | Y.Doc | null

export type ResolvedDoc = {
  doc: Y.Doc
  /**
   * Which version this is:
   * - `pinned` — the snapshot named by `publishedFrontier`. What readers should see.
   * - `live` — the current document, because the post pins no document lane.
   * - `fallback` — the pin exists but its snapshot could not be resolved.
   */
  source: 'pinned' | 'live' | 'fallback'
  /** Set on `fallback`, explaining what went wrong. */
  warning?: string
}

/** The frontier entry covering a post's own document lane. */
export function documentEntry(post: PostRecord, frontier?: Frontier): string | undefined {
  const f = frontier ?? post.publishedFrontier
  return f?.[post.id]?.yjsSnapshotRef
}

/**
 * Resolve the document a reader should see for a post.
 *
 * A published post whose pin cannot be resolved falls back to the live
 * document **and says so**. Rendering the current text under an old
 * publication date is a smaller lie than rendering nothing, but it is still a
 * lie, so the caller gets a warning to surface rather than a silent swap.
 */
export async function resolvePublishedDoc(
  post: PostRecord,
  liveDoc: Y.Doc,
  resolveSnapshot?: SnapshotResolver
): Promise<ResolvedDoc> {
  const ref = documentEntry(post)

  // Not published, or no document lane pinned: the live doc is correct.
  if (!ref || post.publishedAt === undefined || post.publishedAt === null) {
    return { doc: liveDoc, source: 'live' }
  }

  if (!resolveSnapshot) {
    return {
      doc: liveDoc,
      source: 'fallback',
      warning: `post "${post.id}" pins snapshot ${ref} but no snapshot resolver was supplied; rendering the live document`
    }
  }

  let snapshot: Y.Doc | null = null
  try {
    snapshot = await resolveSnapshot(ref)
  } catch (error) {
    return {
      doc: liveDoc,
      source: 'fallback',
      warning: `snapshot ${ref} failed to load (${(error as Error).message}); rendering the live document`
    }
  }

  if (!snapshot) {
    return {
      doc: liveDoc,
      source: 'fallback',
      warning: `snapshot ${ref} is unavailable (pruned past the history horizon?); rendering the live document`
    }
  }

  return { doc: snapshot, source: 'pinned' }
}
