/**
 * Tests for PluginRegistry
 */

import type { PluginContributions } from '../manifest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ContributionRegistry, TypedRegistry } from '../contributions'
import { PluginRegistry } from '../registry'

function createCanvasContributions(): PluginContributions {
  return {
    canvasCards: [
      {
        id: 'crm.account-card',
        type: 'canvas.card',
        name: 'Account Card',
        provider: 'crm',
        previewTiers: ['summary', 'thumbnail', 'shell'],
        rendererEntrypoint: 'canvas/cards/account.render',
        previewEntrypoint: 'canvas/cards/account.preview'
      }
    ],
    canvasIngestors: [
      {
        id: 'crm.account-url-ingestor',
        type: 'canvas.ingestor',
        name: 'Account URL Ingestor',
        input: 'url',
        urlPatterns: ['https://crm.example.com/accounts/*'],
        matchEntrypoint: 'canvas/ingestors/account.match',
        ingestEntrypoint: 'canvas/ingestors/account.ingest'
      }
    ],
    canvasTools: [
      {
        id: 'crm.account-link-tool',
        type: 'canvas.tool',
        name: 'Link Accounts',
        group: 'connect',
        activationEntrypoint: 'canvas/tools/link-accounts.activate'
      }
    ],
    canvasLayouts: [
      {
        id: 'crm.pipeline-layout',
        type: 'canvas.layout',
        name: 'Pipeline Layout',
        scope: 'selection',
        applyEntrypoint: 'canvas/layouts/pipeline.apply'
      }
    ],
    canvasEdges: [
      {
        id: 'crm.owns',
        type: 'canvas.edge',
        name: 'Owns',
        label: 'owns',
        directed: true,
        style: 'solid'
      }
    ],
    canvasInspectors: [
      {
        id: 'crm.account-inspector',
        type: 'canvas.inspector',
        name: 'Account Inspector',
        placement: 'side-panel',
        panelEntrypoint: 'canvas/inspectors/account.render'
      }
    ],
    canvasTemplates: [
      {
        id: 'crm.account-plan',
        type: 'canvas.template',
        name: 'Account Plan',
        category: 'planning',
        instantiateEntrypoint: 'canvas/templates/account-plan.instantiate'
      }
    ]
  }
}

// Mock NodeStore
function createMockStore() {
  const nodes: Record<string, unknown>[] = []
  const subscribers: ((node: unknown, change: unknown) => void)[] = []

  return {
    list: vi.fn(async () => nodes),
    create: vi.fn(async (options: { schemaId: string; properties: Record<string, unknown> }) => {
      const node = {
        id: `node-${nodes.length}`,
        schemaId: options.schemaId,
        properties: options.properties
      }
      nodes.push(node)
      return node
    }),
    delete: vi.fn(async (id: string) => {
      const idx = nodes.findIndex((n) => (n as { id: string }).id === id)
      if (idx >= 0) nodes.splice(idx, 1)
    }),
    subscribe: vi.fn((cb: (node: unknown, change: unknown) => void) => {
      subscribers.push(cb)
      return () => {
        const idx = subscribers.indexOf(cb)
        if (idx >= 0) subscribers.splice(idx, 1)
      }
    }),
    _nodes: nodes
  }
}

describe('PluginRegistry', () => {
  let store: ReturnType<typeof createMockStore>
  let registry: PluginRegistry

  beforeEach(() => {
    store = createMockStore()
    registry = new PluginRegistry(store as any, 'web')
  })

  describe('install', () => {
    it('installs and activates a plugin', async () => {
      const activated = vi.fn()
      await registry.install({
        id: 'com.test.plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        activate: activated
      })

      expect(activated).toHaveBeenCalled()
      expect(registry.get('com.test.plugin')?.status).toBe('active')
    })

    it('stores plugin metadata as Node', async () => {
      await registry.install({
        id: 'com.test.plugin',
        name: 'Test Plugin',
        version: '1.0.0'
      })

      expect(store.create).toHaveBeenCalled()
      expect(store._nodes.length).toBe(1)
      const node = store._nodes[0] as { properties: { pluginId: string } }
      expect(node.properties.pluginId).toBe('com.test.plugin')
    })

    it('rejects invalid manifest', async () => {
      await expect(
        registry.install({
          id: '',
          name: 'Test',
          version: '1.0.0'
        })
      ).rejects.toThrow('Invalid manifest')
    })

    it('rejects duplicate installation', async () => {
      await registry.install({
        id: 'com.test.plugin',
        name: 'Test',
        version: '1.0.0'
      })

      await expect(
        registry.install({
          id: 'com.test.plugin',
          name: 'Test 2',
          version: '2.0.0'
        })
      ).rejects.toThrow('already installed')
    })

    it('rejects incompatible platform', async () => {
      await expect(
        registry.install({
          id: 'com.test.electron',
          name: 'Electron Only',
          version: '1.0.0',
          platforms: ['electron']
        })
      ).rejects.toThrow('requires platforms')
    })
  })

  describe('activate', () => {
    it('creates ExtensionContext for plugin', async () => {
      let receivedContext: unknown
      await registry.install({
        id: 'com.test.plugin',
        name: 'Test',
        version: '1.0.0',
        activate: (ctx) => {
          receivedContext = ctx
        }
      })

      expect(receivedContext).toBeDefined()
      expect((receivedContext as { pluginId: string }).pluginId).toBe('com.test.plugin')
    })

    it('handles activation errors gracefully', async () => {
      await expect(
        registry.install({
          id: 'com.test.broken',
          name: 'Broken',
          version: '1.0.0',
          activate: () => {
            throw new Error('activation failed')
          }
        })
      ).rejects.toThrow('activation failed')

      expect(registry.get('com.test.broken')?.status).toBe('error')
    })
  })

  describe('deactivate', () => {
    it('calls deactivate lifecycle hook', async () => {
      const deactivated = vi.fn()
      await registry.install({
        id: 'com.test.plugin',
        name: 'Test',
        version: '1.0.0',
        deactivate: deactivated
      })

      await registry.deactivate('com.test.plugin')

      expect(deactivated).toHaveBeenCalled()
      expect(registry.get('com.test.plugin')?.status).toBe('disabled')
    })

    it('disposes all subscriptions', async () => {
      const disposed = vi.fn()
      await registry.install({
        id: 'com.test.plugin',
        name: 'Test',
        version: '1.0.0',
        activate: (ctx) => {
          ctx.subscriptions.push({ dispose: disposed })
        }
      })

      await registry.deactivate('com.test.plugin')

      expect(disposed).toHaveBeenCalled()
    })

    it('disposes even if deactivate throws', async () => {
      const disposed = vi.fn()
      await registry.install({
        id: 'com.test.plugin',
        name: 'Test',
        version: '1.0.0',
        activate: (ctx) => {
          ctx.subscriptions.push({ dispose: disposed })
        },
        deactivate: () => {
          throw new Error('oops')
        }
      })

      await registry.deactivate('com.test.plugin')

      expect(disposed).toHaveBeenCalled()
    })
  })

  describe('uninstall', () => {
    it('removes plugin from registry and store', async () => {
      await registry.install({
        id: 'com.test.plugin',
        name: 'Test',
        version: '1.0.0'
      })

      expect(registry.has('com.test.plugin')).toBe(true)

      await registry.uninstall('com.test.plugin')

      expect(registry.has('com.test.plugin')).toBe(false)
    })
  })

  describe('queries', () => {
    it('getAll returns all plugins', async () => {
      await registry.install({ id: 'com.test.one', name: 'One', version: '1.0.0' })
      await registry.install({ id: 'com.test.two', name: 'Two', version: '1.0.0' })

      expect(registry.getAll()).toHaveLength(2)
    })

    it('has returns correct status', async () => {
      expect(registry.has('com.test.plugin')).toBe(false)

      await registry.install({ id: 'com.test.plugin', name: 'Test', version: '1.0.0' })

      expect(registry.has('com.test.plugin')).toBe(true)
    })
  })

  describe('contributions', () => {
    it('registers static contributions from manifest', async () => {
      await registry.install({
        id: 'com.test.plugin',
        name: 'Test',
        version: '1.0.0',
        contributes: {
          commands: [
            {
              id: 'test.command',
              name: 'Test Command',
              execute: () => {}
            }
          ]
        }
      })

      const commands = registry.getContributions().commands.getAll()
      expect(commands).toHaveLength(1)
      expect(commands[0].id).toBe('test.command')
    })

    it('registers importer contributions from manifest (0189)', async () => {
      await registry.install({
        id: 'com.test.importer',
        name: 'Importer Plugin',
        version: '1.0.0',
        contributes: {
          importers: [
            {
              id: 'fyi.xnet.import.instagram',
              platform: 'instagram',
              version: '1.0.0',
              adapter: { detect: () => 1 }
            }
          ]
        }
      })

      const importer = registry.getContributions().importers.get('fyi.xnet.import.instagram')
      expect(importer?.platform).toBe('instagram')
    })

    it('registers canvas contributions from manifest', async () => {
      await registry.install({
        id: 'com.test.canvas',
        name: 'Canvas Plugin',
        version: '1.0.0',
        contributes: createCanvasContributions()
      })

      const contributions = registry.getContributions()
      expect(contributions.canvasCards.get('crm.account-card')?.rendererEntrypoint).toBe(
        'canvas/cards/account.render'
      )
      expect(contributions.canvasIngestors.get('crm.account-url-ingestor')?.input).toBe('url')
      expect(contributions.canvasTools.get('crm.account-link-tool')?.group).toBe('connect')
      expect(contributions.canvasLayouts.get('crm.pipeline-layout')?.scope).toBe('selection')
      expect(contributions.canvasEdges.get('crm.owns')?.directed).toBe(true)
      expect(contributions.canvasInspectors.get('crm.account-inspector')?.placement).toBe(
        'side-panel'
      )
      expect(contributions.canvasTemplates.get('crm.account-plan')?.category).toBe('planning')
    })

    it('cleans up contributions on deactivate', async () => {
      await registry.install({
        id: 'com.test.plugin',
        name: 'Test',
        version: '1.0.0',
        contributes: {
          commands: [
            {
              id: 'test.command',
              name: 'Test Command',
              execute: () => {}
            }
          ]
        }
      })

      expect(registry.getContributions().commands.getAll()).toHaveLength(1)

      await registry.deactivate('com.test.plugin')

      expect(registry.getContributions().commands.getAll()).toHaveLength(0)
    })

    it('cleans up canvas contributions on deactivate', async () => {
      await registry.install({
        id: 'com.test.canvas',
        name: 'Canvas Plugin',
        version: '1.0.0',
        contributes: createCanvasContributions()
      })

      expect(registry.getContributions().canvasCards.getAll()).toHaveLength(1)

      await registry.deactivate('com.test.canvas')

      expect(registry.getContributions().canvasCards.getAll()).toHaveLength(0)
      expect(registry.getContributions().canvasTemplates.getAll()).toHaveLength(0)
    })

    it('rejects invalid canvas contribution descriptors', async () => {
      const invalidContributions = {
        canvasCards: [
          {
            id: 'broken-card',
            type: 'canvas.card'
          }
        ]
      } as unknown as PluginContributions

      await expect(
        registry.install({
          id: 'com.test.canvas',
          name: 'Canvas Plugin',
          version: '1.0.0',
          contributes: invalidContributions
        })
      ).rejects.toThrow('rendererEntrypoint is required')
    })
  })

  describe('onChange', () => {
    it('notifies listeners on install', async () => {
      const listener = vi.fn()
      registry.onChange(listener)

      await registry.install({ id: 'com.test.plugin', name: 'Test', version: '1.0.0' })

      expect(listener).toHaveBeenCalled()
    })

    it('allows unsubscribing', async () => {
      const listener = vi.fn()
      const disposable = registry.onChange(listener)
      disposable.dispose()

      await registry.install({ id: 'com.test.plugin', name: 'Test', version: '1.0.0' })

      expect(listener).not.toHaveBeenCalled()
    })
  })
})

describe('ContributionRegistry', () => {
  it('registers and retrieves items', () => {
    const registry = new ContributionRegistry()
    registry.commands.register({ id: 'test', name: 'Test', execute: () => {} })
    registry.canvasCards.register({
      id: 'canvas-card',
      type: 'canvas.card',
      rendererEntrypoint: 'canvas/cards/render'
    })

    expect(registry.commands.getAll()).toHaveLength(1)
    expect(registry.commands.get('test')).toBeDefined()
    expect(registry.canvasCards.get('canvas-card')).toBeDefined()
  })

  it('disposes items correctly', () => {
    const registry = new ContributionRegistry()
    const d = registry.commands.register({ id: 'test', name: 'Test', execute: () => {} })

    expect(registry.commands.has('test')).toBe(true)
    d.dispose()
    expect(registry.commands.has('test')).toBe(false)
  })

  it('notifies on changes', () => {
    const registry = new ContributionRegistry()
    const listener = vi.fn()
    registry.commands.onChange(listener)

    registry.commands.register({ id: 'test', name: 'Test', execute: () => {} })
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('TypedRegistry', () => {
  it('generates UUID for items without id', () => {
    const registry = new TypedRegistry<{ id?: string; name: string }>()
    registry.register({ name: 'Test' })

    expect(registry.size).toBe(1)
  })
})
