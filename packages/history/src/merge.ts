/**
 * Draft merge — the merger-signed three-way squash (exploration 0329 P3).
 *
 * `payload.nodeId` lives inside every change's hashed, signed body, so a
 * clone's changes can never be replayed onto its original. Instead the merge
 * is the fourth consumer of the proven "diff two NodeStates → sparse patch →
 * one transaction" pattern (undo, revert, schema-restore): a three-way,
 * per-property diff (fork base vs main-now vs draft-now) applied as ONE
 * `batchId` transaction the merging user signs. Draft authorship survives in
 * the Draft node's provenance, not in forged signatures.
 *
 * Two durability lanes: the record squash commits atomically; Yjs post-fork
 * deltas apply immediately after and are idempotent (`Y.mergeUpdates` over
 * blobs), so a crash between the lanes recovers by re-running the Yjs lane —
 * the draft's status flips to merged only after BOTH lanes land.
 */

import type { ContentId } from '@xnetjs/core'
import { fromBase64, toBase64 } from '@xnetjs/crypto'
import type {
  DraftEntry,
  DraftProvenance,
  NodeId,
  NodeStorageAdapter,
  NodeStore,
  TransactionOperation
} from '@xnetjs/data'
import * as Y from 'yjs'
import { draftEntries } from './draft'
import type { HistoryEngine } from './engine'
import { headHash } from './frontier'
import { deepEqual } from './utils'

// ─── Three-way property merge ────────────────────────────────

/** A both-sides-changed-differently property: needs a human decision. */
export interface DraftMergeConflict {
  originalId: NodeId
  property: string
  /** Value at the fork point (the merge base). */
  base: unknown
  /** Main's value now. */
  ours: unknown
  /** The draft's value now. */
  theirs: unknown
}

export interface ThreeWayResult {
  /** Sparse property patch to apply to the original (draft wins cleanly). */
  patch: Record<string, unknown>
  conflicts: Omit<DraftMergeConflict, 'originalId'>[]
}

/**
 * Per-property three-way merge. Only *both-sides-changed-differently*
 * properties conflict — everything else auto-merges (the structural answer
 * to Figma's whole-object A/B complaint):
 *
 * - draft didn't touch it → keep main's value (no patch entry)
 * - main didn't touch it, draft did → draft's value
 * - both changed to the same value → already converged
 * - both changed differently → conflict card
 *
 * `remapValue` maps draft-side ids (clones, draft-born temp ids) back to
 * main-side ids inside property values before comparison/patching.
 */
export function threeWayPropertyMerge(
  base: Record<string, unknown>,
  ours: Record<string, unknown>,
  theirs: Record<string, unknown>,
  remapValue: (value: unknown) => unknown = (v) => v
): ThreeWayResult {
  const patch: Record<string, unknown> = {}
  const conflicts: Omit<DraftMergeConflict, 'originalId'>[] = []

  const keys = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)])
  for (const key of keys) {
    const baseV = base[key]
    const oursV = ours[key]
    const theirsV = remapValue(theirs[key])

    if (deepEqual(theirsV, remapValue(baseV))) continue // draft untouched
    if (deepEqual(oursV, theirsV)) continue // both converged
    if (deepEqual(oursV, baseV)) {
      patch[key] = theirsV // clean draft win
      continue
    }
    conflicts.push({ property: key, base: baseV, ours: oursV, theirs: theirsV })
  }

  return { patch, conflicts }
}

/** Rewrite draft-side ids to main-side ids inside arbitrary property values. */
export function makeIdRemapper(idMap: Map<string, string>): (value: unknown) => unknown {
  const remap = (value: unknown): unknown => {
    if (typeof value === 'string') return idMap.get(value) ?? value
    if (Array.isArray(value)) return value.map(remap)
    return value
  }
  return remap
}

// ─── Merge ───────────────────────────────────────────────────

export type MergeDraftResult =
  | { status: 'merged'; provenance: DraftProvenance; operations: number }
  | { status: 'conflicts'; conflicts: DraftMergeConflict[] }

/**
 * Merge an open draft back into main: one merger-signed squash batch for
 * record properties (updates + draft-born creations via temp ids + draft
 * deletions), then the idempotent Yjs delta lane, then provenance + cleanup.
 * Returns conflict cards (and applies NOTHING) when any member has a
 * both-sides-changed property.
 */
export async function mergeDraft(
  store: NodeStore,
  storage: NodeStorageAdapter,
  engine: HistoryEngine,
  draftId: NodeId
): Promise<MergeDraftResult> {
  const draft = await store.getRaw(draftId)
  if (!draft) throw new Error(`Draft ${draftId} not found`)
  if (draft.properties.status !== 'open') {
    throw new Error(`Draft ${draftId} is ${String(draft.properties.status)}, not open`)
  }

  const entries = draftEntries(draft)
  const createdIds = (draft.properties.created as NodeId[] | undefined) ?? []
  const deletedIds = (draft.properties.deletedIds as NodeId[] | undefined) ?? []

  // Draft-side id -> main-side id: clones map to their originals; draft-born
  // nodes map to `~` temp ids the transaction resolves to fresh main ids.
  const idMap = new Map<string, string>()
  for (const [originalId, entry] of Object.entries(entries)) {
    idMap.set(entry.cloneId, originalId)
  }
  for (const createdId of createdIds) {
    idMap.set(createdId, `~promoted-${createdId}`)
  }
  const remapValue = makeIdRemapper(idMap)

  const operations: TransactionOperation[] = []
  const conflicts: DraftMergeConflict[] = []

  // 1. Updates: three-way per forked member.
  for (const [id, entry] of Object.entries(entries)) {
    const originalId = id as NodeId
    const base = await engine.materializeAt(originalId, {
      type: 'hash',
      hash: entry.forkedAtHash as ContentId
    })
    const ours = await store.getRaw(originalId)
    const theirs = await store.getRaw(entry.cloneId as NodeId)
    if (!ours || !theirs) continue

    const result = threeWayPropertyMerge(
      base.node.properties,
      ours.properties,
      theirs.properties,
      remapValue
    )
    for (const conflict of result.conflicts) {
      conflicts.push({ originalId, ...conflict })
    }
    if (Object.keys(result.patch).length > 0) {
      operations.push({ type: 'update', nodeId: originalId, options: { properties: result.patch } })
    }
  }

  // 2. Draft-born creations → new main nodes via temp ids.
  for (const createdId of createdIds) {
    const born = await store.getRaw(createdId)
    if (!born || born.deleted) continue
    const remapped: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(born.properties)) {
      remapped[key] = remapValue(value)
    }
    operations.push({
      type: 'create',
      options: {
        id: `~promoted-${createdId}` as NodeId,
        schemaId: born.schemaId,
        properties: remapped
      }
    })
  }

  // 3. Draft deletions → tombstone originals (conflict if main edited since fork).
  for (const originalId of deletedIds) {
    const entry = entries[originalId]
    const ours = await store.getRaw(originalId)
    if (!ours || ours.deleted) continue
    if (entry) {
      const base = await engine.materializeAt(originalId, {
        type: 'hash',
        hash: entry.forkedAtHash as ContentId
      })
      const mainChanged = !deepEqual(base.node.properties, ours.properties)
      if (mainChanged) {
        conflicts.push({
          originalId,
          property: '(deleted in draft)',
          base: base.node.properties,
          ours: ours.properties,
          theirs: undefined
        })
        continue
      }
    }
    operations.push({ type: 'delete', nodeId: originalId })
  }

  if (conflicts.length > 0) {
    return { status: 'conflicts', conflicts }
  }

  // 4. Record lane: ONE merger-signed batch (atomic).
  let tempIdResolution: Record<string, string> = {}
  if (operations.length > 0) {
    const result = await store.transaction(operations)
    tempIdResolution = result.tempIds ?? {}
  }

  // 5. Yjs lane: post-fork deltas onto originals. Idempotent — Y.mergeUpdates
  //    over blobs converges under re-application (crash recovery re-runs it).
  for (const [id, entry] of Object.entries(entries)) {
    await mergeYjsDelta(storage, id as NodeId, entry)
  }

  // 6. Provenance + cleanup. Status flips only after BOTH lanes landed.
  const contributors = new Set<string>()
  const merged: Record<string, string> = {}
  const mergedAtHashes: Record<string, string> = {}
  for (const [id, entry] of Object.entries(entries)) {
    merged[id] = entry.cloneId
    const head = await headHash(storage, id as NodeId)
    if (head) mergedAtHashes[id] = head
    for (const change of await storage.getChanges(entry.cloneId as NodeId)) {
      contributors.add(change.authorDID)
    }
    await store.delete(entry.cloneId as NodeId) // clones are spent
  }
  for (const createdId of createdIds) {
    const promoted = tempIdResolution[`~promoted-${createdId}`]
    if (promoted) merged[createdId] = promoted
    await store.delete(createdId)
  }

  const provenance: DraftProvenance = {
    merged,
    mergedAtHashes,
    contributors: [...contributors],
    mergedAt: Date.now()
  }

  await storage.pins?.removePinsByOwner(draftId)
  store.unmarkDraftPrivate([
    ...Object.values(entries).map((e) => e.cloneId as NodeId),
    ...createdIds
  ])
  await store.update(draftId, {
    properties: { status: 'merged', mergeProvenance: provenance }
  })

  return { status: 'merged', provenance, operations: operations.length }
}

/**
 * Apply a member's post-fork Yjs delta to its original's persisted blob.
 * Safe to re-run: merging the same delta twice converges to the same state.
 * Live pool docs pick the merged state up via the runtime (acquire applies
 * the persisted blob; an already-open doc can apply the delta directly —
 * Yjs updates commute).
 */
export async function mergeYjsDelta(
  storage: NodeStorageAdapter,
  originalId: NodeId,
  entry: DraftEntry
): Promise<Uint8Array | null> {
  if (!entry.forkedAtYjsStateVector) return null
  const cloneBlob = await storage.getDocumentContent(entry.cloneId as NodeId)
  if (!cloneBlob || cloneBlob.length === 0) return null

  const cloneDoc = new Y.Doc({ gc: false })
  let delta: Uint8Array
  try {
    Y.applyUpdate(cloneDoc, cloneBlob)
    delta = Y.encodeStateAsUpdate(cloneDoc, fromBase64(entry.forkedAtYjsStateVector))
  } finally {
    cloneDoc.destroy()
  }

  const originalBlob = await storage.getDocumentContent(originalId)
  const merged = originalBlob ? Y.mergeUpdates([originalBlob, delta]) : delta
  await storage.setDocumentContent(originalId, merged)
  return delta
}

// ─── Refresh-from-main (Upwelling's floating drafts) ─────────

export type RefreshDraftResult =
  | { status: 'refreshed'; refreshedMembers: number }
  | { status: 'conflicts'; conflicts: DraftMergeConflict[] }

/**
 * The reverse three-way: fold main's post-fork changes INTO the clones and
 * advance each member's fork point to main's current head, so the draft
 * floats on top of a moving main and "what a reviewer reads is what merges".
 * Pauses (applies nothing) when main and draft both changed a property.
 */
export async function refreshDraftFromMain(
  store: NodeStore,
  storage: NodeStorageAdapter,
  engine: HistoryEngine,
  draftId: NodeId
): Promise<RefreshDraftResult> {
  const draft = await store.getRaw(draftId)
  if (!draft) throw new Error(`Draft ${draftId} not found`)
  const entries = draftEntries(draft)

  // Pass 1: compute every member's refresh patch; any conflict aborts whole.
  const planned: {
    originalId: NodeId
    entry: DraftEntry
    patch: Record<string, unknown>
    newForkHash: string
    mainBlobDelta: Uint8Array | null
    newForkSV?: string
  }[] = []
  const conflicts: DraftMergeConflict[] = []

  for (const [id, entry] of Object.entries(entries)) {
    const originalId = id as NodeId
    const base = await engine.materializeAt(originalId, {
      type: 'hash',
      hash: entry.forkedAtHash as ContentId
    })
    const main = await store.getRaw(originalId)
    const clone = await store.getRaw(entry.cloneId as NodeId)
    if (!main || !clone) continue

    // Reverse roles: apply MAIN's post-fork edits into the CLONE.
    const result = threeWayPropertyMerge(base.node.properties, clone.properties, main.properties)
    for (const conflict of result.conflicts) {
      // Re-orient the card so ours=main, theirs=draft (matching merge cards).
      conflicts.push({
        originalId,
        property: conflict.property,
        base: conflict.base,
        ours: conflict.theirs,
        theirs: conflict.ours
      })
    }

    const newForkHash = await headHash(storage, originalId)
    if (!newForkHash) continue

    // Yjs: main's post-fork delta folds into the clone blob.
    let mainBlobDelta: Uint8Array | null = null
    let newForkSV: string | undefined
    if (entry.forkedAtYjsStateVector) {
      const mainBlob = await storage.getDocumentContent(originalId)
      if (mainBlob && mainBlob.length > 0) {
        const mainDoc = new Y.Doc({ gc: false })
        try {
          Y.applyUpdate(mainDoc, mainBlob)
          mainBlobDelta = Y.encodeStateAsUpdate(mainDoc, fromBase64(entry.forkedAtYjsStateVector))
          newForkSV = toBase64(Y.encodeStateVector(mainDoc))
        } finally {
          mainDoc.destroy()
        }
      }
    }

    planned.push({ originalId, entry, patch: result.patch, newForkHash, mainBlobDelta, newForkSV })
  }

  if (conflicts.length > 0) {
    return { status: 'conflicts', conflicts }
  }

  // Pass 2: apply — clone patches, blob folds, advanced fork points (pinned).
  const newEntries: Record<string, DraftEntry> = { ...entries }
  for (const plan of planned) {
    if (Object.keys(plan.patch).length > 0) {
      await store.update(plan.entry.cloneId as NodeId, { properties: plan.patch })
    }
    if (plan.mainBlobDelta) {
      const cloneBlob = await storage.getDocumentContent(plan.entry.cloneId as NodeId)
      const merged = cloneBlob
        ? Y.mergeUpdates([cloneBlob, plan.mainBlobDelta])
        : plan.mainBlobDelta
      await storage.setDocumentContent(plan.entry.cloneId as NodeId, merged)
    }
    await storage.pins?.addPins([{ key: plan.newForkHash, ownerId: draftId, reason: 'draft-fork' }])
    newEntries[plan.originalId] = {
      ...plan.entry,
      forkedAtHash: plan.newForkHash,
      ...(plan.newForkSV ? { forkedAtYjsStateVector: plan.newForkSV } : {})
    }
  }

  await store.update(draftId, { properties: { entries: newEntries } })
  return { status: 'refreshed', refreshedMembers: planned.length }
}
