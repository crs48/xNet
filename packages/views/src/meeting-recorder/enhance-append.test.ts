/**
 * AI-notes append tests (exploration 0279): the Markdown parser's block
 * shapes, and that appended Y.Doc blocks mirror the editor's node names with
 * every AI run carrying the `aiGenerated` mark (0234 provenance).
 */

import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  appendAiNotesToDoc,
  appendMarkdownToDoc,
  extractDocText,
  parseEnhancedMarkdown
} from './enhance-append'

describe('parseEnhancedMarkdown', () => {
  it('parses headings, bullets, and paragraphs', () => {
    const blocks = parseEnhancedMarkdown(
      ['## Summary', '', 'A short recap.', '', '- first point', '* second point', ''].join('\n')
    )
    expect(blocks).toEqual([
      { kind: 'heading', level: 2, text: 'Summary' },
      { kind: 'paragraph', text: 'A short recap.' },
      { kind: 'bullets', items: ['first point', 'second point'] }
    ])
  })

  it('joins wrapped lines into one paragraph and strips inline markup', () => {
    const blocks = parseEnhancedMarkdown('This is **bold** and\n*italic* and `code`.')
    expect(blocks).toEqual([{ kind: 'paragraph', text: 'This is bold and italic and code.' }])
  })

  it('returns nothing for empty/whitespace input', () => {
    expect(parseEnhancedMarkdown('')).toEqual([])
    expect(parseEnhancedMarkdown('\n  \n')).toEqual([])
  })
})

describe('appendMarkdownToDoc', () => {
  it('appends editor-shaped blocks to the content fragment', () => {
    const doc = new Y.Doc()
    const count = appendMarkdownToDoc(doc, '## Notes\n\nHello\n\n- a\n- b')
    expect(count).toBe(3)

    const fragment = doc.getXmlFragment('content')
    const nodes = fragment.toArray() as Y.XmlElement[]
    expect(nodes.map((node) => node.nodeName)).toEqual(['heading', 'paragraph', 'bulletList'])
    expect(nodes[0]!.getAttribute('level')).toBe('2')
    const listItems = nodes[2]!.toArray() as Y.XmlElement[]
    expect(listItems.map((li) => li.nodeName)).toEqual(['listItem', 'listItem'])
  })

  it('appends after existing content instead of clobbering it', () => {
    const doc = new Y.Doc()
    const fragment = doc.getXmlFragment('content')
    const existing = new Y.XmlElement('paragraph')
    existing.insert(0, [new Y.XmlText('user notes')])
    fragment.insert(0, [existing])

    appendMarkdownToDoc(doc, 'appended')
    expect(fragment.length).toBe(2)
    expect((fragment.get(0) as Y.XmlElement).toString()).toContain('user notes')
  })

  it('leaves user text unmarked but AI text aiGenerated-marked', () => {
    const doc = new Y.Doc()
    appendMarkdownToDoc(doc, 'typed by the user')
    appendAiNotesToDoc(doc, 'authored by the model')

    const fragment = doc.getXmlFragment('content')
    const [userBlock, aiBlock] = fragment.toArray() as Y.XmlElement[]
    const userText = userBlock!.get(0) as Y.XmlText
    const aiText = aiBlock!.get(0) as Y.XmlText

    const userDelta = userText.toDelta() as Array<{ attributes?: Record<string, unknown> }>
    const aiDelta = aiText.toDelta() as Array<{ attributes?: Record<string, unknown> }>
    expect(userDelta[0]!.attributes?.aiGenerated).toBeUndefined()
    expect(aiDelta[0]!.attributes?.aiGenerated).toEqual({
      assistMode: 'draft',
      citations: null
    })
  })

  it('marks bullet items inside AI lists too', () => {
    const doc = new Y.Doc()
    appendAiNotesToDoc(doc, '- action item')
    const list = doc.getXmlFragment('content').get(0) as Y.XmlElement
    const paragraph = (list.get(0) as Y.XmlElement).get(0) as Y.XmlElement
    const delta = (paragraph.get(0) as Y.XmlText).toDelta() as Array<{
      attributes?: Record<string, unknown>
    }>
    expect(delta[0]!.attributes?.aiGenerated).toBeDefined()
  })

  it('no-ops on empty markdown', () => {
    const doc = new Y.Doc()
    expect(appendAiNotesToDoc(doc, '   ')).toBe(0)
    expect(doc.getXmlFragment('content').length).toBe(0)
  })
})

describe('extractDocText', () => {
  it('flattens blocks to plain lines, dropping marks and nesting', () => {
    const doc = new Y.Doc()
    appendMarkdownToDoc(doc, '## Agenda\n\nShip the recorder\n\n- alpha\n- beta')
    appendAiNotesToDoc(doc, 'AI addendum')
    expect(extractDocText(doc)).toBe('Agenda\nShip the recorder\nalpha\nbeta\nAI addendum')
  })

  it('returns an empty string for an empty doc', () => {
    expect(extractDocText(new Y.Doc())).toBe('')
  })
})
