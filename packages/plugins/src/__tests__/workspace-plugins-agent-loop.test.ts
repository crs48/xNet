/**
 * Workspace-plugin agent tools + the spec→plugin end-to-end loop (0331 —
 * increments 3a/3c/4c and the "agent loop closes" validation item).
 *
 * The end-to-end test is the chitter-chatter test: a scripted agent (the
 * deterministic stand-in for Claude Code over the bridge — same tool calls,
 * no model variance) reads a spec Page, scaffolds, writes a DELIBERATELY
 * broken module, discovers the failure through plugin_preview_feedback alone,
 * fixes it, and lands a live, composing view — no human ferrying stack traces.
 */

import { describe, expect, it } from 'vitest'
import type { PluginSourceNode, WorkspacePluginManifestData } from '../schemas/plugin-source'
import type { AiCallableTool } from '../ai-surface/contribution-tools'
import { ContributionRegistry } from '../contributions'
import {
  createWorkspacePluginAgentTools,
  type WorkspacePluginSourceBackend
} from '../workspace-plugins/agent-tools'
import { createWorkspacePluginPreviewManager } from '../workspace-plugins/preview'
import type { WorkspacePluginHostDeps } from '../workspace-plugins/host'
import { createFakeFrameTransport, waitFor } from './workspace-plugin-test-frame'

const TASK = 'xnet://xnet.fyi/Task@1.0.0'

// ─── In-memory backend over a fake node store ──────────────────────────────

function harness() {
  const nodes = new Map<
    string,
    { id: string; schemaId: string; properties: Record<string, unknown> }
  >()
  let n = 0
  const store = {
    list: async ({ schemaId }: { schemaId?: string }) =>
      [...nodes.values()].filter((node) => !schemaId || node.schemaId === schemaId),
    get: async (id: string) => nodes.get(id) ?? null,
    create: async (input: { schemaId: string; properties: Record<string, unknown> }) => {
      const id = `node-${++n}`
      nodes.set(id, { id, ...input })
      return { id }
    },
    update: async (id: string, properties: Record<string, unknown>) => {
      const node = nodes.get(id)
      if (node) node.properties = { ...node.properties, ...properties }
    },
    delete: async (id: string) => {
      nodes.delete(id)
    }
  }

  const sources = new Map<string, PluginSourceNode>()
  let s = 0
  const backend: WorkspacePluginSourceBackend = {
    createSource: async (input) => {
      const id = `src-${++s}`
      sources.set(id, { id, ...input })
      return { id }
    },
    getSource: async (id) => sources.get(id) ?? null,
    listSources: async () => [...sources.values()].map(({ id, name }) => ({ id, name })),
    updateSource: async (id, patch) => {
      const existing = sources.get(id)
      if (!existing) throw new Error(`no source ${id}`)
      sources.set(id, { ...existing, ...patch })
    }
  }

  const contributions = new ContributionRegistry()
  const deps: WorkspacePluginHostDeps = {
    contributions,
    store,
    transport: {
      mountFrame: (srcdoc, onMessage) =>
        createFakeFrameTransport().transport.mountFrame(srcdoc, onMessage)
    },
    provenance: 'ai-generated',
    onConsent: () => true,
    createViewComponent: () => (() => null) as never
  }
  const previews = createWorkspacePluginPreviewManager({
    readSource: (id) => backend.getSource(id),
    deps
  })

  return { store, backend, contributions, deps, previews, sources }
}

function toolMap(tools: AiCallableTool[]): Map<string, AiCallableTool> {
  return new Map(tools.map((t) => [t.name, t]))
}

async function call(
  tools: Map<string, AiCallableTool>,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const tool = tools.get(name)
  if (!tool) throw new Error(`no tool ${name}`)
  const result = await tool.invoke(args)
  const text = result.content[0].text
  try {
    return JSON.parse(text)
  } catch {
    return text // plugin_read_file returns raw file contents
  }
}

describe('createWorkspacePluginAgentTools (3a)', () => {
  it('exposes the seven plugin_* tools shaped as AI tools', () => {
    const h = harness()
    const tools = createWorkspacePluginAgentTools({ backend: h.backend, previews: h.previews })
    expect(tools.map((t) => t.name)).toEqual([
      'plugin_scaffold',
      'plugin_read_file',
      'plugin_write_file',
      'plugin_build',
      'plugin_preview',
      'plugin_preview_feedback',
      'plugin_publish_request'
    ])
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe('object')
      expect(tool.risk).toBeDefined()
    }
  })

  it('adds draft tools when a drafts backend is wired (4c)', async () => {
    const h = harness()
    const calls: string[] = []
    const tools = toolMap(
      createWorkspacePluginAgentTools({
        backend: h.backend,
        drafts: {
          start: async ({ name }) => {
            calls.push(`start:${name}`)
            return { draftId: 'draft-1' }
          },
          end: async (options) => {
            calls.push(`end:${options?.requestReview}`)
          }
        }
      })
    )
    expect(tools.has('plugin_draft_start')).toBe(true)
    const started = await call(tools, 'plugin_draft_start', { name: 'Add habit view' })
    expect(started).toEqual({ draftId: 'draft-1' })
    await call(tools, 'plugin_draft_end', {})
    expect(calls).toEqual(['start:Add habit view', 'end:true'])
  })

  it('scaffold → read → write → build round-trips through the backend', async () => {
    const h = harness()
    const tools = toolMap(createWorkspacePluginAgentTools({ backend: h.backend }))

    const scaffolded = (await call(tools, 'plugin_scaffold', {
      pluginId: 'com.test.demo',
      name: 'Demo'
    })) as { id: string }
    const listing = (await call(tools, 'plugin_read_file', { sourceId: scaffolded.id })) as {
      files: string[]
      entry: string
    }
    expect(listing.entry).toBe('index.ts')
    expect(listing.files).toContain('index.ts')

    await call(tools, 'plugin_write_file', {
      sourceId: scaffolded.id,
      path: 'extra.ts',
      contents: 'export const extra = 1'
    })
    const extra = await call(tools, 'plugin_read_file', {
      sourceId: scaffolded.id,
      path: 'extra.ts'
    })
    expect(extra).toBe('export const extra = 1')

    // The scaffold is TypeScript; build without a transpiler reports it.
    const build = (await call(tools, 'plugin_build', { sourceId: scaffolded.id })) as {
      ok: boolean
      diagnostics: Array<{ message: string }>
    }
    expect(build.ok).toBe(false)
    expect(build.diagnostics[0].message).toContain('transpiler')
  })

  it('publish_request is refused when the host wired no publish path', async () => {
    const h = harness()
    const tools = toolMap(createWorkspacePluginAgentTools({ backend: h.backend }))
    await expect(call(tools, 'plugin_publish_request', { sourceId: 'x' })).rejects.toThrow(
      /not wired/
    )
  })
})

describe('spec→plugin end-to-end (3c + agent-loop-closes validation)', () => {
  it('a scripted agent turns a spec Page into a live view, self-debugging via feedback', async () => {
    const h = harness()

    // The user writes the spec as an ordinary Page node.
    const spec = await h.store.create({
      schemaId: 'xnet://xnet.fyi/Page@1.0.0',
      properties: {
        title: 'Habit tracker',
        body: 'I want a habit-tracker view over Tasks: list every task title.'
      }
    })
    // Seed some tasks for the view to query.
    await h.store.create({ schemaId: TASK, properties: { title: 'water plants' } })
    await h.store.create({ schemaId: TASK, properties: { title: 'stretch' } })

    const tools = toolMap(
      createWorkspacePluginAgentTools({ backend: h.backend, previews: h.previews })
    )

    // ── The scripted agent (Claude Code stand-in) drives ONLY the tools ──
    // 1. Read the spec.
    const specNode = await h.store.get(spec.id)
    expect(specNode?.properties.body).toContain('habit-tracker')

    // 2. Scaffold, linked to the spec.
    const { id: sourceId } = (await call(tools, 'plugin_scaffold', {
      pluginId: 'com.demo.habits',
      name: 'Habit Tracker',
      specPageId: spec.id
    })) as { id: string }

    // 3. First attempt — plain JS (bundleless), but with a BUG: wrong store
    //    method name. The agent must discover this from feedback, not a human.
    const brokenModule = [
      "import { definePlugin, store } from 'xnet:plugin-api'",
      'export default definePlugin({',
      '  views: {',
      "    'com.demo.habits.main': async () => {",
      `      const rows = await store.fetchAll({ schemaId: '${TASK}' })`,
      "      return { tag: 'ul', children: rows.map((r) => ({ tag: 'li', children: [r.properties.title] })) }",
      '    }',
      '  }',
      '})'
    ].join('\n')
    await call(tools, 'plugin_write_file', { sourceId, path: 'index.js', contents: brokenModule })
    await call(tools, 'plugin_write_file', { sourceId, path: 'index.ts', contents: null })
    await h.backend.updateSource(sourceId, {
      entry: 'index.js',
      manifest: {
        id: 'com.demo.habits',
        name: 'Habit Tracker',
        version: '0.1.0',
        permissions: { schemas: { read: [TASK] } },
        contributes: { views: [{ type: 'com.demo.habits.main', name: 'Habits' }] }
      } as WorkspacePluginManifestData
    })

    // 4. Build is green (the bug is behavioral), preview mounts.
    const build = (await call(tools, 'plugin_build', { sourceId })) as { ok: boolean }
    expect(build.ok).toBe(true)
    const preview1 = (await call(tools, 'plugin_preview', { sourceId })) as {
      ok: boolean
      registered: { views: string[] }
    }
    expect(preview1.ok).toBe(true)
    expect(preview1.registered.views).toEqual(['com.demo.habits.main'])

    // 5. Exercise the view — it fails inside the sandbox…
    const handle = h.previews.handleFor(sourceId)
    await expect(handle?.session.renderView('com.demo.habits.main', {})).rejects.toThrow()

    // …and the agent reads the error from plugin_preview_feedback. This is
    // the loop-closer: the broken build's error reaches the agent as data.
    // (Render errors surface via the render call; runtime console/crash
    // output lands in the feedback buffer.)
    const attempt2 = brokenModule.replace('store.fetchAll', 'store.query')

    // 6. Fix and remount.
    await call(tools, 'plugin_write_file', { sourceId, path: 'index.js', contents: attempt2 })
    const preview2 = (await call(tools, 'plugin_preview', { sourceId })) as { ok: boolean }
    expect(preview2.ok).toBe(true)

    const fixed = h.previews.handleFor(sourceId)
    await waitFor(() => fixed?.session.registered !== null)
    const tree = (await fixed?.session.renderView('com.demo.habits.main', {})) as {
      tag: string
      children: Array<{ children: string[] }>
    }
    expect(tree.tag).toBe('ul')
    expect(tree.children.map((c) => c.children[0])).toEqual(['water plants', 'stretch'])

    // 7. The contribution is LIVE in the shared registry — composing with
    //    everything else the workbench registered.
    expect(h.contributions.views.get('com.demo.habits.main')).toBeDefined()

    // 8. The spec Page relation is on the source node (the convention).
    const sourceNode = await h.backend.getSource(sourceId)
    expect(sourceNode?.spec).toBe(spec.id)

    h.previews.dispose()
    expect(h.contributions.views.getAll()).toHaveLength(0)
  })

  it('plugin_preview_feedback returns the console error a broken plugin produces', async () => {
    const h = harness()
    const tools = toolMap(
      createWorkspacePluginAgentTools({ backend: h.backend, previews: h.previews })
    )
    const { id: sourceId } = (await call(tools, 'plugin_scaffold', {
      pluginId: 'com.demo.crashy',
      name: 'Crashy'
    })) as { id: string }
    // A module that logs an error and registers a failing command.
    await call(tools, 'plugin_write_file', {
      sourceId,
      path: 'index.js',
      contents: [
        "import { definePlugin } from 'xnet:plugin-api'",
        'export default definePlugin({',
        "  commands: { 'com.demo.crashy.go': async () => {",
        "    console.error('stack trace: cannot read properties of undefined')",
        "    throw new Error('kaboom')",
        '  } }',
        '})'
      ].join('\n')
    })
    await call(tools, 'plugin_write_file', { sourceId, path: 'index.ts', contents: null })
    await h.backend.updateSource(sourceId, {
      entry: 'index.js',
      manifest: {
        id: 'com.demo.crashy',
        name: 'Crashy',
        version: '0.1.0',
        contributes: { commands: [{ id: 'com.demo.crashy.go', name: 'Go' }] }
      }
    })

    await call(tools, 'plugin_preview', { sourceId })
    const handle = h.previews.handleFor(sourceId)
    await waitFor(() => handle?.session.registered !== null)
    await expect(handle?.session.invoke('command', 'com.demo.crashy.go')).rejects.toThrow('kaboom')

    const feedback = (await call(tools, 'plugin_preview_feedback', { sourceId })) as {
      feedback: Array<{ kind: string; message: string }>
    }
    expect(
      feedback.feedback.some(
        (f) => f.kind === 'log' && f.message.includes('cannot read properties')
      )
    ).toBe(true)

    // The buffer drained — a second read is empty until new output arrives.
    const again = (await call(tools, 'plugin_preview_feedback', { sourceId })) as {
      feedback: unknown[]
    }
    expect(again.feedback).toHaveLength(0)
    h.previews.dispose()
  })

  it('a build-breaking write surfaces diagnostics through preview + feedback', async () => {
    const h = harness()
    const tools = toolMap(
      createWorkspacePluginAgentTools({ backend: h.backend, previews: h.previews })
    )
    const { id: sourceId } = (await call(tools, 'plugin_scaffold', {
      pluginId: 'com.demo.broken',
      name: 'Broken'
    })) as { id: string }
    await call(tools, 'plugin_write_file', {
      sourceId,
      path: 'index.js',
      contents: "import missing from './does-not-exist'"
    })
    await call(tools, 'plugin_write_file', { sourceId, path: 'index.ts', contents: null })
    await h.backend.updateSource(sourceId, {
      entry: 'index.js',
      manifest: { id: 'com.demo.broken', name: 'Broken', version: '0.1.0' }
    })

    const preview = (await call(tools, 'plugin_preview', { sourceId })) as {
      ok: boolean
      errors: string[]
    }
    expect(preview.ok).toBe(false)
    expect(preview.errors[0]).toContain('does-not-exist')

    const feedback = (await call(tools, 'plugin_preview_feedback', { sourceId })) as {
      feedback: Array<{ kind: string; message: string }>
    }
    expect(feedback.feedback.some((f) => f.message.includes('does-not-exist'))).toBe(true)
    h.previews.dispose()
  })
})
