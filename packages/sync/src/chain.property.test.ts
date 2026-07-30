/**
 * Property-based tests for chain ordering, fork detection, and validation
 * (exploration 0272, Pillar 1).
 *
 * Generated histories — random authors, random parent choices (including
 * forks and missing parents) — pin the structural laws:
 *
 *   - topologicalSort is permutation-invariant (deterministic ordering per
 *     protocol §L1.7: lamport → wallTime → author code-units) and always
 *     emits parents before children;
 *   - detectFork agrees with an independently computed oracle ("some
 *     non-null parent has more than one child"), and so do its fork points;
 *   - getChainHeads / getChainRoots agree with their set-theoretic oracles;
 *   - validateChain accepts every untampered generated history and rejects
 *     any history containing a tampered change.
 *
 * fast-check prints a seed + counterexample path on failure; replay with
 * `fc.assert(..., { seed, path })`. Depth via XNET_PBT_RUNS.
 */

import type { Change } from './change'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { detectFork, getChainHeads, getChainRoots, topologicalSort, validateChain } from './chain'
import { createUnsignedChange, signChange } from './change'

const RUNS = Number.parseInt(process.env.XNET_PBT_RUNS ?? '', 10) || 40

const AUTHORS = [
  'did:key:z6MkAAAchainPropA',
  'did:key:z6MkBBBchainPropB',
  'did:key:z6MkCCCchainPropC'
]
const { privateKey } = generateSigningKeyPair()

/**
 * Build a signed history from generated structure: change i picks its parent
 * among changes 0..i-1 (or null), authors round-robin with strictly
 * increasing per-author lamports (like the real clock), wallTime derived
 * from the lamport so the comparator triple is always a total order over
 * distinct changes.
 */
function buildHistory(parentPicks: number[]): Change<unknown>[] {
  const changes: Change<unknown>[] = []
  const perAuthorClock = new Map<string, number>()
  parentPicks.forEach((pick, index) => {
    const authorDID = AUTHORS[index % AUTHORS.length]
    const lamport = (perAuthorClock.get(authorDID) ?? index) + 1
    perAuthorClock.set(authorDID, lamport)
    const parent = index === 0 || pick % (index + 1) === index ? null : changes[pick % index]
    const unsigned = createUnsignedChange({
      id: `chain-prop-${index}`,
      type: 'node-change',
      payload: { nodeId: 'chain-node', properties: { seq: index } },
      parentHash: parent ? parent.hash : null,
      authorDID: authorDID as Change<unknown>['authorDID'],
      lamport,
      wallTime: 1_700_000_000_000 + lamport * 1000 + (index % AUTHORS.length)
    })
    changes.push(signChange(unsigned, privateKey))
  })
  return changes
}

const arbHistory = fc
  .array(fc.nat(64), { minLength: 1, maxLength: 16 })
  .map((picks) => buildHistory(picks))

/** A permutation expressed as sort keys, applied to any array. */
function permute<T>(items: readonly T[], keys: number[]): T[] {
  return items
    .map((item, index) => ({ item, key: keys[index % keys.length] * 1000 + index }))
    .sort((a, b) => a.key - b.key)
    .map((entry) => entry.item)
}

describe('chain structural properties (0272)', () => {
  it('topologicalSort is permutation-invariant and emits parents before children', () => {
    fc.assert(
      fc.property(
        arbHistory,
        fc.array(fc.nat(1000), { minLength: 1, maxLength: 16 }),
        (history, keys) => {
          const sortedA = topologicalSort(history)
          const sortedB = topologicalSort(permute(history, keys))
          expect(sortedB.map((c) => c.hash)).toEqual(sortedA.map((c) => c.hash))

          const seen = new Set<string>()
          for (const change of sortedA) {
            if (change.parentHash !== null) {
              // Parent is in the set → it must already have been emitted.
              const parentPresent = history.some((c) => c.hash === change.parentHash)
              if (parentPresent) expect(seen.has(change.parentHash)).toBe(true)
            }
            seen.add(change.hash)
          }
        }
      ),
      { numRuns: RUNS }
    )
  })

  it('detectFork and its fork points agree with the independent oracle', () => {
    fc.assert(
      fc.property(arbHistory, (history) => {
        const childCounts = new Map<string, number>()
        for (const change of history) {
          if (change.parentHash !== null) {
            childCounts.set(change.parentHash, (childCounts.get(change.parentHash) ?? 0) + 1)
          }
        }
        const expectedForkPoints = [...childCounts.entries()]
          .filter(([, count]) => count > 1)
          .map(([hash]) => hash)
          .sort()

        const { hasFork, forkPoints } = detectFork(history)
        expect(hasFork).toBe(expectedForkPoints.length > 0)
        expect([...forkPoints].sort()).toEqual(expectedForkPoints)
      }),
      { numRuns: RUNS }
    )
  })

  it('heads and roots agree with their set-theoretic oracles', () => {
    fc.assert(
      fc.property(arbHistory, (history) => {
        const parentHashes = new Set(history.map((c) => c.parentHash).filter((h) => h !== null))
        const expectedHeads = history.filter((c) => !parentHashes.has(c.hash)).map((c) => c.hash)
        const expectedRoots = history.filter((c) => c.parentHash === null).map((c) => c.hash)

        expect(
          getChainHeads(history)
            .map((c) => c.hash)
            .sort()
        ).toEqual([...expectedHeads].sort())
        expect(
          getChainRoots(history)
            .map((c) => c.hash)
            .sort()
        ).toEqual([...expectedRoots].sort())
        // Every non-empty history has at least one head and one root.
        expect(expectedHeads.length).toBeGreaterThan(0)
        expect(expectedRoots.length).toBeGreaterThan(0)
      }),
      { numRuns: RUNS }
    )
  })

  it('validateChain accepts untampered histories and rejects tampered ones', () => {
    fc.assert(
      fc.property(arbHistory, fc.nat(15), (history, victimIndex) => {
        const clean = validateChain(history)
        expect(clean.valid).toBe(true)
        expect(Boolean(clean.forkDetected)).toBe(detectFork(history).hasFork)

        const victim = victimIndex % history.length
        const tampered = history.map((change, index) =>
          index === victim
            ? { ...change, payload: { nodeId: 'chain-node', properties: { seq: -1 } } }
            : change
        )
        expect(validateChain(tampered).valid).toBe(false)
      }),
      { numRuns: RUNS }
    )
  })
})
