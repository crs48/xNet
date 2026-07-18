/**
 * Summary-tier text extraction from a v4 BlockNote fragment (0346).
 *
 * Page embeds render the target document's first blocks as plain text —
 * live (the caller re-runs on Y.Doc updates), read-only, and safely
 * non-recursive (nested embeds degrade to a marker line instead of
 * rendering). Walks the Yjs XML tree directly, same idiom as
 * legacy-import.ts, so no BlockNote schema instance is needed.
 */
import * as Y from 'yjs'
import { EDITOR_DOCUMENT_FRAGMENT_FIELD } from './constants'

function textOf(node: Y.XmlText): string {
  let out = ''
  for (const op of node.toDelta() as Array<{ insert?: unknown }>) {
    if (typeof op.insert === 'string') out += op.insert
  }
  return out
}

function inlineText(element: Y.XmlElement | Y.XmlFragment): string {
  let out = ''
  for (let i = 0; i < element.length; i++) {
    const child = element.get(i)
    if (child instanceof Y.XmlText) {
      out += textOf(child)
    } else if (child instanceof Y.XmlElement) {
      out += inlineAtomText(child)
    }
  }
  return out
}

/** Inline atoms degrade to readable text (mentions, tags, math). */
function inlineAtomText(element: Y.XmlElement): string {
  const name = element.nodeName
  const attrs = element.getAttributes() as Record<string, unknown>
  switch (name) {
    case 'mention':
      return `@${String(attrs.label ?? attrs.id ?? '')}`
    case 'hashtag':
      return `#${String(attrs.name ?? '')}`
    case 'wikilink':
      return String(attrs.title ?? attrs.href ?? '')
    case 'inlineMath':
      return `$${String(attrs.latex ?? '')}$`
    default:
      return inlineText(element)
  }
}

/** One extracted preview line. */
export interface DocPreviewLine {
  text: string
  /** Content element name ('paragraph', 'heading', 'databaseEmbed', …) */
  kind: string
}

/** Block-level atoms that carry no inline text — shown as a marker line. */
const BLOCK_ATOM_MARKERS: Record<string, string> = {
  databaseEmbed: '⊞ Embedded database',
  pageEmbed: '📄 Embedded page',
  taskViewEmbed: '☑ Task view',
  embed: '▶ Media embed',
  richLink: '🔗 Link',
  mermaid: '◇ Diagram',
  image: '🖼 Image',
  file: '📎 File'
}

function collectLines(
  container: Y.XmlElement | Y.XmlFragment,
  lines: DocPreviewLine[],
  max: number
): void {
  for (let i = 0; i < container.length && lines.length < max; i++) {
    const child = container.get(i)
    if (!(child instanceof Y.XmlElement)) continue
    const name = child.nodeName
    if (name === 'blockGroup' || name === 'blockContainer') {
      collectLines(child, lines, max)
      continue
    }
    const marker = BLOCK_ATOM_MARKERS[name]
    if (marker) {
      lines.push({ text: marker, kind: name })
      continue
    }
    const text = inlineText(child).trim()
    if (text) lines.push({ text, kind: name })
  }
}

/**
 * Extract up to `maxLines` non-empty text lines from a document's v4
 * fragment. Returns [] for empty or not-yet-synced documents.
 */
export function extractDocPreviewLines(
  ydoc: Y.Doc,
  maxLines: number,
  field: string = EDITOR_DOCUMENT_FRAGMENT_FIELD
): DocPreviewLine[] {
  const fragment = ydoc.getXmlFragment(field)
  const lines: DocPreviewLine[] = []
  collectLines(fragment, lines, Math.max(0, maxLines))
  return lines
}
