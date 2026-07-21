import { describe, it, expect } from 'vitest'
import { generateIdentity } from '@xnetjs/identity'
import { extractEd25519PubKey } from '@xnetjs/crypto'
import type { DID } from '@xnetjs/core'
import {
  createUnsignedSpaceSnapshot,
  signSpaceSnapshot,
  verifySpaceSnapshot,
  computeSnapshotRoot,
  snapshotsAgree,
  snapshotDelta,
  type SnapshotHead
} from './space-snapshot'

const { identity, privateKey } = generateIdentity()
const DID_ = identity.did as DID
const pub = extractEd25519PubKey(identity.did)!

const heads = (spec: Array<[string, string, number]>): SnapshotHead[] =>
  spec.map(([nodeId, head, lamport]) => ({ nodeId, head: head as never, lamport }))

const sample = heads([
  ['node-b', 'cid:blake3:bbb', 5],
  ['node-a', 'cid:blake3:aaa', 3],
  ['node-c', 'cid:blake3:ccc', 9]
])

const make = (h = sample) =>
  signSpaceSnapshot(
    createUnsignedSpaceSnapshot({
      id: 'snap-1',
      space: 'space-1',
      snapshotterDID: DID_,
      heads: h,
      wallTime: 1000
    }),
    privateKey
  )

describe('createUnsignedSpaceSnapshot', () => {
  it('sorts heads and computes the high-water mark', () => {
    const snap = make()
    expect(snap.heads.map((h) => h.nodeId)).toEqual(['node-a', 'node-b', 'node-c'])
    expect(snap.highWaterMark).toBe(9)
  })

  it('rejects an empty frontier', () => {
    expect(() =>
      createUnsignedSpaceSnapshot({
        id: 's',
        space: 'x',
        snapshotterDID: DID_,
        heads: [],
        wallTime: 1
      })
    ).toThrow(/at least one head/)
  })

  it('rejects a duplicate node, which could hide a fork', () => {
    expect(() =>
      createUnsignedSpaceSnapshot({
        id: 's',
        space: 'x',
        snapshotterDID: DID_,
        heads: heads([
          ['node-a', 'cid:blake3:1', 1],
          ['node-a', 'cid:blake3:2', 2]
        ]),
        wallTime: 1
      })
    ).toThrow(/duplicate node/)
  })
})

describe('the order-independent root', () => {
  it('is identical for the same head set observed in different orders', () => {
    const forward = computeSnapshotRoot(sample)
    const shuffled = computeSnapshotRoot([sample[2], sample[0], sample[1]])
    expect(forward).toBe(shuffled)
  })

  it('changes when any head moves', () => {
    const moved = heads([
      ['node-b', 'cid:blake3:bbb', 5],
      ['node-a', 'cid:blake3:aaaX', 3], // different head
      ['node-c', 'cid:blake3:ccc', 9]
    ])
    expect(computeSnapshotRoot(sample)).not.toBe(computeSnapshotRoot(moved))
  })
})

describe('verifySpaceSnapshot', () => {
  it('accepts a genuine snapshot', () => {
    expect(verifySpaceSnapshot(make(), pub)).toBe(true)
  })

  it('rejects a tampered head (root no longer matches)', () => {
    const snap = make()
    const tampered = { ...snap, heads: [...snap.heads, ...heads([['node-d', 'cid:blake3:ddd', 2]])] }
    expect(verifySpaceSnapshot(tampered, pub)).toBe(false)
  })

  it('rejects a forged high-water mark', () => {
    const snap = make()
    expect(verifySpaceSnapshot({ ...snap, highWaterMark: 999 }, pub)).toBe(false)
  })

  it('rejects a snapshot signed by a different key', () => {
    const other = generateIdentity()
    const snap = make()
    expect(verifySpaceSnapshot(snap, extractEd25519PubKey(other.identity.did)!)).toBe(false)
  })
})

describe('anti-entropy helpers', () => {
  it('snapshotsAgree when two replicas reached the same frontier', () => {
    // Same heads, different observation order, independently created snapshots.
    const a = make(sample)
    const b = make([sample[1], sample[2], sample[0]])
    expect(snapshotsAgree(a, b)).toBe(true)
  })

  it('snapshotDelta returns nodes the holder is missing or behind on', () => {
    const have = heads([
      ['node-a', 'cid:blake3:aaa', 3],
      ['node-b', 'cid:blake3:bbb', 5]
    ])
    // target has node-c (new) and node-b advanced to 8; node-a is level.
    const target = heads([
      ['node-a', 'cid:blake3:aaa', 3],
      ['node-b', 'cid:blake3:bbb2', 8],
      ['node-c', 'cid:blake3:ccc', 9]
    ])
    const delta = snapshotDelta(have, target).map((h) => h.nodeId).sort()
    expect(delta).toEqual(['node-b', 'node-c'])
  })

  it('an up-to-date holder has an empty delta', () => {
    expect(snapshotDelta(sample, sample)).toEqual([])
  })
})
