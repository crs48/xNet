/**
 * Render fidelity gate — the #1 safety net for seeded documents.
 *
 * Runs every seeded PAGE document's `content-v4` fragment back through the
 * real BlockNote editor schema (`createXNetSchema` via the shared headless
 * editor) with `yXmlFragmentToBlocks`. A malformed fragment (unknown block /
 * inline spec, bad prop) throws or drops content here instead of silently
 * rendering blank in the app.
 */

import type { SeedContext } from './types'
import { getCanvasConnectorsMap, getCanvasObjectsMap } from '@xnetjs/canvas'
import {
  EDITOR_DOCUMENT_FRAGMENT_FIELD,
  LEGACY_DOCUMENT_FRAGMENT_FIELD,
  blockInlineText,
  getPageTasksSnapshot,
  walkBlocks,
  type BlockLike
} from '@xnetjs/editor/react'
import { describe, it, expect } from 'vitest'
import { seedDocToBlocks } from './docs/rich-pages'
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

describe('seed render fidelity (BlockNote v4)', () => {
  it('every seeded page document parses against the editor schema', async () => {
    const { docs } = await collectSeed(ctx)

    let validated = 0
    for (const seedDoc of docs) {
      const doc = seedDoc.build()
      const fragment = doc.getXmlFragment(EDITOR_DOCUMENT_FRAGMENT_FIELD)
      if (fragment.length === 0) continue // canvas/other non-editor doc
      // Throws on any block/inline spec the app schema doesn't know.
      const blocks = seedDocToBlocks(doc)
      expect(blocks.length, `empty doc for ${seedDoc.nodeId}`).toBeGreaterThan(0)
      // Nothing seeds the legacy TipTap fragment any more (0312).
      expect(
        doc.getXmlFragment(LEGACY_DOCUMENT_FRAGMENT_FIELD).length,
        `legacy fragment written for ${seedDoc.nodeId}`
      ).toBe(0)
      validated++
    }
    expect(validated, 'no page docs validated').toBeGreaterThan(0)
  })

  it('the flagship sample page covers the block vocabulary', async () => {
    const { docs } = await collectSeed(ctx)
    const sample = docs.find((d) => d.nodeId === 'seed/page/sample')
    expect(sample, 'flagship sample page missing').toBeTruthy()

    const blocks = seedDocToBlocks(sample!.build()) as unknown as BlockLike[]
    const types = new Set<string>()
    walkBlocks(blocks, (b) => types.add(String(b.type)))
    for (const expected of [
      'heading',
      'paragraph',
      'bulletListItem',
      'numberedListItem',
      'checkListItem',
      'quote',
      'codeBlock',
      'divider',
      'callout',
      'toggleListItem',
      'mermaid'
    ]) {
      expect(types.has(expected), `sample page missing block type ${expected}`).toBe(true)
    }

    // Checklist blocks have deterministic ids → stable page-task ids.
    const tasks = getPageTasksSnapshot(blocks, 'seed/page/sample')
    expect(tasks.length).toBeGreaterThanOrEqual(2)
    for (const task of tasks) {
      expect(task.blockId).toMatch(/^seed-block-\d+$/)
    }
    expect(tasks.some((t) => t.completed)).toBe(true)
  })

  it('the showcase page carries inline pills (mention, hashtag, wikilink, math)', async () => {
    const { docs } = await collectSeed(ctx)
    const showcase = docs.find((d) => d.nodeId === 'seed/page/showcase')
    expect(showcase, 'showcase page missing').toBeTruthy()

    const blocks = seedDocToBlocks(showcase!.build()) as unknown as BlockLike[]
    const inlineTypes = new Set<string>()
    const blockTypes = new Set<string>()
    walkBlocks(blocks, (b) => {
      blockTypes.add(String(b.type))
      if (Array.isArray(b.content)) {
        for (const item of b.content as Array<{ type?: string }>) {
          if (item.type) inlineTypes.add(item.type)
        }
      }
    })
    for (const expected of ['mention', 'hashtag', 'wikilink', 'inlineMath', 'link']) {
      expect(inlineTypes.has(expected), `showcase missing inline ${expected}`).toBe(true)
    }
    for (const expected of [
      'callout',
      'toggleListItem',
      'image',
      'file',
      'embed',
      'richLink',
      'mermaid',
      'divider',
      'databaseEmbed',
      'taskViewEmbed'
    ]) {
      expect(blockTypes.has(expected), `showcase missing block ${expected}`).toBe(true)
    }

    // Styled text round-trips (bold/code/strike land as BlockNote styles).
    const intro = blocks.find((b) => blockInlineText(b).includes('every editor feature'))
    expect(intro, 'showcase intro paragraph missing').toBeTruthy()
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
