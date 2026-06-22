/**
 * Memory consolidation (exploration 0211, Phase 3) — the Mem0-style logic that
 * keeps the brain's long-term memory consistent without stuffing full history
 * into context. Given a freshly-extracted candidate fact and the existing memory
 * items, it decides ADD / UPDATE / DELETE / NOOP. These decisions are applied as
 * governed `MemoryItem` node mutations (through the normal approval gate), so the
 * planner itself stays pure and testable.
 */

/** A memory item as the planner sees it (a projection of a `MemoryItem` node). */
export interface MemoryRecord {
  id: string
  text: string
  /** Ranking weight in [0, 1]. */
  salience: number
  /** Epoch ms the item was last used/confirmed. */
  lastUsedAt: number
}

/** A newly-extracted fact, not yet committed to memory. */
export interface MemoryCandidate {
  text: string
  /** Initial salience for an ADD. Defaults applied by the caller. */
  salience?: number
  /** When true, the candidate asks to forget a matching memory (→ DELETE). */
  forget?: boolean
}

export type MemoryOp =
  | { op: 'ADD'; text: string; salience: number }
  | { op: 'UPDATE'; id: string; text: string; salience: number }
  | { op: 'DELETE'; id: string }
  | { op: 'NOOP'; reason: string }

export interface ConsolidateOptions {
  /** Similarity at/above which two facts are considered the same memory. */
  similarityThreshold?: number
  /** Similarity at/above which a candidate is an exact restatement (→ NOOP). */
  duplicateThreshold?: number
  /** Default salience for a brand-new memory. */
  defaultSalience?: number
}

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'is',
  'are',
  'was',
  'were',
  'to',
  'of',
  'and',
  'or',
  'in',
  'on',
  'at',
  'for',
  'with',
  'i',
  'my',
  'me',
  'you',
  'it',
  'that',
  'this'
])

/** Tokenize to lowercased, de-punctuated, stopword-free terms. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t))
}

/**
 * Jaccard similarity over content tokens, in [0, 1]. Cheap, dependency-free, and
 * good enough to catch restatements and near-duplicates; a learned reranker can
 * replace it later without changing the planner's contract.
 */
export function textSimilarity(a: string, b: string): number {
  const setA = new Set(tokenize(a))
  const setB = new Set(tokenize(b))
  if (setA.size === 0 && setB.size === 0) return 1
  if (setA.size === 0 || setB.size === 0) return 0
  let intersection = 0
  for (const token of setA) if (setB.has(token)) intersection++
  const union = setA.size + setB.size - intersection
  return intersection / union
}

/**
 * Decide what to do with `candidate` given the `existing` memories.
 *
 *   - `forget` candidate matching an existing item   → DELETE
 *   - near-exact restatement of an existing item     → NOOP
 *   - same topic, but the candidate adds detail       → UPDATE (keep the richer text)
 *   - otherwise                                       → ADD
 */
export function consolidateMemory(
  candidate: MemoryCandidate,
  existing: readonly MemoryRecord[],
  options: ConsolidateOptions = {}
): MemoryOp {
  const { similarityThreshold = 0.5, duplicateThreshold = 0.85, defaultSalience = 0.5 } = options

  const text = candidate.text.trim()
  if (text.length === 0) return { op: 'NOOP', reason: 'empty candidate' }

  // Find the closest existing memory.
  let best: { record: MemoryRecord; sim: number } | null = null
  for (const record of existing) {
    const sim = textSimilarity(text, record.text)
    if (!best || sim > best.sim) best = { record, sim }
  }

  if (candidate.forget) {
    if (best && best.sim >= similarityThreshold) return { op: 'DELETE', id: best.record.id }
    return { op: 'NOOP', reason: 'nothing matching to forget' }
  }

  if (best && best.sim >= duplicateThreshold) {
    // Exact-ish restatement. Keep the longer text if the candidate is richer.
    if (text.length > best.record.text.length * 1.2) {
      return {
        op: 'UPDATE',
        id: best.record.id,
        text,
        salience: Math.min(1, best.record.salience + 0.1)
      }
    }
    return { op: 'NOOP', reason: 'duplicate of existing memory' }
  }

  if (best && best.sim >= similarityThreshold) {
    // Same topic — merge into the existing memory, bumping salience.
    return {
      op: 'UPDATE',
      id: best.record.id,
      text,
      salience: Math.min(1, best.record.salience + 0.15)
    }
  }

  return { op: 'ADD', text, salience: candidate.salience ?? defaultSalience }
}

export interface MemoryRankOptions {
  /** Current epoch ms. */
  now: number
  /** Half-life of recency decay in ms (default 30 days). */
  halfLifeMs?: number
}

/** Recency-decayed salience, in [0, 1]. Older, low-salience memories sink. */
export function memoryRankScore(record: MemoryRecord, options: MemoryRankOptions): number {
  const halfLifeMs = options.halfLifeMs ?? 30 * 24 * 60 * 60 * 1000
  const ageMs = Math.max(0, options.now - record.lastUsedAt)
  const recency = Math.pow(0.5, ageMs / halfLifeMs)
  return record.salience * recency
}

/** Sort memories best-first by recency-decayed salience. */
export function rankMemories(
  records: readonly MemoryRecord[],
  options: MemoryRankOptions
): MemoryRecord[] {
  return [...records].sort((a, b) => memoryRankScore(b, options) - memoryRankScore(a, options))
}
