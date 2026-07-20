/**
 * Pure seeder unit tests — no store, no crypto. Assert deterministic IDs and
 * draft shapes so the curated graph stays well-formed as schemas evolve.
 */

import type { SeedContext } from './types'
import { describe, it, expect } from 'vitest'
import { autoValue } from './auto-generator'
import { buildFixtures, ORG_SPACE_ID } from './fixtures'
import { isSeedId, makeRng, seedId, DEMO_PEOPLE } from './seed-ids'
import { LANDING_SEED_PROFILE, SEEDERS } from './seed-manifest'
import { SCALES } from './seed-runner'

const ctx: SeedContext = {
  space: ORG_SPACE_ID,
  authorDID: 'did:key:zTestAuthor',
  people: DEMO_PEOPLE,
  fixtures: buildFixtures(),
  scale: SCALES.small,
  rng: makeRng(1)
}

describe('seed-ids', () => {
  it('builds stable, slugified ids under the seed prefix', () => {
    expect(seedId('task', 'Website Redesign', 3)).toBe('seed/task/website-redesign/3')
    expect(isSeedId(seedId('project', 'X'))).toBe(true)
    expect(isSeedId('node-123')).toBe(false)
  })

  it('makeRng is deterministic for a given seed', () => {
    const a = makeRng(42)
    const b = makeRng(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
})

describe('Tier-1 seeders', () => {
  it('every draft id is seed-managed and carries a schemaId', () => {
    for (const seeder of SEEDERS) {
      const { drafts } = seeder.seed(ctx)
      expect(drafts.length).toBeGreaterThan(0)
      for (const d of drafts) {
        expect(isSeedId(d.id), `${seeder.domain}: ${d.id}`).toBe(true)
        expect(typeof d.schemaId).toBe('string')
        expect(d.properties).toBeTypeOf('object')
      }
    }
  })

  it('produces identical drafts across runs (deterministic)', () => {
    const run = () =>
      SEEDERS.flatMap((s) => s.seed({ ...ctx, rng: makeRng(1) }).drafts.map((d) => d.id))
    expect(run()).toEqual(run())
  })

  it('landing seed profile only names registered seeder domains, spaces first', () => {
    const domains = new Set(SEEDERS.map((s) => s.domain))
    for (const d of LANDING_SEED_PROFILE.domains) {
      expect(domains.has(d), `unknown seeder domain in LANDING_SEED_PROFILE: ${d}`).toBe(true)
    }
    // The Space must exist before the rest cross-link into it.
    expect(LANDING_SEED_PROFILE.domains[0]).toBe('spaces')
    expect(LANDING_SEED_PROFILE.includeAuto).toBe(false)
  })

  it('work tasks reference their project + milestone', () => {
    const work = SEEDERS.find((s) => s.domain === 'work')!
    const { drafts } = work.seed(ctx)
    const project = drafts.find((d) => d.schemaId.includes('Project'))!
    const task = drafts.find((d) => d.schemaId.includes('Task'))!
    expect(task.properties.project).toBe(project.id)
    expect(task.properties.milestone).toMatch(/^seed\/milestone\//)
  })

  it('docs seeder emits a Yjs doc for the flagship page with anchored comments', () => {
    const docs = SEEDERS.find((s) => s.domain === 'docs')!
    const result = docs.seed(ctx)
    expect(result.docs?.length).toBeGreaterThan(0)
    const comments = result.drafts.filter((d) => d.schemaId.includes('Comment'))
    expect(comments.length).toBeGreaterThan(0)
    for (const c of comments) {
      expect(typeof c.properties.anchorData).toBe('string')
    }
  })
})

describe('auto-generator value synthesis', () => {
  const auto = { space: 'seed/space/demo', authorDID: 'did:key:zA' }
  it('synthesizes per field type and skips computed fields', () => {
    expect(autoValue({ '@id': '#a', name: 'title', type: 'text', required: true }, auto)).toBe(
      'Sample title'
    )
    expect(autoValue({ '@id': '#a', name: 'n', type: 'number', required: false }, auto)).toBe(42)
    expect(autoValue({ '@id': '#a', name: 'd', type: 'date', required: false }, auto)).toBeTypeOf(
      'number'
    )
    expect(
      autoValue({ '@id': '#a', name: 'createdAt', type: 'created', required: false }, auto)
    ).toBeUndefined()
    expect(autoValue({ '@id': '#a', name: 'space', type: 'relation', required: false }, auto)).toBe(
      'seed/space/demo'
    )
    expect(
      autoValue(
        { '@id': '#a', name: 'amt', type: 'json', required: false, config: { format: 'money' } },
        auto
      )
    ).toEqual({ amount: 1000, currency: 'USD' })
  })
})
