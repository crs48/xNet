/**
 * Yjs-fragment ↔ markdown conversion for AI page projections (0312).
 *
 * v4 pages persist BlockNote's ProseMirror schema in the Y.XmlFragment
 * `content-v4`: the fragment holds one `blockGroup`, each block is a
 * `blockContainer` (with a unique `id` attribute) wrapping one blockContent
 * element (paragraph/heading/…) plus an optional nested `blockGroup` of
 * child blocks. v3 and earlier documents live in the legacy `content`
 * fragment (TipTap schema) and are read-only here.
 *
 * Both directions walk the Yjs XML tree directly — no editor, DOM, or
 * BlockNote dependency — mirroring the dependency-light approach of the
 * editor package's lazy legacy importer. The write path covers the markdown
 * subset AI agents emit (paragraphs, headings, bullet/numbered/check lists,
 * fenced code, quotes, callouts, wikilinks); reading is broader and degrades
 * unknown blocks to text, like the legacy importer.
 */
import * as Y from 'yjs'
import type { AiPageMarkdownApplyAdapter, AiPageMarkdownApplyAdapterResult } from './service'

// ─── Fields ─────────────────────────────────────────────────────────────────

/** The Y.XmlFragment field that holds v4 (BlockNote) page documents. */
export const XNET_PAGE_FRAGMENT_FIELD = 'content-v4'

/** The legacy (TipTap, v3 and below) fragment field, read as a fallback. */
export const XNET_PAGE_LEGACY_FRAGMENT_FIELD = 'content'

export type XNetPageFragmentReadOptions = {
  /** BlockNote fragment field. Defaults to `content-v4`. */
  field?: string
  /** Legacy TipTap fragment field read when the v4 fragment is empty. */
  legacyField?: string
}

// ─── Shared inline reading ──────────────────────────────────────────────────

type Attrs = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function attrString(attrs: Attrs, ...keys: string[]): string {
  for (const key of keys) {
    const value = attrs[key]
    if (value !== undefined && value !== null && value !== '') return String(value)
  }
  return ''
}

function markWrap(text: string, attributes: Attrs | undefined): string {
  if (!attributes || text === '') return text
  let out = text
  if (attributes.code) out = `\`${out}\``
  if (attributes.bold) out = `**${out}**`
  if (attributes.italic) out = `*${out}*`
  const link = attributes.link
  const href = isRecord(link) ? link.href : link
  if (typeof href === 'string' && href) out = `[${out}](${href})`
  return out
}

function textToMarkdown(node: Y.XmlText): string {
  let out = ''
  const delta = node.toDelta() as Array<{ insert?: unknown; attributes?: Attrs }>
  for (const op of delta) {
    if (typeof op.insert === 'string') {
      out += markWrap(op.insert, op.attributes)
    } else if (isRecord(op.insert)) {
      // Older docs can carry inline atoms as delta embeds.
      out += embeddedAtomToMarkdown(op.insert)
    }
  }
  return out
}

function embeddedAtomToMarkdown(embed: Record<string, unknown>): string {
  const type = typeof embed.type === 'string' ? embed.type : ''
  const attrs = isRecord(embed.attrs) ? embed.attrs : embed
  return atomToMarkdown(type, attrs) ?? ''
}

/** Inline atoms render as their markdown-ish text forms. */
function atomToMarkdown(name: string, attrs: Attrs): string | null {
  switch (name) {
    case 'mention':
    case 'personMention':
    case 'taskMention':
      return `@${attrString(attrs, 'label', 'id')}`
    case 'hashtag':
      return `#${attrString(attrs, 'name')}`
    case 'wikilink':
      return `[[${attrString(attrs, 'title', 'href')}]]`
    case 'inlineMath':
      return `$${attrString(attrs, 'latex')}$`
    case 'smartReference':
    case 'databaseReference':
      return attrString(attrs, 'title', 'url', 'databaseId')
    case 'emoji': {
      const emoji = attrString(attrs, 'name')
      return emoji ? `:${emoji}:` : ''
    }
    default:
      return null
  }
}

function inlineToMarkdown(element: Y.XmlElement | Y.XmlFragment): string {
  let out = ''
  for (let i = 0; i < element.length; i++) {
    const child = element.get(i)
    if (child instanceof Y.XmlText) {
      out += textToMarkdown(child)
    } else if (child instanceof Y.XmlElement) {
      const atom = atomToMarkdown(child.nodeName, child.getAttributes() as Attrs)
      out += atom ?? inlineToMarkdown(child)
    }
  }
  return out
}

// ─── BlockNote fragment → markdown ─────────────────────────────────────────

type ChunkKind = 'list' | 'block'

type MarkdownChunk = { text: string; kind: ChunkKind }

const LIST_ITEM_TYPES = new Set(['bulletListItem', 'numberedListItem', 'checkListItem'])

function elementChildren(element: Y.XmlElement | Y.XmlFragment): Y.XmlElement[] {
  const children: Y.XmlElement[] = []
  for (let i = 0; i < element.length; i++) {
    const child = element.get(i)
    if (child instanceof Y.XmlElement) children.push(child)
  }
  return children
}

function joinChunks(chunks: MarkdownChunk[]): string {
  let out = ''
  chunks.forEach((chunk, index) => {
    if (index > 0) {
      const previous = chunks[index - 1]
      out += previous.kind === 'list' && chunk.kind === 'list' ? '\n' : '\n\n'
    }
    out += chunk.text
  })
  return out
}

function indentLines(text: string, indent: string): string {
  return text
    .split('\n')
    .map((line) => (line ? indent + line : line))
    .join('\n')
}

function tableToMarkdown(table: Y.XmlElement): string {
  const rows: string[][] = []
  const visit = (element: Y.XmlElement): void => {
    for (const child of elementChildren(element)) {
      if (child.nodeName === 'tableRow') {
        const cells: string[] = []
        for (const cell of elementChildren(child)) {
          if (cell.nodeName === 'tableCell' || cell.nodeName === 'tableHeader') {
            cells.push(inlineToMarkdown(cell).replace(/\n/g, ' ').trim())
          }
        }
        rows.push(cells)
      } else {
        visit(child)
      }
    }
  }
  visit(table)
  if (rows.length === 0) return ''

  const lines = [`| ${rows[0].join(' | ')} |`, `| ${rows[0].map(() => '---').join(' | ')} |`]
  for (const row of rows.slice(1)) lines.push(`| ${row.join(' | ')} |`)
  return lines.join('\n')
}

/** One blockContent element → markdown text (no children, no indent). */
function blockContentToMarkdown(content: Y.XmlElement, orderedIndex: number): string {
  const attrs = content.getAttributes() as Attrs
  switch (content.nodeName) {
    case 'paragraph':
      return inlineToMarkdown(content)
    case 'heading': {
      const level = Math.min(Math.max(Number(attrs.level ?? 1) || 1, 1), 6)
      return `${'#'.repeat(level)} ${inlineToMarkdown(content)}`
    }
    case 'bulletListItem':
      return `- ${inlineToMarkdown(content)}`
    case 'numberedListItem':
      return `${orderedIndex}. ${inlineToMarkdown(content)}`
    case 'checkListItem': {
      const checked = attrs.checked === true || attrs.checked === 'true'
      return `- [${checked ? 'x' : ' '}] ${inlineToMarkdown(content)}`
    }
    case 'codeBlock': {
      const language = typeof attrs.language === 'string' ? attrs.language : ''
      return `\`\`\`${language}\n${inlineToMarkdown(content)}\n\`\`\``
    }
    case 'quote':
      return inlineToMarkdown(content)
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
    case 'callout': {
      const kind = attrString(attrs, 'kind') || 'info'
      return `> [!${kind}] ${inlineToMarkdown(content)}`
    }
    case 'table':
      return tableToMarkdown(content)
    case 'mermaid':
      return `\`\`\`mermaid\n${attrString(attrs, 'code') || inlineToMarkdown(content)}\n\`\`\``
    case 'embed':
    case 'richLink':
      return attrString(attrs, 'url')
    case 'pageEmbed':
      return `[[${attrString(attrs, 'title', 'nodeId')}]]`
    case 'image':
      return `![${attrString(attrs, 'alt')}](${attrString(attrs, 'src', 'cid')})`
    case 'divider':
    case 'horizontalRule':
      return '---'
    default:
      // Unknown blockContent: degrade to its inline text.
      return inlineToMarkdown(content)
  }
}

function blockGroupToChunks(group: Y.XmlElement | Y.XmlFragment): MarkdownChunk[] {
  const chunks: MarkdownChunk[] = []
  let orderedIndex = 0

  for (const container of elementChildren(group)) {
    if (container.nodeName !== 'blockContainer') {
      // Tolerate schema drift: recurse through unexpected wrappers.
      chunks.push(...blockGroupToChunks(container))
      continue
    }

    const children = elementChildren(container)
    const content = children.find((child) => child.nodeName !== 'blockGroup') ?? null
    const childGroup = children.find((child) => child.nodeName === 'blockGroup') ?? null

    const type = content?.nodeName ?? ''
    orderedIndex = type === 'numberedListItem' ? orderedIndex + 1 : 0

    const kind: ChunkKind = LIST_ITEM_TYPES.has(type) ? 'list' : 'block'
    let text = content ? blockContentToMarkdown(content, orderedIndex) : ''

    if (childGroup) {
      // Nested blocks indent two spaces below their parent (list nesting).
      const nested = joinChunks(blockGroupToChunks(childGroup))
      if (nested) {
        const separator = kind === 'list' ? '\n' : '\n\n'
        text = text ? `${text}${separator}${indentLines(nested, '  ')}` : indentLines(nested, '  ')
      }
    }

    if (text.trim()) chunks.push({ text, kind })
  }

  return chunks
}

/** Convert a BlockNote (`content-v4`) fragment to markdown. */
export function blockNoteFragmentToMarkdown(fragment: Y.XmlFragment): string {
  return joinChunks(blockGroupToChunks(fragment))
}

// ─── Legacy (TipTap) fragment → markdown ────────────────────────────────────

function legacyBlockToLines(element: Y.XmlElement, lines: string[]): void {
  const attrs = element.getAttributes() as Attrs
  switch (element.nodeName) {
    case 'paragraph': {
      const text = inlineToMarkdown(element)
      if (text.trim()) lines.push(text)
      break
    }
    case 'heading': {
      const level = Math.min(Math.max(Number(attrs.level ?? 1) || 1, 1), 6)
      lines.push(`${'#'.repeat(level)} ${inlineToMarkdown(element)}`)
      break
    }
    case 'codeBlock': {
      const language = typeof attrs.language === 'string' ? attrs.language : ''
      lines.push(`\`\`\`${language}\n${inlineToMarkdown(element)}\n\`\`\``)
      break
    }
    case 'blockquote':
    case 'callout': {
      const inner: string[] = []
      legacyChildrenToLines(element, inner)
      lines.push(inner.map((line) => indentLines(line, '> ').replace(/^> $/gm, '>')).join('\n>\n'))
      break
    }
    case 'bulletList':
      legacyListToLines(element, false, lines)
      break
    case 'orderedList':
      legacyListToLines(element, true, lines)
      break
    case 'taskList':
      legacyTaskListToLines(element, lines)
      break
    case 'horizontalRule':
      lines.push('---')
      break
    case 'image':
      lines.push(`![${attrString(attrs, 'alt')}](${attrString(attrs, 'src', 'cid')})`)
      break
    case 'embed':
    case 'richLink':
      lines.push(attrString(attrs, 'url'))
      break
    case 'pageEmbed':
      lines.push(`[[${attrString(attrs, 'title', 'nodeId')}]]`)
      break
    case 'mermaid':
      lines.push(`\`\`\`mermaid\n${attrString(attrs, 'code') || inlineToMarkdown(element)}\n\`\`\``)
      break
    default:
      if (element.length > 0 && elementChildren(element).length > 0) {
        legacyChildrenToLines(element, lines)
      } else {
        const text = inlineToMarkdown(element)
        if (text.trim()) lines.push(text)
      }
  }
}

function legacyListToLines(element: Y.XmlElement, ordered: boolean, lines: string[]): void {
  const items: string[] = []
  let index = 1
  for (const child of elementChildren(element)) {
    if (child.nodeName !== 'listItem') continue
    const inner: string[] = []
    legacyChildrenToLines(child, inner)
    const marker = ordered ? `${index}.` : '-'
    items.push(`${marker} ${indentLines(inner.join('\n'), '  ').trimStart()}`)
    index += 1
  }
  if (items.length > 0) lines.push(items.join('\n'))
}

function legacyTaskListToLines(element: Y.XmlElement, lines: string[]): void {
  const items: string[] = []
  for (const child of elementChildren(element)) {
    if (child.nodeName !== 'taskItem') continue
    const checkedAttr = child.getAttribute('checked') as unknown
    const checked = checkedAttr === true || checkedAttr === 'true'
    const inner: string[] = []
    legacyChildrenToLines(child, inner)
    items.push(`- [${checked ? 'x' : ' '}] ${indentLines(inner.join('\n'), '  ').trimStart()}`)
  }
  if (items.length > 0) lines.push(items.join('\n'))
}

function legacyChildrenToLines(element: Y.XmlElement | Y.XmlFragment, lines: string[]): void {
  for (let i = 0; i < element.length; i++) {
    const child = element.get(i)
    if (child instanceof Y.XmlElement) {
      legacyBlockToLines(child, lines)
    } else if (child instanceof Y.XmlText) {
      const text = textToMarkdown(child)
      if (text.trim()) lines.push(text)
    }
  }
}

/** Convert a legacy TipTap (`content`) fragment to markdown (lossy). */
export function legacyFragmentToMarkdown(fragment: Y.XmlFragment): string {
  const lines: string[] = []
  legacyChildrenToLines(fragment, lines)
  return lines.join('\n\n')
}

/**
 * Read a page Y.Doc as markdown: the BlockNote `content-v4` fragment when it
 * has content, otherwise the legacy TipTap `content` fragment.
 */
export function xnetPageFragmentToMarkdown(
  doc: Y.Doc,
  options: XNetPageFragmentReadOptions = {}
): string {
  const fragment = doc.getXmlFragment(options.field ?? XNET_PAGE_FRAGMENT_FIELD)
  if (fragment.length > 0) return blockNoteFragmentToMarkdown(fragment)

  const legacy = doc.getXmlFragment(options.legacyField ?? XNET_PAGE_LEGACY_FRAGMENT_FIELD)
  if (legacy.length > 0) return legacyFragmentToMarkdown(legacy)

  return ''
}

// ─── Markdown → BlockNote fragment ──────────────────────────────────────────

export type XNetPageFragmentWriteOptions = {
  /** BlockNote fragment field. Defaults to `content-v4`. */
  field?: string
  /** Block id factory (BlockNote requires a unique `id` per blockContainer). */
  generateBlockId?: () => string
}

type ParsedBlock = {
  type:
    | 'paragraph'
    | 'heading'
    | 'bulletListItem'
    | 'numberedListItem'
    | 'checkListItem'
    | 'codeBlock'
    | 'quote'
    | 'callout'
  props: Record<string, string | number | boolean>
  text: string
  children: ParsedBlock[]
}

const HEADING_PATTERN = /^(#{1,6})\s+(.*)$/
const FENCE_PATTERN = /^```([A-Za-z0-9_-]*)\s*$/
const LIST_ITEM_PATTERN = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(.*)$/
const CHECK_PATTERN = /^\[([ xX])\]\s+(.*)$/
const CALLOUT_PATTERN = /^\[!([a-z][a-z0-9-]*)\]\s?(.*)$/i

function parseMarkdownBlocks(markdown: string): ParsedBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: ParsedBlock[] = []
  // Stack of open list items by indent level, for nested lists.
  let listStack: Array<{ indent: number; block: ParsedBlock }> = []
  let index = 0

  const pushTop = (block: ParsedBlock): void => {
    blocks.push(block)
    listStack = []
  }

  while (index < lines.length) {
    const line = lines[index]

    if (!line.trim()) {
      index += 1
      listStack = []
      continue
    }

    const fence = FENCE_PATTERN.exec(line.trim())
    if (fence) {
      const code: string[] = []
      index += 1
      while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) {
        code.push(lines[index])
        index += 1
      }
      index += 1 // closing fence
      pushTop({
        type: 'codeBlock',
        props: fence[1] ? { language: fence[1] } : {},
        text: code.join('\n'),
        children: []
      })
      continue
    }

    const heading = HEADING_PATTERN.exec(line)
    if (heading) {
      pushTop({
        type: 'heading',
        props: { level: heading[1].length },
        text: heading[2],
        children: []
      })
      index += 1
      continue
    }

    const listItem = LIST_ITEM_PATTERN.exec(line)
    if (listItem) {
      const indent = Math.floor(listItem[1].replace(/\t/g, '  ').length / 2)
      const rest = listItem[4]
      const check = listItem[2] ? CHECK_PATTERN.exec(rest) : null
      const block: ParsedBlock = check
        ? {
            type: 'checkListItem',
            props: { checked: check[1] !== ' ' },
            text: check[2],
            children: []
          }
        : {
            type: listItem[3] ? 'numberedListItem' : 'bulletListItem',
            props: {},
            text: rest,
            children: []
          }

      while (listStack.length > 0 && listStack[listStack.length - 1].indent >= indent) {
        listStack.pop()
      }
      const parent = listStack[listStack.length - 1]
      if (parent) {
        parent.block.children.push(block)
      } else {
        blocks.push(block)
      }
      listStack.push({ indent, block })
      index += 1
      continue
    }

    if (line.startsWith('>')) {
      const quoted: string[] = []
      while (index < lines.length && lines[index].startsWith('>')) {
        quoted.push(lines[index].replace(/^>\s?/, ''))
        index += 1
      }
      const callout = CALLOUT_PATTERN.exec(quoted[0] ?? '')
      if (callout) {
        pushTop({
          type: 'callout',
          props: { kind: callout[1].toLowerCase() },
          text: [callout[2], ...quoted.slice(1)].filter((part) => part !== '').join('\n'),
          children: []
        })
      } else {
        pushTop({ type: 'quote', props: {}, text: quoted.join('\n'), children: [] })
      }
      continue
    }

    // Paragraph: consecutive lines until a blank line or another block form.
    const paragraph: string[] = [line]
    index += 1
    while (index < lines.length) {
      const next = lines[index]
      if (
        !next.trim() ||
        HEADING_PATTERN.test(next) ||
        FENCE_PATTERN.test(next.trim()) ||
        LIST_ITEM_PATTERN.test(next) ||
        next.startsWith('>')
      ) {
        break
      }
      paragraph.push(next)
      index += 1
    }
    pushTop({ type: 'paragraph', props: {}, text: paragraph.join('\n'), children: [] })
  }

  return blocks
}

let blockIdCounter = 0

function defaultBlockId(): string {
  const cryptoApi = (globalThis as { crypto?: Crypto }).crypto
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID()
  blockIdCounter += 1
  return `ai-block-${Date.now().toString(36)}-${blockIdCounter}`
}

function setAttr(element: Y.XmlElement, name: string, value: string | number | boolean): void {
  // Yjs typings default XmlElement attrs to strings, but y-prosemirror stores
  // ProseMirror attr values natively (numbers, booleans) — match it.
  element.setAttribute(name, value as unknown as string)
}

const WIKILINK_SPLIT = /(\[\[[^\]\n]+\]\])/

/** Inline text with `[[Page Title]]` wikilinks lifted into inline atoms. */
function inlineNodesForText(text: string): Array<Y.XmlText | Y.XmlElement> {
  const nodes: Array<Y.XmlText | Y.XmlElement> = []
  for (const part of text.split(WIKILINK_SPLIT)) {
    if (!part) continue
    const wikilink = /^\[\[([^\]\n]+)\]\]$/.exec(part)
    if (wikilink) {
      const atom = new Y.XmlElement('wikilink')
      setAttr(atom, 'title', wikilink[1])
      setAttr(atom, 'href', '')
      nodes.push(atom)
    } else {
      nodes.push(new Y.XmlText(part))
    }
  }
  return nodes
}

function blockToYElement(block: ParsedBlock, generateBlockId: () => string): Y.XmlElement {
  const container = new Y.XmlElement('blockContainer')
  setAttr(container, 'id', generateBlockId())

  const content = new Y.XmlElement(block.type)
  for (const [key, value] of Object.entries(block.props)) setAttr(content, key, value)
  if (block.type === 'codeBlock') {
    // Code content is verbatim text — never wikilink-parsed.
    if (block.text) content.insert(0, [new Y.XmlText(block.text)])
  } else if (block.text) {
    content.insert(0, inlineNodesForText(block.text))
  }
  container.insert(0, [content])

  if (block.children.length > 0) {
    const group = new Y.XmlElement('blockGroup')
    group.insert(
      0,
      block.children.map((child) => blockToYElement(child, generateBlockId))
    )
    // blockContainer content = blockContent (index 0) + optional blockGroup.
    container.insert(1, [group])
  }

  return container
}

/**
 * Replace a page's BlockNote fragment with the given markdown (the AI apply
 * path). Runs in a single Yjs transaction; every blockContainer gets a fresh
 * unique id. Covers the AI markdown subset: paragraphs, headings,
 * bullet/numbered/check lists (2-space nesting), fenced code, quotes,
 * `> [!kind]` callouts, and `[[wikilinks]]`. Anything else lands as
 * paragraph text — never dropped.
 */
export function replaceXNetPageFragmentWithMarkdown(
  doc: Y.Doc,
  markdown: string,
  options: XNetPageFragmentWriteOptions = {}
): void {
  const fragment = doc.getXmlFragment(options.field ?? XNET_PAGE_FRAGMENT_FIELD)
  const generateBlockId = options.generateBlockId ?? defaultBlockId
  const blocks = parseMarkdownBlocks(markdown)

  doc.transact(() => {
    if (fragment.length > 0) fragment.delete(0, fragment.length)
    if (blocks.length === 0) return
    const group = new Y.XmlElement('blockGroup')
    fragment.insert(0, [group])
    group.insert(
      0,
      blocks.map((block) => blockToYElement(block, generateBlockId))
    )
  })
}

// ─── AI-surface adapter ─────────────────────────────────────────────────────

/** Resolves the live (or loaded) Y.Doc for a page node id. */
export type XNetPageDocResolver = (pageId: string) => Promise<Y.Doc | null> | Y.Doc | null

export type BlockNotePageMarkdownAdapterOptions = {
  resolveDoc: XNetPageDocResolver
  /** BlockNote fragment field. Defaults to `content-v4`. */
  field?: string
  generateBlockId?: () => string
}

/**
 * The BlockNote/Yjs `AiPageMarkdownApplyAdapter` (replaces the TipTap-era
 * document bridge): applies validated AI markdown plans into the page's
 * `content-v4` fragment, and reads pages back out of it. Hosts wire
 * `resolveDoc` to their document store; without an adapter the AI surface
 * falls back to the `markdown` node property.
 */
export function createBlockNotePageMarkdownAdapter(
  options: BlockNotePageMarkdownAdapterOptions
): AiPageMarkdownApplyAdapter & { readMarkdown: (pageId: string) => Promise<string | null> } {
  const field = options.field ?? XNET_PAGE_FRAGMENT_FIELD

  return {
    applyMarkdown: async ({ pageId, bodyMarkdown }): Promise<AiPageMarkdownApplyAdapterResult> => {
      const doc = await options.resolveDoc(pageId)
      if (!doc) {
        throw new Error(`No document available for page ${pageId}`)
      }
      replaceXNetPageFragmentWithMarkdown(doc, bodyMarkdown, {
        field,
        ...(options.generateBlockId ? { generateBlockId: options.generateBlockId } : {})
      })
      return { mode: 'blocknote-yjs', yjsField: field }
    },
    readMarkdown: async (pageId) => {
      const doc = await options.resolveDoc(pageId)
      return doc ? xnetPageFragmentToMarkdown(doc, { field }) : null
    }
  }
}
