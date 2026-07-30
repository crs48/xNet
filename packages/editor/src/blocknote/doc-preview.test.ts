import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { extractDocPreviewLines } from './doc-preview'

function block(name: string, text?: string, attrs?: Record<string, string>): Y.XmlElement {
  const container = new Y.XmlElement('blockContainer')
  const content = new Y.XmlElement(name)
  if (attrs) for (const [k, v] of Object.entries(attrs)) content.setAttribute(k, v)
  if (text !== undefined) content.insert(0, [new Y.XmlText(text)])
  container.insert(0, [content])
  return container
}

function docWith(...containers: Y.XmlElement[]): Y.Doc {
  const ydoc = new Y.Doc()
  const fragment = ydoc.getXmlFragment('content-v4')
  const group = new Y.XmlElement('blockGroup')
  group.insert(0, containers)
  fragment.insert(0, [group])
  return ydoc
}

describe('extractDocPreviewLines', () => {
  it('extracts text lines from paragraphs and headings in order', () => {
    const ydoc = docWith(
      block('heading', 'Trip plan'),
      block('paragraph', 'Day one: arrive.'),
      block('paragraph', ''),
      block('paragraph', 'Day two: hike.')
    )
    expect(extractDocPreviewLines(ydoc, 10)).toEqual([
      { text: 'Trip plan', kind: 'heading' },
      { text: 'Day one: arrive.', kind: 'paragraph' },
      { text: 'Day two: hike.', kind: 'paragraph' }
    ])
  })

  it('caps at maxLines', () => {
    const ydoc = docWith(
      block('paragraph', 'one'),
      block('paragraph', 'two'),
      block('paragraph', 'three')
    )
    expect(extractDocPreviewLines(ydoc, 2)).toHaveLength(2)
  })

  it('degrades nested embeds to marker lines instead of recursing', () => {
    const ydoc = docWith(
      block('paragraph', 'before'),
      block('databaseEmbed', undefined, { databaseId: 'db1' }),
      block('pageEmbed', undefined, { nodeId: 'p1' })
    )
    const lines = extractDocPreviewLines(ydoc, 10)
    expect(lines.map((l) => l.kind)).toEqual(['paragraph', 'databaseEmbed', 'pageEmbed'])
    expect(lines[1].text).toContain('database')
  })

  it('renders inline atoms as readable text', () => {
    const container = new Y.XmlElement('blockContainer')
    const paragraph = new Y.XmlElement('paragraph')
    const mention = new Y.XmlElement('mention')
    mention.setAttribute('label', 'ada')
    paragraph.insert(0, [new Y.XmlText('ping ')])
    paragraph.insert(1, [mention])
    container.insert(0, [paragraph])
    const ydoc = docWith(container)
    expect(extractDocPreviewLines(ydoc, 5)[0].text).toBe('ping @ada')
  })

  it('returns [] for an empty document', () => {
    const ydoc = new Y.Doc()
    expect(extractDocPreviewLines(ydoc, 5)).toEqual([])
  })
})
