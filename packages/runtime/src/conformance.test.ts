/**
 * XNet Protocol conformance corpus — generator + drift guard.
 *
 * This test derives the golden-vector corpus at `conformance/vectors/` from the
 * reference implementation and asserts it matches the committed JSON. It makes
 * the central claim of the spec (these exact bytes) executable: a change to
 * canonicalization, hashing, or DID derivation that is not reflected in the
 * corpus fails CI. See docs/specs/protocol/90-conformance.md.
 *
 * To regenerate after an intentional protocol change:
 *   WRITE_VECTORS=1 pnpm exec vitest run --project runtime \
 *     packages/runtime/src/conformance.test.ts
 *
 * The same vectors are verified by a second-language kernel in
 * conformance/reference/ — the proof that the boundary is real.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getSigningPublicKeyFromPrivate, verify, hashHex } from '@xnetjs/crypto'
import { createDID } from '@xnetjs/identity'
import { createUnsignedChange, computeChangeHash, signChange } from '@xnetjs/sync'
import { describe, it, expect } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const vectorsDir = path.resolve(here, '../../..', 'conformance', 'vectors')
const WRITE = process.env.WRITE_VECTORS === '1'

const toHex = (b: Uint8Array): string => Buffer.from(b).toString('hex')
const toB64 = (b: Uint8Array): string => Buffer.from(b).toString('base64')

/** Deterministic 32-byte Ed25519 seed from a single fill byte. */
const seedFrom = (fill: number): Uint8Array => new Uint8Array(32).fill(fill)

/**
 * Canonical JSON exactly as the reference `computeChangeHash` does it:
 * object keys sorted lexicographically and recursively, no insignificant
 * whitespace, arrays in order, `undefined` omitted (via JSON.stringify).
 */
function sortKeysRecursively(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(sortKeysRecursively)
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = sortKeysRecursively((value as Record<string, unknown>)[key])
  }
  return out
}
const canonicalJson = (v: unknown): string => JSON.stringify(sortKeysRecursively(v))

type Vector = { suite: string; name: string; data: unknown }
const corpus: Vector[] = []

// ── L0 · identity vectors ────────────────────────────────────────────────────
const identitySeeds = [
  { name: '0001-seed-aa', fill: 0xaa },
  { name: '0002-seed-01', fill: 0x01 }
]
for (const { name, fill } of identitySeeds) {
  const seed = seedFrom(fill)
  const publicKey = getSigningPublicKeyFromPrivate(seed)
  corpus.push({
    suite: 'identity',
    name,
    data: {
      description: `did:key derivation from a 32-byte seed (0x${fill.toString(16)} repeated)`,
      input: { seedHex: toHex(seed) },
      expected: { publicKeyHex: toHex(publicKey), did: createDID(publicKey) }
    }
  })
}

// ── L1 · change vectors (canonicalize → BLAKE3 → Ed25519) ────────────────────
const authorSeed = seedFrom(0xaa)
const authorPub = getSigningPublicKeyFromPrivate(authorSeed)
const authorDID = createDID(authorPub)

const changeInputs = [
  {
    name: '0001-create-page',
    description: 'first change for a Page node (carries schemaId)',
    options: {
      id: 'chg-0001',
      type: 'node-change',
      payload: {
        nodeId: 'node-0001',
        schemaId: 'xnet://xnet.fyi/Page@1.0.0',
        properties: { title: 'Welcome' }
      },
      parentHash: null,
      authorDID,
      lamport: 1,
      wallTime: 1718641200000
    }
  },
  {
    name: '0002-update-title',
    description: 'sparse update to one property, chained to the first change',
    options: {
      id: 'chg-0002',
      type: 'node-change',
      payload: { nodeId: 'node-0001', properties: { title: 'Welcome, world' } },
      parentHash: 'cid:blake3:0000000000000000000000000000000000000000000000000000000000000000',
      authorDID,
      lamport: 2,
      wallTime: 1718641260000
    }
  },
  {
    name: '0003-soft-delete',
    description: 'soft delete (tombstone) of the node',
    options: {
      id: 'chg-0003',
      type: 'node-change',
      payload: { nodeId: 'node-0001', properties: {}, deleted: true },
      parentHash: 'cid:blake3:1111111111111111111111111111111111111111111111111111111111111111',
      authorDID,
      lamport: 3,
      wallTime: 1718641320000
    }
  }
]

for (const { name, description, options } of changeInputs) {
  const unsigned = createUnsignedChange(options)
  const signed = signChange(unsigned, authorSeed)
  // Cross-check our spec'd canonicalization against the real hash, and that the
  // signature covers the UTF-8 bytes of the hash string.
  const canonical = canonicalJson(unsigned)
  const recomputed = `cid:blake3:${hashHex(new TextEncoder().encode(canonical))}`
  expect(recomputed).toBe(signed.hash)
  expect(signed.hash).toBe(computeChangeHash(unsigned))
  expect(verify(new TextEncoder().encode(signed.hash), signed.signature, authorPub)).toBe(true)

  corpus.push({
    suite: 'change',
    name,
    data: {
      description,
      input: { authorSeedHex: toHex(authorSeed), unsignedChange: unsigned },
      expected: {
        authorDID,
        canonicalJson: canonical,
        hash: signed.hash,
        signatureBase64: toB64(signed.signature)
      }
    }
  })
}

// ── L1 · LWW convergence vectors ─────────────────────────────────────────────
type LwwTs = { lamport: number; wallTime: number; author: string }
const cmpTs = (a: LwwTs, b: LwwTs): number =>
  a.lamport !== b.lamport
    ? a.lamport - b.lamport
    : a.wallTime !== b.wallTime
      ? a.wallTime - b.wallTime
      : a.author < b.author
        ? -1
        : a.author > b.author
          ? 1
          : 0

type LwwChange = {
  authorDID: string
  lamport: number
  wallTime: number
  properties: Record<string, unknown>
}

/** The spec's per-property Last-Write-Wins fold (docs/specs/protocol §L1.7). */
function foldLww(changes: LwwChange[]): {
  properties: Record<string, unknown>
  timestamps: Record<string, LwwTs>
} {
  const properties: Record<string, unknown> = {}
  const timestamps: Record<string, LwwTs> = {}
  for (const c of changes) {
    const ts: LwwTs = { lamport: c.lamport, wallTime: c.wallTime, author: c.authorDID }
    for (const [key, val] of Object.entries(c.properties)) {
      const current = timestamps[key]
      if (!current || cmpTs(ts, current) > 0) {
        properties[key] = val
        timestamps[key] = ts
      }
    }
  }
  return { properties, timestamps }
}

const permute = <T>(items: T[]): T[][] => {
  if (items.length <= 1) return [items]
  const result: T[][] = []
  items.forEach((item, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)]
    for (const sub of permute(rest)) result.push([item, ...sub])
  })
  return result
}

const didB = createDID(getSigningPublicKeyFromPrivate(seedFrom(0x01)))
const lwwScenarios = [
  {
    name: '0001-concurrent-different-props',
    description: 'concurrent edits to different properties both survive',
    changes: [
      { authorDID, lamport: 1, wallTime: 100, properties: { title: 'A' } },
      { authorDID: didB, lamport: 1, wallTime: 100, properties: { status: 'open' } }
    ] as LwwChange[]
  },
  {
    name: '0002-same-prop-lamport-wins',
    description: 'same property: higher lamport wins regardless of order',
    changes: [
      { authorDID, lamport: 1, wallTime: 999, properties: { title: 'old' } },
      { authorDID: didB, lamport: 2, wallTime: 100, properties: { title: 'new' } }
    ] as LwwChange[]
  },
  {
    name: '0003-tie-author-breaks',
    description: 'lamport+wallTime tie resolved by higher author DID',
    changes: [
      { authorDID, lamport: 5, wallTime: 500, properties: { title: 'from-A' } },
      { authorDID: didB, lamport: 5, wallTime: 500, properties: { title: 'from-B' } }
    ] as LwwChange[]
  }
]

for (const { name, description, changes } of lwwScenarios) {
  const expected = foldLww(changes)
  // Order-independence: every permutation folds to the same property values.
  for (const order of permute(changes)) {
    expect(foldLww(order).properties).toEqual(expected.properties)
  }
  corpus.push({
    suite: 'lww',
    name,
    data: { description, input: { changes }, expected }
  })
}

// ── generate-or-verify ────────────────────────────────────────────────────────
describe('XNet Protocol conformance corpus', () => {
  for (const vector of corpus) {
    it(`${vector.suite}/${vector.name} matches the committed golden vector`, () => {
      const file = path.join(vectorsDir, vector.suite, `${vector.name}.json`)
      const serialized = `${JSON.stringify(vector.data, null, 2)}\n`
      if (WRITE) {
        mkdirSync(path.dirname(file), { recursive: true })
        writeFileSync(file, serialized)
        return
      }
      expect(existsSync(file), `missing vector ${file} — run with WRITE_VECTORS=1`).toBe(true)
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(vector.data)
    })
  }
})
