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
import { getSigningPublicKeyFromPrivate, verify, hashHex, hash, sign } from '@xnetjs/crypto'
import { LWW_TIEBREAK_KEY_VERSION, computeLwwTiebreakKey } from '@xnetjs/core'
import { createDID } from '@xnetjs/identity'
import {
  createUnsignedChange,
  computeChangeHash,
  signChange,
  serializeYjsEnvelope,
  verifyYjsEnvelopeV2,
  type SignedYjsEnvelopeV2
} from '@xnetjs/sync'
import { describe, it, expect } from 'vitest'
import {
  negotiateProtocolVersion,
  XNET_PROTOCOL_VERSION,
  XNET_SUPPORTED_PROTOCOL_VERSIONS
} from './protocol'

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
// The final tiebreak is the raw author DID for legacy changes, or (protocol
// v4+, exploration 0305) a grinding-resistant per-conflict key. cmpTs mirrors
// `@xnetjs/core`'s compareLwwStamps exactly.
type LwwTs = { lamport: number; wallTime: number; author: string; tiebreakKey?: string }
const cmpTs = (a: LwwTs, b: LwwTs): number => {
  if (a.lamport !== b.lamport) return a.lamport - b.lamport
  if (a.wallTime !== b.wallTime) return a.wallTime - b.wallTime
  if (
    a.tiebreakKey !== undefined &&
    b.tiebreakKey !== undefined &&
    a.tiebreakKey !== b.tiebreakKey
  ) {
    return a.tiebreakKey < b.tiebreakKey ? -1 : 1
  }
  return a.author < b.author ? -1 : a.author > b.author ? 1 : 0
}

type LwwChange = {
  authorDID: string
  lamport: number
  wallTime: number
  properties: Record<string, unknown>
  /** Present ⇒ this change is at that protocol version (gates the v4 key). */
  protocolVersion?: number
}

/** The spec's per-property Last-Write-Wins fold (docs/specs/protocol §L1.7/§7.1). */
function foldLww(changes: LwwChange[]): {
  properties: Record<string, unknown>
  timestamps: Record<string, LwwTs>
} {
  const properties: Record<string, unknown> = {}
  const timestamps: Record<string, LwwTs> = {}
  for (const c of changes) {
    const hasKey = (c.protocolVersion ?? 0) >= LWW_TIEBREAK_KEY_VERSION
    for (const [key, val] of Object.entries(c.properties)) {
      const ts: LwwTs = {
        lamport: c.lamport,
        wallTime: c.wallTime,
        author: c.authorDID,
        ...(hasKey ? { tiebreakKey: computeLwwTiebreakKey(c.authorDID, key, val) } : {})
      }
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
  },
  {
    // Pins the tiebreak to UTF-16 code-unit order (`<`/`>`), NOT locale collation:
    // 'A' (U+0041) < 'a' (U+0061), so the lowercase DID wins. `localeCompare`
    // would order these the other way in many locales — and is non-deterministic
    // across ICU versions — so it must not be used for CRDT convergence.
    name: '0004-tie-author-case-codeunit',
    description: 'author tiebreak is by UTF-16 code unit (uppercase < lowercase), not locale',
    changes: [
      { authorDID: 'did:key:zAAA', lamport: 1, wallTime: 1, properties: { title: 'from-upper' } },
      { authorDID: 'did:key:zaaa', lamport: 1, wallTime: 1, properties: { title: 'from-lower' } }
    ] as LwwChange[]
  },
  {
    // Grinding-resistant final tiebreak (exploration 0305, spec §7.1): at
    // protocolVersion 4 a lamport+wallTime tie is decided by
    // blake3(author ‖ property ‖ value), NOT the author DID — so the
    // lexically-maximal DID does NOT automatically win. Here 'did:key:zzzz'
    // (max DID) loses the `title` tie because its key sorts below zAAA's for
    // this (property, value) pair; a different property re-randomises the win.
    name: '0005-tie-grinding-resistant-key',
    description: 'protocol v4 tie resolved by blake3(author‖property‖value), not the author DID',
    changes: [
      {
        authorDID: 'did:key:zzzz',
        lamport: 7,
        wallTime: 700,
        properties: { title: 'from-zzzz' },
        protocolVersion: 4
      },
      {
        authorDID: 'did:key:zAAA',
        lamport: 7,
        wallTime: 700,
        properties: { title: 'from-zAAA' },
        protocolVersion: 4
      }
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

// ── L2 · replication vectors (handshake / catch-up / signed Yjs envelope) ─────
// Version handshake: two peers are compatible iff their advertised umbrella sets
// intersect; negotiation returns the newest shared id (docs/specs/protocol §L2.7).
const negotiationScenarios = [
  {
    name: '0001-handshake-compatible',
    description: 'identical single-version peers negotiate that version',
    ours: ['xnet/1.0'],
    theirs: ['xnet/1.0']
  },
  {
    name: '0002-handshake-newest-shared',
    description: 'the newest umbrella version shared by both peers is chosen',
    ours: ['xnet/2.0', 'xnet/1.0'],
    theirs: ['xnet/1.0', 'xnet/2.0']
  },
  {
    name: '0003-handshake-incompatible',
    description: 'no shared umbrella version → null (the caller must refuse)',
    ours: ['xnet/1.0'],
    theirs: ['xnet/0.9']
  }
]
for (const { name, description, ours, theirs } of negotiationScenarios) {
  const negotiated = negotiateProtocolVersion(ours, theirs)
  corpus.push({
    suite: 'replication',
    name,
    data: {
      description,
      input: { ours, theirs },
      expected: { negotiated, compatible: negotiated !== null }
    }
  })
}

// The umbrella version bundle every xnet/1.0 implementation advertises.
corpus.push({
  suite: 'replication',
  name: '0004-protocol-version-bundle',
  data: {
    description: 'the xnet/1.0 umbrella version bundle and supported-version set',
    input: {},
    expected: {
      bundle: XNET_PROTOCOL_VERSION,
      supported: [...XNET_SUPPORTED_PROTOCOL_VERSIONS]
    }
  }
})

// Catch-up (node-sync-response): given a room's changes and a client's last-seen
// Lamport, return the changes strictly after it (ascending by lamport) plus the
// relay's high-water mark = max Lamport over all changes in the room (§L2.3).
const foldCatchUp = (
  changes: { id: string; lamport: number }[],
  sinceLamport: number
): { changeIds: string[]; highWaterMark: number } => ({
  changeIds: changes
    .filter((c) => c.lamport > sinceLamport)
    .sort((a, b) => a.lamport - b.lamport)
    .map((c) => c.id),
  highWaterMark: changes.reduce((max, c) => Math.max(max, c.lamport), 0)
})
const catchupScenarios = [
  {
    name: '0005-catchup-since-mid',
    description: 'catch-up returns only changes after sinceLamport, lamport-ordered',
    changes: [
      { id: 'chg-a', lamport: 1 },
      { id: 'chg-c', lamport: 3 },
      { id: 'chg-b', lamport: 2 },
      { id: 'chg-d', lamport: 4 }
    ],
    sinceLamport: 2
  },
  {
    name: '0006-catchup-from-zero',
    description: 'sinceLamport 0 returns the whole room ordered by lamport',
    changes: [
      { id: 'chg-b', lamport: 2 },
      { id: 'chg-a', lamport: 1 }
    ],
    sinceLamport: 0
  }
]
for (const { name, description, changes, sinceLamport } of catchupScenarios) {
  corpus.push({
    suite: 'replication',
    name,
    data: {
      description,
      input: { changes, sinceLamport },
      expected: foldCatchUp(changes, sinceLamport)
    }
  })
}

// Signed Yjs envelope (§L2.4): L2's one crypto contract. The signature is Ed25519
// over BLAKE3(update ++ utf8(JSON(meta))), where `meta` is serialized in INSERTION
// order { authorDID, clientId, timestamp, docId } — NOT sorted (the cross-language
// landmine). The Yjs `update` bytes are an opaque codec payload (any bytes here).
{
  const update = new Uint8Array([0x01, 0x02, 0x03, 0x04])
  const clientId = 42
  const timestamp = 1718641200000
  const docId = 'doc-0001'
  const meta = { authorDID, clientId, timestamp, docId }
  const metaBytes = new TextEncoder().encode(JSON.stringify(meta))
  const combined = new Uint8Array(update.length + metaBytes.length)
  combined.set(update, 0)
  combined.set(metaBytes, update.length)
  const signingHash = hash(combined, 'blake3')
  const ed25519 = sign(signingHash, authorSeed)
  const envelope: SignedYjsEnvelopeV2 = {
    v: 2,
    update,
    meta,
    signature: { level: 0, ed25519 }
  }
  // Anchor to the real verifier: a correctly constructed envelope MUST verify.
  expect((await verifyYjsEnvelopeV2(envelope)).valid).toBe(true)
  corpus.push({
    suite: 'replication',
    name: '0007-yjs-envelope-sign',
    data: {
      description: 'signed Yjs envelope: Ed25519 over BLAKE3(update ++ utf8(JSON(meta)))',
      input: {
        authorSeedHex: toHex(authorSeed),
        updateHex: toHex(update),
        clientId,
        timestamp,
        docId
      },
      expected: {
        signingHashHex: toHex(signingHash),
        wire: serializeYjsEnvelope(envelope)
      }
    }
  })
}

// ── L3 · authorization decision vectors (expression AST evaluation) ───────────
// The normative deny-wins / AST core (docs/specs/protocol §L3.4). This mirrors
// `evaluateExpression` in packages/data/src/auth/evaluator.ts exactly: `deny(r)`
// is a role-membership PREDICATE (true when the subject holds r), so literal
// deny-wins is composed as `and(allow(...), not(deny(...)))` (and in field rules).
type AuthExpr =
  | { _tag: 'allow'; roles: string[] }
  | { _tag: 'deny'; roles: string[] }
  | { _tag: 'and'; exprs: AuthExpr[] }
  | { _tag: 'or'; exprs: AuthExpr[] }
  | { _tag: 'not'; expr: AuthExpr }
  | { _tag: 'roleRef'; role: string }
  | { _tag: 'public' }
  | { _tag: 'authenticated' }
const evalExpr = (expr: AuthExpr, roles: Set<string>, isAuthenticated: boolean): boolean => {
  switch (expr._tag) {
    case 'allow':
    case 'deny':
      return expr.roles.some((r) => roles.has(r))
    case 'and':
      return expr.exprs.every((e) => evalExpr(e, roles, isAuthenticated))
    case 'or':
      return expr.exprs.some((e) => evalExpr(e, roles, isAuthenticated))
    case 'not':
      return !evalExpr(expr.expr, roles, isAuthenticated)
    case 'roleRef':
      return roles.has(expr.role)
    case 'public':
      return true
    case 'authenticated':
      return isAuthenticated
  }
}
const allow = (...roles: string[]): AuthExpr => ({ _tag: 'allow', roles })
const deny = (...roles: string[]): AuthExpr => ({ _tag: 'deny', roles })
const and = (...exprs: AuthExpr[]): AuthExpr => ({ _tag: 'and', exprs })
const or = (...exprs: AuthExpr[]): AuthExpr => ({ _tag: 'or', exprs })
const not = (expr: AuthExpr): AuthExpr => ({ _tag: 'not', expr })
const PUBLIC: AuthExpr = { _tag: 'public' }
const AUTHENTICATED: AuthExpr = { _tag: 'authenticated' }

const authzScenarios: {
  name: string
  description: string
  expression: AuthExpr
  roles: string[]
  isAuthenticated: boolean
}[] = [
  {
    name: '0001-allow-hit',
    description: 'allow matches a held role',
    expression: allow('editor', 'owner'),
    roles: ['owner'],
    isAuthenticated: true
  },
  {
    name: '0002-allow-miss',
    description: 'allow with no held role denies',
    expression: allow('editor', 'owner'),
    roles: ['viewer'],
    isAuthenticated: true
  },
  {
    name: '0003-public',
    description: 'PUBLIC is always true, even for an anonymous subject',
    expression: PUBLIC,
    roles: [],
    isAuthenticated: false
  },
  {
    name: '0004-authenticated',
    description: 'AUTHENTICATED is true for any valid DID subject',
    expression: AUTHENTICATED,
    roles: [],
    isAuthenticated: true
  },
  {
    name: '0005-authenticated-anonymous',
    description: 'AUTHENTICATED is false without a subject',
    expression: AUTHENTICATED,
    roles: [],
    isAuthenticated: false
  },
  {
    name: '0006-deny-wins-allowed',
    description: 'a member who is not banned is allowed',
    expression: and(allow('member'), not(deny('banned'))),
    roles: ['member'],
    isAuthenticated: true
  },
  {
    name: '0007-deny-wins-denied',
    description: 'deny wins: a banned member is denied',
    expression: and(allow('member'), not(deny('banned'))),
    roles: ['member', 'banned'],
    isAuthenticated: true
  },
  {
    name: '0008-or-fallback',
    description: 'or allows when any branch is true',
    expression: or(allow('owner'), AUTHENTICATED),
    roles: [],
    isAuthenticated: true
  },
  {
    name: '0009-roleref',
    description: 'roleRef is true when the subject holds the named role',
    expression: { _tag: 'roleRef', role: 'admin' },
    roles: ['admin'],
    isAuthenticated: true
  }
]
for (const { name, description, expression, roles, isAuthenticated } of authzScenarios) {
  const allowed = evalExpr(expression, new Set(roles), isAuthenticated)
  corpus.push({
    suite: 'authz',
    name,
    data: {
      description,
      input: { expression, roles, isAuthenticated },
      expected: { allowed }
    }
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
