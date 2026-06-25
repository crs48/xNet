/**
 * Flexible deterministic Yjs builder for rich pages driven by a block list, so
 * each seeded document can show distinct content and cross-link to other nodes
 * via `pageEmbed` atoms and inline `#tag` / `[[wikilink]]` text (parsed by the
 * editor's hashtag/wikilink extensions on render).
 */

import type { SchemaIRI } from '@xnetjs/data'
import * as Y from 'yjs'

export type RichBlock =
  | { kind: 'h'; level: 1 | 2 | 3; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'callout'; type: 'info' | 'tip' | 'warning' | 'note'; text: string }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'tasks'; items: Array<{ text: string; checked: boolean }> }
  | { kind: 'pageEmbed'; pageId: string; title: string; icon: string }

function paragraph(text: string): Y.XmlElement {
  const p = new Y.XmlElement('paragraph')
  p.insert(0, [new Y.XmlText(text)])
  return p
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
    for (const block of blocks) {
      switch (block.kind) {
        case 'h': {
          const h = new Y.XmlElement('heading')
          h.setAttribute('level', String(block.level))
          h.insert(0, [new Y.XmlText(block.text)])
          fragment.push([h])
          break
        }
        case 'p':
          fragment.push([paragraph(block.text)])
          break
        case 'quote': {
          const q = new Y.XmlElement('blockquote')
          q.insert(0, [paragraph(block.text)])
          fragment.push([q])
          break
        }
        case 'callout': {
          const c = new Y.XmlElement('callout')
          c.setAttribute('type', block.type)
          c.insert(0, [paragraph(block.text)])
          fragment.push([c])
          break
        }
        case 'code': {
          const code = new Y.XmlElement('codeBlock')
          code.setAttribute('language', block.lang)
          code.insert(0, [new Y.XmlText(block.text)])
          fragment.push([code])
          break
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
          fragment.push([list])
          break
        }
        case 'tasks': {
          const list = new Y.XmlElement('taskList')
          list.insert(
            0,
            block.items.map((item) => {
              const task = new Y.XmlElement('taskItem')
              task.setAttribute('checked', String(item.checked))
              task.insert(0, [paragraph(item.text)])
              return task
            })
          )
          fragment.push([list])
          break
        }
        case 'pageEmbed': {
          const embed = new Y.XmlElement('pageEmbed')
          embed.setAttribute('pageId', block.pageId)
          embed.setAttribute('title', block.title)
          embed.setAttribute('icon', block.icon)
          fragment.push([embed])
          break
        }
      }
    }

    const meta = ydoc.getMap('meta')
    meta.set('_schemaId', schemaId)
    meta.set('title', title)
    meta.set('icon', icon)
  })

  return ydoc
}
