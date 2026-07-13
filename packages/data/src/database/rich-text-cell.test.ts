import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  deleteRichTextCell,
  getRichTextCell,
  getRichTextPlainText,
  hasRichTextContent
} from './rich-text-cell'

describe('rich text cells', () => {
  it('reports content presence and supports deletion', () => {
    const doc = new Y.Doc()
    const fragment = getRichTextCell(doc, 'notes')
    expect(hasRichTextContent(doc, 'notes')).toBe(false)

    const paragraph = new Y.XmlElement('paragraph')
    paragraph.insert(0, [new Y.XmlText('hello')])
    fragment.insert(0, [paragraph])
    expect(hasRichTextContent(doc, 'notes')).toBe(true)

    deleteRichTextCell(doc, 'notes')
    expect(hasRichTextContent(doc, 'notes')).toBe(false)
  })

  it('extracts plain text from legacy TipTap-shaped cells', () => {
    const doc = new Y.Doc()
    const fragment = getRichTextCell(doc, 'notes')

    const heading = new Y.XmlElement('heading')
    heading.insert(0, [new Y.XmlText('Title')])
    const paragraph = new Y.XmlElement('paragraph')
    paragraph.insert(0, [new Y.XmlText('Body text')])
    fragment.insert(0, [heading, paragraph])

    const text = getRichTextPlainText(doc, 'notes')
    expect(text).toContain('Title')
    expect(text).toContain('Body text')
  })

  it('extracts plain text from BlockNote-shaped cells (0312)', () => {
    const doc = new Y.Doc()
    const fragment = getRichTextCell(doc, 'notes')

    // v4 shape: blockGroup > blockContainer > paragraph with inline atoms.
    const blockGroup = new Y.XmlElement('blockGroup')
    const container = new Y.XmlElement('blockContainer')
    container.setAttribute('id', 'block-1')
    const paragraph = new Y.XmlElement('paragraph')

    const lead = new Y.XmlText()
    lead.insert(0, 'Ping ')
    paragraph.insert(0, [lead])

    const mention = new Y.XmlElement('mention')
    mention.setAttribute('id', 'did:key:alice')
    mention.setAttribute('label', 'Alice')
    paragraph.insert(1, [mention])

    const mid = new Y.XmlText()
    mid.insert(0, ' re ')
    paragraph.insert(2, [mid])

    const hashtag = new Y.XmlElement('hashtag')
    hashtag.setAttribute('id', 'tag-1')
    hashtag.setAttribute('name', 'harvest')
    paragraph.insert(3, [hashtag])

    const wikilink = new Y.XmlElement('wikilink')
    wikilink.setAttribute('href', 'default/plan')
    wikilink.setAttribute('title', 'Plan')
    paragraph.insert(4, [wikilink])

    const math = new Y.XmlElement('inlineMath')
    math.setAttribute('latex', 'E=mc^2')
    paragraph.insert(5, [math])

    container.insert(0, [paragraph])
    blockGroup.insert(0, [container])
    fragment.insert(0, [blockGroup])

    const text = getRichTextPlainText(doc, 'notes')
    expect(text).toContain('Ping')
    expect(text).toContain('@Alice')
    expect(text).toContain('#harvest')
    expect(text).toContain('Plan')
    expect(text).toContain('E=mc^2')
  })

  it('separates BlockNote blocks with newlines', () => {
    const doc = new Y.Doc()
    const fragment = getRichTextCell(doc, 'notes')

    const blockGroup = new Y.XmlElement('blockGroup')
    const blocks = [
      ['heading', 'First'],
      ['bulletListItem', 'Second'],
      ['checkListItem', 'Third']
    ].map(([nodeName, textContent], index) => {
      const container = new Y.XmlElement('blockContainer')
      container.setAttribute('id', `block-${index}`)
      const content = new Y.XmlElement(nodeName!)
      content.insert(0, [new Y.XmlText(textContent!)])
      container.insert(0, [content])
      return container
    })
    blockGroup.insert(0, blocks)
    fragment.insert(0, [blockGroup])

    expect(getRichTextPlainText(doc, 'notes')).toBe('First\nSecond\nThird\n')
  })
})
