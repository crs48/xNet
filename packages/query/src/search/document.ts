/**
 * Shared page-document search helpers.
 *
 * Search, snippets, and backlink extraction should walk the same Yjs content
 * tree so app surfaces stay behaviorally aligned.
 */
import type { YDoc } from '@xnetjs/data'

const CONTENT_FRAGMENT_NAMES = ['content', 'default', 'prosemirror', '']
const BLOCK_NODES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'codeBlock',
  'callout',
  'toggle',
  'details',
  'summary'
])

type RawLinkMatch = {
  href: string
  title: string
  start: number
  end: number
}

type XmlNodeWithChildren = {
  length: number
  get(index: number): unknown
}

type XmlElementLike = XmlNodeWithChildren & {
  nodeName: string
  getAttribute(name: string): unknown
}

type XmlTextLike = {
  toString(): string
}

export interface DocumentLinkMatch {
  href: string
  title: string
  text: string
  context: string
  start: number
  end: number
}

export interface SearchDocumentContent {
  text: string
  links: DocumentLinkMatch[]
}

export function extractDocumentText(doc: YDoc): string {
  return extractSearchDocument(doc).text
}

export function extractDocumentLinks(doc: YDoc): DocumentLinkMatch[] {
  return extractSearchDocument(doc).links
}

export function extractBacklinks(doc: YDoc, targetId: string): DocumentLinkMatch[] {
  return extractDocumentLinks(doc).filter((link) => link.href === targetId)
}

export function createSearchSnippet(text: string, query: string, maxLength = 96): string {
  const normalizedText = compactWhitespace(text)
  if (!normalizedText) return ''

  const normalizedQuery = compactWhitespace(query).toLowerCase()
  if (!normalizedQuery) {
    return clipSnippet(normalizedText, 0, Math.min(maxLength, normalizedText.length))
  }

  const matchIndex = normalizedText.toLowerCase().indexOf(normalizedQuery)
  if (matchIndex === -1) {
    return clipSnippet(normalizedText, 0, Math.min(maxLength, normalizedText.length))
  }

  return clipSnippet(normalizedText, matchIndex, Math.max(maxLength, normalizedQuery.length))
}

export function extractSearchDocument(doc: YDoc): SearchDocumentContent {
  const fragment = findContentFragment(doc)
  if (!fragment) {
    return { text: '', links: [] }
  }

  const state = {
    parts: [] as string[],
    length: 0,
    links: [] as RawLinkMatch[]
  }

  walkNode(fragment, state)

  const rawText = state.parts.join('')
  const links = state.links
    .map((link) => {
      const text = compactWhitespace(rawText.slice(link.start, link.end))
      const title = link.title || text
      if (!link.href || !title) return null

      return {
        href: link.href,
        title,
        text,
        context: createContextSnippet(rawText, link.start, link.end),
        start: link.start,
        end: link.end
      }
    })
    .filter((link): link is DocumentLinkMatch => link !== null)

  return {
    text: compactWhitespace(rawText),
    links
  }
}

function findContentFragment(doc: YDoc): XmlNodeWithChildren | null {
  for (const name of CONTENT_FRAGMENT_NAMES) {
    try {
      const fragment = doc.getXmlFragment(name)
      if (fragment.length > 0) {
        return fragment
      }
    } catch {
      // Ignore unknown fragment names.
    }
  }

  return null
}

function walkNode(
  node: XmlNodeWithChildren,
  state: {
    parts: string[]
    length: number
    links: RawLinkMatch[]
  }
): void {
  for (let index = 0; index < node.length; index++) {
    const child = node.get(index)

    if (isXmlElement(child)) {
      if (child.nodeName === 'hardBreak' || child.nodeName === 'br') {
        appendText(state, '\n')
        continue
      }

      if (child.nodeName === 'horizontalRule') {
        appendBlockBreak(state)
        continue
      }

      const linkStart = state.length
      walkNode(child, state)
      const linkEnd = state.length

      if (child.nodeName === 'wikilink') {
        const title = readStringAttribute(child, 'title') ?? ''
        const href = readStringAttribute(child, 'href') ?? generatePageId(title)
        if (href && linkEnd > linkStart) {
          state.links.push({
            href,
            title,
            start: linkStart,
            end: linkEnd
          })
        }
      }

      if (BLOCK_NODES.has(child.nodeName)) {
        appendBlockBreak(state)
      }
      continue
    }

    if (isXmlText(child)) {
      appendText(state, child.toString())
    }
  }
}

function appendText(
  state: {
    parts: string[]
    length: number
  },
  value: string
): void {
  if (!value) return
  state.parts.push(value)
  state.length += value.length
}

function appendBlockBreak(state: { parts: string[]; length: number }): void {
  const last = state.parts[state.parts.length - 1]
  if (!last || last.endsWith('\n')) {
    return
  }

  state.parts.push('\n')
  state.length += 1
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function clipSnippet(text: string, focusStart: number, width: number): string {
  if (text.length <= width) return compactWhitespace(text)

  const half = Math.floor(width / 2)
  const start = Math.max(0, focusStart - half)
  const end = Math.min(text.length, start + width)
  const adjustedStart = Math.max(0, end - width)
  const excerpt = compactWhitespace(text.slice(adjustedStart, end))

  return `${adjustedStart > 0 ? '…' : ''}${excerpt}${end < text.length ? '…' : ''}`
}

function createContextSnippet(text: string, start: number, end: number, maxLength = 96): string {
  return clipSnippet(text, start, Math.max(maxLength, end - start))
}

function readStringAttribute(node: XmlElementLike, key: string): string | null {
  const value = node.getAttribute(key)
  return typeof value === 'string' && value.length > 0 ? value : null
}

function generatePageId(title: string): string {
  if (!title) return ''
  return `default/${title.toLowerCase().replace(/\s+/g, '-')}`
}

function isXmlElement(value: unknown): value is XmlElementLike {
  return (
    typeof value === 'object' && value !== null && 'nodeName' in value && 'getAttribute' in value
  )
}

function isXmlText(value: unknown): value is XmlTextLike {
  return (
    typeof value === 'object' && value !== null && 'toString' in value && !('nodeName' in value)
  )
}
