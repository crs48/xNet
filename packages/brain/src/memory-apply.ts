/**
 * Apply memory consolidation decisions to the graph (exploration 0211, Phase 2).
 *
 * `consolidateMemory` decides *what* should happen (ADD/UPDATE/DELETE/NOOP); this
 * turns that decision into governed `MemoryItem` node mutations. Kept structural
 * (the `schemaId` and store are injected) so the brain carries no hard dependency
 * on `@xnetjs/data` — the app passes the canonical `MEMORY_ITEM_SCHEMA_IRI`.
 *
 * In the app these mutations flow through the normal `AiMutationPlan` approval
 * gate; the helper itself is the pure write-path the planner ultimately calls.
 */
import {
  consolidateMemory,
  type ConsolidateOptions,
  type MemoryCandidate,
  type MemoryOp,
  type MemoryRecord
} from './memory'

/** The minimal `NodeStore` write surface needed to persist a memory. */
export interface MemoryStore {
  create(input: { schemaId: string; properties: Record<string, unknown> }): Promise<{ id: string }>
  update(id: string, input: { properties: Record<string, unknown> }): Promise<unknown>
  delete(id: string): Promise<void>
}

export interface ApplyMemoryOptions {
  /** The `MemoryItem` schema IRI (from `@xnetjs/data`). */
  schemaId: string
  /** Current epoch ms, stamped into `lastUsedAt`. */
  now: number
  /** Kind for new memories. Defaults to `'fact'`. */
  kind?: 'fact' | 'preference' | 'episode'
  /** Source node ids this memory was distilled from (the `evidence` relation). */
  evidence?: readonly string[]
}

export type AppliedMemory =
  | { op: 'ADD'; id: string }
  | { op: 'UPDATE'; id: string }
  | { op: 'DELETE'; id: string }
  | { op: 'NOOP'; reason: string }

/** Execute a single planned memory op against the store. */
export async function applyMemoryOp(
  op: MemoryOp,
  store: MemoryStore,
  options: ApplyMemoryOptions
): Promise<AppliedMemory> {
  switch (op.op) {
    case 'ADD': {
      const created = await store.create({
        schemaId: options.schemaId,
        properties: {
          kind: options.kind ?? 'fact',
          text: op.text,
          salience: op.salience,
          lastUsedAt: options.now,
          decay: 0,
          ...(options.evidence && options.evidence.length > 0
            ? { evidence: [...options.evidence] }
            : {})
        }
      })
      return { op: 'ADD', id: created.id }
    }
    case 'UPDATE': {
      await store.update(op.id, {
        properties: { text: op.text, salience: op.salience, lastUsedAt: options.now }
      })
      return { op: 'UPDATE', id: op.id }
    }
    case 'DELETE': {
      await store.delete(op.id)
      return { op: 'DELETE', id: op.id }
    }
    default:
      return { op: 'NOOP', reason: op.reason }
  }
}

/**
 * Consolidate a candidate fact against the existing memories and apply the result
 * in one step — the common "remember this" path.
 */
export async function rememberFact(
  candidate: MemoryCandidate,
  existing: readonly MemoryRecord[],
  store: MemoryStore,
  options: ApplyMemoryOptions & { consolidate?: ConsolidateOptions }
): Promise<AppliedMemory> {
  const op = consolidateMemory(candidate, existing, options.consolidate)
  return applyMemoryOp(op, store, options)
}
