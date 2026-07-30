/**
 * AI-notes → Y.Doc append (exploration 0279, phase 2).
 *
 * After the meeting, `streamEnhancedNotes` produces Markdown; this appends it
 * to the meeting's notes Y.Doc (`content-v4` fragment — the BlockNote
 * editor's fragment, 0312) as heading/paragraph/bullet blocks, every text run
 * carrying the editor's `aiGenerated` style (0234 Charter §Agency: anything
 * the model authored discloses itself). Node names mirror BlockNote's
 * ProseMirror schema exactly (blockGroup > blockContainer > blockContent) —
 * the same document shape `XNetEditor` writes via y-prosemirror.
 *
 * The parser is deliberately small: headings, bullet lists, and paragraphs
 * cover the enhancement templates' output; unknown syntax degrades to a
 * plain paragraph, never lost text.
 */

import * as Y from 'yjs'

/**
 * Text format mirroring the `aiGenerated` style spec (`@xnetjs/editor`,
 * boolean prop → mark with no attrs).
 */
const AI_MARK = { aiGenerated: {} }

/** The BlockNote editor's collaborative fragment name (schema v4, 0312). */
const CONTENT_FRAGMENT = 'content-v4'

/** The legacy TipTap fragment, still read as a fallback by extractDocText. */
const LEGACY_CONTENT_FRAGMENT = 'content'

type ParsedBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullets'; items: string[] }

/** Strip the inline markdown the templates emit (bold/italic/code fences). */
function stripInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .trim()
}

/** Parse the enhancement Markdown into the block shapes we can append. */
export function parseEnhancedMarkdown(markdown: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = []
  let bullets: string[] | null = null
  let paragraph: string[] = []

  const flushParagraph = (): void => {
    const text = stripInline(paragraph.join(' '))
    paragraph = []
    if (text) blocks.push({ kind: 'paragraph', text })
  }
  const flushBullets = (): void => {
    if (bullets && bullets.length > 0) blocks.push({ kind: 'bullets', items: bullets })
    bullets = null
  }

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trimEnd()
    const heading = /^(#{1,6})\s+(.*)$/.exec(line.trim())
    const bullet = /^[-*+]\s+(.*)$/.exec(line.trim())

    if (heading) {
      flushParagraph()
      flushBullets()
      blocks.push({
        kind: 'heading',
        level: Math.min(heading[1]!.length, 6),
        text: stripInline(heading[2] ?? '')
      })
      continue
    }
    if (bullet) {
      flushParagraph()
      bullets ??= []
      const item = stripInline(bullet[1] ?? '')
      if (item) bullets.push(item)
      continue
    }
    if (line.trim() === '') {
      flushParagraph()
      flushBullets()
      continue
    }
    flushBullets()
    paragraph.push(line.trim())
  }
  flushParagraph()
  flushBullets()

  return blocks
}

function textRun(text: string, aiGenerated: boolean): Y.XmlText {
  const xmlText = new Y.XmlText()
  if (aiGenerated) xmlText.insert(0, text, AI_MARK)
  else xmlText.insert(0, text)
  return xmlText
}

/** RFC-4122 id for a blockContainer (BlockNote's UniqueID uses uuid v4). */
function generateBlockId(): string {
  const cryptoObj = globalThis.crypto as Crypto | undefined
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID()
  // Non-crypto fallback (old runtimes): collision odds are irrelevant here.
  return `blk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Wrap a blockContent element in a BlockNote `blockContainer` (the "block"
 * node — carries the block id; missing style attrs fall back to schema
 * defaults when y-prosemirror rebuilds the ProseMirror node).
 */
function blockContainer(content: Y.XmlElement): Y.XmlElement {
  const container = new Y.XmlElement('blockContainer')
  container.setAttribute('id', generateBlockId())
  container.insert(0, [content])
  return container
}

function paragraphBlock(text: string, aiGenerated: boolean): Y.XmlElement {
  const el = new Y.XmlElement('paragraph')
  el.insert(0, [textRun(text, aiGenerated)])
  return blockContainer(el)
}

export interface AppendMarkdownOptions {
  /** Mark every text run `aiGenerated` (the enhancement path). */
  aiGenerated?: boolean
}

/**
 * The `blockGroup` root all blocks live under (BlockNote's doc content is a
 * single blockGroup). Reuses the existing one, creating it for empty docs.
 */
function ensureBlockGroup(fragment: Y.XmlFragment): Y.XmlElement {
  const first = fragment.length > 0 ? fragment.get(0) : null
  if (first instanceof Y.XmlElement && first.nodeName === 'blockGroup') return first
  const group = new Y.XmlElement('blockGroup')
  fragment.insert(fragment.length, [group])
  return group
}

/**
 * Append Markdown to a meeting's notes Y.Doc as BlockNote blocks. One
 * transaction — a single undo step and a single sync burst. Returns the
 * number of markdown blocks appended (0 when the markdown was empty).
 */
export function appendMarkdownToDoc(
  doc: Y.Doc,
  markdown: string,
  options: AppendMarkdownOptions = {}
): number {
  const aiGenerated = options.aiGenerated ?? false
  const blocks = parseEnhancedMarkdown(markdown)
  if (blocks.length === 0) return 0

  const fragment = doc.getXmlFragment(CONTENT_FRAGMENT)
  doc.transact(() => {
    const group = ensureBlockGroup(fragment)
    const containers: Y.XmlElement[] = []
    for (const block of blocks) {
      if (block.kind === 'heading') {
        const el = new Y.XmlElement('heading')
        // Numeric, matching BlockNote's `level` prop (y-prosemirror stores
        // node attrs with their ProseMirror values).
        el.setAttribute('level', block.level as unknown as string)
        el.insert(0, [textRun(block.text, aiGenerated)])
        containers.push(blockContainer(el))
        continue
      }
      if (block.kind === 'bullets') {
        // BlockNote's list model is flat: one bulletListItem block per item.
        for (const item of block.items) {
          const li = new Y.XmlElement('bulletListItem')
          li.insert(0, [textRun(item, aiGenerated)])
          containers.push(blockContainer(li))
        }
        continue
      }
      containers.push(paragraphBlock(block.text, aiGenerated))
    }
    group.insert(group.length, containers)
  })

  return blocks.length
}

/** Append AI-enhanced notes: every run carries the `aiGenerated` style. */
export function appendAiNotesToDoc(doc: Y.Doc, markdown: string): number {
  return appendMarkdownToDoc(doc, markdown, { aiGenerated: true })
}

function collectText(node: Y.XmlElement | Y.XmlFragment, lines: string[]): void {
  let current = ''
  for (const child of node.toArray()) {
    if (child instanceof Y.XmlText) {
      // toDelta() gives raw text runs — toString() would re-embed format tags.
      for (const op of child.toDelta() as Array<{ insert?: unknown }>) {
        if (typeof op.insert === 'string') current += op.insert
      }
      continue
    }
    if (child instanceof Y.XmlElement || child instanceof Y.XmlFragment) {
      collectText(child, lines)
    }
  }
  if (current.trim()) lines.push(current.trim())
}

/**
 * The notes body as plain text (one line per block) — grounding for the
 * transcript chat. Reads the v4 (BlockNote) fragment, falling back to the
 * legacy TipTap fragment for docs written before 0312 that the editor has
 * not lazily imported yet. Marks/attributes are dropped; only readable text
 * survives.
 */
export function extractDocText(doc: Y.Doc): string {
  const lines: string[] = []
  const v4 = doc.getXmlFragment(CONTENT_FRAGMENT)
  collectText(v4, lines)
  if (lines.length === 0) {
    collectText(doc.getXmlFragment(LEGACY_CONTENT_FRAGMENT), lines)
  }
  return lines.join('\n')
}
