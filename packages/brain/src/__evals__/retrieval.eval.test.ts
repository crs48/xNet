/**
 * Golden-set retrieval eval (exploration 0394).
 *
 * The repo measures agent *interfaces* (token cost per task) but had nothing
 * measuring retrieval *output*, so every improvement to the retriever shipped
 * on reasoning alone. This is the missing half: a fixed corpus, a fixed set of
 * questions, and recall@k / MRR over the real `retrieve()` pipeline.
 *
 * Named consumer (0294): whoever changes `retrieve`, `expand`, `pack`, or
 * `HOP_DECAY`. It gates on a committed baseline rather than an absolute score,
 * so it can actually go green, and it ratchets — improving the retriever means
 * raising `BASELINE` in the same commit.
 *
 * Deterministic by construction: fixed corpus, BM25 with no randomness, no
 * clock, no network, no native modules.
 */

import { describe, expect, it } from 'vitest'
import { retrieve } from '../retrieve'
import { DEFAULT_BUDGET, type RetrievalBudget } from '../types'
import {
  budgetFromProfile,
  DEFAULT_RETRIEVAL_PROFILE,
  normalizeProfile,
  ratchetProfile,
  type ProfileScores,
  type RetrievalProfile
} from '../retrieval-profile'
import { createDeps } from './corpus'
import { GOLDEN, mean, recallAt, reciprocalRank, round2 } from './golden'

/**
 * The app's real budget (`ai-graph-retriever.ts`), so the eval measures the
 * shipping configuration rather than a convenient one.
 */
const BUDGET = { maxTokens: 24_000, maxHops: 1, maxEntries: 12, maxNodes: 48 }

/**
 * Recall is scored at 5, not at the 12 the retriever returns. On a corpus this
 * size a top-12 cut holds most of the workspace, so recall@12 is 1.00 for
 * everything and cannot detect a ranking regression — a gate that cannot fail
 * teaches everyone to ignore it (0294). Five is the number that discriminates.
 */
const K = 5

/**
 * Measured on the corpus + golden set as committed. Raise these when the
 * retriever genuinely improves; a drop is a regression to explain, not a
 * number to lower.
 */
const BASELINE = {
  recallAll: 0.81,
  recallKeyword: 1.0,
  /**
   * Half the graph-only answers miss the top 5 — expanded nodes carry
   * `HOP_DECAY` and lose to any keyword match. Real headroom, not a bad
   * corpus; see `hop-decay.sweep.test.ts` for what moving the constant costs.
   */
  recallGraph: 0.5,
  mrr: 0.69
}

interface CaseResult {
  id: string
  kind: string
  recall: number
  rr: number
  returned: string[]
}

async function runGoldenSet(budget: Partial<RetrievalBudget> = BUDGET): Promise<CaseResult[]> {
  const deps = createDeps()
  const results: CaseResult[] = []
  for (const testCase of GOLDEN) {
    const pack = await retrieve(testCase.query, budget, deps)
    // Budget overflow is still "found" for recall purposes — the agent can pull
    // an expandable ref with a tool. Ranking is what MRR measures.
    const returned = [
      ...pack.items.map((item) => item.nodeId),
      ...pack.expandable.map((ref) => ref.nodeId)
    ]
    results.push({
      id: testCase.id,
      kind: testCase.kind,
      recall: recallAt(returned, testCase.relevant, K),
      rr: reciprocalRank(
        pack.items.map((item) => item.nodeId),
        testCase.relevant
      ),
      returned
    })
  }
  return results
}

describe('golden-set retrieval eval (0394)', () => {
  it('meets the committed baseline for recall and MRR', async () => {
    const results = await runGoldenSet()
    const keyword = results.filter((r) => r.kind === 'keyword')
    const graph = results.filter((r) => r.kind === 'graph')

    const measured = {
      recallAll: round2(mean(results.map((r) => r.recall))),
      recallKeyword: round2(mean(keyword.map((r) => r.recall))),
      recallGraph: round2(mean(graph.map((r) => r.recall))),
      mrr: round2(mean(results.map((r) => r.rr)))
    }

    // Printed so a CI log shows the numbers, not just pass/fail.
    console.log(
      `[0394 retrieval eval] recall@${K} all=${measured.recallAll} ` +
        `keyword=${measured.recallKeyword} graph=${measured.recallGraph} mrr=${measured.mrr}`
    )
    const misses = results.filter((r) => r.recall < 1).map((r) => r.id)
    if (misses.length > 0) console.log(`[0394 retrieval eval] incomplete: ${misses.join(', ')}`)

    expect(measured.recallAll).toBeGreaterThanOrEqual(BASELINE.recallAll)
    expect(measured.recallKeyword).toBeGreaterThanOrEqual(BASELINE.recallKeyword)
    expect(measured.recallGraph).toBeGreaterThanOrEqual(BASELINE.recallGraph)
    expect(measured.mrr).toBeGreaterThanOrEqual(BASELINE.mrr)
  })

  it('is deterministic across runs', async () => {
    const first = await runGoldenSet()
    const second = await runGoldenSet()
    expect(first.map((r) => r.returned)).toEqual(second.map((r) => r.returned))
  })

  /**
   * The eval has to be able to fail, or it is decoration. Breaking the graph
   * stage must move the graph-only cases and leave the keyword ones alone.
   */
  it('detects a broken graph stage', async () => {
    const deps = createDeps({ graph: { neighbors: async () => [] } })
    const graphCases = GOLDEN.filter((c) => c.kind === 'graph')

    const recalls: number[] = []
    for (const testCase of graphCases) {
      const pack = await retrieve(testCase.query, BUDGET, deps)
      recalls.push(
        recallAt(
          pack.items.map((i) => i.nodeId),
          testCase.relevant,
          K
        )
      )
    }

    expect(round2(mean(recalls))).toBeLessThan(BASELINE.recallGraph)
  })

  it('detects a broken entry stage', async () => {
    const deps = createDeps({ entrySearch: async () => [] })
    const pack = await retrieve(GOLDEN[0].query, BUDGET, deps)
    expect(pack.items).toHaveLength(0)
  })

  /**
   * Authorization runs before packing, so a denied node must not reach the
   * pack by any route — including graph expansion, which is the path that
   * would leak it (0192).
   */
  it('never returns a node the authorizer denies', async () => {
    const secret = 'page-threat-model'
    const deps = createDeps({ authorize: (nodeId) => nodeId !== secret })
    for (const testCase of GOLDEN) {
      const pack = await retrieve(testCase.query, BUDGET, deps)
      expect(pack.items.map((i) => i.nodeId)).not.toContain(secret)
      expect(pack.expandable.map((r) => r.nodeId)).not.toContain(secret)
    }
  })
})

/**
 * The ratchet, scored against this eval (exploration 0415).
 *
 * A locally-tuned `RetrievalProfile` is only adopted when the *pinned* golden
 * set does not regress. Scoring a profile on the behaviour that produced it is
 * how a retriever convinces itself it has improved while getting worse at
 * everything the user has not done yet — so the gate is this fixed corpus, and
 * nothing else.
 */
describe('retrieval profile ratchet (0415)', () => {
  async function score(profile: RetrievalProfile): Promise<ProfileScores> {
    const results = await runGoldenSet(budgetFromProfile(profile, { ...DEFAULT_BUDGET, ...BUDGET }))
    const graph = results.filter((r) => r.kind === 'graph')
    return {
      recallAll: round2(mean(results.map((r) => r.recall))),
      recallGraph: round2(mean(graph.map((r) => r.recall))),
      mrr: round2(mean(results.map((r) => r.rr)))
    }
  }

  /**
   * Measured, not assumed. The first draft of this test asserted that a steep
   * hop penalty (0.2) would regress the graph cases — it does the opposite:
   *
   *   hopDecay=0.55 (shipped)  all=0.81  graph=0.50  mrr=0.69
   *   hopDecay=0.20            all=0.85  graph=0.60  mrr=0.71
   *
   * 0394's sweep only covered [0.35, 0.85] and found no winner inside it. The
   * default has NOT been moved on this: the whole gap is one or two golden
   * cases, which is this eval's resolution rather than a signal — the same
   * argument 0394 made for leaving it alone. What the ratchet proves here is
   * that it would accept the change if the evidence were stronger, and that it
   * is scoring the pinned corpus rather than the user's own behaviour.
   */
  it('adopts a measured improvement on the pinned corpus', async () => {
    const baseline = await score(DEFAULT_RETRIEVAL_PROFILE)
    const candidate = normalizeProfile({ ...DEFAULT_RETRIEVAL_PROFILE, hopDecay: 0.2 })
    const scored = await score(candidate)
    const decision = ratchetProfile({ candidate, baseline, scored })

    console.log(
      `[0415 ratchet] hopDecay 0.55 → 0.2: all ${baseline.recallAll}→${scored.recallAll} ` +
        `graph ${baseline.recallGraph}→${scored.recallGraph} mrr ${baseline.mrr}→${scored.mrr} ` +
        `(${decision.adopt ? 'ADOPT' : 'REJECT'}: ${decision.reason})`
    )
    expect(decision.adopt).toBe(true)
    expect(scored.recallGraph).toBeGreaterThan(baseline.recallGraph)
  })

  it('refuses a candidate that regresses any metric', async () => {
    const baseline = await score(DEFAULT_RETRIEVAL_PROFILE)
    // No in-bounds profile regresses this corpus, so the regression is
    // constructed: the assertion under test is the ratchet's decision rule, and
    // it must refuse even when overall recall went up.
    const decision = ratchetProfile({
      candidate: normalizeProfile({ ...DEFAULT_RETRIEVAL_PROFILE, hopDecay: 0.3 }),
      baseline,
      scored: { ...baseline, recallAll: baseline.recallAll + 0.1, mrr: baseline.mrr - 0.05 }
    })
    expect(decision.adopt).toBe(false)
    expect(decision.reason).toContain('mrr')
  })

  it('refuses a profile that merely matches the baseline', async () => {
    const baseline = await score(DEFAULT_RETRIEVAL_PROFILE)
    const decision = ratchetProfile({
      candidate: DEFAULT_RETRIEVAL_PROFILE,
      baseline,
      scored: await score(DEFAULT_RETRIEVAL_PROFILE)
    })
    expect(decision.adopt).toBe(false)
    expect(decision.reason).toBe('no measurable improvement')
  })
})
