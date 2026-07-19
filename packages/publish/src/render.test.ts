import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { renderPost, buildExcerpt } from './render'

/**
 * Build a `content-v4` fragment from a compact spec, mirroring the real
 * BlockNote shape: blockGroup → blockContainer → blockContent (+ nested group).
 */
type BlockSpec = {
  type: string
  text?: string
  attrs?: Record<string, string>
  children?: BlockSpec[]
  /** Inline atoms carried as delta embeds (wikilink, mention). */
  atoms?: Array<{ type: string; attrs: Record<string, string> }>
  /** Marks applied to `text`. */
  marks?: Record<string, unknown>
}

/**
 * Populate `group` (already attached to a doc) with `blocks`.
 *
 * Elements are inserted into their parent *before* attributes are set: Yjs
 * warns ("Add Yjs type to a document before reading data") on writes to a
 * detached type, and a noisy test is a test people stop reading.
 */
function fillGroup(group: Y.XmlElement, blocks: BlockSpec[]): void {
  for (const spec of blocks) {
    const container = new Y.XmlElement('blockContainer')
    group.insert(group.length, [container])
    container.setAttribute('id', `b-${spec.type}-${spec.text ?? ''}`)

    const content = new Y.XmlElement(spec.type)
    container.insert(0, [content])
    for (const [k, v] of Object.entries(spec.attrs ?? {})) content.setAttribute(k, v)

    const inline = new Y.XmlText()
    content.insert(0, [inline])
    if (spec.text) inline.insert(0, spec.text, spec.marks)
    for (const atom of spec.atoms ?? []) {
      inline.insertEmbed(inline.length, atom as unknown as object)
    }

    if (spec.children?.length) {
      const child = new Y.XmlElement('blockGroup')
      container.insert(container.length, [child])
      fillGroup(child, spec.children)
    }
  }
}

function docWith(blocks: BlockSpec[], field = 'content-v4'): Y.Doc {
  const doc = new Y.Doc()
  const fragment = doc.getXmlFragment(field)
  const group = new Y.XmlElement('blockGroup')
  fragment.insert(0, [group])
  fillGroup(group, blocks)
  return doc
}

describe('renderPost', () => {
  it('renders headings, paragraphs and marks', () => {
    const doc = docWith([
      { type: 'heading', text: 'The Owned Audience', attrs: { level: '2' } },
      { type: 'paragraph', text: 'Bold claim', marks: { bold: true } }
    ])
    const { html } = renderPost(doc)
    expect(html).toContain('<h2 id="the-owned-audience">The Owned Audience</h2>')
    expect(html).toContain('<p><strong>Bold claim</strong></p>')
  })

  it('collects a heading outline with stable, unique anchors', () => {
    const doc = docWith([
      { type: 'heading', text: 'Notes', attrs: { level: '2' } },
      { type: 'heading', text: 'Notes', attrs: { level: '3' } }
    ])
    const { headings, html } = renderPost(doc)
    expect(headings).toEqual([
      { level: 2, text: 'Notes', id: 'notes' },
      { level: 3, text: 'Notes', id: 'notes-2' }
    ])
    // Duplicate titles must not produce duplicate ids — anchors would collide.
    expect(html).toContain('id="notes"')
    expect(html).toContain('id="notes-2"')
  })

  it('groups consecutive list items into one list, and switches on type', () => {
    const doc = docWith([
      { type: 'bulletListItem', text: 'one' },
      { type: 'bulletListItem', text: 'two' },
      { type: 'numberedListItem', text: 'first' }
    ])
    const { html } = renderPost(doc)
    expect(html).toBe('<ul><li>one</li><li>two</li></ul><ol><li>first</li></ol>')
  })

  it('nests child blocks inside their parent list item', () => {
    const doc = docWith([
      { type: 'bulletListItem', text: 'parent', children: [{ type: 'bulletListItem', text: 'child' }] }
    ])
    const { html } = renderPost(doc)
    expect(html).toBe('<ul><li>parent<ul><li>child</li></ul></li></ul>')
  })

  it('escapes authored HTML rather than emitting it', () => {
    const doc = docWith([{ type: 'paragraph', text: '<script>alert(1)</script>' }])
    const { html } = renderPost(doc)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('drops javascript: links but keeps their text', () => {
    const doc = docWith([
      { type: 'paragraph', text: 'click', marks: { link: { href: 'javascript:alert(1)' } } }
    ])
    const { html } = renderPost(doc)
    expect(html).not.toContain('javascript:')
    expect(html).toContain('click')
  })

  it('renders a code block with its language and escaped body', () => {
    const doc = docWith([
      { type: 'codeBlock', text: 'const a = 1 < 2', attrs: { language: 'ts' } }
    ])
    const { html } = renderPost(doc)
    expect(html).toBe('<pre><code class="language-ts">const a = 1 &lt; 2</code></pre>')
  })

  it('collects image CIDs as assets and resolves them', () => {
    const doc = docWith([
      { type: 'image', attrs: { cid: 'bafyimage', alt: 'A diagram' } }
    ])
    const { html, assets } = renderPost(doc, {
      resolveAsset: (cid) => `https://cdn.example/${cid}`
    })
    expect(assets).toEqual(['bafyimage'])
    expect(html).toContain('src="https://cdn.example/bafyimage"')
    expect(html).toContain('alt="A diagram"')
  })

  describe('embed degradation', () => {
    const doc = () =>
      docWith([
        {
          type: 'databaseEmbed',
          attrs: { nodeId: 'db-1', title: 'Roadmap' }
        }
      ])

    it('shell tier renders a titled container with a snapshot date', () => {
      const { html } = renderPost(doc(), {
        embedTier: 'shell',
        snapshotDate: '2026-07-18',
        resolveNode: (id) => `/n/${id}`
      })
      expect(html).toContain('xn-embed--shell')
      expect(html).toContain('Roadmap')
      // The honesty label: never imply a static snapshot is live.
      expect(html).toContain('snapshot as of 2026-07-18')
      expect(html).toContain('href="/n/db-1"')
    })

    it('link tier renders only an anchor', () => {
      const { html } = renderPost(doc(), {
        embedTier: 'link',
        resolveNode: (id) => `/n/${id}`
      })
      expect(html).toBe('<p class="xn-embed xn-embed--link"><a href="/n/db-1">Roadmap</a></p>')
    })

    it('omits the snapshot note when no date is supplied, rather than inventing one', () => {
      const { html } = renderPost(doc(), { embedTier: 'shell' })
      expect(html).not.toContain('snapshot as of')
      expect(html).toContain('Live view')
    })

    it('degrades a task-view embed through the same path', () => {
      const d = docWith([{ type: 'taskViewEmbed', attrs: { nodeId: 't-1', title: 'Sprint' } }])
      const { html } = renderPost(d, { embedTier: 'link', resolveNode: (id) => `/n/${id}` })
      expect(html).toContain('Sprint')
    })
  })

  it('labels AI-generated blocks in published output', () => {
    const doc = docWith([{ type: 'aiGenerated', text: 'Drafted by an assistant' }])
    const { html } = renderPost(doc)
    expect(html).toContain('data-provenance="ai"')
  })

  it('renders wikilinks as links when resolvable and text when not', () => {
    const doc = docWith([
      {
        type: 'paragraph',
        atoms: [{ type: 'wikilink', attrs: { nodeId: 'p-1', title: 'Charter' } }]
      },
      {
        type: 'paragraph',
        atoms: [{ type: 'wikilink', attrs: { nodeId: 'p-missing', title: 'Unpublished' } }]
      }
    ])
    const { html } = renderPost(doc, {
      resolveNode: (id) => (id === 'p-1' ? '/blog/charter' : undefined)
    })
    expect(html).toContain('<a href="/blog/charter" class="xn-wikilink">Charter</a>')
    expect(html).toContain('xn-wikilink--unresolved')
  })

  it('falls back to the legacy fragment when content-v4 is empty', () => {
    const doc = docWith([{ type: 'paragraph', text: 'Old post' }], 'content')
    const { html } = renderPost(doc)
    expect(html).toContain('Old post')
  })

  it('degrades an unknown block to its text instead of dropping it', () => {
    const doc = docWith([{ type: 'someFutureBlock', text: 'still readable' }])
    const { html } = renderPost(doc)
    expect(html).toBe('<p>still readable</p>')
  })

  it('renders a table inside a horizontal scroll wrapper', () => {
    const doc = new Y.Doc()
    const group = new Y.XmlElement('blockGroup')
    doc.getXmlFragment('content-v4').insert(0, [group])
    const container = new Y.XmlElement('blockContainer')
    group.insert(0, [container])
    const table = new Y.XmlElement('table')
    container.insert(0, [table])
    const row = new Y.XmlElement('tableRow')
    table.insert(0, [row])
    for (const label of ['A', 'B']) {
      const cell = new Y.XmlElement('tableHeader')
      row.insert(row.length, [cell])
      const t = new Y.XmlText()
      cell.insert(0, [t])
      t.insert(0, label)
    }

    const { html } = renderPost(doc)
    expect(html).toContain('xn-table-wrap')
    expect(html).toContain('<th>A</th>')
  })

  // ─── Validation checklist items ──────────────────────────────────────────

  it('is deterministic — identical output across repeated renders', () => {
    const build = () =>
      docWith([
        { type: 'heading', text: 'Repeatable', attrs: { level: '1' } },
        { type: 'paragraph', text: 'Same every time' },
        { type: 'image', attrs: { cid: 'bafy2' } },
        { type: 'bulletListItem', text: 'x' }
      ])
    const first = renderPost(build(), { snapshotDate: '2026-07-18' })
    for (let i = 0; i < 25; i += 1) {
      const again = renderPost(build(), { snapshotDate: '2026-07-18' })
      expect(again.html).toBe(first.html)
      expect(again.excerpt).toBe(first.excerpt)
      expect(again.assets).toEqual(first.assets)
      expect(again.headings).toEqual(first.headings)
    }
  })

  it('sorts assets stably regardless of document order', () => {
    const forward = renderPost(
      docWith([{ type: 'image', attrs: { cid: 'zzz' } }, { type: 'image', attrs: { cid: 'aaa' } }])
    )
    const reverse = renderPost(
      docWith([{ type: 'image', attrs: { cid: 'aaa' } }, { type: 'image', attrs: { cid: 'zzz' } }])
    )
    expect(forward.assets).toEqual(['aaa', 'zzz'])
    expect(reverse.assets).toEqual(forward.assets)
  })

  it('runs with no DOM present', () => {
    // Guards the "no DOM shim, no browser dependency" validation item: if the
    // renderer ever reaches for document/window this fails in the node env.
    expect(typeof globalThis.document).toBe('undefined')
    expect(typeof globalThis.window).toBe('undefined')
    const { html } = renderPost(docWith([{ type: 'paragraph', text: 'headless' }]))
    expect(html).toBe('<p>headless</p>')
  })
})

describe('buildExcerpt', () => {
  it('collapses whitespace and truncates on a word boundary', () => {
    const excerpt = buildExcerpt(`${'word '.repeat(80)}`, 40)
    expect(excerpt.length).toBeLessThanOrEqual(41)
    expect(excerpt.endsWith('…')).toBe(true)
    expect(excerpt).not.toContain('  ')
  })

  it('returns short text unchanged', () => {
    expect(buildExcerpt('Short.', 40)).toBe('Short.')
  })
})
