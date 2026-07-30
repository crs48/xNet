/**
 * Constant sweep against the golden set (exploration 0394).
 *
 * `HOP_DECAY` was a bare literal chosen by reasoning. This sweeps it over the
 * eval and asserts the shipped default is still a best scorer, so changing the
 * constant means moving a measured number rather than an opinion — and so a
 * casual edit to it turns the lane red.
 *
 * Note on RRF_K: the app's vector tier fuses keyword and vector ranks with
 * `RRF_K = 60` (`ai-vector-search.ts`). It is deliberately NOT swept here.
 * Doing so needs a second, genuinely semantic ranking; a mock embedding model
 * would just measure the mock, and real MiniLM weights mean a network download
 * in CI, which this lane must not have. 60 is the literature default and the
 * optimum is documented as flat across k ∈ [20, 100], so it stays until the
 * vector tier can be measured honestly. See the exploration's open questions.
 */

import { describe, expect, it } from 'vitest'
import { retrieve } from '../retrieve'
import { DEFAULT_HOP_DECAY } from '../types'
import { createDeps } from './corpus'
import { GOLDEN, mean, recallAt, reciprocalRank, round2 } from './golden'

const K = 5
const BASE_BUDGET = { maxTokens: 24_000, maxHops: 1, maxEntries: 12, maxNodes: 48 }
const CANDIDATES = [0.2, 0.35, 0.45, 0.55, 0.7, 0.85, 1.0]

interface SweepRow {
  hopDecay: number
  recallAll: number
  recallKeyword: number
  recallGraph: number
  mrr: number
}

async function scoreAt(hopDecay: number): Promise<SweepRow> {
  const deps = createDeps()
  const budget = { ...BASE_BUDGET, hopDecay }
  const recalls: number[] = []
  const keyword: number[] = []
  const graph: number[] = []
  const rrs: number[] = []

  for (const testCase of GOLDEN) {
    const pack = await retrieve(testCase.query, budget, deps)
    const ids = pack.items.map((item) => item.nodeId)
    const recall = recallAt(ids, testCase.relevant, K)
    recalls.push(recall)
    rrs.push(reciprocalRank(ids, testCase.relevant))
    if (testCase.kind === 'keyword') keyword.push(recall)
    else graph.push(recall)
  }

  return {
    hopDecay,
    recallAll: round2(mean(recalls)),
    recallKeyword: round2(mean(keyword)),
    recallGraph: round2(mean(graph)),
    mrr: round2(mean(rrs))
  }
}

/**
 * The eval's resolution. `recallAll` is a mean over {@link GOLDEN}, so the
 * coarsest a single golden item can move it is `1 / |GOLDEN|` — one case with
 * one relevant node flipping in or out of the top K. Differences at or below
 * this are one item reordering, not evidence about the constant, and acting on
 * them would be the same vibes-driven tuning the eval exists to replace.
 */
const ONE_ITEM = 1 / GOLDEN.length

describe('hop-decay sweep (0394)', () => {
  it('shows no candidate beating the shipped default by more than eval noise', async () => {
    const rows: SweepRow[] = []
    for (const candidate of CANDIDATES) rows.push(await scoreAt(candidate))

    for (const row of rows) {
      console.log(
        `[0394 sweep] hopDecay=${row.hopDecay.toFixed(2)} ` +
          `recall@${K} all=${row.recallAll} keyword=${row.recallKeyword} ` +
          `graph=${row.recallGraph} mrr=${row.mrr}`
      )
    }

    const best = rows.reduce((a, b) => (b.recallAll > a.recallAll ? b : a))
    const shipped = rows.find((row) => row.hopDecay === DEFAULT_HOP_DECAY)
    expect(
      shipped,
      `DEFAULT_HOP_DECAY ${DEFAULT_HOP_DECAY} is not in the swept range`
    ).toBeDefined()

    // A candidate that wins by more than one golden item is a real signal and
    // should change the default — fail so somebody looks.
    const margin = round2(best.recallAll - shipped!.recallAll)
    console.log(
      `[0394 sweep] best=${best.hopDecay} (${best.recallAll}) ` +
        `shipped=${DEFAULT_HOP_DECAY} (${shipped!.recallAll}) ` +
        `margin=${margin} noise floor=${round2(ONE_ITEM)}`
    )
    expect(margin).toBeLessThanOrEqual(ONE_ITEM)
  })

  it('shows the tradeoff the constant actually controls', async () => {
    // The knob trades direct-match precision against multi-hop recall; if it
    // ever stops doing that, the sweep above is measuring nothing.
    const steep = await scoreAt(0.2)
    const flat = await scoreAt(1.0)
    expect(flat.recallGraph).toBeGreaterThanOrEqual(steep.recallGraph)
  })
})
