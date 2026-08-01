/**
 * The semantic tier, for the warm process only (exploration 0415).
 *
 * Loading an embedding model costs hundreds of milliseconds and tens of
 * megabytes. A cold `xnet search` must never pay that — it would turn a 0.22 s
 * verb into a multi-second one to improve a ranking the user did not ask for.
 * So this lives behind `xnet serve --vectors`, where the cost is paid once and
 * amortized over every call the daemon answers.
 *
 * Everything heavy is dynamically imported, and every failure degrades rather
 * than throws: no model, no `usearch`, an unreadable snapshot — each one leaves
 * the daemon serving `bm25-graph` and **says so**, rather than failing to start
 * or, worse, pretending to be `hybrid-graph`.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { BlobStore, EntryHit, EntrySearch } from '@xnetjs/brain'
import { loadVectorTier, saveVectorTier } from '@xnetjs/brain'
import type { NodeStoreAPI } from '@xnetjs/plugins/node'

/** The slice of `@xnetjs/vectors`' `SemanticSearch` we need. */
export type SemanticIndex = {
  /** Loads the embedding model and builds the index. Must run before anything else. */
  initialize(): Promise<void>
  indexDocument(documentId: string, content: string): Promise<unknown>
  search(
    query: string,
    options?: { maxResults?: number; minScore?: number }
  ): Promise<Array<{ id: string; score: number }>>
  documentCount?(): number
  serialize(): unknown
  restore(data: never): void
  clear?(): void
}

/** A file-backed {@link BlobStore} — the daemon's snapshot lives beside the db. */
export function fileBlobStore(path: string): BlobStore {
  return {
    getBlob: async () => {
      try {
        return new Uint8Array(await readFile(path))
      } catch {
        // Absent is a real answer here: the tier is cold and gets backfilled.
        return null
      }
    },
    setBlob: async (_key: string, data: Uint8Array) => {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, data)
    }
  }
}

export type VectorTierOptions = {
  store: NodeStoreAPI
  /** Where to persist the serialized index between daemon runs. */
  snapshotPath: string
  /** Cap on nodes indexed during a cold backfill. */
  maxNodes?: number
  /** Injection seam for tests; defaults to `@xnetjs/vectors`. */
  loadEngine?: () => Promise<{ createSemanticSearch: (config?: never) => SemanticIndex }>
}

export type VectorTier = {
  /** Ready to fuse into the retrieval factory. */
  entrySearch: EntrySearch
  /** How many documents the tier holds. */
  documents: number
  /** True when a persisted snapshot was reused instead of re-embedding. */
  restored: boolean
  /** Set when the backfill failed part-way; the operator should see this. */
  backfillError?: string
}

const TEXT_KEYS = ['title', 'name', 'subject', 'summary', 'description', 'markdown', 'body', 'text']

function nodeText(node: { properties: Record<string, unknown> }): string {
  const parts: string[] = []
  for (const key of TEXT_KEYS) {
    const value = node.properties[key]
    if (typeof value === 'string' && value.trim()) parts.push(value.trim())
  }
  return parts.join('\n')
}

/**
 * Build the semantic tier, or return `null` when it cannot be had.
 *
 * `null` is the honest answer for a missing model or a broken native binding —
 * the caller reports `bm25-graph` and carries on. Throwing would take down a
 * daemon that is perfectly capable of serving BM25.
 */
export async function createVectorTier(options: VectorTierOptions): Promise<VectorTier | null> {
  const loadEngine =
    options.loadEngine ??
    (() =>
      import('@xnetjs/vectors') as unknown as Promise<{
        createSemanticSearch: (config?: never) => SemanticIndex
      }>)

  let index: SemanticIndex
  try {
    const engine = await loadEngine()
    index = engine.createSemanticSearch()
    // `SemanticSearch` throws "not initialized" on every other method until
    // this runs, and this is the call that actually downloads/loads the model —
    // the reason the whole tier is daemon-only.
    await index.initialize()
  } catch {
    return null
  }

  const blobs = fileBlobStore(options.snapshotPath)
  let restored = false
  try {
    restored = await loadVectorTier(index, blobs)
  } catch {
    restored = false
  }

  let documents = 0
  let backfillError: string | undefined
  if (!restored) {
    // Cold: embed the workspace once, then snapshot so the next daemon start is
    // a file read instead of a model run.
    try {
      const nodes = await options.store.list({ limit: options.maxNodes ?? 2000 })
      for (const node of nodes) {
        if (node.deleted) continue
        const text = nodeText(node)
        if (!text) continue
        await index.indexDocument(node.id, text)
        documents++
      }
      await saveVectorTier(index, blobs)
    } catch (err) {
      // Record it. An earlier draft swallowed this, and the result was a daemon
      // announcing `tier hybrid-graph` over an index holding zero documents —
      // precisely the confident-but-empty failure this whole exploration is
      // about. A tier that indexed nothing is not a tier.
      backfillError = err instanceof Error ? err.message : String(err)
    }
  }

  if (!restored && documents === 0) return null

  const entrySearch: EntrySearch = async (query: string, k: number) => {
    const hits = await index.search(query, { maxResults: k })
    return hits.map((hit): EntryHit => ({ nodeId: hit.id, score: hit.score, source: 'vector' }))
  }

  return {
    entrySearch,
    documents,
    restored,
    ...(backfillError ? { backfillError } : {})
  }
}
