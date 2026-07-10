import { describe, expect, it } from 'vitest'
import { normalizeEditorDocumentJson } from './document-compat'

describe('normalizeEditorDocumentJson', () => {
  it('preserves current editor documents without migrations', () => {
    const currentDoc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Roadmap' }]
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Use ' },
            {
              type: 'databaseReference',
              attrs: { databaseId: 'db-roadmap', title: 'Roadmap', icon: 'DB' }
            }
          ]
        }
      ]
    }

    const result = normalizeEditorDocumentJson(currentDoc)

    expect(result.doc).toEqual(currentDoc)
    expect(result.migrations).toEqual([])
  })

  it('converts legacy database view blocks into database embeds', () => {
    const result = normalizeEditorDocumentJson({
      type: 'doc',
      content: [
        {
          type: 'databaseView',
          attrs: {
            id: 'db-roadmap',
            view: 'board',
            config: { groupBy: 'status' },
            maxHeight: 520
          }
        }
      ]
    })

    expect(result.doc.content?.[0]).toEqual({
      type: 'databaseEmbed',
      attrs: {
        databaseId: 'db-roadmap',
        viewType: 'board',
        viewConfig: { groupBy: 'status' },
        showTitle: true,
        maxHeight: 520
      }
    })
    expect(result.migrations).toMatchObject([
      {
        kind: 'node-renamed',
        from: 'databaseView',
        to: 'databaseEmbed',
        path: '$.content[0]'
      }
    ])
  })

  it('converts legacy page reference blocks into page embeds', () => {
    const result = normalizeEditorDocumentJson({
      type: 'doc',
      content: [
        {
          type: 'pageCard',
          attrs: {
            href: 'page/roadmap',
            name: 'Roadmap',
            description: 'Planning doc',
            excerpt: 'Next releases'
          }
        }
      ]
    })

    expect(result.doc.content?.[0]).toEqual({
      type: 'pageEmbed',
      attrs: {
        pageId: 'page/roadmap',
        title: 'Roadmap',
        subtitle: 'Planning doc',
        icon: 'PG',
        preview: 'Next releases'
      }
    })
  })

  it('converts legacy inline database links into database reference chips', () => {
    const result = normalizeEditorDocumentJson({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'See ' },
            {
              type: 'databaseLink',
              attrs: { id: 'db-customers', name: 'Customers', icon: 'CRM' }
            }
          ]
        }
      ]
    })

    expect(result.doc.content?.[0]?.content?.[1]).toEqual({
      type: 'databaseReference',
      attrs: {
        databaseId: 'db-customers',
        title: 'Customers',
        icon: 'CRM'
      }
    })
  })

  it('converts legacy media embed blocks into current embed blocks', () => {
    const result = normalizeEditorDocumentJson({
      type: 'doc',
      content: [
        {
          type: 'mediaEmbed',
          attrs: {
            href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            provider: 'youtube',
            title: 'Demo'
          }
        }
      ]
    })

    expect(result.doc.content?.[0]).toEqual({
      type: 'embed',
      attrs: {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        provider: 'youtube',
        embedId: null,
        embedUrl: null,
        title: 'Demo',
        width: 400,
        alignment: 'left'
      }
    })
  })

  it('falls back unsupported blocks to editable paragraphs', () => {
    const result = normalizeEditorDocumentJson({
      type: 'doc',
      content: [
        {
          type: 'legacyPoll',
          attrs: { title: 'Launch preference' }
        }
      ]
    })

    expect(result.doc.content?.[0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Launch preference' }]
    })
    expect(result.migrations).toMatchObject([
      {
        kind: 'node-fallback',
        from: 'legacyPoll',
        to: 'paragraph'
      }
    ])
  })

  it('drops unsupported marks while preserving text', () => {
    const result = normalizeEditorDocumentJson({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Marked',
              marks: [{ type: 'legacyHighlight' }, { type: 'bold' }]
            }
          ]
        }
      ]
    })

    expect(result.doc.content?.[0]?.content?.[0]).toEqual({
      type: 'text',
      text: 'Marked',
      marks: [{ type: 'bold' }]
    })
    expect(result.migrations).toMatchObject([
      {
        kind: 'mark-dropped',
        from: 'legacyHighlight',
        to: 'none'
      }
    ])
  })

  it('keeps emoji and math nodes without migrations (schema v3, 0297)', () => {
    const result = normalizeEditorDocumentJson({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hi ' },
            { type: 'emoji', attrs: { name: 'smile' } },
            { type: 'inlineMath', attrs: { latex: 'a^2' } }
          ]
        },
        { type: 'blockMath', attrs: { latex: '\\int_0^1 x\\,dx' } }
      ]
    })

    expect(result.migrations).toEqual([])
    expect(result.doc.content?.[0]?.content?.[1]).toMatchObject({
      type: 'emoji',
      attrs: { name: 'smile' }
    })
    expect(result.doc.content?.[1]).toMatchObject({ type: 'blockMath' })
  })

  it('creates an empty current document for malformed roots', () => {
    const result = normalizeEditorDocumentJson(null)

    expect(result.doc).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph' }]
    })
    expect(result.migrations).toMatchObject([
      {
        kind: 'root-normalized',
        from: 'object',
        to: 'doc',
        path: '$'
      }
    ])
  })
})
