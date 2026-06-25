/**
 * Relationship-integrity tests over the pure draft graph (no store): the whole
 * point of a deeply-relational seed is that every link resolves. Catches
 * dangling references, unbalanced ledgers, and missing hierarchy depth.
 */

import type { SeedContext } from './types'
import { describe, it, expect } from 'vitest'
import { buildFixtures, ORG_SPACE_ID } from './fixtures'
import { DEMO_PEOPLE, makeRng, SEED_PREFIX } from './seed-ids'
import { SCALES, collectSeed } from './seed-runner'

const ctx: SeedContext = {
  space: ORG_SPACE_ID,
  authorDID: 'did:key:zTestAuthor',
  people: DEMO_PEOPLE,
  fixtures: buildFixtures(),
  scale: SCALES.medium,
  rng: makeRng(7)
}

const isSeedRef = (v: unknown): v is string =>
  typeof v === 'string' && (v === SEED_PREFIX || v.startsWith(`${SEED_PREFIX}/`))

async function graph() {
  const { drafts } = await collectSeed(ctx)
  const ids = new Set(drafts.map((d) => d.id))
  return { drafts, ids }
}

describe('seed relationship integrity', () => {
  it('has no dangling references (every seed-id value resolves to a node)', async () => {
    const { drafts, ids } = await graph()
    const dangling: string[] = []
    for (const draft of drafts) {
      for (const [key, value] of Object.entries(draft.properties)) {
        const refs = Array.isArray(value) ? value : [value]
        for (const ref of refs) {
          if (isSeedRef(ref) && !ids.has(ref)) {
            dangling.push(`${draft.id}.${key} → ${ref}`)
          }
        }
      }
    }
    expect(dangling, `dangling refs:\n${dangling.slice(0, 20).join('\n')}`).toEqual([])
  })

  it('every ledger transaction balances to zero per currency', async () => {
    const { drafts } = await graph()
    const postings = drafts.filter((d) => d.schemaId.includes('Posting'))
    expect(postings.length).toBeGreaterThan(0)
    const byTxn = new Map<string, Record<string, number>>()
    for (const p of postings) {
      const txn = p.properties.transaction as string
      const amount = p.properties.amount as { amount: number; currency: string }
      const sums = byTxn.get(txn) ?? {}
      sums[amount.currency] = (sums[amount.currency] ?? 0) + amount.amount
      byTxn.set(txn, sums)
    }
    expect(byTxn.size).toBeGreaterThan(0)
    for (const [txn, sums] of byTxn) {
      for (const [currency, total] of Object.entries(sums)) {
        expect(total, `${txn} unbalanced in ${currency}`).toBe(0)
      }
    }
  })

  it('builds a folder tree at least 3 deep', async () => {
    const { drafts } = await graph()
    const folders = drafts.filter((d) => d.schemaId.includes('Folder'))
    const parent = new Map<string, string | undefined>()
    for (const f of folders) parent.set(f.id, f.properties.parent as string | undefined)
    const depth = (id: string, guard = 0): number => {
      const p = parent.get(id)
      return !p || guard > 20 ? 1 : 1 + depth(p, guard + 1)
    }
    const maxDepth = Math.max(...folders.map((f) => depth(f.id)))
    expect(maxDepth).toBeGreaterThanOrEqual(3)
  })

  it('creates a multi-space workspace tree (≥3 spaces) and subtasks', async () => {
    const { drafts } = await graph()
    const spaces = drafts.filter((d) => d.schemaId.includes('Space@'))
    expect(spaces.length).toBeGreaterThanOrEqual(3)
    // At least one space nests under another.
    expect(spaces.some((s) => isSeedRef(s.properties.parent))).toBe(true)
    // At least one task is a subtask (has a parent task).
    const subtasks = drafts.filter(
      (d) => d.schemaId.includes('Task@') && isSeedRef(d.properties.parent)
    )
    expect(subtasks.length).toBeGreaterThan(0)
  })

  it('database rows reference real fields, options and cross-database rows', async () => {
    const { drafts, ids } = await graph()
    const rows = drafts.filter((d) => d.schemaId.includes('DatabaseRow'))
    expect(rows.length).toBeGreaterThan(0)
    let cellRefs = 0
    for (const row of rows) {
      for (const [key, value] of Object.entries(row.properties)) {
        if (!key.startsWith('cell_')) continue
        const refs = Array.isArray(value) ? value : [value]
        for (const ref of refs) {
          if (isSeedRef(ref)) {
            cellRefs++
            expect(ids.has(ref), `row cell ${row.id}.${key} → ${ref}`).toBe(true)
          }
        }
      }
    }
    // select/relation cells produced resolvable references.
    expect(cellRefs).toBeGreaterThan(0)
  })
})
