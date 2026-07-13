/**
 * Lazy legacy import (0312): best-effort conversion of a v3 TipTap
 * document (Y.XmlFragment 'content') into markdown, for one-time parsing
 * into the v4 BlockNote fragment ('content-v4').
 *
 * Deliberately lossy — embeds, mentions and other rich nodes degrade to
 * text or links. Walks the Yjs XML tree directly (no TipTap schema
 * needed), so it survives Phase 5's removal of the TipTap extensions.
 */
import * as Y from 'yjs'

/** Meta-map flag marking a completed (or unnecessary) legacy import. */
export const LEGACY_IMPORT_FLAG = 'content-v4-imported'

function textOf(node: Y.XmlText): string {
  // Y.XmlText deltas can carry embedded objects (old inline atoms like
  // mentions); toDelta() preserves them where toString() would emit XML.
  let out = ''
  for (const op of node.toDelta() as Array<{ insert?: unknown; attributes?: Record<string, unknown> }>) {
    if (typeof op.insert === 'string') {
      out += op.insert
    }
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

/** Old inline atoms degrade to readable text. */
function inlineAtomText(element: Y.XmlElement): string {
  const name = element.nodeName
  const attrs = element.getAttributes() as Record<string, unknown>
  switch (name) {
    case 'taskMention':
    case 'personMention':
    case 'mention':
      return `@${String(attrs.label ?? attrs.id ?? '')}`
    case 'hashtag':
      return `#${String(attrs.name ?? '')}`
    case 'smartReference':
    case 'databaseReference':
      return String(attrs.title ?? attrs.url ?? attrs.databaseId ?? '')
    case 'inlineMath':
      return `$${String(attrs.latex ?? '')}$`
    case 'emoji':
      return String(attrs.name ? `:${String(attrs.name)}:` : '')
    default:
      return inlineText(element)
  }
}

interface WalkContext {
  depth: number
  ordered: boolean
  index: number
}

function blockToMarkdown(element: Y.XmlElement, ctx: WalkContext, lines: string[]): void {
  const name = element.nodeName
  const attrs = element.getAttributes() as Record<string, unknown>
  const indent = '  '.repeat(ctx.depth)

  switch (name) {
    case 'paragraph': {
      const text = inlineText(element)
      if (text.trim()) lines.push(indent + text)
      break
    }
    case 'heading': {
      const level = Math.min(Math.max(Number(attrs.level ?? 1), 1), 6)
      lines.push(`${'#'.repeat(level)} ${inlineText(element)}`)
      break
    }
    case 'codeBlock': {
      const lang = typeof attrs.language === 'string' ? attrs.language : ''
      lines.push('```' + lang)
      lines.push(inlineText(element))
      lines.push('```')
      break
    }
    case 'blockquote':
    case 'callout': {
      const inner: string[] = []
      walkChildren(element, { ...ctx, depth: 0 }, inner)
      for (const line of inner) lines.push(`> ${line}`)
      break
    }
    case 'bulletList':
      walkList(element, { ...ctx, ordered: false }, lines)
      break
    case 'orderedList':
      walkList(element, { ...ctx, ordered: true }, lines)
      break
    case 'taskList':
      walkTaskList(element, ctx, lines)
      break
    case 'horizontalRule':
      lines.push('---')
      break
    case 'image':
      lines.push(`![${String(attrs.alt ?? '')}](${String(attrs.src ?? attrs.cid ?? '')})`)
      break
    case 'file':
      lines.push(`[${String(attrs.name ?? 'file')}](${String(attrs.cid ?? '')})`)
      break
    case 'embed':
    case 'richLink':
      lines.push(String(attrs.url ?? ''))
      break
    case 'pageEmbed':
      lines.push(`[[${String(attrs.title ?? attrs.nodeId ?? '')}]]`)
      break
    case 'mermaid': {
      lines.push('```mermaid')
      lines.push(String(attrs.code ?? inlineText(element)))
      lines.push('```')
      break
    }
    case 'toggle': {
      // Toggles flatten: summary as bold line, contents below.
      walkChildren(element, ctx, lines)
      break
    }
    default:
      // Unknown container: recurse; unknown leaf: emit its text.
      if (element.length > 0) {
        walkChildren(element, ctx, lines)
      } else {
        const text = inlineText(element)
        if (text.trim()) lines.push(indent + text)
      }
  }
}

function walkList(element: Y.XmlElement, ctx: WalkContext, lines: string[]): void {
  let index = 1
  for (let i = 0; i < element.length; i++) {
    const child = element.get(i)
    if (!(child instanceof Y.XmlElement) || child.nodeName !== 'listItem') continue
    const inner: string[] = []
    walkChildren(child, { depth: 0, ordered: false, index: 0 }, inner)
    const marker = ctx.ordered ? `${index}.` : '-'
    inner.forEach((line, j) => {
      const prefix = '  '.repeat(ctx.depth)
      lines.push(j === 0 ? `${prefix}${marker} ${line}` : `${prefix}  ${line}`)
    })
    index++
  }
}

function walkTaskList(element: Y.XmlElement, ctx: WalkContext, lines: string[]): void {
  for (let i = 0; i < element.length; i++) {
    const child = element.get(i)
    if (!(child instanceof Y.XmlElement) || child.nodeName !== 'taskItem') continue
    const checkedAttr = child.getAttribute('checked') as unknown
    const checked = checkedAttr === 'true' || checkedAttr === true
    const inner: string[] = []
    walkChildren(child, { depth: 0, ordered: false, index: 0 }, inner)
    const prefix = '  '.repeat(ctx.depth)
    inner.forEach((line, j) => {
      lines.push(j === 0 ? `${prefix}- [${checked ? 'x' : ' '}] ${line}` : `${prefix}  ${line}`)
    })
  }
}

function walkChildren(
  element: Y.XmlElement | Y.XmlFragment,
  ctx: WalkContext,
  lines: string[]
): void {
  for (let i = 0; i < element.length; i++) {
    const child = element.get(i)
    if (child instanceof Y.XmlElement) {
      blockToMarkdown(child, ctx, lines)
    } else if (child instanceof Y.XmlText) {
      const text = textOf(child)
      if (text.trim()) lines.push(text)
    }
  }
}

/** Convert a legacy TipTap fragment to markdown (lossy, dependency-free). */
export function legacyFragmentToMarkdown(fragment: Y.XmlFragment): string {
  const lines: string[] = []
  walkChildren(fragment, { depth: 0, ordered: false, index: 0 }, lines)
  return lines.join('\n\n')
}

/**
 * Whether a lazy import should run: v4 fragment empty, legacy fragment has
 * content, and no peer has already imported (meta flag).
 */
export function shouldImportLegacyContent(
  ydoc: Y.Doc,
  v4Field: string,
  legacyField: string
): boolean {
  const meta = ydoc.getMap('meta')
  if (meta.get(LEGACY_IMPORT_FLAG)) return false
  const v4 = ydoc.getXmlFragment(v4Field)
  if (v4.length > 0) return false
  const legacy = ydoc.getXmlFragment(legacyField)
  return legacy.length > 0
}

/** Mark the import as done (idempotence across peers/reloads). */
export function markLegacyImportDone(ydoc: Y.Doc): void {
  ydoc.getMap('meta').set(LEGACY_IMPORT_FLAG, true)
}
