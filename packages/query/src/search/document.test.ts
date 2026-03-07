import { YDoc } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  createSearchSnippet,
  extractBacklinks,
  extractDocumentLinks,
  extractDocumentText
} from './document'

function createPageDoc(): YDoc {
  const doc = new YDoc({ guid: 'page-1', gc: false })
  const content = doc.getXmlFragment('content')

  const heading = new Y.XmlElement('heading')
  heading.setAttribute('level', '1')
  heading.insert(0, [new Y.XmlText('Weekly Plan')])

  const paragraph = new Y.XmlElement('paragraph')
  const intro = new Y.XmlText()
  intro.insert(0, 'Coordinate harvest logistics with ')
  paragraph.insert(0, [intro])

  const link = new Y.XmlElement('wikilink')
  link.setAttribute('href', 'default/alice')
  link.setAttribute('title', 'Alice')
  link.insert(0, [new Y.XmlText('Alice')])
  paragraph.insert(1, [link])

  const outro = new Y.XmlText()
  outro.insert(0, ' before Friday.')
  paragraph.insert(2, [outro])

  content.insert(0, [heading, paragraph])
  return doc
}

describe('page document search helpers', () => {
  it('extracts plain text across blocks', () => {
    const doc = createPageDoc()

    expect(extractDocumentText(doc)).toBe(
      'Weekly Plan Coordinate harvest logistics with Alice before Friday.'
    )
  })

  it('extracts wikilinks with context', () => {
    const doc = createPageDoc()

    expect(extractDocumentLinks(doc)).toEqual([
      expect.objectContaining({
        href: 'default/alice',
        title: 'Alice',
        text: 'Alice',
        context: 'Weekly Plan Coordinate harvest logistics with Alice before Friday.'
      })
    ])
  })

  it('filters backlinks for the requested target', () => {
    const doc = createPageDoc()

    expect(extractBacklinks(doc, 'default/alice')).toHaveLength(1)
    expect(extractBacklinks(doc, 'default/missing')).toHaveLength(0)
  })

  it('creates centered snippets around a search match', () => {
    const snippet = createSearchSnippet(
      'Coordinate harvest logistics with Alice before Friday and publish the checklist.',
      'Alice',
      32
    )

    expect(snippet).toContain('Alice')
    expect(snippet.startsWith('…')).toBe(true)
    expect(snippet.endsWith('…')).toBe(true)
  })
})
