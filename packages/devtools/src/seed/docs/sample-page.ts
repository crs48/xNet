/**
 * Deterministic Yjs builder for the flagship sample Page (ported from the old
 * Seed panel's `createSamplePage`). It produces a `content` XmlFragment covering
 * every editor block type plus a `meta` map.
 *
 * The doc is built ONCE per run and the same instance is both used to compute
 * comment text anchors and applied by the runner — comment `RelativePosition`s
 * encode client-relative item ids, so they must resolve against the exact doc
 * state the runner persists.
 */

import type { SchemaIRI } from '@xnetjs/data'
import * as Y from 'yjs'

function uint8ArrayToBase64(arr: Uint8Array): string {
  let s = ''
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i] as number)
  return btoa(s)
}

/**
 * Build a JSON `TextAnchor` for a substring inside a `content` fragment, walking
 * to the actual `Y.XmlText` node (matching y-tiptap's relative-position scheme).
 * Returns null if the text isn't found.
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
  const ydoc = new Y.Doc({ guid: nodeId, gc: false })
  const fragment = ydoc.getXmlFragment('content')

  ydoc.transact(() => {
    const h1 = new Y.XmlElement('heading')
    h1.setAttribute('level', '1')
    h1.insert(0, [new Y.XmlText('Heading 1 - Main Title')])
    fragment.push([h1])

    const para1 = new Y.XmlElement('paragraph')
    para1.insert(0, [
      new Y.XmlText(
        'This is a sample page demonstrating all supported block types in the xNet editor.'
      )
    ])
    fragment.push([para1])

    const h2 = new Y.XmlElement('heading')
    h2.setAttribute('level', '2')
    h2.insert(0, [new Y.XmlText('Heading 2 - Section')])
    fragment.push([h2])

    const h3 = new Y.XmlElement('heading')
    h3.setAttribute('level', '3')
    h3.insert(0, [new Y.XmlText('Heading 3 - Subsection')])
    fragment.push([h3])

    const bulletList = new Y.XmlElement('bulletList')
    const bulletItems: Y.XmlElement[] = []
    for (const text of ['First bullet point', 'Second bullet point', 'Third bullet point']) {
      const li = new Y.XmlElement('listItem')
      const p = new Y.XmlElement('paragraph')
      p.insert(0, [new Y.XmlText(text)])
      li.insert(0, [p])
      bulletItems.push(li)
    }
    bulletList.insert(0, bulletItems)
    fragment.push([bulletList])

    const orderedList = new Y.XmlElement('orderedList')
    const orderedItems: Y.XmlElement[] = []
    for (const text of ['First numbered item', 'Second numbered item']) {
      const li = new Y.XmlElement('listItem')
      const p = new Y.XmlElement('paragraph')
      p.insert(0, [new Y.XmlText(text)])
      li.insert(0, [p])
      orderedItems.push(li)
    }
    orderedList.insert(0, orderedItems)
    fragment.push([orderedList])

    const taskList = new Y.XmlElement('taskList')
    const taskItems: Y.XmlElement[] = []
    for (const { text, checked } of [
      { text: 'Unchecked task', checked: false },
      { text: 'Completed task', checked: true }
    ]) {
      const task = new Y.XmlElement('taskItem')
      // Yjs attrs are strings, and the editor reads any non-empty string as
      // truthy — a literal "false" renders an unchecked task as checked. Only
      // set it when true; absent means the schema's boolean `false` default.
      if (checked) task.setAttribute('checked', 'true')
      const p = new Y.XmlElement('paragraph')
      p.insert(0, [new Y.XmlText(text)])
      task.insert(0, [p])
      taskItems.push(task)
    }
    taskList.insert(0, taskItems)
    fragment.push([taskList])

    const quote = new Y.XmlElement('blockquote')
    const quotePara = new Y.XmlElement('paragraph')
    quotePara.insert(0, [
      new Y.XmlText('This is a blockquote. It can contain multiple lines of quoted text.')
    ])
    quote.insert(0, [quotePara])
    fragment.push([quote])

    const codeBlock = new Y.XmlElement('codeBlock')
    codeBlock.setAttribute('language', 'typescript')
    codeBlock.insert(0, [
      new Y.XmlText('function greet(name: string): string {\n  return `Hello, ${name}!`;\n}')
    ])
    fragment.push([codeBlock])

    const hr = new Y.XmlElement('horizontalRule')
    fragment.push([hr])

    for (const { type, text } of [
      { type: 'info', text: 'This is an info callout - use it for general information.' },
      { type: 'tip', text: 'This is a tip callout - use it for helpful suggestions.' },
      { type: 'warning', text: 'This is a warning callout - use it for important notices.' },
      { type: 'caution', text: 'This is a caution callout - use it for dangerous operations.' },
      { type: 'note', text: 'This is a note callout - use it for side notes.' }
    ]) {
      const callout = new Y.XmlElement('callout')
      callout.setAttribute('type', type)
      const calloutPara = new Y.XmlElement('paragraph')
      calloutPara.insert(0, [new Y.XmlText(text)])
      callout.insert(0, [calloutPara])
      fragment.push([callout])
    }

    const toggle = new Y.XmlElement('toggle')
    toggle.setAttribute('summary', 'Click to expand this toggle section')
    toggle.setAttribute('open', 'true')
    const togglePara = new Y.XmlElement('paragraph')
    togglePara.insert(0, [
      new Y.XmlText(
        'This is the hidden content inside the toggle. It can contain any other block types.'
      )
    ])
    toggle.insert(0, [togglePara])
    fragment.push([toggle])

    const mermaidHeading = new Y.XmlElement('heading')
    mermaidHeading.setAttribute('level', '2')
    mermaidHeading.insert(0, [new Y.XmlText('Mermaid Diagrams')])
    fragment.push([mermaidHeading])

    const mermaidIntro = new Y.XmlElement('paragraph')
    mermaidIntro.insert(0, [
      new Y.XmlText('Mermaid diagrams render flowcharts, sequence diagrams, and more from text.')
    ])
    fragment.push([mermaidIntro])

    const mermaid = new Y.XmlElement('mermaid')
    mermaid.setAttribute(
      'code',
      `flowchart TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> B
    C --> E[Ship it!]`
    )
    mermaid.setAttribute('theme', 'default')
    fragment.push([mermaid])

    for (const text of [
      '[Image placeholder - use /image command to insert]',
      '[File placeholder - use /file command to attach]',
      '[Embed placeholder - use /embed command for YouTube, Spotify, etc.]'
    ]) {
      const p = new Y.XmlElement('paragraph')
      p.insert(0, [new Y.XmlText(text)])
      fragment.push([p])
    }

    const metaMap = ydoc.getMap('meta')
    metaMap.set('_schemaId', schemaId)
    metaMap.set('title', title)
    metaMap.set('icon', icon)
  })

  return ydoc
}
