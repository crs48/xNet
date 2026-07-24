/**
 * A fixed workspace to measure retrieval against (exploration 0394).
 *
 * Deliberately NOT the devtools demo seed: that seed exists to exercise every
 * schema and changes whenever one is added, which would silently move the
 * eval's numbers and make the gate meaningless. A golden set has to be pinned
 * to survive, so the corpus lives here, in the eval, and changes only when
 * someone means to change it.
 *
 * Entry search is a real Okapi BM25 rather than a stand-in — SQLite's `bm25()`
 * is the same ranking function, so this measures the same entry stage the app
 * gets from `nodes_fts` without pulling a native module into the unit pool.
 * FTS5's own behavior is covered separately by the sqlite adapter tests.
 */

import type { EntryHit, GraphAccess, GraphEdge, NodeText, RetrieveDeps } from '../types'

// ─── Corpus ─────────────────────────────────────────────────────────────────

export interface CorpusNode {
  id: string
  schemaId: string
  title: string
  /** Body text — what BM25 matches on, alongside the title. */
  content: string
  /** Typed outbound relations: property name → target node ids. */
  relations?: Record<string, string[]>
}

const PERSON = 'xnet://xnet.fyi/Person@1.0.0'
const PROJECT = 'xnet://xnet.fyi/Project@1.0.0'
const PAGE = 'xnet://xnet.fyi/Page@1.0.0'
const TASK = 'xnet://xnet.fyi/Task@1.0.0'
const MEETING = 'xnet://xnet.fyi/Meeting@1.0.0'
const INCIDENT = 'xnet://xnet.fyi/Incident@1.0.0'

/**
 * A small consultancy workspace. Two projects, three people, and enough
 * cross-links that some questions can only be answered by walking a relation
 * rather than by matching words — which is the entire reason the graph stage
 * exists, and the only thing that makes `HOP_DECAY` measurable.
 */
export const CORPUS: CorpusNode[] = [
  // — People ——————————————————————————————————————————————————————————
  {
    id: 'person-ana',
    schemaId: PERSON,
    title: 'Ana Duarte',
    content: 'Staff engineer. Focus areas: storage, replication, on-call rotation.'
  },
  {
    id: 'person-ben',
    schemaId: PERSON,
    title: 'Ben Okafor',
    content: 'Product designer. Works on onboarding flows and the design system.'
  },
  {
    id: 'person-cleo',
    schemaId: PERSON,
    title: 'Cleo Marsh',
    content: 'Security lead. Owns the threat model and vendor reviews.'
  },

  // — Projects ————————————————————————————————————————————————————————
  {
    id: 'project-atlas',
    schemaId: PROJECT,
    title: 'Atlas',
    content: 'Replatform the customer data warehouse onto the new storage engine.'
  },
  {
    id: 'project-beacon',
    schemaId: PROJECT,
    title: 'Beacon',
    content: 'Redesign the first-run experience so a new account reaches value faster.'
  },

  // — Pages ———————————————————————————————————————————————————————————
  {
    id: 'page-atlas-charter',
    schemaId: PAGE,
    title: 'Atlas charter',
    content:
      'Goals, non-goals and success metrics for the warehouse replatform. Cutover must be reversible for thirty days.',
    relations: { project: ['project-atlas'], owner: ['person-ana'] }
  },
  {
    id: 'page-beacon-charter',
    schemaId: PAGE,
    title: 'Beacon charter',
    content:
      'Scope for the onboarding redesign: fewer steps, clearer empty states, measurable activation.',
    relations: { project: ['project-beacon'], owner: ['person-ben'] }
  },
  {
    id: 'page-runbook',
    schemaId: PAGE,
    title: 'Warehouse cutover runbook',
    content:
      'Step by step procedure for the migration window, including the rollback command and who to page.',
    relations: { project: ['project-atlas'], owner: ['person-ana'] }
  },
  {
    id: 'page-threat-model',
    schemaId: PAGE,
    title: 'Threat model',
    content:
      'Assets, adversaries and trust boundaries. Covers credential handling and third party egress.',
    relations: { owner: ['person-cleo'] }
  },
  {
    id: 'page-onboarding-research',
    schemaId: PAGE,
    title: 'Onboarding research notes',
    content:
      'Eight interviews. People abandon at the workspace naming step and never return to finish.',
    relations: { project: ['project-beacon'], owner: ['person-ben'] }
  },
  {
    id: 'page-q2-retro',
    schemaId: PAGE,
    title: 'Q2 retrospective',
    content:
      'What went well, what did not, and the three changes we committed to for next quarter.',
    relations: { attendees: ['person-ana', 'person-ben', 'person-cleo'] }
  },

  // — Tasks ———————————————————————————————————————————————————————————
  {
    id: 'task-migrate-db',
    schemaId: TASK,
    title: 'Migrate the warehouse tables',
    content: 'Move every table to the new storage engine behind a feature flag.',
    relations: { project: ['project-atlas'], assignee: ['person-ana'] }
  },
  {
    id: 'task-write-runbook',
    schemaId: TASK,
    title: 'Write the cutover runbook',
    content: 'Document the migration window procedure and the rollback path.',
    relations: { project: ['project-atlas'], assignee: ['person-ana'] }
  },
  {
    id: 'task-rotate-keys',
    schemaId: TASK,
    title: 'Rotate signing keys',
    content: 'Quarterly credential rotation for the release signing keys.',
    relations: { assignee: ['person-cleo'] }
  },
  {
    id: 'task-vendor-review',
    schemaId: TASK,
    title: 'Vendor security review',
    content: 'Assess the analytics vendor before renewal.',
    relations: { assignee: ['person-cleo'] }
  },
  {
    id: 'task-empty-states',
    schemaId: TASK,
    title: 'Design the empty states',
    content: 'Every list needs a first-run state that explains what goes there.',
    relations: { project: ['project-beacon'], assignee: ['person-ben'] }
  },
  {
    id: 'task-naming-step',
    schemaId: TASK,
    title: 'Remove the workspace naming step',
    content: 'Default the name and let people rename later; this is the abandonment point.',
    relations: { project: ['project-beacon'], assignee: ['person-ben'] }
  },
  {
    id: 'task-oncall-docs',
    schemaId: TASK,
    title: 'Refresh the on-call handbook',
    content: 'Escalation ladder is stale and the pager rotation moved.',
    relations: { assignee: ['person-ana'] }
  },

  // — Meetings ————————————————————————————————————————————————————————
  {
    id: 'meeting-atlas-kickoff',
    schemaId: MEETING,
    title: 'Atlas kickoff',
    content: 'Agreed the cutover window and the reversibility requirement.',
    relations: { project: ['project-atlas'], attendees: ['person-ana', 'person-cleo'] }
  },
  {
    id: 'meeting-beacon-review',
    schemaId: MEETING,
    title: 'Beacon design review',
    content: 'Walked the new first-run flow and cut two screens.',
    relations: { project: ['project-beacon'], attendees: ['person-ben'] }
  },

  // — Incidents ———————————————————————————————————————————————————————
  {
    id: 'incident-login-outage',
    schemaId: INCIDENT,
    title: 'Login outage 2026-05-11',
    content:
      'Expired certificate on the auth edge. Forty minutes of failed sign-ins before rollback.',
    relations: { owner: ['person-cleo'] }
  },
  {
    id: 'incident-slow-queries',
    schemaId: INCIDENT,
    title: 'Slow dashboard queries',
    content: 'Missing index after the partial migration; dashboards timed out for two hours.',
    relations: { project: ['project-atlas'], owner: ['person-ana'] }
  }
]

export const CORPUS_BY_ID = new Map(CORPUS.map((node) => [node.id, node]))

// ─── Okapi BM25 ─────────────────────────────────────────────────────────────

const K1 = 1.2
const B = 0.75

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1)
}

interface Bm25Index {
  docs: Array<{ id: string; terms: Map<string, number>; length: number }>
  df: Map<string, number>
  avgLength: number
}

function buildBm25Index(nodes: CorpusNode[]): Bm25Index {
  const docs = nodes.map((node) => {
    const tokens = tokenize(`${node.title} ${node.content}`)
    const terms = new Map<string, number>()
    for (const token of tokens) terms.set(token, (terms.get(token) ?? 0) + 1)
    return { id: node.id, terms, length: tokens.length }
  })
  const df = new Map<string, number>()
  for (const doc of docs) {
    for (const term of doc.terms.keys()) df.set(term, (df.get(term) ?? 0) + 1)
  }
  const avgLength = docs.reduce((sum, doc) => sum + doc.length, 0) / Math.max(1, docs.length)
  return { docs, df, avgLength }
}

const INDEX = buildBm25Index(CORPUS)

/** BM25-ranked ids for a query, best first. Ties break on id for determinism. */
export function bm25Search(query: string, k: number): Array<{ id: string; score: number }> {
  const queryTerms = tokenize(query)
  const n = INDEX.docs.length
  const scored: Array<{ id: string; score: number }> = []

  for (const doc of INDEX.docs) {
    let score = 0
    for (const term of queryTerms) {
      const tf = doc.terms.get(term)
      if (!tf) continue
      const df = INDEX.df.get(term) ?? 0
      // Okapi IDF, the +1 form SQLite's bm25() also uses (never negative).
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5))
      const norm = tf * (K1 + 1)
      const denom = tf + K1 * (1 - B + (B * doc.length) / INDEX.avgLength)
      score += idf * (norm / denom)
    }
    if (score > 0) scored.push({ id: doc.id, score })
  }

  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  return scored.slice(0, k)
}

// ─── Retriever wiring ───────────────────────────────────────────────────────

/** Typed edges both ways, exactly as `nodeStoreGraphAccess` presents them. */
function buildAdjacency(): Map<string, GraphEdge[]> {
  const adjacency = new Map<string, GraphEdge[]>()
  const push = (from: string, edge: GraphEdge): void => {
    const list = adjacency.get(from)
    if (list) list.push(edge)
    else adjacency.set(from, [edge])
  }
  for (const node of CORPUS) {
    for (const [relation, targets] of Object.entries(node.relations ?? {})) {
      for (const target of targets) {
        push(node.id, { nodeId: target, relation, direction: 'outbound' })
        push(target, { nodeId: node.id, relation, direction: 'inbound' })
      }
    }
  }
  return adjacency
}

const ADJACENCY = buildAdjacency()

export const graph: GraphAccess = {
  neighbors: async (nodeId) => ADJACENCY.get(nodeId) ?? []
}

export async function loadText(nodeId: string): Promise<NodeText | null> {
  const node = CORPUS_BY_ID.get(nodeId)
  if (!node) return null
  return { title: node.title, snippet: node.content, schemaId: node.schemaId }
}

/** Normalized so the top BM25 hit scores 1.0, matching the app's entry search. */
export function keywordEntrySearch(query: string, k: number): Promise<EntryHit[]> {
  const hits = bm25Search(query, k)
  const best = hits[0]?.score ?? 1
  return Promise.resolve(
    hits.map((hit) => ({
      nodeId: hit.id,
      score: best > 0 ? hit.score / best : 0,
      source: 'keyword' as const
    }))
  )
}

export function createDeps(overrides: Partial<RetrieveDeps> = {}): RetrieveDeps {
  return { entrySearch: keywordEntrySearch, graph, loadText, ...overrides }
}
