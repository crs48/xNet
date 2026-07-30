/**
 * Drafts — writable branches forked from a frontier (exploration 0329 P2).
 *
 * A draft is a set of lazy copy-on-write clones behind a store-level overlay
 * (see NodeStore.setCheckedOutDraft): reads of an original id resolve to its
 * clone while checked out; the first write through the overlay forks the
 * member. Forking is one signed snapshot-create (the clone), one pinned fork
 * point (the three-way merge base), and — for doc-bearing members — a
 * byte-copy of the Yjs blob (a true fork: identical structs, so post-fork
 * updates from both sides commute) plus the fork state vector for computing
 * the merge-back delta.
 *
 * Callers should flush the doc pool (SyncManager.flushAll) before forking a
 * node with unsaved Yjs edits — the fork copies the *persisted* blob.
 */

import { TaggedError } from '@xnetjs/core'
import { toBase64 } from '@xnetjs/crypto'
import { DRAFT_SCHEMA_IRI, createNodeId } from '@xnetjs/data'
import type {
  DraftEntry,
  NodeId,
  NodeState,
  NodeStorageAdapter,
  NodeStore,
  SchemaIRI
} from '@xnetjs/data'
import * as Y from 'yjs'
import { headHash, pinKeyForChange } from './frontier'

// ─── Never-fork policy ───────────────────────────────────────

/**
 * Schemas that never fork into a draft (Patchwork clone-policy lesson):
 * global/identity/membership state, draft bookkeeping itself, and
 * conversational records (comments stay live and anchored; chat is an
 * append-only record — see the 0329 coverage matrix).
 */
export const NEVER_FORK_SCHEMA_BASES: readonly string[] = [
  'xnet://xnet.fyi/Space',
  'xnet://xnet.fyi/SpaceMembership',
  'xnet://xnet.fyi/Profile',
  'xnet://xnet.fyi/Draft',
  'xnet://xnet.fyi/Checkpoint',
  'xnet://xnet.fyi/Comment',
  'xnet://xnet.fyi/Channel',
  'xnet://xnet.fyi/ChatMessage'
]

/** Whether nodes of this schema may be forked into a draft. */
export function isForkable(schemaId: SchemaIRI | string): boolean {
  const base = String(schemaId).split('@')[0]
  return !NEVER_FORK_SCHEMA_BASES.includes(base)
}

/** Thrown when a fork request violates the never-fork policy. */
export class DraftPolicyError extends TaggedError<'DraftPolicyError'> {
  readonly _tag = 'DraftPolicyError' as const

  constructor(
    readonly nodeId: NodeId,
    readonly schemaId: string
  ) {
    super(`Nodes of schema ${schemaId} never fork into a draft (node ${nodeId})`)
  }
}

// ─── Lifecycle ───────────────────────────────────────────────

export interface CreateDraftOptions {
  /** Upwelling: a title that signals intent. */
  name: string
  /** The host node/scope being drafted. */
  targetId?: NodeId
}

/** Create an (empty) open draft. Forking is lazy — on first write per node. */
export async function createDraft(
  store: NodeStore,
  options: CreateDraftOptions
): Promise<NodeState> {
  const draft = await store.create({
    schemaId: DRAFT_SCHEMA_IRI as SchemaIRI,
    properties: {
      name: options.name,
      status: 'open',
      ...(options.targetId !== undefined ? { target: options.targetId } : {}),
      entries: {},
      created: [],
      deletedIds: []
    }
  })
  // Device-local until shared (P5): keep the bookkeeping out of outbound sync.
  store.markDraftPrivate([draft.id])
  return draft
}

/** The member map of a draft node. */
export function draftEntries(draft: NodeState): Record<NodeId, DraftEntry> {
  return (draft.properties.entries as Record<NodeId, DraftEntry> | undefined) ?? {}
}

/**
 * Copy-on-write fork of one member into a draft. Idempotent: an existing
 * entry is returned untouched. The clone is one signed snapshot-create; the
 * fork point is pinned under the draft's id; a Yjs blob (rich text, canvas,
 * database rows' rich cells) is byte-copied to the clone id with the fork
 * state vector recorded for the merge-back delta.
 *
 * Database members: fork the database node AND its row nodes (each row doc
 * carries its own rich-text fragments) — the caller enumerates members; this
 * function forks exactly one node.
 */
export async function forkNodeIntoDraft(
  store: NodeStore,
  storage: NodeStorageAdapter,
  draftId: NodeId,
  originalId: NodeId
): Promise<DraftEntry> {
  const draft = await store.get(draftId)
  if (!draft) throw new Error(`Draft ${draftId} not found`)

  const entries = draftEntries(draft)
  const existing = entries[originalId]
  if (existing) return existing

  const original = await store.get(originalId)
  if (!original) throw new Error(`Cannot fork unknown node ${originalId}`)
  if (!isForkable(original.schemaId)) {
    throw new DraftPolicyError(originalId, original.schemaId)
  }

  const cloneId = createNodeId() as NodeId
  await store.importDeterministicNodes([
    { id: cloneId, schemaId: original.schemaId, properties: { ...original.properties } }
  ])

  const forkedAtHash = await headHash(storage, originalId)
  if (!forkedAtHash) throw new Error(`No changes found for node ${originalId}`)

  const entry: DraftEntry = { cloneId, forkedAtHash }

  // Yjs lane: byte-copy the persisted blob (a true fork — identical structs)
  // and record the fork state vector for the merge-back delta.
  const blob = await storage.getDocumentContent(originalId)
  if (blob && blob.length > 0) {
    await storage.setDocumentContent(cloneId, blob)
    const temp = new Y.Doc({ gc: false })
    try {
      Y.applyUpdate(temp, blob)
      entry.forkedAtYjsStateVector = toBase64(Y.encodeStateVector(temp))
    } finally {
      temp.destroy()
    }
  }

  await storage.pins?.addPins([
    { key: pinKeyForChange(forkedAtHash), ownerId: draftId, reason: 'draft-fork' }
  ])

  store.markDraftPrivate([cloneId])
  await store.update(draftId, {
    properties: { entries: { ...entries, [originalId]: entry } }
  })

  return entry
}

/** Record a node created inside the draft (promoted to main on merge). */
export async function markCreatedInDraft(
  store: NodeStore,
  draftId: NodeId,
  nodeId: NodeId
): Promise<void> {
  const draft = await store.get(draftId)
  if (!draft) throw new Error(`Draft ${draftId} not found`)
  const created = (draft.properties.created as NodeId[] | undefined) ?? []
  if (created.includes(nodeId)) return
  store.markDraftPrivate([nodeId])
  await store.update(draftId, { properties: { created: [...created, nodeId] } })
}

/** Record an original deleted inside the draft (tombstoned on merge). */
export async function markDeletedInDraft(
  store: NodeStore,
  draftId: NodeId,
  originalId: NodeId
): Promise<void> {
  const draft = await store.get(draftId)
  if (!draft) throw new Error(`Draft ${draftId} not found`)
  const deletedIds = (draft.properties.deletedIds as NodeId[] | undefined) ?? []
  if (deletedIds.includes(originalId)) return
  await store.update(draftId, { properties: { deletedIds: [...deletedIds, originalId] } })
}

/**
 * Discard a draft: tombstone every clone and draft-born node, release every
 * pin the draft holds, and mark it discarded. Originals are untouched.
 */
export async function discardDraft(
  store: NodeStore,
  storage: NodeStorageAdapter,
  draftId: NodeId
): Promise<void> {
  const draft = await store.get(draftId)
  if (!draft) throw new Error(`Draft ${draftId} not found`)

  const entries = draftEntries(draft)
  for (const entry of Object.values(entries)) {
    await store.delete(entry.cloneId as NodeId)
  }
  for (const nodeId of (draft.properties.created as NodeId[] | undefined) ?? []) {
    await store.delete(nodeId)
  }

  await storage.pins?.removePinsByOwner(draftId)
  await store.update(draftId, { properties: { status: 'discarded' } })
  const cloneIds = Object.values(entries).map((e) => e.cloneId as NodeId)
  const createdIds = (draft.properties.created as NodeId[] | undefined) ?? []
  store.unmarkDraftPrivate([...cloneIds, ...createdIds])
  // The draft node itself stays private: its tombstone is nobody's business.
}

/**
 * Rebuild the store's device-local draft-privacy set from persisted Draft
 * nodes. MUST run before outbound sync starts (the client wires this) so a
 * reload never leaks clones into the personal node-sync room.
 */
export async function rehydrateDraftPrivacy(store: NodeStore): Promise<void> {
  const drafts = await store.list({ schemaId: DRAFT_SCHEMA_IRI as SchemaIRI })
  const ids: NodeId[] = []
  for (const draft of drafts) {
    ids.push(draft.id)
    if (draft.properties.status !== 'open') continue
    for (const entry of Object.values(draftEntries(draft))) {
      ids.push(entry.cloneId as NodeId)
    }
    ids.push(...(((draft.properties.created as NodeId[] | undefined) ?? []) as NodeId[]))
  }
  if (ids.length > 0) store.markDraftPrivate(ids)
}

/**
 * Share a draft (P5): lift device-local privacy from the draft node, its
 * clones, and draft-born nodes so they replicate like ordinary nodes (the
 * personal room and any share room whose grants cover them). Cross-user
 * multi-author drafting then rides the existing room machinery — the cost is
 * the doubled member traffic the exploration accepts knowingly.
 */
export async function shareDraft(store: NodeStore, draftId: NodeId): Promise<void> {
  const draft = await store.get(draftId)
  if (!draft) throw new Error(`Draft ${draftId} not found`)
  const entries = draftEntries(draft)
  store.unmarkDraftPrivate([
    draftId,
    ...Object.values(entries).map((e) => e.cloneId as NodeId),
    ...(((draft.properties.created as NodeId[] | undefined) ?? []) as NodeId[])
  ])
}

/** List open drafts, optionally scoped to one target node. */
export async function listDrafts(store: NodeStore, targetId?: NodeId): Promise<NodeState[]> {
  const all = await store.list({ schemaId: DRAFT_SCHEMA_IRI as SchemaIRI })
  return all
    .filter((d) => d.properties.status === 'open')
    .filter((d) => (targetId ? d.properties.target === targetId : true))
    .sort((a, b) => b.createdAt - a.createdAt)
}
