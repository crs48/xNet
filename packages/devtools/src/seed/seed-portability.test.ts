/**
 * Seed round-trip demo (exploration 0344): export the seeded demo workspace
 * as an .xnetpack bundle and import it into a fresh instance — the imported
 * store carries the same nodes (including Yjs doc content), and seed
 * coverage still holds on the receiving side.
 */

import { generateSigningKeyPair, sign } from '@xnetjs/crypto'
import {
  MemoryNodeStorageAdapter,
  MemoryBundleSink,
  NodeStore,
  applyBundle,
  createStoreYjsPort,
  verifyBundle,
  writeBundle
} from '@xnetjs/data'
import { createDID } from '@xnetjs/identity'
import { describe, it, expect } from 'vitest'
import { resolveAllSchemas, SEED_EXCLUDED_SCHEMA_IDS } from './seed-manifest'
import { runSeed } from './seed-runner'

function makeIdentity() {
  const kp = generateSigningKeyPair()
  return { did: createDID(kp.publicKey), privateKey: kp.privateKey }
}

function makeStore(identity: { did: string; privateKey: Uint8Array }): NodeStore {
  return new NodeStore({
    storage: new MemoryNodeStorageAdapter(),
    authorDID: identity.did as never,
    signingKey: identity.privateKey
  })
}

describe('seed workspace .xnetpack round-trip (0344)', () => {
  it('export → fresh import preserves every seeded schema (coverage green on B)', async () => {
    const identity = makeIdentity()
    const a = makeStore(identity)
    await runSeed({ store: a, scale: 'small' })

    const sink = new MemoryBundleSink()
    const manifest = await writeBundle(a, { kind: 'full' }, sink, {
      ownerDid: identity.did,
      manifestSigner: (bytes) => sign(bytes, identity.privateKey),
      yjsPort: createStoreYjsPort(a)
    })
    expect(manifest.counts.changes).toBeGreaterThan(0)

    const report = await verifyBundle(sink.toSource())
    expect(report.issues.filter((i) => i.severity === 'error')).toEqual([])

    const b = makeStore(identity)
    const result = await applyBundle(b, sink.toSource(), {
      importerDid: identity.did,
      yjsPort: createStoreYjsPort(b)
    })
    expect(result.quarantined).toEqual([])
    expect(result.applied).toBe(manifest.counts.changes)

    // Seed coverage holds on the imported side: every non-excluded schema
    // that had nodes on A has nodes on B.
    const schemas = await resolveAllSchemas()
    const missing: string[] = []
    for (const schema of schemas) {
      if (SEED_EXCLUDED_SCHEMA_IDS.has(schema._schemaId)) continue
      const [onA, onB] = await Promise.all([
        b.query({ schemaId: schema._schemaId, includeDeleted: false, count: 'exact' }),
        a.query({ schemaId: schema._schemaId, includeDeleted: false, count: 'exact' })
      ])
      const countA = onA.totalCount ?? onA.nodes.length
      const countB = onB.totalCount ?? onB.nodes.length
      if (countA !== countB) missing.push(`${schema._schemaId}: A=${countA} B=${countB}`)
    }
    expect(missing).toEqual([])

    // Re-running the seed on the imported store creates no duplicate nodes —
    // deterministic IDs + LWW upsert converge (the seed idempotency
    // contract is node-level: same logical entity → same node ID → upsert).
    const beforeNodes = (await b.list({ includeDeleted: true })).length
    await runSeed({ store: b, scale: 'small' })
    const afterNodes = (await b.list({ includeDeleted: true })).length
    expect(afterNodes).toBe(beforeNodes)
  })
})
