/**
 * Deterministic IDs, a seeded PRNG, and small content pools for the dev seed.
 *
 * Idempotency is a deterministic-ID problem: if the same logical entity always
 * gets the same node ID, `store.importDeterministicNodes()` upserts (LWW merge)
 * instead of duplicating. Every seeded node ID lives under the `seed/` prefix so
 * the runner can recognise and (in reseed mode) target the managed set.
 */

/** Prefix every seed-managed node ID carries. */
export const SEED_PREFIX = 'seed'

/** Prefix for non-idempotent "accrete" volume nodes (random IDs). */
export const SEED_ACCRETE_PREFIX = `${SEED_PREFIX}/accrete`

/** Prefix for Tier-2 auto-generated representative nodes. */
export const SEED_AUTO_PREFIX = `${SEED_PREFIX}/auto`

const slugify = (part: string): string =>
  String(part)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * Build a stable node ID, e.g.
 * `seedId('task', 'Website Redesign', 3)` → `seed/task/website-redesign/3`.
 */
export function seedId(domain: string, ...parts: Array<string | number>): string {
  const tail = parts.map((p) => slugify(String(p))).filter(Boolean)
  return [SEED_PREFIX, slugify(domain), ...tail].join('/')
}

/** Whether a node ID belongs to the seed-managed set. */
export function isSeedId(id: string): boolean {
  return id === SEED_PREFIX || id.startsWith(`${SEED_PREFIX}/`)
}

/**
 * mulberry32 — a tiny, fast, deterministic PRNG. The same seed always yields the
 * same sequence, so seeded property values are reproducible across runs.
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Deterministically pick one element of `xs`. */
export function pick<T>(rng: () => number, xs: readonly T[]): T {
  return xs[Math.floor(rng() * xs.length) % xs.length] as T
}

/** Deterministic integer in `[min, max]` inclusive. */
export function int(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

/**
 * Stable demo DIDs used for assignees / members / reactors. These only ever
 * appear as field VALUES (the store still signs every seeded change as the real
 * author), so syntactically-valid placeholder `did:key` strings are enough; we
 * avoid pulling `@xnetjs/crypto`/`identity` into the devtools bundle.
 */
export const DEMO_PEOPLE: ReadonlyArray<{ did: string; name: string; emoji: string }> = [
  {
    did: 'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH',
    name: 'Ada Lovelace',
    emoji: '👩‍💻'
  },
  {
    did: 'did:key:z6MkjchhfUsD6mmvni8mCdXHw216Xrm9bQe2mBH1P5RDjVJG',
    name: 'Alan Turing',
    emoji: '🧮'
  },
  {
    did: 'did:key:z6MktiSzqF9kqwdU8VkdBKx56EYzXfpgnNPUAGznmkuzdrqv',
    name: 'Grace Hopper',
    emoji: '⚓️'
  },
  {
    did: 'did:key:z6Mkf5rGMoatrSj1f4CyvuHBeXJ2GpwQ58gw4uMvPRy4Vqfu',
    name: 'Katherine Johnson',
    emoji: '🚀'
  }
]

export const PROJECT_NAMES = [
  'Website Redesign',
  'API Migration',
  'Mobile App v2',
  'Billing Overhaul',
  'Search Relevance',
  'Onboarding Revamp'
] as const

export const TASK_VERBS = [
  'Wireframes',
  'Technical spec',
  'Implementation',
  'Code review',
  'QA pass',
  'Launch checklist',
  'Retrospective',
  'Docs',
  'Performance budget',
  'Accessibility audit',
  'Telemetry',
  'Rollback plan'
] as const

export const CHANNEL_NAMES = [
  'general',
  'engineering',
  'design',
  'product',
  'random',
  'incidents'
] as const

export const CHAT_LINES = [
  'Morning! Anyone reviewing the latest PR?',
  'Just pushed a fix for the flaky test.',
  'Can we sync on the API contract at 2pm?',
  'Deploy is green ✅',
  'Heads up: staging is a bit slow right now.',
  'Nice work on the migration 🎉',
  'I left a couple of comments on the doc.',
  'Where did we land on the rollout plan?',
  'Following up on yesterday — any blockers?',
  'Shipping this behind a flag for now.',
  'LGTM, merging.',
  'Thanks for the quick turnaround!'
] as const

export const METRIC_DEFS: ReadonlyArray<{
  name: string
  kind: 'boolean' | 'count' | 'duration' | 'scale' | 'number'
  unit: string
  icon: string
  polarity: 'higherBetter' | 'lowerBetter' | 'neutral'
}> = [
  { name: 'Deploys per day', kind: 'count', unit: 'deploys', icon: '🚀', polarity: 'higherBetter' },
  { name: 'p95 latency', kind: 'duration', unit: 'ms', icon: '⏱️', polarity: 'lowerBetter' },
  { name: 'Focus', kind: 'scale', unit: '', icon: '🎯', polarity: 'higherBetter' },
  { name: 'Active users', kind: 'number', unit: 'users', icon: '📈', polarity: 'higherBetter' }
]
