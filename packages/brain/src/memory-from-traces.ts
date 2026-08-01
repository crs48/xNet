/**
 * Memories distilled from what the agent was already told (exploration 0415).
 *
 * Every guarded tool call already lands as an `AgentAction` node carrying the
 * operator's `instruction` verbatim. That is the whole signal — nothing new is
 * captured here, and no new consent surface is introduced. This module only
 * reads a trail the user can already see and delete.
 *
 * Two rules do the ethical work:
 *
 * - **Recurrence.** A one-off instruction is a task, not a preference. Only
 *   something said `minOccurrences` separate times becomes a candidate, which
 *   keeps "delete the Henderson file" out of long-term memory while letting
 *   "always file these under Ops" in.
 * - **Never invent.** A redacted instruction (`[redacted N chars sha256:…]`)
 *   contributes nothing. It is deliberately unreadable, and reconstructing
 *   intent from a digest would defeat the redaction that produced it.
 *
 * The output is `MemoryCandidate[]` for the existing planner — `consolidateMemory`
 * still decides ADD/UPDATE/DELETE/NOOP, and `applyMemoryOp` still writes through
 * the normal approval gate.
 */

import { tokenize, type MemoryCandidate } from './memory'

/** The slice of an `AgentAction` node this reads. */
export interface AgentActionLike {
  id: string
  properties: {
    instruction?: unknown
    tool?: unknown
    status?: unknown
    createdAt?: unknown
  }
}

export interface TraceCandidateOptions {
  /**
   * How many separate actions must carry the same instruction shape before it
   * is a candidate. Below 3 this starts learning one-off tasks as if they were
   * standing preferences.
   */
  minOccurrences?: number
  /** Ignore actions whose `status` is not one of these. Defaults to succeeded. */
  statuses?: readonly string[]
  /** Cap on returned candidates, highest-recurrence first. */
  limit?: number
}

/** A candidate plus the evidence it was distilled from. */
export interface TraceCandidate extends MemoryCandidate {
  /** `AgentAction` node ids supporting this candidate — the `evidence` relation. */
  evidence: string[]
  occurrences: number
}

/** True for the marker `redactInstruction` writes; those carry no recoverable text. */
export function isRedactedInstruction(text: string): boolean {
  return /^\[redacted \d+ chars sha256:[0-9a-f]+\]$/.test(text.trim())
}

/**
 * Group actions by instruction shape and return the recurring ones.
 *
 * Shape is the sorted bag of content tokens, so "file these under Ops" and
 * "under Ops, file these" are the same standing instruction while "delete the
 * Henderson file" stays distinct.
 */
export function candidatesFromTraces(
  actions: readonly AgentActionLike[],
  options: TraceCandidateOptions = {}
): TraceCandidate[] {
  const minOccurrences = options.minOccurrences ?? 3
  const statuses = options.statuses ?? ['succeeded', 'applied', 'approved']

  const buckets = new Map<string, { text: string; evidence: string[] }>()
  for (const action of actions) {
    const status = action.properties.status
    if (typeof status === 'string' && !statuses.includes(status)) continue

    const instruction = action.properties.instruction
    if (typeof instruction !== 'string') continue
    const text = instruction.trim()
    if (!text || isRedactedInstruction(text)) continue

    const tokens = tokenize(text)
    if (tokens.length === 0) continue
    const key = [...tokens].sort().join(' ')

    const bucket = buckets.get(key)
    if (bucket) {
      bucket.evidence.push(action.id)
      // Keep the fullest phrasing seen — it reads better in a preamble.
      if (text.length > bucket.text.length) bucket.text = text
    } else {
      buckets.set(key, { text, evidence: [action.id] })
    }
  }

  const candidates: TraceCandidate[] = []
  for (const bucket of buckets.values()) {
    const occurrences = bucket.evidence.length
    if (occurrences < minOccurrences) continue
    candidates.push({
      text: bucket.text,
      // More repetition, more salience — capped so a loop cannot pin a memory
      // at 1.0 and starve everything else out of the top-k.
      salience: Math.min(0.9, 0.3 + 0.1 * occurrences),
      evidence: bucket.evidence,
      occurrences
    })
  }

  candidates.sort((a, b) => b.occurrences - a.occurrences || a.text.localeCompare(b.text))
  return options.limit === undefined ? candidates : candidates.slice(0, options.limit)
}
