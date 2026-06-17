/**
 * @xnetjs/plugins — plugin authoring test kit (exploration 0192).
 *
 * A zero-setup harness so plugin authors can unit-test a manifest without a real
 * NodeStore or the app: spin up an in-memory store, install the plugin into a
 * real `PluginRegistry`, and assert on the contributions it registered. This is
 * the "@xnetjs/plugin-testing" surface, kept in-package to avoid a new workspace
 * dependency.
 */

import type { XNetExtension } from '../manifest'
import type { Platform } from '../types'
import { PluginRegistry } from '../registry'

interface MemNode {
  id: string
  schemaId: string
  properties: Record<string, unknown>
  deleted?: boolean
}

type Listener = (event: unknown) => void

/** A minimal in-memory NodeStore good enough for plugin lifecycle tests. */
export interface TestNodeStore {
  create(options: { schemaId: string; properties?: Record<string, unknown> }): Promise<MemNode>
  get(id: string): Promise<MemNode | null>
  update(id: string, options: { properties?: Record<string, unknown> }): Promise<MemNode>
  delete(id: string): Promise<void>
  list(options?: { schemaId?: string }): Promise<MemNode[]>
  subscribe(listener: Listener): () => void
  /** Test helper: how many live nodes exist (optionally for one schema). */
  count(schemaId?: string): number
}

export function createTestNodeStore(initial: MemNode[] = []): TestNodeStore {
  const nodes = new Map<string, MemNode>(initial.map((n) => [n.id, n]))
  const listeners = new Set<Listener>()
  let counter = 0

  const emit = (event: unknown) => {
    for (const l of listeners) {
      try {
        l(event)
      } catch {
        /* listeners must not break the store */
      }
    }
  }

  return {
    async create(options) {
      counter += 1
      const node: MemNode = {
        id: `test-node-${counter}`,
        schemaId: options.schemaId,
        properties: options.properties ?? {}
      }
      nodes.set(node.id, node)
      emit({ change: { type: 'node-change', payload: { nodeId: node.id } }, node })
      return node
    },
    async get(id) {
      const node = nodes.get(id)
      return node && !node.deleted ? node : null
    },
    async update(id, options) {
      const existing = nodes.get(id)
      if (!existing) throw new Error(`Node not found: ${id}`)
      const node: MemNode = {
        ...existing,
        properties: { ...existing.properties, ...options.properties }
      }
      nodes.set(id, node)
      emit({ change: { type: 'node-update', payload: { nodeId: id } }, node })
      return node
    },
    async delete(id) {
      const existing = nodes.get(id)
      if (existing) {
        existing.deleted = true
        emit({ change: { type: 'node-delete', payload: { nodeId: id } }, node: existing })
      }
    },
    async list(options) {
      let result = Array.from(nodes.values()).filter((n) => !n.deleted)
      if (options?.schemaId) result = result.filter((n) => n.schemaId === options.schemaId)
      return result
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    count(schemaId) {
      let live = Array.from(nodes.values()).filter((n) => !n.deleted)
      if (schemaId) live = live.filter((n) => n.schemaId === schemaId)
      return live.length
    }
  }
}

export interface TestPluginHarness {
  registry: PluginRegistry
  store: TestNodeStore
  /** Install a plugin and return its registered record. */
  install(manifest: XNetExtension): Promise<void>
}

export interface TestHarnessOptions {
  platform?: Platform
  initialNodes?: MemNode[]
}

/**
 * Build a ready-to-use plugin test harness: an in-memory store wired into a real
 * `PluginRegistry`. Use it to install a plugin and assert on
 * `registry.getContributions()` or `registry.get(id)?.status`.
 *
 * @example
 * const h = createTestPluginHarness()
 * await h.install(MyPlugin)
 * expect(h.registry.get('com.me.plugin')?.status).toBe('active')
 * expect(h.registry.getContributions().slashCommands.getAll()).toHaveLength(1)
 */
export function createTestPluginHarness(options: TestHarnessOptions = {}): TestPluginHarness {
  const store = createTestNodeStore(options.initialNodes)
  const platform: Platform = options.platform ?? 'web'
  // The registry only calls create/list/delete/subscribe — the in-memory store
  // satisfies that surface; cast through unknown to the NodeStore the API expects.
  const registry = new PluginRegistry(store as unknown as ConstructorStore, platform)
  return {
    registry,
    store,
    install: (manifest) => registry.install(manifest)
  }
}

// The PluginRegistry constructor's first parameter type, referenced structurally
// so the harness does not import @xnetjs/data just to name it.
type ConstructorStore = ConstructorParameters<typeof PluginRegistry>[0]
