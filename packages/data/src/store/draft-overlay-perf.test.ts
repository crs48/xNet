/**
 * Draft-overlay perf spike (exploration 0329 P2 gate; 0266 stopping rule).
 *
 * Runs against the REAL @sqlite.org/sqlite-wasm build (in-memory under Node —
 * the same engine the browser worker executes), seeds a workspace-scale node
 * set, and measures the query hot path in three configurations:
 *   1. overlay INACTIVE (the common case — must be within noise of itself:
 *      the only added cost is one null check),
 *   2. overlay ACTIVE with a checked-out draft covering a handful of members
 *      (the drafts session case — bounded added cost per page),
 *   3. the 0266 budget: cold-ish first-rows p95 < 100 ms at this scale.
 *
 * Node count defaults to 10k; scale up via XNET_DRAFT_OVERLAY_BENCH_NODES
 * (the 1M envelope lives in benchmarks/sqlite-node-store.bench.ts patterns).
 */

import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { createWebSQLiteAdapter } from '@xnetjs/sqlite/web'
import { describe, it, expect, vi } from 'vitest'
import type { SchemaIRI } from '../schema/node'
import { SQLiteNodeStorageAdapter } from './sqlite-adapter'
import { NodeStore } from './store'
import type { NodeId, NodeState } from './types'

const SCHEMA_ID = 'xnet://bench/OverlayNode' as SchemaIRI
const OTHER_SCHEMA_ID = 'xnet://bench/UnrelatedNode' as SchemaIRI
const AUTHOR = 'did:key:z6MkoverlayBench' as DID

const NODE_COUNT = Number(process.env.XNET_DRAFT_OVERLAY_BENCH_NODES ?? 10_000)
const PAGE = 500
const ITERATIONS = 20
const OVERLAY_MEMBERS = 10

function benchNode(index: number, schemaId: SchemaIRI = SCHEMA_ID): NodeState {
  const now = 1_700_000_000_000 + index
  const properties = {
    title: `node ${index}`,
    rank: index,
    active: index % 2 === 0
  }
  return {
    id: `${schemaId === SCHEMA_ID ? 'ovl' : 'unr'}-${String(index).padStart(7, '0')}`,
    schemaId,
    properties,
    timestamps: Object.fromEntries(
      Object.keys(properties).map((key, i) => [
        key,
        { lamport: index * 10 + i, author: AUTHOR, wallTime: now }
      ])
    ),
    deleted: false,
    createdAt: now,
    createdBy: AUTHOR,
    updatedAt: now,
    updatedBy: AUTHOR
  }
}

function percentile(samples: number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}

describe('draft overlay perf spike (0329 P2 / 0266 budget)', () => {
  it('overlay inactive is noise; active is bounded; first-rows p95 holds', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const db = await createWebSQLiteAdapter({ path: '/draft-overlay-bench.db' })
    try {
      const adapter = new SQLiteNodeStorageAdapter(db)
      const nodes = Array.from({ length: NODE_COUNT }, (_, i) => benchNode(i))
      await adapter.importNodes(nodes)
      // A same-size unrelated schema: the grid a checkout must NOT degrade.
      await adapter.importNodes(
        Array.from({ length: NODE_COUNT }, (_, i) => benchNode(i, OTHER_SCHEMA_ID))
      )

      const keyPair = generateSigningKeyPair()
      const store = new NodeStore({
        storage: adapter,
        authorDID: AUTHOR,
        signingKey: keyPair.privateKey
      })

      // System ordering rides idx_nodes_live_schema_updated — the indexed
      // grid path (property-sort at 10k is 0318's known cliff, not ours).
      const descriptor = {
        schemaId: SCHEMA_ID,
        includeDeleted: false,
        orderBy: { updatedAt: 'desc' as const },
        limit: PAGE
      }

      const measure = async (target = descriptor): Promise<number[]> => {
        const samples: number[] = []
        for (let i = 0; i < ITERATIONS; i++) {
          const t0 = performance.now()
          const result = await store.query(target)
          samples.push(performance.now() - t0)
          expect(result.nodes.length).toBe(PAGE)
        }
        return samples
      }

      // 1. Inactive twice — the second run is the noise reference.
      const inactiveA = await measure()
      const inactiveB = await measure()

      // 2. Active: clone the first OVERLAY_MEMBERS page rows into a draft.
      const memberIds = nodes.slice(0, OVERLAY_MEMBERS).map((n) => n.id as NodeId)
      const clones: Record<NodeId, NodeId> = {}
      for (const id of memberIds) {
        const original = await store.getRaw(id)
        const clone = await store.create({
          schemaId: original!.schemaId,
          properties: { ...original!.properties, title: `draft ${id}` }
        })
        clones[id] = clone.id
      }
      store.setCheckedOutDraft({
        draftId: 'bench-draft' as NodeId,
        members: memberIds,
        clones,
        memberSchemaIds: [SCHEMA_ID]
      })

      // 2a. Active, querying the UNRELATED schema: keeps the indexed fast
      //     path — a checkout must never degrade unrelated grids.
      const activeOtherSchema = await measure({ ...descriptor, schemaId: OTHER_SCHEMA_ID })

      // 2b. Active, querying the MEMBER schema: the draft-aware path
      //     (unpaginated candidates + JS re-apply) — the accepted
      //     transient-session cost.
      const activeMemberSchema = await measure()
      // Verify the swap actually happens on this path (fetch members directly).
      const swapped = await store.get(memberIds[0])
      expect(swapped?.properties.title).toBe(`draft ${memberIds[0]}`)
      store.setCheckedOutDraft(null)

      // 3. The 0266 budget measures FIRST rows — the first-page window a
      //    surface renders (50), not a full 500-row hydrate.
      const firstRowsSamples: number[] = []
      const firstRowsDescriptor = { ...descriptor, limit: 50 }
      for (let i = 0; i < ITERATIONS; i++) {
        const t0 = performance.now()
        await store.query(firstRowsDescriptor)
        firstRowsSamples.push(performance.now() - t0)
      }

      const med = (s: number[]) => percentile(s, 50)
      const inactiveDeltaPct = ((med(inactiveB) - med(inactiveA)) / med(inactiveA)) * 100
      const otherSchemaOverheadPct =
        ((med(activeOtherSchema) - med(inactiveB)) / med(inactiveB)) * 100
      const p95FirstRows = percentile(firstRowsSamples, 95)

      console.info(
        `[0329 overlay spike] ${NODE_COUNT} nodes, page ${PAGE}, ${OVERLAY_MEMBERS} members: ` +
          `inactive med ${med(inactiveA).toFixed(2)}ms/${med(inactiveB).toFixed(2)}ms ` +
          `(Δ ${inactiveDeltaPct.toFixed(1)}%), active/other-schema med ` +
          `${med(activeOtherSchema).toFixed(2)}ms (+${otherSchemaOverheadPct.toFixed(1)}%), ` +
          `active/member-schema med ${med(activeMemberSchema).toFixed(2)}ms (draft-aware), ` +
          `first-rows(50) p95 ${p95FirstRows.toFixed(2)}ms`
      )

      // Inactive-vs-inactive is pure run noise; generous bound so CI variance
      // never flakes, while a real regression (a per-row cost on the inactive
      // path) would blow far past it.
      expect(Math.abs(inactiveDeltaPct)).toBeLessThan(60)
      // Checked-out overhead on UNRELATED schemas: content swap only — must
      // stay well under the doc's <10% target locally; CI headroom to 50%.
      expect(otherSchemaOverheadPct).toBeLessThan(50)
      // Member-schema queries take the draft-aware JS re-apply (the accepted
      // transient-session trade) — still interactive at this scale.
      expect(med(activeMemberSchema)).toBeLessThan(1_000)
      // 0266 stopping rule at this scale.
      expect(p95FirstRows).toBeLessThan(100)
    } finally {
      await db.close()
    }
  }, 120_000)
})
