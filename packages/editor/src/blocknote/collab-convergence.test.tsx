/**
 * Two-peer convergence + spec round-trip over the real Yjs path (0312).
 *
 * Substantiates the 0312 validation items headlessly: two BlockNote
 * editors bound to two Y.Docs relaying updates (the same shape the
 * hub/sync layer delivers) converge on identical documents, and every
 * custom spec survives encode → apply → read on a fresh peer (the
 * persistence path useNode drives via encodeStateAsUpdate/applyUpdate).
 */
import { BlockNoteEditor } from '@blocknote/core'
import { blocksToYXmlFragment, yXmlFragmentToBlocks } from '@blocknote/core/yjs'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { EDITOR_DOCUMENT_FRAGMENT_FIELD, createXNetSchema } from './schema'

function createPeer(ydoc: Y.Doc) {
  const editor = BlockNoteEditor.create({
    schema: createXNetSchema(),
    collaboration: {
      fragment: ydoc.getXmlFragment(EDITOR_DOCUMENT_FRAGMENT_FIELD),
      user: { name: 'peer', color: '#88aa88' }
    }
  })
  // The ySync plugin binds on view creation; mount headlessly into jsdom.
  editor.mount(document.createElement('div'))
  return editor
}

/** Relay updates both ways, like two peers on the same channel. */
function connect(a: Y.Doc, b: Y.Doc): void {
  a.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== 'relay-b') Y.applyUpdate(b, update, 'relay-a')
  })
  b.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== 'relay-a') Y.applyUpdate(a, update, 'relay-b')
  })
}

const RICH_BLOCKS = [
  {
    type: 'heading',
    props: { level: 2 },
    content: [{ type: 'text', text: 'Convergence', styles: {} }]
  },
  {
    type: 'paragraph',
    content: [
      { type: 'text', text: 'ping ', styles: {} },
      { type: 'mention', props: { id: 'did:key:z6MkAda', label: 'Ada' } },
      { type: 'text', text: ' about ', styles: {} },
      { type: 'hashtag', props: { id: 'tag-1', name: 'urgent' } },
      { type: 'wikilink', props: { href: 'page-roadmap', title: 'Roadmap' } },
      { type: 'inlineMath', props: { latex: 'e=mc^2' } }
    ]
  },
  {
    type: 'callout',
    props: { kind: 'warning' },
    content: [{ type: 'text', text: 'careful', styles: {} }]
  },
  { type: 'embed', props: { url: 'https://youtu.be/abc123' } },
  { type: 'pageEmbed', props: { nodeId: 'page-1', title: 'Roadmap' } },
  {
    type: 'databaseEmbed',
    props: { databaseId: 'db-1', viewType: 'board', viewConfig: '{"group":"status"}' }
  },
  {
    type: 'taskViewEmbed',
    props: { viewType: 'list', config: '{"scope":"page"}' }
  },
  { type: 'mermaid', props: { code: 'graph TD; A-->B' } },
  {
    type: 'richLink',
    props: { url: 'https://example.com', preview: '{"title":"Example","kind":"external"}' }
  },
  {
    type: 'checkListItem',
    props: { checked: true },
    content: [{ type: 'text', text: 'ship it', styles: {} }]
  }
] as const

describe('two-peer convergence over Yjs (0312 validation)', () => {
  it('concurrent edits from both peers converge to identical documents', () => {
    const docA = new Y.Doc()
    const docB = new Y.Doc()
    connect(docA, docB)
    const peerA = createPeer(docA)
    const peerB = createPeer(docB)

    peerA.insertBlocks(
      [{ type: 'paragraph', content: [{ type: 'text', text: 'from A', styles: {} }] } as never],
      peerA.document[0],
      'before'
    )
    peerB.insertBlocks(
      [{ type: 'paragraph', content: [{ type: 'text', text: 'from B', styles: {} }] } as never],
      peerB.document[peerB.document.length - 1],
      'after'
    )

    const textOf = (editor: BlockNoteEditor<never, never, never>) => JSON.stringify(editor.document)
    expect(textOf(peerA as never)).toEqual(textOf(peerB as never))
    expect(JSON.stringify(peerA.document)).toContain('from A')
    expect(JSON.stringify(peerA.document)).toContain('from B')
  })

  it('every custom spec round-trips to a fresh peer via encodeStateAsUpdate', () => {
    const author = new Y.Doc()
    // Author DOM-free: blocksToYXmlFragment writes the identical structure
    // the live editor's ySync binding produces (custom React inline specs
    // can't render into a non-React headless view).
    const writer = BlockNoteEditor.create({ schema: createXNetSchema() })
    blocksToYXmlFragment(
      writer as never,
      RICH_BLOCKS as never,
      author.getXmlFragment(EDITOR_DOCUMENT_FRAGMENT_FIELD)
    )

    // Persist + restore exactly like useNode: full state update bytes.
    const bytes = Y.encodeStateAsUpdate(author)
    const restored = new Y.Doc()
    Y.applyUpdate(restored, bytes)
    // Read the restored fragment without a DOM view (custom React inline
    // specs can't render into an unmounted headless view).
    const reader = BlockNoteEditor.create({ schema: createXNetSchema() })
    const restoredBlocks = yXmlFragmentToBlocks(
      reader as never,
      restored.getXmlFragment(EDITOR_DOCUMENT_FRAGMENT_FIELD)
    )

    const types = restoredBlocks.map((block) => block.type)
    for (const expected of [
      'heading',
      'paragraph',
      'callout',
      'embed',
      'pageEmbed',
      'databaseEmbed',
      'taskViewEmbed',
      'mermaid',
      'richLink',
      'checkListItem'
    ]) {
      expect(types).toContain(expected)
    }

    const serialized = JSON.stringify(restoredBlocks)
    expect(serialized).toContain('did:key:z6MkAda')
    expect(serialized).toContain('urgent')
    expect(serialized).toContain('page-roadmap')
    expect(serialized).toContain('e=mc^2')
    expect(serialized).toContain('graph TD; A-->B')
    expect(serialized).toContain('"checked":true')
  })
})
