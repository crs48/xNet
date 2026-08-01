/**
 * Memory console hook (exploration 0415).
 *
 * Reads `MemoryItem` nodes live from the store, ranked the way retrieval ranks
 * them (recency-decayed salience) so the list shows what would actually reach a
 * model's context — not creation order, which would misrepresent what the agent
 * sees. Edit and delete write straight to the store: a memory the user cannot
 * change is a profile, not a memory.
 */

import type { NodeState } from '@xnetjs/data'
import { memoryRankScore, type MemoryRecord } from '@xnetjs/brain'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDevTools } from '../../provider/useDevTools'

const MEMORY_IRI = 'xnet://xnet.fyi/MemoryItem@1.0.0'
const PROFILE_IRI = 'xnet://xnet.fyi/RetrievalProfile@1.0.0'

const LIVE_DEBOUNCE_MS = 250
const LIST_LIMIT = 500

export type MemoryRow = MemoryRecord & {
  kind: string
  /** Node ids this memory was distilled from — its auditable provenance. */
  evidence: string[]
  /** Recency-decayed salience: the number that decides what reaches context. */
  score: number
}

export type RetrievalProfileRow = {
  id: string
  hopDecay: number
  vectorWeight: number
  maxEntries: number
  rerank: boolean
  reason: string
  adoptedAt: number | null
}

export type MemoryPanelState = {
  rows: MemoryRow[]
  profile: RetrievalProfileRow | null
  loading: boolean
  /** How many memories the skill preamble would carry. */
  preambleLimit: number
  edit: (id: string, text: string) => Promise<void>
  setSalience: (id: string, salience: number) => Promise<void>
  forget: (id: string) => Promise<void>
}

/** Memories the preamble carries — mirrors `PREAMBLE_LIMIT` in the CLI. */
export const PREAMBLE_LIMIT = 8

const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback

export function buildMemoryRows(nodes: NodeState[], now: number): MemoryRow[] {
  const rows: MemoryRow[] = []
  for (const node of nodes) {
    if (node.deleted) continue
    const text = node.properties.text
    if (typeof text !== 'string' || !text.trim()) continue
    const record: MemoryRecord = {
      id: node.id,
      text,
      salience: num(node.properties.salience, 0.5),
      lastUsedAt: num(node.properties.lastUsedAt, node.updatedAt)
    }
    rows.push({
      ...record,
      kind: str(node.properties.kind, 'fact'),
      evidence: Array.isArray(node.properties.evidence)
        ? (node.properties.evidence as unknown[]).filter((e): e is string => typeof e === 'string')
        : [],
      score: memoryRankScore(record, { now })
    })
  }
  return rows.sort((a, b) => b.score - a.score)
}

export function buildProfileRow(nodes: NodeState[]): RetrievalProfileRow | null {
  const node = nodes.find((n) => !n.deleted)
  if (!node) return null
  return {
    id: node.id,
    hopDecay: num(node.properties.hopDecay, 0.55),
    vectorWeight: num(node.properties.vectorWeight, 0.5),
    maxEntries: num(node.properties.maxEntries, 12),
    rerank: node.properties.rerank === true,
    reason: str(node.properties.reason),
    adoptedAt: typeof node.properties.adoptedAt === 'number' ? node.properties.adoptedAt : null
  }
}

export function useMemories(): MemoryPanelState {
  const { store } = useDevTools()
  const [rows, setRows] = useState<MemoryRow[]>([])
  const [profile, setProfile] = useState<RetrievalProfileRow | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!store) return
    const [memories, profiles] = await Promise.all([
      store.list({ schemaId: MEMORY_IRI, limit: LIST_LIMIT }),
      store.list({ schemaId: PROFILE_IRI, limit: 10 })
    ])
    setRows(buildMemoryRows(memories, Date.now()))
    setProfile(buildProfileRow(profiles))
    setLoading(false)
  }, [store])

  useEffect(() => {
    if (!store) return
    void refresh()
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = store.subscribe(() => {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        void refresh()
      }, LIVE_DEBOUNCE_MS)
    })
    return () => {
      unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [store, refresh])

  const mutate = useCallback(
    async (id: string, properties: Record<string, unknown>) => {
      if (!store) throw new Error('No store: dev tools are not attached to a workspace')
      await store.update(id, { properties })
    },
    [store]
  )

  return useMemo(
    () => ({
      rows,
      profile,
      loading,
      preambleLimit: PREAMBLE_LIMIT,
      edit: (id, text) => mutate(id, { text, lastUsedAt: Date.now() }),
      setSalience: (id, salience) => mutate(id, { salience: Math.min(1, Math.max(0, salience)) }),
      forget: async (id) => {
        if (!store) throw new Error('No store: dev tools are not attached to a workspace')
        await store.delete(id)
      }
    }),
    [rows, profile, loading, mutate, store]
  )
}
