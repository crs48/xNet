/**
 * Memory schema pack (exploration 0211, Phase 3) — the AI second brain's
 * long-term memory, modeled as governed nodes rather than an off-graph service.
 *
 * A `MemoryItem` is a durable fact / preference / episode the brain has decided
 * is worth keeping. Because it's an ordinary node, it inherits sync, the
 * authorization engine, provenance, and the agent mutation-approval gate for
 * free — consolidation (`@xnetjs/brain`'s `consolidateMemory`, the Mem0-style
 * ADD/UPDATE/DELETE/NOOP planner) is applied as a normal, approved mutation plan.
 *
 * Design decisions (argued in exploration 0211):
 *   - **Private by default.** Memories are personal; they use `presets.private()`
 *     (owner-only) so a memory never leaks into a shared space unless explicitly
 *     re-homed there. Retrieval still runs inside the authorization cascade.
 *   - **Evidence by reference.** `evidence` is an unconstrained relation to the
 *     source nodes a memory was distilled from, so every memory is auditable back
 *     to the data that justified it — never a free-floating assertion.
 *   - **Salience + decay are first-class.** `salience` and `lastUsedAt` drive the
 *     recency-decayed ranking that keeps stale memories from crowding context.
 */

import type { InferNode } from '../types'
import { presets } from '../../auth'
import { defineSchema } from '../define'
import { checkbox, date, json, number, relation, select, text } from '../properties'

export const MEMORY_ITEM_SCHEMA_IRI = 'xnet://xnet.fyi/MemoryItem@1.0.0' as const

/** What kind of thing a memory captures. */
export const MEMORY_KINDS = [
  { id: 'fact', name: 'Fact', color: 'blue' },
  { id: 'preference', name: 'Preference', color: 'purple' },
  { id: 'episode', name: 'Episode', color: 'green' }
] as const

export type MemoryKind = (typeof MEMORY_KINDS)[number]['id']

export const MemoryItemSchema = defineSchema({
  name: 'MemoryItem',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Fact / preference / episode. */
    kind: select({ options: MEMORY_KINDS, default: 'fact' }),
    /** The remembered statement, in natural language. */
    text: text({ required: true, maxLength: 4000 }),
    /** Ranking weight in [0, 1]. Higher = more important to surface. */
    salience: number({ min: 0, max: 1 }),
    /** When this memory was last used or confirmed (epoch ms). */
    lastUsedAt: date(),
    /** Decay factor in [0, 1] applied during consolidation. */
    decay: number({ min: 0, max: 1 }),
    /** The source nodes this memory was distilled from (auditable provenance). */
    evidence: relation({ multiple: true })
  },
  document: undefined,
  authorization: presets.private()
})

export type MemoryItem = InferNode<(typeof MemoryItemSchema)['_properties']>

// ─── Retrieval tuning ────────────────────────────────────────────────────────

export const RETRIEVAL_PROFILE_SCHEMA_IRI = 'xnet://xnet.fyi/RetrievalProfile@1.0.0' as const

/**
 * Locally-learned retrieval weights (exploration 0415).
 *
 * Deliberately **not** a `MemoryItem`. Memories are facts about the user and
 * their work; this is four numbers describing how their retriever is tuned.
 * MemPrivacy's argument, and the reason for the split: personalized memory and
 * an agent's self-improvement state obey different retention, retrieval and
 * privacy rules, and collapsing them turns "make search better" into "build a
 * profile of the user".
 *
 * Private, like memories, and equally ordinary: it syncs, exports and deletes
 * as a node. `adoptedAt`/`baseline` record *why* a profile was accepted, so a
 * tuning decision is auditable rather than something the retriever just did.
 */
export const RetrievalProfileSchema = defineSchema({
  name: 'RetrievalProfile',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Score multiplier per hop away from an entry node. */
    hopDecay: number({ min: 0, max: 1 }),
    /** Weight of the semantic side when fusing with keyword hits. */
    vectorWeight: number({ min: 0, max: 1 }),
    /** Entry nodes pulled before graph expansion. */
    maxEntries: number({ integer: true, min: 1 }),
    /** Whether a reranker runs over the candidate set. */
    rerank: checkbox(),
    /** When this profile was adopted (epoch ms). */
    adoptedAt: date(),
    /** The golden-set scores that justified adopting it. */
    baseline: json<{ recallAll: number; recallGraph: number; mrr: number }>({}),
    /** Why it was adopted — the ratchet's verdict, in words. */
    reason: text({ maxLength: 500 })
  },
  document: undefined,
  authorization: presets.private()
})

export type RetrievalProfileNode = InferNode<(typeof RetrievalProfileSchema)['_properties']>
