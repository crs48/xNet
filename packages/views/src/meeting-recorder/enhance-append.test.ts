/**
 * AI-notes append tests (exploration 0279): the Markdown parser's block
 * shapes, and that appended Y.Doc blocks mirror the BlockNote editor's node
 * shape (0312: blockGroup > blockContainer > blockContent in `content-v4`)
 * with every AI run carrying the `aiGenerated` style (0234 provenance).
 */

import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  appendAiNotesToDoc,
  appendMarkdownToDoc,
  extractDocText,
  parseEnhancedMarkdown
} from './enhance-append'

/** The blockContainer children of the doc's single blockGroup. */
function containersOf(doc: Y.Doc): Y.XmlElement[] {
  const fragment = doc.getXmlFragment('content-v4')
  expect(fragment.length).toBe(1)
  const group = fragment.get(0) as Y.XmlElement
  expect(group.nodeName).toBe('blockGroup')
  return group.toArray() as Y.XmlElement[]
}

/** The blockContent element inside a blockContainer. */
function contentOf(container: Y.XmlElement): Y.XmlElement {
  expect(container.nodeName).toBe('blockContainer')
  return container.get(0) as Y.XmlElement
}

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
  it('appends BlockNote-shaped blocks to the content-v4 fragment', () => {
    const doc = new Y.Doc()
    const count = appendMarkdownToDoc(doc, '## Notes\n\nHello\n\n- a\n- b')
    expect(count).toBe(3)

    const containers = containersOf(doc)
    // Bullets are flat in BlockNote: one bulletListItem block per item.
    expect(containers.map((c) => contentOf(c).nodeName)).toEqual([
      'heading',
      'paragraph',
      'bulletListItem',
      'bulletListItem'
    ])
    expect(contentOf(containers[0]!).getAttribute('level')).toBe(2 as unknown as string)
    // Every block carries an id (BlockNote's UniqueID contract).
    for (const container of containers) {
      expect(container.getAttribute('id')).toBeTruthy()
    }
  })

  it('appends after existing blocks instead of clobbering them', () => {
    const doc = new Y.Doc()
    appendMarkdownToDoc(doc, 'user notes')
    appendMarkdownToDoc(doc, 'appended')

    const containers = containersOf(doc)
    expect(containers.length).toBe(2)
    expect(contentOf(containers[0]!).toString()).toContain('user notes')
    expect(contentOf(containers[1]!).toString()).toContain('appended')
  })

  it('leaves user text unmarked but AI text aiGenerated-marked', () => {
    const doc = new Y.Doc()
    appendMarkdownToDoc(doc, 'typed by the user')
    appendAiNotesToDoc(doc, 'authored by the model')

    const [userBlock, aiBlock] = containersOf(doc)
    const userText = contentOf(userBlock!).get(0) as Y.XmlText
    const aiText = contentOf(aiBlock!).get(0) as Y.XmlText

    const userDelta = userText.toDelta() as Array<{ attributes?: Record<string, unknown> }>
    const aiDelta = aiText.toDelta() as Array<{ attributes?: Record<string, unknown> }>
    expect(userDelta[0]!.attributes?.aiGenerated).toBeUndefined()
    // Boolean style spec: the mark exists with no attrs.
    expect(aiDelta[0]!.attributes?.aiGenerated).toEqual({})
  })

  it('marks bullet items inside AI lists too', () => {
    const doc = new Y.Doc()
    appendAiNotesToDoc(doc, '- action item')
    const [container] = containersOf(doc)
    const item = contentOf(container!)
    expect(item.nodeName).toBe('bulletListItem')
    const delta = (item.get(0) as Y.XmlText).toDelta() as Array<{
      attributes?: Record<string, unknown>
    }>
    expect(delta[0]!.attributes?.aiGenerated).toBeDefined()
  })

  it('no-ops on empty markdown', () => {
    const doc = new Y.Doc()
    expect(appendAiNotesToDoc(doc, '   ')).toBe(0)
    expect(doc.getXmlFragment('content-v4').length).toBe(0)
  })
})

describe('extractDocText', () => {
  it('flattens blocks to plain lines, dropping marks and nesting', () => {
    const doc = new Y.Doc()
    appendMarkdownToDoc(doc, '## Agenda\n\nShip the recorder\n\n- alpha\n- beta')
    appendAiNotesToDoc(doc, 'AI addendum')
    expect(extractDocText(doc)).toBe('Agenda\nShip the recorder\nalpha\nbeta\nAI addendum')
  })

  it('falls back to the legacy content fragment for pre-0312 docs', () => {
    const doc = new Y.Doc()
    const legacy = doc.getXmlFragment('content')
    const paragraph = new Y.XmlElement('paragraph')
    paragraph.insert(0, [new Y.XmlText('old tiptap notes')])
    legacy.insert(0, [paragraph])
    expect(extractDocText(doc)).toBe('old tiptap notes')
  })

  it('returns an empty string for an empty doc', () => {
    expect(extractDocText(new Y.Doc())).toBe('')
  })
})
