/**
 * Structured hashtag extraction (exploration 0169).
 *
 * The composer — not the reader — declares tags: when a page or comment
 * document is saved, it is walked once and every hashtag pill carrying a
 * Tag node id becomes an entry in the node's `tags` relation. Body text
 * is never parsed for '#' (the structured-mentions invariant from 0168
 * applied to tags).
 */
import type { JSONContent } from '@tiptap/core'

function collectTagIds(node: JSONContent | null | undefined, ids: Set<string>): void {
  if (!node) return
  const id = node.attrs?.id
  if (node.type === 'hashtag' && typeof id === 'string' && id.length > 0) {
    ids.add(id)
  }
  for (const child of node.content ?? []) {
    collectTagIds(child, ids)
  }
}

/** All Tag node ids referenced via pills in the document, deduped, in walk order. */
export function extractTagIds(doc: JSONContent | null | undefined): string[] {
  const ids = new Set<string>()
  collectTagIds(doc, ids)
  return [...ids]
}

/**
 * The `tags` relation value for a composed document, or undefined when
 * nothing is tagged (so the property is omitted entirely).
 */
export function tagsFromDoc(doc: JSONContent | null | undefined): string[] | undefined {
  const ids = extractTagIds(doc)
  return ids.length > 0 ? ids : undefined
}
