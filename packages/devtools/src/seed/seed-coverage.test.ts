/**
 * Coverage guard — the "like testing, make sure new content has seed data" rule.
 *
 * Runs the full seed against an in-memory store, then asserts every registered,
 * non-excluded schema produced at least one node (via a Tier-1 seeder or the
 * Tier-2 auto-generator). A new schema that can't be seeded fails CI; a new
 * system/meta schema must be added to SEED_EXCLUDED_SCHEMA_IDS.
 */

import { generateSigningKeyPair } from '@xnetjs/crypto'
import { MemoryNodeStorageAdapter, NodeStore } from '@xnetjs/data'
import { createDID } from '@xnetjs/identity'
import { describe, it, expect } from 'vitest'
import { resolveAllSchemas, SEED_EXCLUDED_SCHEMA_IDS } from './seed-manifest'
import { runSeed } from './seed-runner'

function makeStore(): NodeStore {
  const kp = generateSigningKeyPair()
  const did = createDID(kp.publicKey)
  return new NodeStore({
    storage: new MemoryNodeStorageAdapter(),
    authorDID: did,
    signingKey: kp.privateKey
  })
}

describe('seed coverage', () => {
  it('every consumer-facing schema gets at least one seeded node', async () => {
    const store = makeStore()
    await runSeed({ store, scale: 'small' })

    const schemas = await resolveAllSchemas()
    const missing: string[] = []
    for (const schema of schemas) {
      if (SEED_EXCLUDED_SCHEMA_IDS.has(schema._schemaId)) continue
      const res = await store.query({
        schemaId: schema._schemaId,
        includeDeleted: false,
        count: 'exact'
      })
      const total = res.totalCount ?? res.nodes.length
      if (total < 1) missing.push(schema._schemaId)
    }

    expect(
      missing,
      `No seed data for: ${missing.join(', ')}. Add a Tier-1 seeder, rely on the ` +
        `auto-generator, or add it to SEED_EXCLUDED_SCHEMA_IDS.`
    ).toEqual([])
  })

  it('excluded system schemas are real registered schemas', async () => {
    const schemas = await resolveAllSchemas()
    const known = new Set(schemas.map((s) => s._schemaId))
    for (const excluded of SEED_EXCLUDED_SCHEMA_IDS) {
      expect(known.has(excluded), `stale exclusion: ${excluded}`).toBe(true)
    }
  })
})
