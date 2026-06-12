/**
 * Round-trip safety property test (0161 validation):
 * 1,000-page checkout → random markdown edits → commit → re-export is
 * byte-stable for supported features, and every unsupported-feature edit
 * lands in conflicts — never lossy-applied.
 */

import type { NodeData, NodeStoreAPI, SchemaRegistryAPI } from '../services/local-api'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAiSurfaceService, type AiSurfaceService } from '../ai-surface'
import {
  createAiWorkspaceExporter,
  createAiWorkspaceWatcher,
  type AiWorkspaceExporter,
  type AiWorkspaceWatcher
} from '../services/ai-workspace-exporter'

const PAGE_COUNT = 1000
const SUPPORTED_EDIT_SAMPLE = 40
const UNSUPPORTED_EDIT_SAMPLE = 15

// Deterministic LCG so the "random" edits are reproducible.
function createRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0xffffffff
  }
}

function createStore(): NodeStoreAPI {
  const nodes = new Map<string, NodeData>()
  for (let index = 0; index < PAGE_COUNT; index += 1) {
    nodes.set(`page_${index}`, {
      id: `page_${index}`,
      schemaId: 'xnet://xnet.fyi/Page@1.0.0',
      properties: {
        title: `Note ${index}`,
        markdown: `# Note ${index}\n\nParagraph for note ${index}.\n\n- item one\n- item two`
      },
      deleted: false,
      createdAt: 1,
      updatedAt: 10 + index
    })
  }
  return {
    get: async (id) => nodes.get(id) ?? null,
    list: async (options) => {
      let result = Array.from(nodes.values())
      if (options?.schemaId) result = result.filter((node) => node.schemaId === options.schemaId)
      if (options?.offset) result = result.slice(options.offset)
      if (options?.limit) result = result.slice(0, options.limit)
      return result
    },
    create: async () => {
      throw new Error('not supported')
    },
    update: async (id, options) => {
      const existing = nodes.get(id)
      if (!existing) throw new Error(`Node not found: ${id}`)
      const node = {
        ...existing,
        properties: { ...existing.properties, ...options.properties },
        updatedAt: existing.updatedAt + 1
      }
      nodes.set(id, node)
      return node
    },
    delete: async () => {},
    subscribe: () => () => {}
  }
}

const schemas: SchemaRegistryAPI = {
  getAllIRIs: () => ['xnet://xnet.fyi/Page@1.0.0'],
  get: async (iri) =>
    iri === 'xnet://xnet.fyi/Page@1.0.0'
      ? { iri, name: 'Page', properties: { title: { type: 'text' } } }
      : null
}

describe('workspace round-trip safety (0161)', () => {
  let rootDir: string
  let store: NodeStoreAPI
  let aiSurface: AiSurfaceService
  let exporter: AiWorkspaceExporter
  let watcher: AiWorkspaceWatcher

  beforeAll(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'xnet-roundtrip-'))
    store = createStore()
    aiSurface = createAiSurfaceService({ store, schemas })
    exporter = createAiWorkspaceExporter({ store, schemas, aiSurface })
    watcher = createAiWorkspaceWatcher({ store, schemas, aiSurface })
  })

  afterAll(async () => {
    await rm(rootDir, { recursive: true, force: true })
  })

  it(
    'checkout → random edits → commit → re-export is byte-stable; unsupported edits quarantine',
    { timeout: 120_000 },
    async () => {
      const rng = createRng(0x0161)

      // 1. Checkout all 1,000 pages.
      const checkout = await exporter.checkout({
        rootDir,
        scope: { kinds: ['page'], limit: PAGE_COUNT }
      })
      const pagePaths = checkout.manifestEntries
        .filter((entry) => entry.kind === 'page')
        .map((entry) => entry.path)
      expect(pagePaths).toHaveLength(PAGE_COUNT)

      // 2. Re-export with no changes: every node skips, no file rewrites.
      const stable = await exporter.checkout({
        rootDir,
        scope: { kinds: ['page'], limit: PAGE_COUNT }
      })
      expect(stable.skippedNodeIds).toHaveLength(PAGE_COUNT)
      expect(stable.manifestEntries.map((entry) => entry.sha256).sort()).toEqual(
        checkout.manifestEntries.map((entry) => entry.sha256).sort()
      )

      // 3. Random supported edits on a sample of pages.
      const shuffled = [...pagePaths].sort(() => rng() - 0.5)
      const supportedTargets = shuffled.slice(0, SUPPORTED_EDIT_SAMPLE)
      const unsupportedTargets = shuffled.slice(
        SUPPORTED_EDIT_SAMPLE,
        SUPPORTED_EDIT_SAMPLE + UNSUPPORTED_EDIT_SAMPLE
      )

      const editMarker = new Map<string, string>()
      for (const path of supportedTargets) {
        const text = await readFile(join(rootDir, path), 'utf8')
        const marker = `Edited paragraph ${Math.floor(rng() * 1e9)}.`
        editMarker.set(path, marker)
        await writeFile(
          join(rootDir, path),
          text.replace('- item two', `- item two\n\n${marker}`),
          'utf8'
        )
      }
      // Unsupported edits: HTML comments do not round-trip and must quarantine.
      for (const path of unsupportedTargets) {
        const text = await readFile(join(rootDir, path), 'utf8')
        await writeFile(join(rootDir, path), `${text}\n\n<!-- lossy html comment -->\n`, 'utf8')
      }

      // 4. Commit: scan and apply the valid plans.
      const scan = await watcher.scanChangedFiles({ rootDir, actor: 'roundtrip-test' })

      expect(scan.pendingPlans).toHaveLength(SUPPORTED_EDIT_SAMPLE)
      const warningConflicts = scan.conflicts.filter(
        (conflict) => conflict.kind === 'validation-warning'
      )
      expect(warningConflicts).toHaveLength(UNSUPPORTED_EDIT_SAMPLE)
      expect(new Set(warningConflicts.map((conflict) => conflict.path))).toEqual(
        new Set(unsupportedTargets)
      )

      for (const pending of scan.pendingPlans) {
        const result = (await aiSurface.callTool('xnet_apply_page_markdown', {
          plan: pending.plan,
          confirmApply: true
        })) as { applied?: boolean }
        expect(result.applied).toBe(true)
      }

      // Unsupported edits never reached the store.
      for (const path of unsupportedTargets) {
        const entry = checkout.manifestEntries.find((candidate) => candidate.path === path)
        const node = await store.get(entry?.id ?? '')
        expect(String(node?.properties.markdown)).not.toContain('lossy html comment')
      }

      // 5. Re-export and verify the supported edits round-tripped byte-stably.
      const refreshed = await exporter.checkout({
        rootDir,
        scope: { kinds: ['page'], limit: PAGE_COUNT }
      })
      for (const path of supportedTargets) {
        const text = await readFile(join(rootDir, path), 'utf8')
        expect(text).toContain(editMarker.get(path) ?? 'missing-marker')
      }

      // A second re-export changes nothing: byte-stable for supported features.
      const second = await exporter.checkout({
        rootDir,
        scope: { kinds: ['page'], limit: PAGE_COUNT }
      })
      expect(second.manifestEntries.map((entry) => `${entry.path}:${entry.sha256}`).sort()).toEqual(
        refreshed.manifestEntries.map((entry) => `${entry.path}:${entry.sha256}`).sort()
      )
    }
  )
})
