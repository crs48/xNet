/**
 * Tests for the BlockNote (`content-v4`) Yjs-fragment ↔ markdown conversion
 * that backs the AI page-markdown surface (0312).
 */

import type { SchemaRegistryAPI } from '../services/local-api'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  blockNoteFragmentToMarkdown,
  createAiSurfaceService,
  createBlockNotePageMarkdownAdapter,
  replaceXNetPageFragmentWithMarkdown,
  XNET_PAGE_FRAGMENT_FIELD,
  xnetPageFragmentToMarkdown,
  type AiMutationPlan,
  type AiPageMarkdownApplyResult
} from '../ai-surface'
import { createMemoryNodeStore } from '../testing/memory-backend'

// ─── Fragment-building helpers (BlockNote PM shape) ─────────────────────────

type AttrValue = string | number | boolean

function el(
  name: string,
  attrs: Record<string, AttrValue> = {},
  children: Array<Y.XmlElement | Y.XmlText> = []
): Y.XmlElement {
  const element = new Y.XmlElement(name)
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, value as unknown as string)
  }
  if (children.length > 0) element.insert(0, children)
  return element
}

function text(value: string): Y.XmlText {
  return new Y.XmlText(value)
}

/** blockContainer wrapping one blockContent element (+ optional children). */
function block(
  content: Y.XmlElement,
  id: string,
  children: Y.XmlElement[] = []
): Y.XmlElement {
  const wrapped: Array<Y.XmlElement | Y.XmlText> = [content]
  if (children.length > 0) wrapped.push(el('blockGroup', {}, children))
  return el('blockContainer', { id }, wrapped)
}

function docWithV4(blocks: Y.XmlElement[]): Y.Doc {
  const doc = new Y.Doc()
  const fragment = doc.getXmlFragment(XNET_PAGE_FRAGMENT_FIELD)
  fragment.insert(0, [el('blockGroup', {}, blocks)])
  return doc
}

function sequentialIds(): () => string {
  let n = 0
  return () => `block-${++n}`
}

// ─── Reading: BlockNote fragment → markdown ─────────────────────────────────

describe('blockNoteFragmentToMarkdown', () => {
  it('converts headings, paragraphs, lists, code, quotes, and callouts', () => {
    const doc = docWithV4([
      block(el('heading', { level: 1 }, [text('Roadmap')]), 'b1'),
      block(el('paragraph', {}, [text('Intro paragraph.')]), 'b2'),
      block(el('bulletListItem', {}, [text('item one')]), 'b3'),
      block(el('bulletListItem', {}, [text('item two')]), 'b4', [
        block(el('bulletListItem', {}, [text('nested item')]), 'b5')
      ]),
      block(el('numberedListItem', {}, [text('first')]), 'b6'),
      block(el('numberedListItem', {}, [text('second')]), 'b7'),
      block(el('checkListItem', { checked: false }, [text('todo')]), 'b8'),
      block(el('checkListItem', { checked: true }, [text('done')]), 'b9'),
      block(el('quote', {}, [text('Quoted text')]), 'b10'),
      block(el('callout', { kind: 'warning' }, [text('Watch out')]), 'b11'),
      block(el('codeBlock', { language: 'ts' }, [text('const x = 1')]), 'b12')
    ])

    expect(xnetPageFragmentToMarkdown(doc)).toBe(
      [
        '# Roadmap',
        '',
        'Intro paragraph.',
        '',
        '- item one',
        '- item two',
        '  - nested item',
        '1. first',
        '2. second',
        '- [ ] todo',
        '- [x] done',
        '',
        '> Quoted text',
        '',
        '> [!warning] Watch out',
        '',
        '```ts',
        'const x = 1',
        '```'
      ].join('\n')
    )
  })

  it('renders inline atoms (mention, hashtag, wikilink, inlineMath) and marks', () => {
    const bold = new Y.XmlText()
    bold.insert(0, 'important', { bold: true })
    const doc = docWithV4([
      block(
        el('paragraph', {}, [
          text('Ping '),
          el('mention', { id: 'did:key:z6Mk', label: 'alice' }),
          text(' about '),
          el('hashtag', { id: 'tag_1', name: 'infra' }),
          text(' and '),
          el('wikilink', { href: '', title: 'Planning' }),
          text(' where '),
          el('inlineMath', { latex: 'x^2' }),
          text(' is '),
          bold
        ]),
        'b1'
      )
    ])

    expect(xnetPageFragmentToMarkdown(doc)).toBe(
      'Ping @alice about #infra and [[Planning]] where $x^2$ is **important**'
    )
  })

  it('renders tables as markdown tables', () => {
    const cell = (name: string, value: string) =>
      el(name, {}, [el('tableParagraph', {}, [text(value)])])
    const doc = docWithV4([
      block(
        el('table', {}, [
          el('tableRow', {}, [cell('tableHeader', 'Name'), cell('tableHeader', 'Role')]),
          el('tableRow', {}, [cell('tableCell', 'Alice'), cell('tableCell', 'Admin')])
        ]),
        'b1'
      )
    ])

    expect(xnetPageFragmentToMarkdown(doc)).toBe(
      ['| Name | Role |', '| --- | --- |', '| Alice | Admin |'].join('\n')
    )
  })

  it('degrades embeds and unknown blocks to text instead of dropping them', () => {
    const doc = docWithV4([
      block(el('embed', { url: 'https://example.com/demo' }), 'b1'),
      block(el('pageEmbed', { nodeId: 'page_9', title: 'Specs' }), 'b2'),
      block(el('mysteryBlock', {}, [text('mystery text')]), 'b3')
    ])

    expect(xnetPageFragmentToMarkdown(doc)).toBe(
      ['https://example.com/demo', '', '[[Specs]]', '', 'mystery text'].join('\n')
    )
  })

  it('falls back to the legacy TipTap fragment when content-v4 is empty', () => {
    const doc = new Y.Doc()
    const legacy = doc.getXmlFragment('content')
    legacy.insert(0, [
      el('heading', { level: 2 }, [text('Old Notes')]),
      el('paragraph', {}, [text('Legacy body.')]),
      el('bulletList', {}, [
        el('listItem', {}, [el('paragraph', {}, [text('alpha')])]),
        el('listItem', {}, [el('paragraph', {}, [text('beta')])])
      ]),
      el('taskList', {}, [el('taskItem', { checked: 'true' }, [el('paragraph', {}, [text('ship')])])])
    ])

    expect(xnetPageFragmentToMarkdown(doc)).toBe(
      ['## Old Notes', '', 'Legacy body.', '', '- alpha', '- beta', '', '- [x] ship'].join('\n')
    )
  })

  it('returns an empty string when both fragments are empty', () => {
    expect(xnetPageFragmentToMarkdown(new Y.Doc())).toBe('')
  })
})

// ─── Writing: markdown → BlockNote fragment ─────────────────────────────────

describe('replaceXNetPageFragmentWithMarkdown', () => {
  it('wraps every block in blockContainer (unique id) inside one blockGroup', () => {
    const doc = new Y.Doc()
    replaceXNetPageFragmentWithMarkdown(doc, '# Title\n\nBody text', {
      generateBlockId: sequentialIds()
    })

    const fragment = doc.getXmlFragment(XNET_PAGE_FRAGMENT_FIELD)
    expect(fragment.length).toBe(1)
    const group = fragment.get(0) as Y.XmlElement
    expect(group.nodeName).toBe('blockGroup')
    expect(group.length).toBe(2)

    const first = group.get(0) as Y.XmlElement
    const second = group.get(1) as Y.XmlElement
    expect(first.nodeName).toBe('blockContainer')
    expect(second.nodeName).toBe('blockContainer')
    expect(first.getAttribute('id')).toBe('block-1')
    expect(second.getAttribute('id')).toBe('block-2')

    const heading = first.get(0) as Y.XmlElement
    expect(heading.nodeName).toBe('heading')
    expect(heading.getAttribute('level') as unknown).toBe(1)
    const paragraph = second.get(0) as Y.XmlElement
    expect(paragraph.nodeName).toBe('paragraph')
    expect(paragraph.toString()).toContain('Body text')
  })

  it('nests indented list items as child blockGroups and keeps props native', () => {
    const doc = new Y.Doc()
    replaceXNetPageFragmentWithMarkdown(
      doc,
      ['- parent', '  - child', '- [x] done', '```py', 'print(1)', '```'].join('\n'),
      { generateBlockId: sequentialIds() }
    )

    const group = doc.getXmlFragment(XNET_PAGE_FRAGMENT_FIELD).get(0) as Y.XmlElement
    const parent = group.get(0) as Y.XmlElement
    expect((parent.get(0) as Y.XmlElement).nodeName).toBe('bulletListItem')
    const childGroup = parent.get(1) as Y.XmlElement
    expect(childGroup.nodeName).toBe('blockGroup')
    const child = childGroup.get(0) as Y.XmlElement
    expect((child.get(0) as Y.XmlElement).nodeName).toBe('bulletListItem')

    const check = (group.get(1) as Y.XmlElement).get(0) as Y.XmlElement
    expect(check.nodeName).toBe('checkListItem')
    expect(check.getAttribute('checked') as unknown).toBe(true)

    const code = (group.get(2) as Y.XmlElement).get(0) as Y.XmlElement
    expect(code.nodeName).toBe('codeBlock')
    expect(code.getAttribute('language') as unknown).toBe('py')
  })

  it('lifts [[wikilinks]] into inline atoms', () => {
    const doc = new Y.Doc()
    replaceXNetPageFragmentWithMarkdown(doc, 'See [[Planning]] for details', {
      generateBlockId: sequentialIds()
    })

    const group = doc.getXmlFragment(XNET_PAGE_FRAGMENT_FIELD).get(0) as Y.XmlElement
    const paragraph = (group.get(0) as Y.XmlElement).get(0) as Y.XmlElement
    const atom = paragraph.get(1) as Y.XmlElement
    expect(atom.nodeName).toBe('wikilink')
    expect(atom.getAttribute('title')).toBe('Planning')
  })

  it('replaces previous content in a single transaction', () => {
    const doc = new Y.Doc()
    replaceXNetPageFragmentWithMarkdown(doc, 'First version')
    replaceXNetPageFragmentWithMarkdown(doc, 'Second version')

    const fragment = doc.getXmlFragment(XNET_PAGE_FRAGMENT_FIELD)
    expect(fragment.length).toBe(1)
    expect(blockNoteFragmentToMarkdown(fragment)).toBe('Second version')
  })

  it('round-trips the AI markdown subset byte-stably', () => {
    const markdown = [
      '# Roadmap',
      '',
      'Intro paragraph with [[Planning]] link.',
      '',
      '## Details',
      '',
      '- item one',
      '- item two',
      '  - nested item',
      '1. first',
      '2. second',
      '- [ ] todo',
      '- [x] done',
      '',
      '> [!warning] Watch out',
      '',
      '> Quoted text',
      '',
      '```ts',
      'const x = 1',
      '```'
    ].join('\n')

    const doc = new Y.Doc()
    replaceXNetPageFragmentWithMarkdown(doc, markdown)
    const exported = xnetPageFragmentToMarkdown(doc)
    expect(exported).toBe(markdown)

    // Idempotent: re-applying the export changes nothing.
    replaceXNetPageFragmentWithMarkdown(doc, exported)
    expect(xnetPageFragmentToMarkdown(doc)).toBe(exported)
  })
})

// ─── Adapter: AI apply path writes the fragment ─────────────────────────────

describe('createBlockNotePageMarkdownAdapter', () => {
  const schemas: SchemaRegistryAPI = {
    getAllIRIs: () => ['xnet://xnet.fyi/Page@1.0.0'],
    get: async (iri) =>
      iri === 'xnet://xnet.fyi/Page@1.0.0'
        ? { iri, name: 'Page', properties: { title: { type: 'text' } } }
        : null
  }

  it('applies validated plans into content-v4 instead of node properties', async () => {
    const doc = new Y.Doc()
    replaceXNetPageFragmentWithMarkdown(doc, 'Original body')
    const store = createMemoryNodeStore([
      {
        id: 'page_1',
        schemaId: 'xnet://xnet.fyi/Page@1.0.0',
        properties: { title: 'Roadmap', markdown: 'Original body' },
        deleted: false,
        createdAt: 1,
        updatedAt: 10
      }
    ])
    const adapter = createBlockNotePageMarkdownAdapter({
      resolveDoc: (pageId) => (pageId === 'page_1' ? doc : null)
    })
    const service = createAiSurfaceService({ store, schemas, pageMarkdownAdapter: adapter })

    const plan = (await service.callTool('xnet_plan_page_patch', {
      pageId: 'page_1',
      baseRevision: 'updatedAt:10',
      markdown: '# Roadmap\n\nUpdated body'
    })) as AiMutationPlan
    const result = (await service.callTool('xnet_apply_page_markdown', {
      plan,
      confirmApply: true
    })) as AiPageMarkdownApplyResult

    expect(result).toMatchObject({
      applied: true,
      mode: 'blocknote-yjs',
      yjsField: XNET_PAGE_FRAGMENT_FIELD
    })
    expect(xnetPageFragmentToMarkdown(doc)).toBe('# Roadmap\n\nUpdated body')
    expect((await store.get('page_1'))?.properties.markdown).toBe('Original body')
    expect(await adapter.readMarkdown('page_1')).toBe('# Roadmap\n\nUpdated body')
    expect(await adapter.readMarkdown('page_missing')).toBeNull()
  })

  it('throws when no document resolves for the page', async () => {
    const adapter = createBlockNotePageMarkdownAdapter({ resolveDoc: () => null })
    await expect(
      adapter.applyMarkdown({
        pageId: 'page_x',
        markdown: 'Body',
        bodyMarkdown: 'Body',
        baseRevision: 'updatedAt:1',
        plan: {} as AiMutationPlan,
        operation: { op: 'replaceMarkdown', args: {} }
      })
    ).rejects.toThrow('No document available for page page_x')
  })
})
