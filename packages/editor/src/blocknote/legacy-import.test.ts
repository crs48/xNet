import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  LEGACY_IMPORT_FLAG,
  legacyFragmentToMarkdown,
  markLegacyImportDone,
  shouldImportLegacyContent
} from './legacy-import'

function el(name: string, attrs: Record<string, string> = {}, children: Array<Y.XmlElement | Y.XmlText> = []): Y.XmlElement {
  const node = new Y.XmlElement(name)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
  if (children.length) node.insert(0, children)
  return node
}

function text(value: string): Y.XmlText {
  const t = new Y.XmlText()
  t.insert(0, value)
  return t
}

function docWithLegacy(children: Y.XmlElement[]): Y.Doc {
  const ydoc = new Y.Doc()
  ydoc.getXmlFragment('content').insert(0, children)
  return ydoc
}

describe('legacyFragmentToMarkdown', () => {
  it('converts paragraphs, headings and code blocks', () => {
    const ydoc = docWithLegacy([
      el('heading', { level: '2' }, [text('Title')]),
      el('paragraph', {}, [text('Hello world')]),
      el('codeBlock', { language: 'ts' }, [text('const a = 1')])
    ])
    const md = legacyFragmentToMarkdown(ydoc.getXmlFragment('content'))
    expect(md).toContain('## Title')
    expect(md).toContain('Hello world')
    expect(md).toContain('```ts')
    expect(md).toContain('const a = 1')
  })

  it('converts lists and task lists', () => {
    const ydoc = docWithLegacy([
      el('bulletList', {}, [
        el('listItem', {}, [el('paragraph', {}, [text('one')])]),
        el('listItem', {}, [el('paragraph', {}, [text('two')])])
      ]),
      el('taskList', {}, [
        el('taskItem', { checked: 'true' }, [el('paragraph', {}, [text('done')])]),
        el('taskItem', { checked: 'false' }, [el('paragraph', {}, [text('todo')])])
      ])
    ])
    const md = legacyFragmentToMarkdown(ydoc.getXmlFragment('content'))
    expect(md).toContain('- one')
    expect(md).toContain('- two')
    expect(md).toContain('- [x] done')
    expect(md).toContain('- [ ] todo')
  })

  it('degrades inline atoms to readable text', () => {
    const ydoc = docWithLegacy([
      el('paragraph', {}, [
        text('ping '),
        el('taskMention', { id: 'did:key:z6MkTest', label: 'Ada' }),
        text(' about '),
        el('hashtag', { id: 'tag-1', name: 'urgent' })
      ])
    ])
    const md = legacyFragmentToMarkdown(ydoc.getXmlFragment('content'))
    expect(md).toContain('@Ada')
    expect(md).toContain('#urgent')
  })

  it('degrades embeds and page embeds to links', () => {
    const ydoc = docWithLegacy([
      el('embed', { url: 'https://youtu.be/abc' }),
      el('pageEmbed', { nodeId: 'page-1', title: 'Roadmap' })
    ])
    const md = legacyFragmentToMarkdown(ydoc.getXmlFragment('content'))
    expect(md).toContain('https://youtu.be/abc')
    expect(md).toContain('[[Roadmap]]')
  })
})

describe('shouldImportLegacyContent', () => {
  it('imports when v4 is empty and legacy has content', () => {
    const ydoc = docWithLegacy([el('paragraph', {}, [text('old')])])
    expect(shouldImportLegacyContent(ydoc, 'content-v4', 'content')).toBe(true)
  })

  it('skips when the v4 fragment already has content', () => {
    const ydoc = docWithLegacy([el('paragraph', {}, [text('old')])])
    ydoc.getXmlFragment('content-v4').insert(0, [el('paragraph', {}, [text('new')])])
    expect(shouldImportLegacyContent(ydoc, 'content-v4', 'content')).toBe(false)
  })

  it('skips when both fragments are empty', () => {
    const ydoc = new Y.Doc()
    expect(shouldImportLegacyContent(ydoc, 'content-v4', 'content')).toBe(false)
  })

  it('is idempotent via the meta flag', () => {
    const ydoc = docWithLegacy([el('paragraph', {}, [text('old')])])
    markLegacyImportDone(ydoc)
    expect(ydoc.getMap('meta').get(LEGACY_IMPORT_FLAG)).toBe(true)
    expect(shouldImportLegacyContent(ydoc, 'content-v4', 'content')).toBe(false)
  })
})
