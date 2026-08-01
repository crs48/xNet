/**
 * What reaches the full-text index.
 *
 * The regression this guards (exploration 0419): imported social content puts
 * its full text in `searchText`, and the extractor did not read that property.
 * Every imported post, comment and video transcript was therefore absent from
 * search while the pipeline reported them as indexed — the quiet kind of
 * failure, where the query returns a clean empty result.
 */

import { describe, expect, it } from 'vitest'
import { extractSearchableContent } from './fts'

describe('extractSearchableContent', () => {
  it('indexes the denormalized search text of imported social content', () => {
    const content = extractSearchableContent({
      platform: 'youtube',
      contentKind: 'transcript',
      title: 'Transcript — Sourdough basics',
      searchText: 'first you mix the flour and the water',
      textPreview: 'first you mix the flour'
    })

    expect(content).toContain('first you mix the flour and the water')
  })

  it('prefers the full text over the truncated preview', () => {
    const content = extractSearchableContent({
      searchText: 'the complete transcript body',
      textPreview: 'the complete'
    })

    expect(content).toBe('the complete transcript body')
  })

  it('falls back to the preview when there is no full text', () => {
    expect(extractSearchableContent({ textPreview: 'only a preview' })).toBe('only a preview')
    expect(extractSearchableContent({ searchText: '', textPreview: 'only a preview' })).toBe(
      'only a preview'
    )
  })

  it('still indexes the properties it always did', () => {
    expect(extractSearchableContent({ description: 'a description' })).toBe('a description')
    expect(extractSearchableContent({ body: 'a body' })).toBe('a body')
    expect(extractSearchableContent({ name: 'a name' })).toBe('a name')
    expect(extractSearchableContent({ note: 'a note' })).toBe('a note')
    expect(extractSearchableContent({ content: 'plain string content' })).toBe(
      'plain string content'
    )
  })

  it('extracts text from TipTap document content', () => {
    const content = extractSearchableContent({
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] }]
      }
    })

    expect(content).toContain('hello world')
  })

  it('returns null when a node carries no searchable text', () => {
    expect(extractSearchableContent({})).toBeNull()
    expect(extractSearchableContent({ platform: 'youtube', viewCount: 12 })).toBeNull()
  })
})
