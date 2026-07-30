/**
 * The golden set: questions a person would actually ask this workspace, and
 * the nodes an answer is wrong without (exploration 0394).
 *
 * `relevant` is the judgement — keep it to nodes that genuinely must appear,
 * not everything vaguely on-topic, or recall stops discriminating. Adding a
 * case is cheap; changing an existing one moves the baseline and should be a
 * deliberate, reviewed act.
 */

export type GoldenKind =
  /** The answer text contains the query's words — BM25 alone should find it. */
  | 'keyword'
  /**
   * The answer does NOT contain the query's words and is only reachable by
   * walking a typed relation from something that does. These are the cases
   * that justify the graph stage, and the only ones `HOP_DECAY` can move.
   */
  | 'graph'

export interface GoldenCase {
  id: string
  query: string
  kind: GoldenKind
  relevant: string[]
  note?: string
}

export const GOLDEN: GoldenCase[] = [
  // — Keyword: the entry stage should carry these on its own ———————————
  {
    id: 'runbook',
    query: 'cutover runbook rollback procedure',
    kind: 'keyword',
    relevant: ['page-runbook', 'task-write-runbook']
  },
  {
    id: 'key-rotation',
    query: 'rotate signing keys credential rotation',
    kind: 'keyword',
    relevant: ['task-rotate-keys']
  },
  {
    id: 'onboarding-abandonment',
    query: 'where do people abandon onboarding',
    kind: 'keyword',
    relevant: ['page-onboarding-research', 'task-naming-step']
  },
  {
    id: 'threat-model',
    query: 'trust boundaries and third party egress',
    kind: 'keyword',
    relevant: ['page-threat-model']
  },
  {
    id: 'login-outage',
    query: 'expired certificate failed sign-ins',
    kind: 'keyword',
    relevant: ['incident-login-outage']
  },
  {
    id: 'storage-engine',
    query: 'move tables to the new storage engine',
    kind: 'keyword',
    relevant: ['task-migrate-db', 'project-atlas']
  },
  {
    id: 'empty-states',
    query: 'first-run empty state for every list',
    kind: 'keyword',
    relevant: ['task-empty-states']
  },
  {
    id: 'oncall',
    query: 'escalation ladder pager rotation',
    kind: 'keyword',
    relevant: ['task-oncall-docs']
  },

  // — Graph: only reachable by walking a relation ————————————————————
  {
    id: 'atlas-people',
    query: 'Atlas',
    kind: 'graph',
    relevant: ['person-ana'],
    note: 'Ana is never named in Atlas text; she is the assignee/owner of its work.'
  },
  {
    id: 'ana-work',
    query: 'Ana Duarte',
    kind: 'graph',
    relevant: ['task-migrate-db', 'task-write-runbook'],
    note: 'Her tasks never mention her name — reachable only via `assignee`.'
  },
  {
    id: 'cleo-work',
    query: 'Cleo Marsh security lead',
    kind: 'graph',
    relevant: ['task-rotate-keys', 'task-vendor-review'],
    note: 'Reachable via `assignee`; the tasks do not name her.'
  },
  {
    id: 'beacon-scope',
    query: 'Beacon',
    kind: 'graph',
    relevant: ['task-empty-states', 'task-naming-step'],
    note: 'The tasks say nothing about Beacon; they hang off it via `project`.'
  },
  {
    id: 'atlas-incidents',
    query: 'Atlas project',
    kind: 'graph',
    relevant: ['incident-slow-queries'],
    note: 'The incident is linked to Atlas but never uses the project name.'
  }
]

// ─── Metrics ────────────────────────────────────────────────────────────────

/** Fraction of a case's relevant nodes present in the top `k` returned ids. */
export function recallAt(returned: string[], relevant: string[], k: number): number {
  if (relevant.length === 0) return 1
  const top = new Set(returned.slice(0, k))
  const found = relevant.filter((id) => top.has(id)).length
  return found / relevant.length
}

/** Reciprocal rank of the first relevant node (0 when none appear). */
export function reciprocalRank(returned: string[], relevant: string[]): number {
  const wanted = new Set(relevant)
  for (let i = 0; i < returned.length; i++) {
    if (wanted.has(returned[i])) return 1 / (i + 1)
  }
  return 0
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/** Two decimals — enough to see a real move, coarse enough not to be noise. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100
}
