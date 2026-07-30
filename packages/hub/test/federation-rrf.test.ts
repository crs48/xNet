/**
 * RRF fusion order (explorations 0367/0383, W0).
 *
 * The bug this guards against: deduplicating by cid BEFORE reciprocal rank
 * fusion collapses each document to a single source, so a document three hubs
 * agree on earns fusion credit from only one list — discarding cross-source
 * agreement, which is RRF's entire purpose. Fusion must see every copy;
 * deduplication happens after, keeping one representative per cid.
 */
import { describe, expect, it } from 'vitest'
import { fuseFederatedResults, type FederatedResult } from '../src/services/federation'

const result = (
  cid: string,
  sourceHub: string,
  score: number,
  overrides: Partial<FederatedResult> = {}
): FederatedResult => ({
  nodeId: cid,
  cid,
  score,
  title: cid,
  schema: 'xnet://xnet.fyi/Page@1.0.0',
  snippet: '',
  author: '',
  updatedAt: 0,
  sourceHub,
  ...overrides
})

describe('fuseFederatedResults', () => {
  it('rewards cross-hub agreement: a doc two hubs return outranks a single-source top hit', () => {
    // Source A ranks Y first and X second; sources B and C both rank X first.
    // Agreement should win: X gets credit from three lists, Y from one.
    const fused = fuseFederatedResults([
      result('Y', 'hub-a', 10),
      result('X', 'hub-a', 5),
      result('X', 'hub-b', 9),
      result('X', 'hub-c', 8)
    ])

    const x = fused.find((r) => r.cid === 'X')
    const y = fused.find((r) => r.cid === 'Y')
    expect(x).toBeDefined()
    expect(y).toBeDefined()
    // Strict: under the old dedupe-first order X kept only its highest-score
    // copy (one source), earning the same 1/(k+1) as Y — a tie at best.
    expect(x!.score).toBeGreaterThan(y!.score)
    expect(fused[0]!.cid).toBe('X')
  })

  it('returns one row per cid after fusion', () => {
    const fused = fuseFederatedResults([
      result('X', 'hub-a', 5),
      result('X', 'hub-b', 9),
      result('Z', 'hub-b', 3)
    ])
    expect(fused.map((r) => r.cid).sort()).toEqual(['X', 'Z'])
  })

  it('prefers the local copy as the surviving representative', () => {
    const fused = fuseFederatedResults([
      result('X', 'hub-b', 9, { snippet: 'remote' }),
      result('X', 'local', 2, { snippet: 'local' })
    ])
    expect(fused).toHaveLength(1)
    expect(fused[0]!.sourceHub).toBe('local')
    expect(fused[0]!.snippet).toBe('local')
  })

  it('fused scores are per-cid sums of 1/(k+rank+1) across sources', () => {
    const k = 60
    const fused = fuseFederatedResults(
      [result('X', 'hub-a', 5), result('X', 'hub-b', 9), result('Y', 'hub-a', 10)],
      k
    )
    const x = fused.find((r) => r.cid === 'X')!
    const y = fused.find((r) => r.cid === 'Y')!
    // hub-a: [Y, X] → Y rank 0, X rank 1; hub-b: [X] → X rank 0.
    expect(x.score).toBeCloseTo(1 / (k + 2) + 1 / (k + 1), 10)
    expect(y.score).toBeCloseTo(1 / (k + 1), 10)
  })
})
