/**
 * SandboxedPluginHost tests (0331 — increment 2 + the trust/provenance,
 * composition, and revocation validation items). The fake frame executes the
 * built modules for real, so these exercise the full contribution RPC chain.
 */

import { describe, expect, it } from 'vitest'
import type { PluginSourceNode } from '../schemas/plugin-source'
import { ContributionRegistry } from '../contributions'
import {
  activateWorkspacePlugin,
  WorkspacePluginError,
  type WorkspacePluginHostDeps
} from '../workspace-plugins/host'
import { computePluginSourceHash } from '../workspace-plugins/hash'
import { createFakeFrameTransport, waitFor } from './workspace-plugin-test-frame'

const TASK = 'xnet://xnet.fyi/Task@1.0.0'

function memoryStore() {
  const nodes = new Map<
    string,
    { id: string; schemaId: string; properties: Record<string, unknown> }
  >()
  let n = 0
  return {
    list: async ({ schemaId }: { schemaId?: string }) =>
      [...nodes.values()].filter((node) => !schemaId || node.schemaId === schemaId),
    get: async (id: string) => nodes.get(id) ?? null,
    create: async ({
      schemaId,
      properties
    }: {
      schemaId: string
      properties: Record<string, unknown>
    }) => {
      const id = `node-${++n}`
      nodes.set(id, { id, schemaId, properties })
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
}

function taskCounterSource(overrides: Partial<PluginSourceNode> = {}): PluginSourceNode {
  return {
    id: 'src-1',
    name: 'Task Counter',
    entry: 'index.js',
    files: {
      'index.js': [
        "import { definePlugin, store } from 'xnet:plugin-api'",
        'export default definePlugin({',
        '  commands: {',
        "    'com.test.counter.count': async () => {",
        `      const rows = await store.query({ schemaId: '${TASK}' })`,
        '      console.log("counted", rows.length)',
        '      return rows.length',
        '    }',
        '  },',
        '  views: {',
        "    'com.test.counter.main': async () => ({ tag: 'div', children: ['tasks'] })",
        '  }',
        '})'
      ].join('\n')
    },
    manifest: {
      id: 'com.test.counter',
      name: 'Task Counter',
      version: '1.0.0',
      permissions: { schemas: { read: [TASK] as never } },
      contributes: {
        commands: [{ id: 'com.test.counter.count', name: 'Count tasks' }],
        views: [{ type: 'com.test.counter.main', name: 'Tasks' }]
      }
    },
    ...overrides
  }
}

function makeDeps(overrides: Partial<WorkspacePluginHostDeps> = {}): {
  deps: WorkspacePluginHostDeps
  contributions: ContributionRegistry
  frame: ReturnType<typeof createFakeFrameTransport>
} {
  const contributions = new ContributionRegistry()
  const frame = createFakeFrameTransport()
  const deps: WorkspacePluginHostDeps = {
    contributions,
    store: memoryStore(),
    transport: frame.transport,
    provenance: 'authored',
    createViewComponent: () => (() => null) as never,
    ...overrides
  }
  return { deps, contributions, frame }
}

describe('activateWorkspacePlugin — contribution RPC (increment 2)', () => {
  it('registers commands + views in the shared registry and proxies execution', async () => {
    const { deps, contributions } = makeDeps()
    // A "bundled" command registered the classic way — composition baseline.
    contributions.commands.register({
      id: 'bundled.hello',
      name: 'Bundled Hello',
      execute: () => {}
    })

    const store = deps.store
    await store.create({ schemaId: TASK, properties: { title: 'a' } })
    await store.create({ schemaId: TASK, properties: { title: 'b' } })

    const handle = await activateWorkspacePlugin(taskCounterSource(), deps)
    await waitFor(() => handle.session.registered !== null)

    // Palette composition: workspace-plugin command sits beside the bundled one.
    const ids = contributions.commands.getAll().map((c) => c.id)
    expect(ids).toContain('bundled.hello')
    expect(ids).toContain('com.test.counter.count')

    // Handler proxies over RPC into the sandbox, which queries via the store RPC.
    const count = await handle.session.invoke('command', 'com.test.counter.count')
    expect(count).toBe(2)

    // The view renders to a JSON tree over RPC.
    const tree = await handle.session.renderView('com.test.counter.main', {})
    expect(tree).toEqual({ tag: 'div', children: ['tasks'] })

    // Console output landed in the feedback channel.
    const feedback = handle.drainFeedback()
    expect(feedback.some((f) => f.kind === 'log' && f.message.includes('counted'))).toBe(true)

    // Uninstall removes cleanly.
    handle.dispose()
    expect(contributions.commands.getAll().map((c) => c.id)).toEqual(['bundled.hello'])
    expect(contributions.views.getAll()).toHaveLength(0)
  })

  it('lets a second workspace plugin extend the first through a registry id (composition)', async () => {
    const { deps, contributions } = makeDeps()
    const first = await activateWorkspacePlugin(taskCounterSource(), deps)
    await waitFor(() => first.session.registered !== null)

    const frame2 = createFakeFrameTransport()
    const second = await activateWorkspacePlugin(
      taskCounterSource({
        id: 'src-2',
        files: {
          'index.js': [
            "import { definePlugin } from 'xnet:plugin-api'",
            'export default definePlugin({',
            "  commands: { 'com.test.ext.boost': async () => 'boosted' }",
            '})'
          ].join('\n')
        },
        manifest: {
          id: 'com.test.ext',
          name: 'Counter Booster',
          version: '1.0.0',
          contributes: {
            commands: [{ id: 'com.test.ext.boost', name: 'Boost counter' }]
          }
        }
      }),
      { ...deps, transport: frame2.transport }
    )
    await waitFor(() => second.session.registered !== null)

    // Plugin B can see (and a host command palette can chain) plugin A's id.
    expect(contributions.commands.get('com.test.counter.count')).toBeDefined()
    expect(contributions.commands.get('com.test.ext.boost')).toBeDefined()

    // Uninstalling both leaves the registry clean.
    first.dispose()
    second.dispose()
    expect(contributions.commands.getAll()).toHaveLength(0)
  })

  it('refuses to activate when views are declared but no view factory is wired', async () => {
    const { deps } = makeDeps({ createViewComponent: undefined })
    await expect(activateWorkspacePlugin(taskCounterSource(), deps)).rejects.toThrow(
      /createViewComponent/
    )
  })

  it('surfaces build failures as structured errors before any consent/mount', async () => {
    const { deps, frame } = makeDeps()
    const source = taskCounterSource({
      files: { 'index.js': "import missing from './nope'" }
    })
    await expect(activateWorkspacePlugin(source, deps)).rejects.toThrow(WorkspacePluginError)
    expect(frame.mounted).toBe(false)
  })
})

describe('trust + provenance (validation item)', () => {
  it('an ai-generated plugin activates at user tier after consent showing capabilities', async () => {
    const decisions: unknown[] = []
    const { deps } = makeDeps({
      provenance: 'ai-generated',
      onConsent: (decision) => {
        decisions.push(decision)
        return true
      }
    })
    const handle = await activateWorkspacePlugin(taskCounterSource(), deps)
    expect(handle.trustTier).toBe('user')
    expect(decisions).toHaveLength(1)
    expect((decisions[0] as { lines: unknown[] }).lines.length).toBeGreaterThan(0)
    handle.dispose()
  })

  it('a synced copy is inert until its receiver consents', async () => {
    const { deps, frame } = makeDeps({ provenance: 'synced' })
    // No onConsent wired → the gate fails closed.
    await expect(activateWorkspacePlugin(taskCounterSource(), deps)).rejects.toThrow(
      /consent/
    )
    expect(frame.mounted).toBe(false)

    const granted = await activateWorkspacePlugin(taskCounterSource(), {
      ...deps,
      onConsent: () => true
    })
    expect(granted.trustTier).toBe('user')
    granted.dispose()
  })

  it('revocation (dispose) kills a running plugin: frame down, handlers gone', async () => {
    const { deps, contributions, frame } = makeDeps()
    const handle = await activateWorkspacePlugin(taskCounterSource(), deps)
    await waitFor(() => handle.session.registered !== null)
    expect(frame.mounted).toBe(true)

    handle.dispose()
    expect(handle.status).toBe('disabled')
    expect(frame.mounted).toBe(false)
    expect(contributions.commands.getAll()).toHaveLength(0)
    await expect(handle.session.invoke('command', 'com.test.counter.count')).rejects.toThrow()
  })

  it('a crash auto-disables the plugin and reports the last good hash', async () => {
    const disabled: Array<{ pluginId: string; lastGoodHash: string }> = []
    const { deps, contributions, frame } = makeDeps({
      onAutoDisable: (info) => disabled.push(info)
    })
    const source = taskCounterSource()
    const handle = await activateWorkspacePlugin(source, deps)
    await waitFor(() => handle.session.registered !== null)

    frame.crash('TypeError: boom')
    expect(handle.status).toBe('disabled')
    expect(contributions.commands.getAll()).toHaveLength(0)
    expect(disabled[0].pluginId).toBe('com.test.counter')
    expect(disabled[0].lastGoodHash).toBe(
      await computePluginSourceHash({
        files: source.files,
        entry: source.entry,
        manifest: source.manifest
      })
    )
    // The crash is in the feedback the agent will read.
    expect(handle.drainFeedback().some((f) => f.kind === 'crash')).toBe(true)
  })
})

describe('content-hash pinning (increment 4b)', () => {
  it('pins the hash on first consented activation', async () => {
    const pins: Array<[string, string]> = []
    const { deps } = makeDeps({
      persistPinnedHash: (id, hash) => {
        pins.push([id, hash])
      }
    })
    const handle = await activateWorkspacePlugin(taskCounterSource(), deps)
    expect(pins).toHaveLength(1)
    expect(pins[0][0]).toBe('src-1')
    expect(pins[0][1]).toBe(handle.contentHash)
    handle.dispose()
  })

  it('refuses drifted sources under enforce-pin — diff-and-consent, never silent update', async () => {
    const { deps } = makeDeps()
    const source = taskCounterSource({ publishedHash: 'stale-hash' })
    await expect(activateWorkspacePlugin(source, deps)).rejects.toThrow(/drifted/)
  })

  it('follow-source (preview/hot-reload) activates drifted sources without pinning', async () => {
    const pins: string[] = []
    const { deps } = makeDeps({
      hashPolicy: 'follow-source',
      persistPinnedHash: (_, hash) => {
        pins.push(hash)
      }
    })
    const handle = await activateWorkspacePlugin(
      taskCounterSource({ publishedHash: 'stale-hash' }),
      deps
    )
    expect(handle.contentHash).not.toBe('stale-hash')
    expect(pins).toHaveLength(0)
    handle.dispose()
  })
})
