import type { SchemaIRI } from './node'
import { describe, it, expect } from 'vitest'
import {
  type RecordLens,
  type LexiconRecord,
  RecordLensRegistry,
  assertRoundTrip,
  ingestRecord,
  partitionRecord,
  projectRecord,
  recoverExtras,
  stashExtras
} from './record-lens'

const PAGE: SchemaIRI = 'xnet://xnet.fyi/Page@1.0.0'

/** A deliberately partial lens: it models three fields of a richer lexicon. */
const documentLens: RecordLens = {
  lexicon: 'site.standard.document',
  source: PAGE,
  mode: 'projection',
  lossless: false,
  modelled: ['title', 'description', 'publishedAt'],
  forward: (node) => ({
    title: node.title,
    description: node.excerpt,
    publishedAt: node.publishedAt
  }),
  backward: (record) => ({
    title: record.title,
    excerpt: record.description,
    publishedAt: record.publishedAt
  })
}

describe('partitionRecord', () => {
  it('splits modelled from unmodelled and never treats $type as an extra', () => {
    const { modelled, unmodelled } = partitionRecord(
      { $type: 'site.standard.document', title: 'Hi', theme: 'dark' },
      ['title']
    )
    expect(modelled).toEqual({ title: 'Hi' })
    expect(unmodelled).toEqual({ theme: 'dark' })
  })
})

describe('the extras bag', () => {
  it('namespaces stashed fields by lexicon so two lexicons never collide', () => {
    const a = stashExtras('site.standard.document', { title: 'A' })
    const b = stashExtras('app.bsky.feed.post', { title: 'B' })
    expect(Object.keys(a)[0]).toBe('ext:site.standard.document/title')
    expect(Object.keys(b)[0]).toBe('ext:app.bsky.feed.post/title')
    // Merged onto one node, both survive — this is the per-key LWW property.
    expect(Object.keys({ ...a, ...b })).toHaveLength(2)
  })

  it('recovers only its own lexicon, never another authority overlay', () => {
    const node = {
      ...stashExtras('site.standard.document', { theme: 'dark' }),
      'ext:acme.com/leadScore': 91,
      title: 'Post'
    }
    // An org's private overlay must never leak into a published record.
    expect(recoverExtras('site.standard.document', node)).toEqual({ theme: 'dark' })
  })
})

describe('projectRecord', () => {
  it('stamps $type from the lens', () => {
    expect(projectRecord(documentLens, { title: 'Hi' }).$type).toBe('site.standard.document')
  })

  it('carries unmodelled fields of the prior record through a republish', () => {
    // The exact putRecord hazard: another app wrote `theme`; we must not eat it.
    const prior: LexiconRecord = { $type: 'site.standard.document', title: 'Old', theme: 'dark' }
    const projected = projectRecord(documentLens, { title: 'New' }, prior)
    expect(projected.title).toBe('New')
    expect(projected.theme).toBe('dark')
  })

  it('lets the lens win over a stale stashed extra', () => {
    // `title` is modelled, so a stash of it must never shadow the live value.
    const node = { title: 'Live', 'ext:site.standard.document/title': 'Stale' }
    expect(projectRecord(documentLens, node).title).toBe('Live')
  })

  it('prefers the node stash over the live record for unmodelled fields', () => {
    const prior: LexiconRecord = { $type: 'site.standard.document', theme: 'light' }
    const node = { title: 'T', 'ext:site.standard.document/theme': 'dark' }
    expect(projectRecord(documentLens, node, prior).theme).toBe('dark')
  })
})

describe('ingestRecord', () => {
  it('maps modelled fields and stashes the rest', () => {
    const node = ingestRecord(documentLens, {
      $type: 'site.standard.document',
      title: 'Hi',
      description: 'Sub',
      theme: 'dark'
    })
    expect(node.title).toBe('Hi')
    expect(node.excerpt).toBe('Sub')
    expect(node['ext:site.standard.document/theme']).toBe('dark')
  })
})

describe('the round-trip law', () => {
  it('holds for a record full of fields the lens has never heard of', () => {
    const report = assertRoundTrip(documentLens, {
      $type: 'site.standard.document',
      title: 'Hi',
      description: 'Sub',
      publishedAt: '2026-07-21T00:00:00.000Z',
      theme: 'dark',
      coverImage: { ref: 'blob', mimeType: 'image/png' },
      tags: ['a', 'b']
    })
    expect(report).toEqual({ ok: true, lost: [] })
  })

  it('catches a lens that eats unknown fields', () => {
    // The bug this file exists to prevent: a lens that claims to model
    // everything, so nothing is stashed, and putRecord deletes the rest.
    const greedy: RecordLens = {
      ...documentLens,
      modelled: ['title', 'description', 'publishedAt', 'theme'],
      forward: (node) => ({ title: node.title })
    }
    const report = assertRoundTrip(greedy, {
      $type: 'site.standard.document',
      title: 'Hi',
      theme: 'dark'
    })
    expect(report.ok).toBe(false)
    expect(report.lost).toContain('theme')
  })
})

describe('RecordLensRegistry', () => {
  it('refuses a second lexicon for one schema', () => {
    const registry = new RecordLensRegistry()
    registry.register(documentLens)
    expect(() => registry.register({ ...documentLens, lexicon: 'com.whtwnd.blog.entry' })).toThrow(
      /already projects to/
    )
  })

  it('re-registering the same lexicon replaces rather than throws', () => {
    const registry = new RecordLensRegistry()
    registry.register(documentLens)
    registry.register({ ...documentLens, lossless: true })
    expect(registry.get(PAGE)?.lossless).toBe(true)
  })

  it('lists lexicons for the index subscription', () => {
    const registry = new RecordLensRegistry()
    registry.register(documentLens)
    expect(registry.lexicons()).toEqual(['site.standard.document'])
  })
})
