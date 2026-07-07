/**
 * AI-notes → Y.Doc append (exploration 0279, phase 2).
 *
 * After the meeting, `streamEnhancedNotes` produces Markdown; this appends it
 * to the meeting's notes Y.Doc (`content` fragment — the editor's fragment
 * name) as heading/paragraph/bullet blocks, every text run carrying the
 * editor's `aiGenerated` mark (0234 Charter §Agency: anything the model
 * authored discloses itself). Node/mark names mirror the `@xnetjs/editor`
 * extensions exactly — the same contract the devtools seed builder honors.
 *
 * The parser is deliberately small: headings, bullet lists, and paragraphs
 * cover the enhancement templates' output; unknown syntax degrades to a
 * plain paragraph, never lost text.
 */

import * as Y from 'yjs'

/** Mark attrs mirroring `AiGeneratedMark` (`@xnetjs/editor`). */
const AI_MARK = { aiGenerated: { assistMode: 'draft', citations: null } }

/** The editor's collaborative fragment name. */
const CONTENT_FRAGMENT = 'content'

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

function paragraphElement(text: string, aiGenerated: boolean): Y.XmlElement {
  const el = new Y.XmlElement('paragraph')
  el.insert(0, [textRun(text, aiGenerated)])
  return el
}

export interface AppendMarkdownOptions {
  /** Mark every text run `aiGenerated` (the enhancement path). */
  aiGenerated?: boolean
}

/**
 * Append Markdown to a meeting's notes Y.Doc as blocks. One transaction —
 * a single undo step and a single sync burst. Returns the number of blocks
 * appended (0 when the markdown was empty).
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
    const elements: Y.XmlElement[] = []
    for (const block of blocks) {
      if (block.kind === 'heading') {
        const el = new Y.XmlElement('heading')
        el.setAttribute('level', String(block.level))
        el.insert(0, [textRun(block.text, aiGenerated)])
        elements.push(el)
        continue
      }
      if (block.kind === 'bullets') {
        const list = new Y.XmlElement('bulletList')
        list.insert(
          0,
          block.items.map((item) => {
            const li = new Y.XmlElement('listItem')
            li.insert(0, [paragraphElement(item, aiGenerated)])
            return li
          })
        )
        elements.push(list)
        continue
      }
      elements.push(paragraphElement(block.text, aiGenerated))
    }
    fragment.insert(fragment.length, elements)
  })

  return blocks.length
}

/** Append AI-enhanced notes: every run carries the `aiGenerated` mark. */
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
 * transcript chat. Marks/attributes are dropped; only readable text survives.
 */
export function extractDocText(doc: Y.Doc): string {
  const lines: string[] = []
  collectText(doc.getXmlFragment(CONTENT_FRAGMENT), lines)
  return lines.join('\n')
}
