import { describe, it, expect } from 'vitest'
import {
  RecordLensRegistry,
  projectRecord,
  ingestRecord,
  assertRoundTrip
} from '../record-lens'
import { pageToDocumentLens, SITE_STANDARD_DOCUMENT, XNET_BODY_BLOCK } from './page-document'
import { registerBuiltinRecordLenses } from './index'

const PAGE_NODE = {
  title: 'Hello Atmosphere',
  excerpt: 'A post published as a card.',
  publishedAt: '2026-07-21T00:00:00.000Z',
  canonicalUrl: 'https://hub.example/p/hello',
  // xNet-only fields the card must never carry but must never drop:
  space: 'space-1',
  folder: 'folder-9',
  sortKey: 'a0'
}

describe('Page → site.standard.document projection', () => {
  it('builds a card with the reader-facing fields', () => {
    const card = projectRecord(pageToDocumentLens, PAGE_NODE)
    expect(card.$type).toBe(SITE_STANDARD_DOCUMENT)
    expect(card.title).toBe('Hello Atmosphere')
    expect(card.description).toBe('A post published as a card.')
    expect(card.canonicalUrl).toBe('https://hub.example/p/hello')
    expect(Array.isArray(card.content)).toBe(true)
  })

  it('never leaks xNet-only fields into the card', () => {
    const card = projectRecord(pageToDocumentLens, PAGE_NODE)
    expect(card.space).toBeUndefined()
    expect(card.folder).toBeUndefined()
    expect(card.sortKey).toBeUndefined()
  })

  it('preserves xNet-only fields when ingesting a card back', () => {
    const card = projectRecord(pageToDocumentLens, PAGE_NODE)
    const back = ingestRecord(pageToDocumentLens, card, PAGE_NODE)
    // The body/home fields survive because backward is given the prior node.
    expect(back.space).toBe('space-1')
    expect(back.folder).toBe('folder-9')
    expect(back.title).toBe('Hello Atmosphere')
    expect(back.excerpt).toBe('A post published as a card.')
  })

  it('preserves an unmodelled field another app wrote (the putRecord hazard)', () => {
    const foreign = {
      $type: SITE_STANDARD_DOCUMENT,
      title: 'Hello Atmosphere',
      theme: 'dark',
      customFacets: [{ index: [0, 4] }]
    }
    const report = assertRoundTrip(pageToDocumentLens, foreign)
    expect(report).toEqual({ ok: true, lost: [] })
  })

  it('extends the open content union with exactly one fyi.xnet.* block', () => {
    const card = projectRecord(pageToDocumentLens, PAGE_NODE)
    const content = card.content as Array<{ $type: string; hubUrl?: string }>
    // The plain fallback block every reader understands…
    expect(content.some((b) => b.$type === `${SITE_STANDARD_DOCUMENT}.textContent`)).toBe(true)
    // …plus the one minted xNet block pointing at the hub body.
    const xnetBlocks = content.filter((b) => b.$type.startsWith('fyi.xnet.'))
    expect(xnetBlocks).toHaveLength(1)
    expect(xnetBlocks[0].$type).toBe(XNET_BODY_BLOCK)
    expect(xnetBlocks[0].hubUrl).toBe('https://hub.example/p/hello')
  })

  it('carries the published content hash on the body block when present', () => {
    const card = projectRecord(pageToDocumentLens, {
      ...PAGE_NODE,
      publishedContentHash: 'cid:blake3:abc'
    })
    const block = (card.content as Array<Record<string, unknown>>).find(
      (b) => b.$type === XNET_BODY_BLOCK
    )
    expect(block?.contentHash).toBe('cid:blake3:abc')
  })

  it('registers as the sole lens for Page', () => {
    const registry = new RecordLensRegistry()
    registerBuiltinRecordLenses(registry)
    expect(registry.get(pageToDocumentLens.source)?.lexicon).toBe(SITE_STANDARD_DOCUMENT)
    expect(registry.lexicons()).toContain(SITE_STANDARD_DOCUMENT)
  })
})
