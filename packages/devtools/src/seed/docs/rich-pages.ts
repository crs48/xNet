/**
 * Flexible deterministic Yjs builder for rich pages driven by a block list, so
 * each seeded document exercises the editor's full block + inline vocabulary and
 * cross-links to other nodes (pageEmbed / databaseEmbed / taskViewEmbed atoms,
 * inline hashtag / taskMention / databaseReference pills, and text marks).
 *
 * All `setAttribute` values are strings (Yjs XmlElement attribute contract);
 * marks apply via `Y.XmlText.format(offset, length, { ... })`. Every node/mark
 * name + attribute mirrors the editor extensions exactly (gated by
 * `seed-render.test.ts`).
 */

import type { SchemaIRI } from '@xnetjs/data'
import * as Y from 'yjs'

/** Inline text run with optional marks / link / wikilink / comment. */
export interface TextRun {
  text: string
  marks?: Array<'bold' | 'italic' | 'code' | 'strike'>
  link?: string
  wikilink?: { href: string; title: string }
}
/** Inline atom pills (ProseMirror inline nodes). */
export type InlinePill =
  | { pill: 'hashtag'; id: string; name: string }
  | { pill: 'taskMention'; id: string; label?: string; subtitle?: string; color?: string }
  | { pill: 'databaseReference'; databaseId: string; title?: string; icon?: string }
export type Inline = TextRun | InlinePill

export type RichBlock =
  | { kind: 'h'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { kind: 'p'; text: string | Inline[] }
  | { kind: 'quote'; text: string }
  | { kind: 'callout'; type: 'info' | 'tip' | 'warning' | 'caution' | 'note'; text: string }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'tasks'; items: Array<{ text: string; checked: boolean }> }
  | { kind: 'hr' }
  | { kind: 'toggle'; summary: string; open?: boolean; children: RichBlock[] }
  | { kind: 'mermaid'; code: string; theme?: string }
  | { kind: 'image'; src: string; alt?: string; alignment?: 'left' | 'center' | 'right' | 'full' }
  | { kind: 'file'; cid: string; name: string; mimeType: string; size: number }
  | { kind: 'embed'; url: string; provider: string; embedUrl: string; title?: string }
  | { kind: 'richLink'; url: string; title: string; subtitle?: string; icon?: string }
  | { kind: 'pageEmbed'; pageId: string; title: string; icon: string }
  | { kind: 'databaseEmbed'; databaseId: string; viewType?: string }
  | { kind: 'taskViewEmbed'; scope?: 'current-page' | 'all'; status?: 'open' | 'done' | 'all' }

const isPill = (i: Inline): i is InlinePill => 'pill' in i

function pillElement(part: InlinePill): Y.XmlElement {
  const el = new Y.XmlElement(part.pill)
  if (part.pill === 'hashtag') {
    el.setAttribute('id', part.id)
    el.setAttribute('name', part.name)
  } else if (part.pill === 'taskMention') {
    el.setAttribute('id', part.id)
    if (part.label) el.setAttribute('label', part.label)
    if (part.subtitle) el.setAttribute('subtitle', part.subtitle)
    if (part.color) el.setAttribute('color', part.color)
  } else {
    el.setAttribute('databaseId', part.databaseId)
    el.setAttribute('title', part.title ?? part.databaseId)
    el.setAttribute('icon', part.icon ?? 'DB')
  }
  return el
}

/** Build a paragraph from a plain string or a sequence of inline runs/pills. */
function paragraph(content: string | Inline[]): Y.XmlElement {
  const p = new Y.XmlElement('paragraph')
  if (typeof content === 'string') {
    p.insert(0, [new Y.XmlText(content)])
    return p
  }
  const nodes: Array<Y.XmlText | Y.XmlElement> = content.map((part) => {
    if (isPill(part)) return pillElement(part)
    const t = new Y.XmlText()
    t.insert(0, part.text)
    for (const m of part.marks ?? []) t.format(0, part.text.length, { [m]: true })
    if (part.link) t.format(0, part.text.length, { link: { href: part.link, target: '_blank' } })
    if (part.wikilink) t.format(0, part.text.length, { wikilink: part.wikilink })
    return t
  })
  p.insert(0, nodes)
  return p
}

/** Render one block to a Y.XmlElement (recursive for toggles). */
function renderBlock(block: RichBlock): Y.XmlElement {
  switch (block.kind) {
    case 'h': {
      const h = new Y.XmlElement('heading')
      h.setAttribute('level', String(block.level))
      h.insert(0, [new Y.XmlText(block.text)])
      return h
    }
    case 'p':
      return paragraph(block.text)
    case 'quote': {
      const q = new Y.XmlElement('blockquote')
      q.insert(0, [paragraph(block.text)])
      return q
    }
    case 'callout': {
      const c = new Y.XmlElement('callout')
      c.setAttribute('type', block.type)
      c.insert(0, [paragraph(block.text)])
      return c
    }
    case 'code': {
      const code = new Y.XmlElement('codeBlock')
      code.setAttribute('language', block.lang)
      code.insert(0, [new Y.XmlText(block.text)])
      return code
    }
    case 'bullets': {
      const list = new Y.XmlElement('bulletList')
      list.insert(
        0,
        block.items.map((t) => {
          const li = new Y.XmlElement('listItem')
          li.insert(0, [paragraph(t)])
          return li
        })
      )
      return list
    }
    case 'tasks': {
      const list = new Y.XmlElement('taskList')
      list.insert(
        0,
        block.items.map((item) => {
          const task = new Y.XmlElement('taskItem')
          // Only set when true: a literal "false" string reads as truthy and
          // renders an unchecked task as checked (absent ⇒ boolean false).
          if (item.checked) task.setAttribute('checked', 'true')
          task.insert(0, [paragraph(item.text)])
          return task
        })
      )
      return list
    }
    case 'hr':
      return new Y.XmlElement('horizontalRule')
    case 'toggle': {
      const toggle = new Y.XmlElement('toggle')
      toggle.setAttribute('summary', block.summary)
      toggle.setAttribute('open', String(block.open ?? true))
      toggle.insert(0, block.children.map(renderBlock))
      return toggle
    }
    case 'mermaid': {
      const m = new Y.XmlElement('mermaid')
      m.setAttribute('code', block.code)
      m.setAttribute('theme', block.theme ?? 'default')
      return m
    }
    case 'image': {
      const img = new Y.XmlElement('image')
      img.setAttribute('src', block.src)
      img.setAttribute('alt', block.alt ?? '')
      img.setAttribute('alignment', block.alignment ?? 'center')
      return img
    }
    case 'file': {
      const f = new Y.XmlElement('file')
      f.setAttribute('cid', block.cid)
      f.setAttribute('name', block.name)
      f.setAttribute('mimeType', block.mimeType)
      f.setAttribute('size', String(block.size))
      return f
    }
    case 'embed': {
      const e = new Y.XmlElement('embed')
      e.setAttribute('url', block.url)
      e.setAttribute('provider', block.provider)
      e.setAttribute('embedUrl', block.embedUrl)
      if (block.title) e.setAttribute('title', block.title)
      e.setAttribute('alignment', 'center')
      return e
    }
    case 'richLink': {
      const r = new Y.XmlElement('richLink')
      r.setAttribute('url', block.url)
      r.setAttribute('provider', 'generic')
      r.setAttribute('title', block.title)
      if (block.subtitle) r.setAttribute('subtitle', block.subtitle)
      r.setAttribute('icon', block.icon ?? '🔗')
      return r
    }
    case 'pageEmbed': {
      const embed = new Y.XmlElement('pageEmbed')
      embed.setAttribute('pageId', block.pageId)
      embed.setAttribute('title', block.title)
      embed.setAttribute('icon', block.icon)
      return embed
    }
    case 'databaseEmbed': {
      const db = new Y.XmlElement('databaseEmbed')
      db.setAttribute('databaseId', block.databaseId)
      db.setAttribute('viewType', block.viewType ?? 'table')
      db.setAttribute('showTitle', 'true')
      return db
    }
    case 'taskViewEmbed': {
      const tv = new Y.XmlElement('taskViewEmbed')
      tv.setAttribute('viewType', 'list')
      tv.setAttribute('showTitle', 'true')
      return tv
    }
  }
}

/** Build a rich page Y.Doc from a block list. */
export function buildRichPageDoc(
  nodeId: string,
  schemaId: SchemaIRI,
  title: string,
  icon: string,
  blocks: RichBlock[]
): Y.Doc {
  const ydoc = new Y.Doc({ guid: nodeId, gc: false })
  const fragment = ydoc.getXmlFragment('content')

  ydoc.transact(() => {
    fragment.push(blocks.map(renderBlock))
    const meta = ydoc.getMap('meta')
    meta.set('_schemaId', schemaId)
    meta.set('title', title)
    meta.set('icon', icon)
  })

  return ydoc
}
