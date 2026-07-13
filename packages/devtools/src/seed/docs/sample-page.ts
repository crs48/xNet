/**
 * Deterministic Yjs builder for the flagship sample Page. It produces a
 * `content-v4` BlockNote XmlFragment covering every editor block type plus a
 * `meta` map (see rich-pages.ts for the conversion pipeline).
 *
 * The doc is built ONCE per run and the same instance is both used to compute
 * comment text anchors and applied by the runner — comment `RelativePosition`s
 * encode client-relative item ids, so they must resolve against the exact doc
 * state the runner persists.
 */

import type { SchemaIRI } from '@xnetjs/data'
import * as Y from 'yjs'
import { buildRichPageDoc } from './rich-pages'

function uint8ArrayToBase64(arr: Uint8Array): string {
  let s = ''
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i] as number)
  return btoa(s)
}

/**
 * Build a JSON `TextAnchor` for a substring inside a document fragment, walking
 * to the actual `Y.XmlText` node (matching y-prosemirror's relative-position
 * scheme). Works on the nested BlockNote structure (blockGroup →
 * blockContainer → content). Returns null if the text isn't found.
 */
export function buildTextAnchor(
  fragment: Y.XmlFragment,
  searchText: string,
  occurrence = 0
): string | null {
  let found = 0

  function findTextNode(
    el: Y.XmlElement | Y.XmlFragment
  ): { textNode: Y.XmlText; offsetInNode: number } | null {
    const children = (el as Y.XmlElement).toArray()
    for (const child of children) {
      if (child instanceof Y.XmlElement) {
        const result = findTextNode(child)
        if (result) return result
      } else if (child instanceof Y.XmlText) {
        const text = child.toString()
        const idx = text.indexOf(searchText)
        if (idx !== -1 && found === occurrence) {
          return { textNode: child, offsetInNode: idx }
        }
        if (idx !== -1) found++
      }
    }
    return null
  }

  const result = findTextNode(fragment)
  if (!result) return null

  const startRelPos = Y.createRelativePositionFromTypeIndex(
    result.textNode,
    result.offsetInNode,
    -1
  )
  const endRelPos = Y.createRelativePositionFromTypeIndex(
    result.textNode,
    result.offsetInNode + searchText.length,
    -1
  )

  return JSON.stringify({
    startRelative: uint8ArrayToBase64(Y.encodeRelativePosition(startRelPos)),
    endRelative: uint8ArrayToBase64(Y.encodeRelativePosition(endRelPos)),
    quotedText: searchText
  })
}

/** Build the sample page Y.Doc with every supported block type. */
export function buildSamplePageDoc(
  nodeId: string,
  schemaId: SchemaIRI,
  title: string,
  icon: string
): Y.Doc {
  return buildRichPageDoc(nodeId, schemaId, title, icon, [
    { kind: 'h', level: 1, text: 'Heading 1 - Main Title' },
    {
      kind: 'p',
      text: 'This is a sample page demonstrating all supported block types in the xNet editor.'
    },
    { kind: 'h', level: 2, text: 'Heading 2 - Section' },
    { kind: 'h', level: 3, text: 'Heading 3 - Subsection' },
    {
      kind: 'bullets',
      items: ['First bullet point', 'Second bullet point', 'Third bullet point']
    },
    { kind: 'numbers', items: ['First numbered item', 'Second numbered item'] },
    {
      kind: 'tasks',
      items: [
        { text: 'Unchecked task', checked: false },
        { text: 'Completed task', checked: true }
      ]
    },
    { kind: 'quote', text: 'This is a blockquote. It can contain multiple lines of quoted text.' },
    {
      kind: 'code',
      lang: 'typescript',
      text: 'function greet(name: string): string {\n  return `Hello, ${name}!`;\n}'
    },
    { kind: 'hr' },
    { kind: 'callout', type: 'info', text: 'This is an info callout - use it for general information.' },
    { kind: 'callout', type: 'tip', text: 'This is a tip callout - use it for helpful suggestions.' },
    { kind: 'callout', type: 'warning', text: 'This is a warning callout - use it for important notices.' },
    { kind: 'callout', type: 'caution', text: 'This is a caution callout - use it for dangerous operations.' },
    { kind: 'callout', type: 'note', text: 'This is a note callout - use it for side notes.' },
    {
      kind: 'toggle',
      summary: 'Click to expand this toggle section',
      children: [
        {
          kind: 'p',
          text: 'This is the hidden content inside the toggle. It can contain any other block types.'
        }
      ]
    },
    { kind: 'h', level: 2, text: 'Mermaid Diagrams' },
    {
      kind: 'p',
      text: 'Mermaid diagrams render flowcharts, sequence diagrams, and more from text.'
    },
    {
      kind: 'mermaid',
      code: `flowchart TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> B
    C --> E[Ship it!]`
    },
    { kind: 'h', level: 2, text: 'Inline math' },
    {
      kind: 'p',
      text: [
        { text: 'KaTeX expressions render inline: ' },
        { pill: 'math', latex: 'e^{i\\pi} + 1 = 0' },
        { text: ' — try the /math slash command.' }
      ]
    },
    { kind: 'p', text: '[Image placeholder - use /image command to insert]' },
    { kind: 'p', text: '[File placeholder - use /file command to attach]' },
    { kind: 'p', text: '[Embed placeholder - use /embed command for YouTube, Spotify, etc.]' }
  ])
}
