/**
 * Render fidelity gate — the #1 safety net for hand-built Yjs documents.
 *
 * Builds the real editor ProseMirror schema from the xNet Tiptap extensions and
 * runs every seeded PAGE document's `content` fragment through
 * `yXmlFragmentToProseMirrorRootNode`. A malformed fragment (unknown node/mark,
 * bad attr) throws or drops content here instead of silently rendering blank in
 * the app.
 */

import type { SeedContext } from './types'
import { getSchema } from '@tiptap/core'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import StarterKit from '@tiptap/starter-kit'
import { yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap'
import { getCanvasConnectorsMap, getCanvasObjectsMap } from '@xnetjs/canvas'
import {
  BlockquoteWithSyntax,
  CalloutExtension,
  CodeBlockWithSyntax,
  DatabaseEmbedExtension,
  DatabaseReferenceExtension,
  EmbedExtension,
  FileExtension,
  HashtagExtension,
  HeadingWithSyntax,
  ImageExtension,
  MermaidExtension,
  PageEmbedExtension,
  PageTaskItemExtension,
  RichLinkExtension,
  TaskMentionExtension,
  TaskViewEmbedExtension,
  ToggleExtension,
  Wikilink
} from '@xnetjs/editor/extensions'
import { describe, it, expect } from 'vitest'
import { buildFixtures, ORG_SPACE_ID } from './fixtures'
import { DEMO_PEOPLE, makeRng } from './seed-ids'
import { collectSeed, SCALES } from './seed-runner'

const ctx: SeedContext = {
  space: ORG_SPACE_ID,
  authorDID: 'did:key:zTestAuthor',
  people: DEMO_PEOPLE,
  fixtures: buildFixtures(),
  scale: SCALES.medium,
  rng: makeRng(9)
}

/** The editor's node/mark schema (mirrors the app's extension set). */
function editorSchema() {
  return getSchema([
    StarterKit.configure({
      heading: false,
      codeBlock: false,
      blockquote: false,
      link: false,
      undoRedo: false
    }),
    HeadingWithSyntax.configure({ levels: [1, 2, 3, 4, 5, 6] }),
    CodeBlockWithSyntax,
    BlockquoteWithSyntax,
    TaskList,
    PageTaskItemExtension.configure({ nested: true }),
    Link.configure({ openOnClick: false }),
    Wikilink,
    ImageExtension,
    CalloutExtension,
    ToggleExtension,
    FileExtension,
    EmbedExtension,
    RichLinkExtension,
    PageEmbedExtension,
    DatabaseEmbedExtension,
    TaskViewEmbedExtension,
    DatabaseReferenceExtension,
    TaskMentionExtension,
    MermaidExtension,
    HashtagExtension
  ])
}

describe('seed render fidelity', () => {
  it('every seeded page document parses against the editor schema', async () => {
    const schema = editorSchema()
    const { docs } = await collectSeed(ctx)

    let validated = 0
    for (const seedDoc of docs) {
      const doc = seedDoc.build()
      const fragment = doc.getXmlFragment('content')
      if (fragment.length === 0) continue // canvas/other non-editor doc
      const node = yXmlFragmentToProseMirrorRootNode(fragment, schema)
      expect(node.type.name, `doc root for ${seedDoc.nodeId}`).toBe('doc')
      expect(node.childCount, `empty doc for ${seedDoc.nodeId}`).toBeGreaterThan(0)
      validated++
    }
    expect(validated, 'no page docs validated').toBeGreaterThan(0)
  })

  it('the flagship canvas scene has real objects + connectors', async () => {
    const { docs } = await collectSeed(ctx)
    let canvasObjects = 0
    let canvasConnectors = 0
    const kinds = new Set<string>()
    for (const seedDoc of docs) {
      const doc = seedDoc.build()
      const objects = getCanvasObjectsMap<{ type: string }>(doc)
      if (objects.size === 0) continue
      canvasObjects += objects.size
      objects.forEach((o) => kinds.add(o.type))
      canvasConnectors += getCanvasConnectorsMap(doc).size
    }
    expect(canvasObjects).toBeGreaterThan(4)
    expect(canvasConnectors).toBeGreaterThan(0)
    // Exercises multiple card kinds incl. a container (frame/group).
    expect(kinds.has('database')).toBe(true)
    expect(kinds.has('group')).toBe(true)
  })
})
