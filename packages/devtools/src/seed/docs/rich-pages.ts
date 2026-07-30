/**
 * Flexible deterministic BlockNote document builder (0312) — rich pages are
 * driven by a small block DSL so each seeded document exercises the editor's
 * full block + inline vocabulary and cross-links to other nodes (pageEmbed /
 * databaseEmbed / taskViewEmbed blocks, inline hashtag / mention / wikilink /
 * math pills, and text styles).
 *
 * Blocks are declared as BlockNote Block JSON and converted to the persisted
 * `content-v4` Y.XmlFragment via a lazily-created headless editor running the
 * real app schema (`createXNetSchema`), so seeded content is by construction
 * the exact shape the editor round-trips. Block ids are deterministic
 * (`seed-block-N`) which keeps derived ids (page-task ids) stable.
 */

import type { SchemaIRI } from '@xnetjs/data'
import { BlockNoteEditor } from '@blocknote/core'
import { blocksToYXmlFragment, yXmlFragmentToBlocks } from '@blocknote/core/yjs'
import {
  createXNetSchema,
  EDITOR_DOCUMENT_FRAGMENT_FIELD,
  type XNetBlock,
  type XNetPartialBlock
} from '@xnetjs/editor/react'
import * as Y from 'yjs'

/** Inline text run with optional styles / link / wikilink. */
export interface TextRun {
  text: string
  marks?: Array<'bold' | 'italic' | 'code' | 'strike' | 'underline'>
  link?: string
  wikilink?: { href: string; title: string }
}
/** Inline atom pills (BlockNote custom inline content). */
export type InlinePill =
  | { pill: 'hashtag'; id: string; name: string }
  | { pill: 'mention'; id: string; label?: string; subtitle?: string; color?: string }
  | { pill: 'math'; latex: string }
export type Inline = TextRun | InlinePill

export type RichBlock =
  | { kind: 'h'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { kind: 'p'; text: string | Inline[] }
  | { kind: 'quote'; text: string }
  | {
      kind: 'callout'
      type: 'info' | 'tip' | 'warning' | 'caution' | 'note' | 'quote'
      text: string
    }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'numbers'; items: string[] }
  | { kind: 'tasks'; items: Array<{ text: string; checked: boolean }> }
  | { kind: 'hr' }
  | { kind: 'toggle'; summary: string; children: RichBlock[] }
  | { kind: 'mermaid'; code: string }
  | { kind: 'image'; src: string; alt?: string; alignment?: 'left' | 'center' | 'right' }
  | { kind: 'file'; cid: string; name: string; mimeType: string; size: number }
  | { kind: 'embed'; url: string }
  | { kind: 'richLink'; url: string; title: string; subtitle?: string }
  | { kind: 'pageEmbed'; pageId: string; title: string }
  | { kind: 'databaseEmbed'; databaseId: string; viewType?: string }
  | {
      kind: 'taskViewEmbed'
      scope?: 'page' | 'workspace' | 'assigned'
      status?: 'open' | 'completed' | 'all'
    }

// ─── Headless editor (module singleton — schema construction is not free) ───

function makeSeedEditor() {
  return BlockNoteEditor.create({ schema: createXNetSchema() })
}
type SeedEditor = ReturnType<typeof makeSeedEditor>

let seedEditor: SeedEditor | null = null

/** The shared headless BlockNote editor used for JSON ⇄ Yjs conversion. */
export function getSeedEditor(): SeedEditor {
  if (!seedEditor) seedEditor = makeSeedEditor()
  return seedEditor
}

// ─── Inline content ──────────────────────────────────────────────────────────

type InlineJson = string | Record<string, unknown>

const isPill = (i: Inline): i is InlinePill => 'pill' in i

function inlineItem(part: Inline): InlineJson {
  if (isPill(part)) {
    switch (part.pill) {
      case 'hashtag':
        return { type: 'hashtag', props: { id: part.id, name: part.name } }
      case 'mention':
        return {
          type: 'mention',
          props: {
            id: part.id,
            label: part.label ?? '',
            subtitle: part.subtitle ?? '',
            color: part.color ?? ''
          }
        }
      case 'math':
        return { type: 'inlineMath', props: { latex: part.latex } }
    }
  }
  if (part.wikilink) {
    return {
      type: 'wikilink',
      props: { href: part.wikilink.href, title: part.wikilink.title || part.text }
    }
  }
  const styles: Record<string, boolean> = {}
  for (const m of part.marks ?? []) styles[m] = true
  if (part.link) {
    return { type: 'link', href: part.link, content: [{ type: 'text', text: part.text, styles }] }
  }
  return { type: 'text', text: part.text, styles }
}

function inline(content: string | Inline[]): InlineJson[] {
  if (typeof content === 'string') return [content]
  return content.map(inlineItem)
}

// ─── Blocks ──────────────────────────────────────────────────────────────────

/** Encode seeded file metadata the way the editor's upload path does (0312). */
export function seedFileUrl(file: {
  cid: string
  name: string
  mimeType: string
  size: number
}): string {
  return `xnet-blob://${file.cid}?name=${encodeURIComponent(file.name)}&type=${encodeURIComponent(file.mimeType)}&size=${file.size}`
}

/** Render one DSL block to 1..n BlockNote partial blocks (recursive for toggles). */
function renderBlock(block: RichBlock, nextId: () => string): XNetPartialBlock[] {
  const b = (json: Record<string, unknown>): XNetPartialBlock =>
    ({ id: nextId(), ...json }) as unknown as XNetPartialBlock

  switch (block.kind) {
    case 'h':
      return [b({ type: 'heading', props: { level: block.level }, content: inline(block.text) })]
    case 'p':
      return [b({ type: 'paragraph', content: inline(block.text) })]
    case 'quote':
      return [b({ type: 'quote', content: inline(block.text) })]
    case 'callout':
      return [b({ type: 'callout', props: { kind: block.type }, content: inline(block.text) })]
    case 'code':
      return [b({ type: 'codeBlock', props: { language: block.lang }, content: [block.text] })]
    case 'bullets':
      return block.items.map((t) => b({ type: 'bulletListItem', content: inline(t) }))
    case 'numbers':
      return block.items.map((t) => b({ type: 'numberedListItem', content: inline(t) }))
    case 'tasks':
      return block.items.map((item) =>
        b({ type: 'checkListItem', props: { checked: item.checked }, content: inline(item.text) })
      )
    case 'hr':
      return [b({ type: 'divider' })]
    case 'toggle':
      return [
        b({
          type: 'toggleListItem',
          content: inline(block.summary),
          children: block.children.flatMap((child) => renderBlock(child, nextId))
        })
      ]
    case 'mermaid':
      return [b({ type: 'mermaid', props: { code: block.code } })]
    case 'image':
      return [
        b({
          type: 'image',
          props: {
            url: block.src,
            name: block.alt ?? '',
            caption: block.alt ?? '',
            textAlignment: block.alignment ?? 'center'
          }
        })
      ]
    case 'file':
      return [b({ type: 'file', props: { url: seedFileUrl(block), name: block.name } })]
    case 'embed':
      return [b({ type: 'embed', props: { url: block.url } })]
    case 'richLink':
      return [
        b({
          type: 'richLink',
          props: {
            url: block.url,
            preview: JSON.stringify({
              url: block.url,
              kind: 'external',
              title: block.title,
              ...(block.subtitle ? { description: block.subtitle } : {})
            })
          }
        })
      ]
    case 'pageEmbed':
      return [b({ type: 'pageEmbed', props: { nodeId: block.pageId, title: block.title } })]
    case 'databaseEmbed':
      return [
        b({
          type: 'databaseEmbed',
          props: { databaseId: block.databaseId, viewType: block.viewType ?? 'table' }
        })
      ]
    case 'taskViewEmbed':
      return [
        b({
          type: 'taskViewEmbed',
          props: {
            viewType: 'list',
            config: JSON.stringify({
              scope: block.scope ?? 'page',
              ...(block.status ? { status: block.status } : {})
            })
          }
        })
      ]
  }
}

/** Render a DSL block list to BlockNote partial blocks with deterministic ids. */
export function renderRichBlocks(blocks: RichBlock[]): XNetPartialBlock[] {
  let n = 0
  const nextId = () => `seed-block-${++n}`
  return blocks.flatMap((block) => renderBlock(block, nextId))
}

/** Build a rich page Y.Doc (v4 BlockNote fragment + meta map) from a block list. */
export function buildRichPageDoc(
  nodeId: string,
  schemaId: SchemaIRI,
  title: string,
  icon: string,
  blocks: RichBlock[]
): Y.Doc {
  const ydoc = new Y.Doc({ guid: nodeId, gc: false })
  const editor = getSeedEditor()
  const partialBlocks = renderRichBlocks(blocks)

  ydoc.transact(() => {
    blocksToYXmlFragment(
      editor as never,
      partialBlocks as never,
      ydoc.getXmlFragment(EDITOR_DOCUMENT_FRAGMENT_FIELD)
    )
    const meta = ydoc.getMap('meta')
    meta.set('_schemaId', schemaId)
    meta.set('title', title)
    meta.set('icon', icon)
  })

  return ydoc
}

/** Read a seeded doc's v4 fragment back as Block JSON (render-fidelity tests). */
export function seedDocToBlocks(ydoc: Y.Doc): XNetBlock[] {
  return yXmlFragmentToBlocks(
    getSeedEditor() as never,
    ydoc.getXmlFragment(EDITOR_DOCUMENT_FRAGMENT_FIELD)
  ) as unknown as XNetBlock[]
}
