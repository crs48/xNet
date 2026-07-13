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

/** Builds a v4 (BlockNote, 0312) document: blockGroup > blockContainer > blockContent. */
function createBlockNotePageDoc(): YDoc {
  const doc = new YDoc({ guid: 'page-v4', gc: false })
  const content = doc.getXmlFragment('content-v4')

  const blockGroup = new Y.XmlElement('blockGroup')

  const headingContainer = new Y.XmlElement('blockContainer')
  headingContainer.setAttribute('id', 'block-1')
  const heading = new Y.XmlElement('heading')
  heading.setAttribute('level', '1')
  heading.insert(0, [new Y.XmlText('Weekly Plan')])
  headingContainer.insert(0, [heading])

  const paragraphContainer = new Y.XmlElement('blockContainer')
  paragraphContainer.setAttribute('id', 'block-2')
  const paragraph = new Y.XmlElement('paragraph')

  const intro = new Y.XmlText()
  intro.insert(0, 'Coordinate harvest logistics with ')
  paragraph.insert(0, [intro])

  // BlockNote inline atoms: no child text, readable text lives in attrs.
  const mention = new Y.XmlElement('mention')
  mention.setAttribute('id', 'did:key:alice')
  mention.setAttribute('label', 'Alice')
  paragraph.insert(1, [mention])

  const mid = new Y.XmlText()
  mid.insert(0, ' about ')
  paragraph.insert(2, [mid])

  const hashtag = new Y.XmlElement('hashtag')
  hashtag.setAttribute('id', 'tag-1')
  hashtag.setAttribute('name', 'harvest')
  paragraph.insert(3, [hashtag])

  const beforeLink = new Y.XmlText()
  beforeLink.insert(0, ' — see ')
  paragraph.insert(4, [beforeLink])

  const wikilink = new Y.XmlElement('wikilink')
  wikilink.setAttribute('href', 'default/logistics')
  wikilink.setAttribute('title', 'Logistics')
  paragraph.insert(5, [wikilink])

  const beforeMath = new Y.XmlText()
  beforeMath.insert(0, ' where ')
  paragraph.insert(6, [beforeMath])

  const math = new Y.XmlElement('inlineMath')
  math.setAttribute('latex', 'E=mc^2')
  paragraph.insert(7, [math])

  paragraphContainer.insert(0, [paragraph])
  blockGroup.insert(0, [headingContainer, paragraphContainer])
  content.insert(0, [blockGroup])
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

  it('extracts text from a v4 BlockNote fragment, including inline atoms', () => {
    const doc = createBlockNotePageDoc()

    const text = extractDocumentText(doc)
    expect(text).toContain('Weekly Plan')
    expect(text).toContain('Coordinate harvest logistics with')
    expect(text).toContain('@Alice')
    expect(text).toContain('#harvest')
    expect(text).toContain('Logistics')
    expect(text).toContain('E=mc^2')
  })

  it('prefers the v4 fragment over legacy content when both exist', () => {
    const doc = createBlockNotePageDoc()
    // Simulate a stale legacy fragment left behind after import.
    const legacy = doc.getXmlFragment('content')
    const paragraph = new Y.XmlElement('paragraph')
    paragraph.insert(0, [new Y.XmlText('Old TipTap body')])
    legacy.insert(0, [paragraph])

    const text = extractDocumentText(doc)
    expect(text).toContain('Weekly Plan')
    expect(text).not.toContain('Old TipTap body')
  })

  it('extracts wikilinks from childless v4 wikilink atoms', () => {
    const doc = createBlockNotePageDoc()

    expect(extractDocumentLinks(doc)).toEqual([
      expect.objectContaining({
        href: 'default/logistics',
        title: 'Logistics',
        text: 'Logistics'
      })
    ])
    expect(extractBacklinks(doc, 'default/logistics')).toHaveLength(1)
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
