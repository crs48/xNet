/**
 * ExtensionContext - The API surface available to plugins
 */

import type {
  ContributionRegistry,
  ViewContribution,
  CommandContribution,
  SlashCommandContribution,
  EditorContribution,
  SidebarContribution,
  PropertyHandlerContribution,
  BlockContribution
} from './contributions'
import type { NodeStoreMiddleware } from './middleware'
import type { Disposable, Platform, PlatformCapabilities, ExtensionStorage } from './types'
import type {
  SchemaIRI,
  NodeStore,
  NodeState,
  NodeChangeListener as StoreChangeListener,
  NodeChangeEvent as StoreChangeEvent
} from '@xnet/data'
import { getPlatformCapabilities, createExtensionStorage } from './types'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PluginNodeChangeEvent {
  type: 'create' | 'update' | 'delete'
  nodeId: string
  node?: NodeState
  changes?: Record<string, { old: unknown; new: unknown }>
}

export type PluginNodeChangeListener = (event: PluginNodeChangeEvent) => void

export interface QueryFilter {
  where?: Record<string, unknown>
  limit?: number
  offset?: number
}

// ─── Extension Context ─────────────────────────────────────────────────────

/**
 * Context provided to plugins during activation.
 * All registration methods return Disposables that are auto-disposed on deactivation.
 */
export interface ExtensionContext {
  /** Plugin ID */
  readonly pluginId: string
  /** Current platform */
  readonly platform: Platform

  // ─── Data Access ───────────────────────────────────────────────────────

  /** NodeStore instance */
  readonly store: NodeStore
  /** Query nodes by schema (async) */
  query(schema: SchemaIRI, filter?: QueryFilter): Promise<NodeState[]>
  /** Subscribe to node changes */
  subscribe(schema: SchemaIRI | null, callback: PluginNodeChangeListener): Disposable

  // ─── Registration ──────────────────────────────────────────────────────

  /** Register a custom schema */
  registerSchema(schema: unknown): Disposable
  /** Register a custom view type */
  registerView(view: ViewContribution): Disposable
  /** Register a property type handler */
  registerPropertyHandler(type: string, handler: PropertyHandlerContribution['handler']): Disposable
  /** Register a command */
  registerCommand(command: CommandContribution): Disposable
  /** Register a sidebar item */
  registerSidebarItem(item: SidebarContribution): Disposable
  /** Register a TipTap editor extension */
  registerEditorExtension(ext: EditorContribution): Disposable
  /** Register a slash command */
  registerSlashCommand(cmd: SlashCommandContribution): Disposable
  /** Register a custom block type */
  registerBlockType(block: BlockContribution): Disposable
  /** Add middleware to NodeStore */
  addMiddleware(middleware: NodeStoreMiddleware): Disposable

  // ─── Storage & Capabilities ────────────────────────────────────────────

  /** Plugin-private storage */
  readonly storage: ExtensionStorage
  /** Platform capabilities */
  readonly capabilities: PlatformCapabilities

  // ─── Lifecycle ─────────────────────────────────────────────────────────

  /** Auto-cleanup list - disposed when plugin deactivates */
  readonly subscriptions: Disposable[]
}

// ─── Factory ───────────────────────────────────────────────────────────────

export interface CreateContextOptions {
  pluginId: string
  store: NodeStore
  contributions: ContributionRegistry
  platform: Platform
  middlewareChain?: {
    add(middleware: NodeStoreMiddleware): Disposable
  }
}

/**
 * Create an ExtensionContext for a plugin
 */
export function createExtensionContext(options: CreateContextOptions): ExtensionContext {
  const { pluginId, store, contributions, platform, middlewareChain } = options
  const disposables: Disposable[] = []
  const storage = createExtensionStorage()

  const ctx: ExtensionContext = {
    pluginId,
    platform,
    store,

    async query(schema, filter) {
      const nodes = await store.list()
      let filtered = schema ? nodes.filter((n: NodeState) => n.schemaId === schema) : nodes

      if (filter?.where) {
        filtered = filtered.filter((node: NodeState) => {
          for (const [key, value] of Object.entries(filter.where!)) {
            if ((node as unknown as Record<string, unknown>)[key] !== value) return false
          }
          return true
        })
      }

      if (filter?.offset) {
        filtered = filtered.slice(filter.offset)
      }
      if (filter?.limit) {
        filtered = filtered.slice(0, filter.limit)
      }

      return filtered
    },

    subscribe(schema, callback) {
      const storeCallback: StoreChangeListener = (event: StoreChangeEvent) => {
        if (!schema || event.node?.schemaId === schema) {
          // Map the store's NodeChangeEvent to our plugin-friendly format
          const change = event.change
          callback({
            type:
              change.type === 'node-delete'
                ? 'delete'
                : change.type === 'node-change'
                  ? 'create'
                  : 'update',
            nodeId: change.payload.nodeId,
            node: event.node ?? undefined,
            changes: undefined // Raw change available via event.change if needed
          })
        }
      }
      const unsub = store.subscribe(storeCallback)
      const disposable = { dispose: unsub }
      disposables.push(disposable)
      return disposable
    },

    registerSchema(_schema) {
      // Schema registration is handled by @xnet/data's schemaRegistry
      // For now, we just track it for cleanup
      const d: Disposable = {
        dispose: () => {
          // schemaRegistry.unregister would go here
        }
      }
      disposables.push(d)
      return d
    },

    registerView(view) {
      const d = contributions.views.register(view)
      disposables.push(d)
      return d
    },

    registerPropertyHandler(type, handler) {
      const d = contributions.propertyHandlers.register({ type, handler })
      disposables.push(d)
      return d
    },

    registerCommand(command) {
      const d = contributions.commands.register(command)
      disposables.push(d)
      return d
    },

    registerSidebarItem(item) {
      const d = contributions.sidebar.register(item)
      disposables.push(d)
      return d
    },

    registerEditorExtension(ext) {
      const d = contributions.editor.register(ext)
      disposables.push(d)
      return d
    },

    registerSlashCommand(cmd) {
      const d = contributions.slashCommands.register(cmd)
      disposables.push(d)
      return d
    },

    registerBlockType(block) {
      const d = contributions.blocks.register(block)
      disposables.push(d)
      return d
    },

    addMiddleware(middleware) {
      if (!middlewareChain) {
        console.warn(`[Plugin ${pluginId}] Middleware not available on this platform`)
        return { dispose: () => {} }
      }
      const namespacedMiddleware = {
        ...middleware,
        id: `${pluginId}:${middleware.id}`
      }
      const d = middlewareChain.add(namespacedMiddleware)
      disposables.push(d)
      return d
    },

    storage,
    capabilities: getPlatformCapabilities(platform),
    subscriptions: disposables
  }

  return ctx
}
