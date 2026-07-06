/**
 * Deterministic sync simulation — invariant suite (exploration 0272, Pillar 2).
 *
 * Runs the seeded SimWorld (see ./world.ts) across a batch of seeds and
 * asserts the invariants the protocol promises:
 *
 *   1. Convergence — after the network drains, every replica materializes the
 *      same state, and that state equals a fresh reference replica fed the
 *      relay's full log.
 *   2. Idempotency — applying the full log twice equals applying it once
 *      (the LWW `WHERE excluded.lamport_time >` guard is the safety net for
 *      every crash/replay path).
 *   3. Cursor monotonicity — a client's persisted sync cursor never moves
 *      backwards.
 *   4. Relay integrity — no hash-invalid change is ever accepted, and dedup
 *      accounting matches the log.
 *   5. Determinism — the same seed reproduces the same event trace and final
 *      state, so any failure replays exactly.
 *
 * Depth knobs (PR tier defaults in parentheses, escalated by the soak
 * workflow): XNET_SIM_SEEDS (4) simulation runs, XNET_SIM_OPS (160) scheduler
 * steps per run.
 *
 * Wall-clock time is pinned (`vi.useFakeTimers` faking only `Date`) so the
 * LWW wallTime tiebreak can never inject nondeterminism between two runs of
 * the same seed; identities are derived from the seed for the same reason.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { envInt } from '../support/rng'
import { runSimulation, type SimResult } from './world'

const SEED_COUNT = envInt('XNET_SIM_SEEDS', 4)
const OPS = envInt('XNET_SIM_OPS', 160)
const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => 0xc0ffee + i * 7919)

/** Rethrow assertion failures annotated with the seed that reproduces them. */
function assertWithSeed(seed: number, assertions: () => void): void {
  try {
    assertions()
  } catch (error) {
    throw new Error(
      `[sim seed=${seed} ops=${OPS}] invariant violated — replay with ` +
        `XNET_SIM_OPS=${OPS} and this seed. Original: ${
          error instanceof Error ? error.message : String(error)
        }`,
      { cause: error }
    )
  }
}

describe('deterministic sync simulation (0272)', () => {
  const results: SimResult[] = []

  beforeAll(async () => {
    // Pin Date so the LWW wallTime tiebreak is identical across runs of the
    // same seed. Timers stay real (sql.js/init paths may rely on them).
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-01-01T00:00:00Z') })
    for (const seed of SEEDS) {
      results.push(await runSimulation(seed, OPS))
    }
  }, 120_000)

  afterAll(() => {
    vi.useRealTimers()
  })

  it('replicas converge to the reference state after the drain', () => {
    for (const result of results) {
      assertWithSeed(result.seed, () => {
        for (const state of result.finalStates) {
          expect(state).toEqual(result.finalStates[0])
        }
        expect(result.finalStates[0]).toEqual(result.referenceState)
      })
    }
  })

  it('double-applying the full log is a no-op (LWW idempotency)', () => {
    for (const result of results) {
      assertWithSeed(result.seed, () => {
        expect(result.doubleApplyState).toEqual(result.referenceState)
      })
    }
  })

  it('persisted sync cursors never move backwards', () => {
    for (const result of results) {
      assertWithSeed(result.seed, () => {
        for (const history of result.cursorHistories) {
          for (let i = 1; i < history.length; i += 1) {
            expect(history[i]).toBeGreaterThanOrEqual(history[i - 1])
          }
        }
      })
    }
  })

  it('the relay never accepts an invalid change and dedup accounting balances', () => {
    for (const result of results) {
      assertWithSeed(result.seed, () => {
        expect(result.relay.rejectedInvalid).toBe(0)
        expect(result.relay.logSize).toBe(result.relay.accepted)
      })
    }
  })

  it('the schedule actually exercised faults (guard against a vacuous pass)', () => {
    // Across the whole seed batch we expect chaos to have happened: drops,
    // crashes, partitions. If tuning ever silences the fault injectors, this
    // test fails instead of the suite silently degrading to a happy path.
    const totals = results.reduce(
      (sum, r) => ({
        drops: sum.drops + r.faults.drops,
        crashes: sum.crashes + r.faults.crashes,
        partitions: sum.partitions + r.faults.partitions,
        writes: sum.writes + r.relay.accepted
      }),
      { drops: 0, crashes: 0, partitions: 0, writes: 0 }
    )
    expect(totals.writes).toBeGreaterThan(0)
    expect(totals.drops).toBeGreaterThan(0)
    expect(totals.crashes).toBeGreaterThan(0)
    expect(totals.partitions).toBeGreaterThan(0)
  })

  it('the same seed reproduces the same trace and final state', async () => {
    const seed = SEEDS[0]
    const first = await runSimulation(seed, OPS)
    const second = await runSimulation(seed, OPS)
    expect(second.trace).toEqual(first.trace)
    expect(second.finalStates).toEqual(first.finalStates)
    expect(second.referenceState).toEqual(first.referenceState)
  }, 60_000)
})
