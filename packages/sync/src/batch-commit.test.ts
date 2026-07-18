import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { describe, expect, it } from 'vitest'
import {
  MAX_COMMIT_CHANGES,
  chunkForCommits,
  computeBatchRoot,
  createUnsignedBatchCommit,
  recomputeBatchCommitHash,
  signBatchCommit,
  verifyBatch,
  verifyBatchCommit,
  type BatchCommit
} from './batch-commit'
import {
  createChangeId,
  createUnsignedChange,
  recomputeChangeHash,
  signChange,
  type Change
} from './change'

const AUTHOR = generateSigningKeyPair()
const OTHER = generateSigningKeyPair()
const AUTHOR_DID = 'did:key:zAuthor' as DID
const OTHER_DID = 'did:key:zOther' as DID

type Payload = { nodeId: string; properties: Record<string, unknown> }

const makeChange = (
  index: number,
  options: { author?: Uint8Array; authorDID?: DID } = {}
): Change<Payload> => {
  const unsigned = createUnsignedChange<Payload>({
    id: createChangeId(),
    type: 'node-change',
    payload: { nodeId: `node-${index}`, properties: { title: `Item ${index}` } },
    parentHash: null,
    authorDID: options.authorDID ?? AUTHOR_DID,
    wallTime: 1_700_000_000_000 + index,
    lamport: index + 1
  })
  return signChange(unsigned, options.author ?? AUTHOR.privateKey)
}

const commitOver = (changes: Change<Payload>[], authorDID: DID = AUTHOR_DID): BatchCommit =>
  signBatchCommit(
    createUnsignedBatchCommit({
      id: createChangeId(),
      authorDID,
      changeHashes: changes.map((change) => change.hash),
      lamport: 100,
      wallTime: 1_700_000_000_000
    }),
    AUTHOR.privateKey
  )

describe('batch commits (0357)', () => {
  describe('root', () => {
    it('is deterministic and order-sensitive', () => {
      const a = 'cid:blake3:aaa' as const
      const b = 'cid:blake3:bbb' as const

      expect(computeBatchRoot([a, b])).toBe(computeBatchRoot([a, b]))
      // Order is part of the commitment — reordering must change the root, or
      // a batch could be replayed with its changes permuted.
      expect(computeBatchRoot([a, b])).not.toBe(computeBatchRoot([b, a]))
    })

    it('distinguishes different groupings of the same hashes', () => {
      const a = 'cid:blake3:aa' as const
      const b = 'cid:blake3:bb' as const
      expect(computeBatchRoot([a, b])).not.toBe(computeBatchRoot([`${a}${b}` as typeof a]))
    })
  })

  describe('creation', () => {
    it('refuses an empty commit', () => {
      expect(() =>
        createUnsignedBatchCommit({
          id: 'c1',
          authorDID: AUTHOR_DID,
          changeHashes: [],
          lamport: 1,
          wallTime: 1
        })
      ).toThrow(/at least one change/)
    })

    it('refuses more than the cap', () => {
      const hashes = Array.from(
        { length: MAX_COMMIT_CHANGES + 1 },
        (_, index) => `cid:blake3:${index}` as const
      )
      expect(() =>
        createUnsignedBatchCommit({
          id: 'c1',
          authorDID: AUTHOR_DID,
          changeHashes: hashes,
          lamport: 1,
          wallTime: 1
        })
      ).toThrow(/at most/)
    })
  })

  describe('commit verification', () => {
    it('accepts a well-formed commit', () => {
      const commit = commitOver([makeChange(0), makeChange(1)])
      expect(verifyBatchCommit(commit, AUTHOR.publicKey)).toBe(true)
    })

    it('rejects a commit signed by someone else', () => {
      const commit = commitOver([makeChange(0)])
      expect(verifyBatchCommit(commit, OTHER.publicKey)).toBe(false)
    })

    it('rejects an edited change list', () => {
      const commit = commitOver([makeChange(0), makeChange(1)])
      const tampered: BatchCommit = {
        ...commit,
        changeHashes: [...commit.changeHashes, 'cid:blake3:smuggled' as const]
      }
      // Both the root and the commit hash now disagree with the list.
      expect(verifyBatchCommit(tampered, AUTHOR.publicKey)).toBe(false)
    })

    it('rejects a commit whose root was recomputed to match an edited list', () => {
      const commit = commitOver([makeChange(0)])
      const edited = [...commit.changeHashes, 'cid:blake3:smuggled' as const]
      const tampered: BatchCommit = {
        ...commit,
        changeHashes: edited,
        root: computeBatchRoot(edited)
      }
      // Root is now self-consistent, but the commit hash (and so the
      // signature) still covers the original list.
      expect(recomputeBatchCommitHash(tampered)).not.toBe(tampered.hash)
      expect(verifyBatchCommit(tampered, AUTHOR.publicKey)).toBe(false)
    })

    it('rejects a reordered change list', () => {
      const commit = commitOver([makeChange(0), makeChange(1), makeChange(2)])
      const reordered: BatchCommit = {
        ...commit,
        changeHashes: [commit.changeHashes[2], commit.changeHashes[1], commit.changeHashes[0]]
      }
      expect(verifyBatchCommit(reordered, AUTHOR.publicKey)).toBe(false)
    })
  })

  describe('batch membership', () => {
    it('accepts every change covered by the commit — one signature, N hashes', async () => {
      const changes = Array.from({ length: 50 }, (_, index) => makeChange(index))
      const commit = commitOver(changes)

      const result = await verifyBatch(commit, changes, AUTHOR.publicKey, recomputeChangeHash)

      expect(result.ok).toBe(true)
      expect(result.members.every(Boolean)).toBe(true)
    })

    it('rejects a change whose payload was tampered with', async () => {
      const changes = [makeChange(0), makeChange(1)]
      const commit = commitOver(changes)

      const tampered: Change<Payload>[] = [
        changes[0],
        { ...changes[1], payload: { nodeId: 'node-1', properties: { title: 'Forged' } } }
      ]

      const result = await verifyBatch(commit, tampered, AUTHOR.publicKey, recomputeChangeHash)

      expect(result.ok).toBe(false)
      expect(result.members).toEqual([true, false])
    })

    it('rejects a change smuggled in alongside a valid commit', async () => {
      const covered = [makeChange(0)]
      const commit = commitOver(covered)
      const smuggled = makeChange(99)

      const result = await verifyBatch(
        commit,
        [...covered, smuggled],
        AUTHOR.publicKey,
        recomputeChangeHash
      )

      expect(result.ok).toBe(false)
      expect(result.members).toEqual([true, false])
    })

    it('refuses to let a commit launder another author’s change', async () => {
      // A validly-signed change by OTHER, listed in a commit signed by AUTHOR.
      const foreign = makeChange(0, { author: OTHER.privateKey, authorDID: OTHER_DID })
      const commit = commitOver([foreign])

      const result = await verifyBatch(commit, [foreign], AUTHOR.publicKey, recomputeChangeHash)

      expect(result.ok).toBe(false)
      expect(result.members).toEqual([false])
    })

    it('rejects everything when the commit itself is invalid', async () => {
      const changes = [makeChange(0), makeChange(1)]
      const commit = commitOver(changes)

      const result = await verifyBatch(commit, changes, OTHER.publicKey, recomputeChangeHash)

      expect(result.ok).toBe(false)
      expect(result.members).toEqual([false, false])
      expect(result.reason).toMatch(/commit is invalid/)
    })
  })

  describe('chunking', () => {
    it('splits into commit-sized groups preserving order', () => {
      const items = Array.from({ length: 25 }, (_, index) => index)
      const chunks = chunkForCommits(items, 10)

      expect(chunks.map((chunk) => chunk.length)).toEqual([10, 10, 5])
      expect(chunks.flat()).toEqual(items)
    })

    it('never exceeds the commit cap even if asked to', () => {
      const items = Array.from({ length: MAX_COMMIT_CHANGES + 5 }, (_, index) => index)
      const chunks = chunkForCommits(items, MAX_COMMIT_CHANGES * 10)
      expect(Math.max(...chunks.map((chunk) => chunk.length))).toBeLessThanOrEqual(
        MAX_COMMIT_CHANGES
      )
    })
  })
})
