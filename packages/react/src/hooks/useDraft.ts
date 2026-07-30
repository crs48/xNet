/**
 * useDraft — React binding for drafts (exploration 0329 P2/P3).
 *
 * Given a host node id, wraps the draft engine (`@xnetjs/history` draft/merge
 * modules) and the NodeStore checkout overlay into one hook the switcher and
 * review surfaces bind to:
 *
 * - `drafts` lists open Draft nodes targeting the host, newest first.
 * - `createDraft` opens an empty draft (Upwelling: a name that signals
 *   intent); forking stays lazy — the first write through the overlay clones
 *   the touched member (`onMissingMember` → `forkNodeIntoDraft`).
 * - `checkout` installs the store overlay (content-swap reads, write
 *   redirect); `returnToMain` clears it. The clones map is re-derived from
 *   the draft's entries at checkout and kept fresh via
 *   `subscribeToDraftOverlay` (the store self-updates it on lazy forks).
 * - `merge` is the merger-signed three-way squash — it returns conflict
 *   cards (applying nothing) when main and draft both changed a property.
 * - `refresh` folds main's post-fork changes into the draft (floating
 *   drafts); it pauses on the same conflict cards.
 * - `computeReview` builds per-property review cards (base at fork vs main
 *   now vs draft now) WITHOUT applying anything — the DraftReviewPanel's
 *   data source.
 *
 * @example
 * ```tsx
 * const d = useDraft(nodeId)
 * {d.checkedOut ? `Draft: ${d.checkedOut.properties.name}` : 'Main'}
 * ```
 */

import type { ContentId } from '@xnetjs/core'
import type { NodeId, NodeState, NodeStorageAdapter, NodeStore } from '@xnetjs/data'
import { DRAFT_SCHEMA_IRI, DatabaseRowSchema, DatabaseSchema } from '@xnetjs/data'
import {
  HistoryEngine,
  MemorySnapshotStorage,
  SnapshotCache,
  createDraft as createDraftNode,
  discardDraft,
  draftEntries,
  forkNodeIntoDraft,
  listDrafts,
  mergeDraft,
  refreshDraftFromMain,
  threeWayPropertyMerge,
  type MergeDraftResult,
  type RefreshDraftResult
} from '@xnetjs/history'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNodeStore } from './useNodeStore'

// ─── Types ───────────────────────────────────────────────────

/** One reviewable property difference between main and the draft. */
export interface DraftReviewCard {
  /** The original (main-side) node the property lives on. */
  originalId: NodeId
  property: string
  /** Value at the fork point (the three-way merge base). */
  base: unknown
  /** Main's value now. */
  main: unknown
  /** The draft's value now. */
  draft: unknown
  /** True when main and draft both changed the property differently. */
  conflict: boolean
}

/** One forked member's review summary. */
export interface DraftReviewMember {
  originalId: NodeId
  cloneId: NodeId
  /** The member carries a Yjs document forked into the draft. */
  hasDocument: boolean
  /**
   * The member's document bytes differ between draft and main (no text diff
   * yet — deferred; this powers the "document edited in draft" line).
   */
  documentDiffers: boolean
}

/** Pending changes + conflicts for a draft, computed without applying. */
export interface DraftReview {
  cards: DraftReviewCard[]
  members: DraftReviewMember[]
}

export interface UseDraftResult {
  /** Open drafts targeting the host node, newest first. */
  drafts: NodeState[]
  /** The Draft node checked out for THIS host, or null (on main). */
  checkedOut: NodeState | null
  /** Create (and check out) an open draft named for its intent. */
  createDraft: (name: string) => Promise<NodeState | null>
  /** Install the checkout overlay for one of the host's drafts. */
  checkout: (draftId: NodeId) => Promise<boolean>
  /** Clear the overlay — reads and writes hit main again. */
  returnToMain: () => void
  /** Tombstone clones + release pins; checks out main first if needed. */
  discard: (draftId: NodeId) => Promise<boolean>
  /** Merger-signed squash; `{status:'conflicts'}` applies nothing. */
  merge: (draftId: NodeId) => Promise<MergeDraftResult | null>
  /** Fold main's post-fork changes into the draft (floating drafts). */
  refresh: (draftId: NodeId) => Promise<RefreshDraftResult | null>
  /** P4: flag the draft for review in the Inbox/Requests surface. */
  setReviewRequested: (draftId: NodeId, requested: boolean) => Promise<void>
  /** Per-property review cards + member doc indicators; applies nothing. */
  computeReview: (draftId: NodeId) => Promise<DraftReview | null>

  loading: boolean
  error: Error | null
  reload: () => Promise<void>
}

// ─── Members ─────────────────────────────────────────────────

const baseIRI = (schemaId: string): string => schemaId.split('@')[0]

/**
 * The draft's member scope for a host: the host itself, plus — for a
 * Database host — its row nodes (each row doc carries its own rich-text
 * fragments, so cell edits must fork the row, not the database node).
 */
async function resolveMembers(store: NodeStore, hostId: NodeId): Promise<NodeId[]> {
  const members: NodeId[] = [hostId]
  const host = await store.getRaw(hostId)
  if (host && baseIRI(host.schemaId) === baseIRI(DatabaseSchema.schema['@id'])) {
    const rows = await store.list({ schemaId: DatabaseRowSchema.schema['@id'] })
    for (const row of rows) {
      if (row.properties.database === hostId) members.push(row.id)
    }
  }
  return members
}

/** originalId → cloneId map from a draft's entries. */
function clonesFromEntries(draft: NodeState): Record<NodeId, NodeId> {
  const clones: Record<NodeId, NodeId> = {}
  for (const [originalId, entry] of Object.entries(draftEntries(draft))) {
    clones[originalId as NodeId] = entry.cloneId as NodeId
  }
  return clones
}

// ─── Hook ────────────────────────────────────────────────────

export function useDraft(hostId: NodeId | null): UseDraftResult {
  const { store, isReady } = useNodeStore()

  const [drafts, setDrafts] = useState<NodeState[]>([])
  const [checkedOut, setCheckedOut] = useState<NodeState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Engine, stable per storage adapter (same shape as useTimeMachine).
  const engineRef = useRef<{ engine: HistoryEngine; storage: NodeStorageAdapter } | null>(null)
  const getEngines = useCallback(() => {
    if (!store) return null
    const storage = store.getStorageAdapter()
    if (!storage) return null
    if (!engineRef.current || engineRef.current.storage !== storage) {
      engineRef.current = {
        engine: new HistoryEngine(
          storage,
          new SnapshotCache(new MemorySnapshotStorage(), { interval: 50 })
        ),
        storage
      }
    }
    return engineRef.current
  }, [store])

  // ─── Loading ───────────────────────────────────────────────

  // Known Draft-node ids for the change subscription: update events carry no
  // schemaId (only creates do), so entry/status/review-flag writes are
  // recognized by node id.
  const draftIdsRef = useRef<Set<string>>(new Set())

  const reload = useCallback(async () => {
    if (!hostId || !isReady || !store) return
    setLoading(true)
    setError(null)
    try {
      const open = await listDrafts(store, hostId)
      setDrafts(open)
      for (const draft of open) draftIdsRef.current.add(draft.id)

      // The checked-out draft, when it targets this host. getRaw: the draft
      // node is bookkeeping, never a member — but stay overlay-independent.
      const overlay = store.getCheckedOutDraft()
      if (overlay) {
        const draftNode = await store.getRaw(overlay.draftId)
        setCheckedOut(
          draftNode &&
            draftNode.properties.status === 'open' &&
            draftNode.properties.target === hostId
            ? draftNode
            : null
        )
      } else {
        setCheckedOut(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
    }
  }, [hostId, isReady, store])

  useEffect(() => {
    void reload()
  }, [reload])

  // Live: Draft-node writes (create/fork bookkeeping/status/review flag)
  // reload the list; checkout changes (including lazy-fork clone-map
  // refreshes) reload the checked-out state.
  useEffect(() => {
    if (!store || !hostId) return
    const unsubStore = store.subscribe((event) => {
      if (
        event.change.payload.schemaId === DRAFT_SCHEMA_IRI ||
        draftIdsRef.current.has(event.change.payload.nodeId)
      ) {
        void reload()
      }
    })
    const unsubOverlay = store.subscribeToDraftOverlay(() => void reload())
    return () => {
      unsubStore()
      unsubOverlay()
    }
  }, [store, hostId, reload])

  // ─── Lifecycle ─────────────────────────────────────────────

  const checkout = useCallback(
    async (draftId: NodeId): Promise<boolean> => {
      if (!hostId || !store) return false
      const engines = getEngines()
      if (!engines) return false
      try {
        const draft = await store.getRaw(draftId)
        if (!draft || draft.properties.status !== 'open') return false

        const members = await resolveMembers(store, hostId)
        store.setCheckedOutDraft({
          draftId,
          members,
          clones: clonesFromEntries(draft),
          // Lazy copy-on-write: the first write to an unforked member clones
          // it. Returning null declines — the write then targets the
          // original (never-fork schemas stay live by policy).
          onMissingMember: async (originalId) => {
            try {
              const entry = await forkNodeIntoDraft(store, engines.storage, draftId, originalId)
              return entry.cloneId as NodeId
            } catch {
              return null
            }
          }
        })
        await reload()
        return true
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
        return false
      }
    },
    [hostId, store, getEngines, reload]
  )

  const returnToMain = useCallback(() => {
    if (!store) return
    store.setCheckedOutDraft(null)
  }, [store])

  const createDraft = useCallback(
    async (name: string): Promise<NodeState | null> => {
      if (!hostId || !store) return null
      try {
        const draft = await createDraftNode(store, { name, targetId: hostId })
        await checkout(draft.id)
        return draft
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
        return null
      }
    },
    [hostId, store, checkout]
  )

  const discard = useCallback(
    async (draftId: NodeId): Promise<boolean> => {
      if (!store) return false
      const engines = getEngines()
      if (!engines) return false
      try {
        // Leave the checkout FIRST so no read resolves to a tombstoned clone.
        if (store.getCheckedOutDraft()?.draftId === draftId) {
          store.setCheckedOutDraft(null)
        }
        await discardDraft(store, engines.storage, draftId)
        await reload()
        return true
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
        return false
      }
    },
    [store, getEngines, reload]
  )

  const merge = useCallback(
    async (draftId: NodeId): Promise<MergeDraftResult | null> => {
      if (!store) return null
      const engines = getEngines()
      if (!engines) return null
      try {
        const result = await mergeDraft(store, engines.storage, engines.engine, draftId)
        // Success lands you back on main — the merged state IS main now.
        if (result.status === 'merged' && store.getCheckedOutDraft()?.draftId === draftId) {
          store.setCheckedOutDraft(null)
        }
        await reload()
        return result
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
        return null
      }
    },
    [store, getEngines, reload]
  )

  const refresh = useCallback(
    async (draftId: NodeId): Promise<RefreshDraftResult | null> => {
      if (!store) return null
      const engines = getEngines()
      if (!engines) return null
      try {
        const result = await refreshDraftFromMain(store, engines.storage, engines.engine, draftId)
        await reload()
        return result
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
        return null
      }
    },
    [store, getEngines, reload]
  )

  const setReviewRequested = useCallback(
    async (draftId: NodeId, requested: boolean): Promise<void> => {
      if (!store) return
      try {
        await store.update(draftId, { properties: { reviewRequested: requested } })
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
      }
    },
    [store]
  )

  // ─── Review (read-only three-way) ──────────────────────────

  const computeReview = useCallback(
    async (draftId: NodeId): Promise<DraftReview | null> => {
      if (!store) return null
      const engines = getEngines()
      if (!engines) return null
      try {
        const draft = await store.getRaw(draftId)
        if (!draft) return null

        const cards: DraftReviewCard[] = []
        const members: DraftReviewMember[] = []

        for (const [id, entry] of Object.entries(draftEntries(draft))) {
          const originalId = id as NodeId
          const cloneId = entry.cloneId as NodeId
          // getRaw on BOTH sides: main's true state even while checked out.
          const [base, ours, theirs] = await Promise.all([
            engines.engine.materializeAt(originalId, {
              type: 'hash',
              hash: entry.forkedAtHash as ContentId
            }),
            store.getRaw(originalId),
            store.getRaw(cloneId)
          ])
          if (!ours || !theirs) continue

          // Display-only three-way (no id remap): patch keys are clean draft
          // wins, conflict cards are both-sides-changed properties.
          const result = threeWayPropertyMerge(
            base.node.properties,
            ours.properties,
            theirs.properties
          )
          for (const [property, draftValue] of Object.entries(result.patch)) {
            cards.push({
              originalId,
              property,
              base: base.node.properties[property],
              main: ours.properties[property],
              draft: draftValue,
              conflict: false
            })
          }
          for (const conflict of result.conflicts) {
            cards.push({
              originalId,
              property: conflict.property,
              base: conflict.base,
              main: conflict.ours,
              draft: conflict.theirs,
              conflict: true
            })
          }

          // Yjs lane indicator: byte-compare draft vs main doc blobs (no
          // text diff — deferred).
          const hasDocument = Boolean(entry.forkedAtYjsStateVector)
          let documentDiffers = false
          if (hasDocument) {
            const [cloneBlob, mainBlob] = await Promise.all([
              engines.storage.getDocumentContent(cloneId),
              engines.storage.getDocumentContent(originalId)
            ])
            documentDiffers = (cloneBlob?.length ?? 0) !== (mainBlob?.length ?? 0)
          }
          members.push({ originalId, cloneId, hasDocument, documentDiffers })
        }

        return { cards, members }
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
        return null
      }
    },
    [store, getEngines]
  )

  return {
    drafts,
    checkedOut,
    createDraft,
    checkout,
    returnToMain,
    discard,
    merge,
    refresh,
    setReviewRequested,
    computeReview,
    loading,
    error,
    reload
  }
}
