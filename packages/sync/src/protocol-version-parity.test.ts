import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { CURRENT_PROTOCOL_VERSION } from './change'

/**
 * The change-record protocol version is written by hand in TypeScript, Rust and
 * Swift. They disagreed in production: TS shipped `4` while both Swift sources
 * still said `3` (exploration 0370). Swift is only `swift build`-ed in CI, never
 * conformance-tested, so nothing caught it.
 *
 * These tests exist so that divergence can only ever be a red build.
 *
 * NOTE: the hub WebSocket handshake carries a *different* number under the same
 * field name (`hubProtocolVersion = 1`). It is deliberately not checked here —
 * see the note in swift/XNetKit/Sources/XNetKit/HubConnection.swift.
 */

/** Walk up from this file to the repo root (the dir containing pnpm-workspace.yaml). */
const repoRoot = ((): string => {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    dir = resolve(dir, '..')
  }
  throw new Error('could not locate repo root from ' + import.meta.url)
})()

interface Source {
  lang: string
  path: string
  re: RegExp
}

/** Sources that must equal the *current change format* version. */
const CHANGE_VERSION_SOURCES: Source[] = [
  {
    lang: 'swift (XNetKit Change)',
    path: 'swift/XNetKit/Sources/XNetKit/Change.swift',
    re: /public var protocolVersion:\s*Int64\s*=\s*(\d+)/,
  },
]

/**
 * Sources that must equal `LWW_TIEBREAK_KEY_VERSION` — a *different* constant
 * that happens to share the value 4 today. It records the protocol version at
 * which the grinding-resistant tiebreak activated, so it stays pinned when
 * `CURRENT_PROTOCOL_VERSION` moves to 5. Do not collapse the two.
 */
const LWW_VERSION_SOURCES: Source[] = [
  {
    lang: 'rust (xnet-core)',
    path: 'rust/xnet-core/src/lib.rs',
    re: /const\s+LWW_TIEBREAK_KEY_VERSION:\s*i64\s*=\s*(\d+)/,
  },
]

function literalFrom({ path, re }: Source): number {
  const full = join(repoRoot, path)
  expect(existsSync(full), `missing source file: ${path}`).toBe(true)
  const found = readFileSync(full, 'utf8').match(re)
  expect(found, `no version literal matched ${re} in ${path}`).toBeTruthy()
  return Number(found![1])
}

describe('protocol version parity across languages', () => {
  it.each(CHANGE_VERSION_SOURCES)('$lang agrees with CURRENT_PROTOCOL_VERSION', (source) => {
    expect(literalFrom(source)).toBe(CURRENT_PROTOCOL_VERSION)
  })

  it.each(LWW_VERSION_SOURCES)('$lang agrees with LWW_TIEBREAK_KEY_VERSION', async (source) => {
    const { LWW_TIEBREAK_KEY_VERSION } = await import('@xnetjs/core')
    expect(literalFrom(source)).toBe(LWW_TIEBREAK_KEY_VERSION)
  })

  it('LWW_TIEBREAK_KEY_VERSION is a past-or-current protocol version', async () => {
    // NOT an equality: the tiebreak activated *at* v4 and stays pinned there
    // when the change format moves on. Asserting equality would go spuriously
    // red on the next protocol bump and pressure someone into a wrong fix.
    const { LWW_TIEBREAK_KEY_VERSION } = await import('@xnetjs/core')
    expect(LWW_TIEBREAK_KEY_VERSION).toBeLessThanOrEqual(CURRENT_PROTOCOL_VERSION)
  })

  it('the frozen conformance vectors agree', () => {
    const vector = join(
      repoRoot,
      'conformance/vectors/replication/0004-protocol-version-bundle.json'
    )
    expect(existsSync(vector), 'missing protocol-version conformance vector').toBe(true)

    const bundle = JSON.parse(readFileSync(vector, 'utf8')) as Record<string, unknown>
    // The vector nests the bundle under an expectation key; find the `change`
    // field wherever it lives rather than hard-coding the vector's shape.
    const changeVersion = findChangeVersion(bundle)
    expect(changeVersion, 'no `change` protocol version found in vector').toBeTypeOf('number')
    expect(changeVersion).toBe(CURRENT_PROTOCOL_VERSION)
  })
})

function findChangeVersion(value: unknown): number | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const obj = value as Record<string, unknown>
  if (typeof obj.change === 'number') return obj.change
  for (const nested of Object.values(obj)) {
    const found = findChangeVersion(nested)
    if (found !== undefined) return found
  }
  return undefined
}
