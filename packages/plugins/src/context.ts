/**
 * ExtensionContext - The API surface available to plugins
 */

import type { AgentToolContribution } from './agent-tools'
import type {
  ContributionRegistry,
  FrameRendererContribution,
  SlotContribution,
  ViewContribution,
  WidgetContribution,
  CommandContribution,
  SlashCommandContribution,
  EditorContribution,
  SidebarContribution,
  PropertyHandlerContribution,
  BlockContribution,
  CanvasCardContribution,
  CanvasIngestorContribution,
  CanvasToolContribution,
  CanvasLayoutContribution,
  CanvasEdgeContribution,
  CanvasInspectorContribution,
  CanvasTemplateContribution,
  ImporterContribution
} from './contributions'
import type { ModuleCapabilities } from './feature-module'
import type { MentionProviderContribution } from './mention-providers'
import type { NodeStoreMiddleware } from './middleware'
import type { Disposable, Platform, PlatformCapabilities, ExtensionStorage } from './types'
import type {
  SchemaIRI,
  NodeStore,
  NodeState,
  NodeChangeListener as StoreChangeListener,
  NodeChangeEvent as StoreChangeEvent
} from '@xnetjs/data'
import { guardStore } from './ecosystem/capability-guard'
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
  /**
   * Register a frame source renderer (0346). Own-views-only rule: the
   * renderer id is namespaced under this plugin's id, so a plugin can
   * add frames for its own schemas but never replace another provider's
   * renderer.
   */
  registerFrameRenderer(renderer: FrameRendererContribution): Disposable
  /** Register a dashboard widget (trust tier assigned by the host) */
  registerWidget(widget: WidgetContribution): Disposable
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
  /** Register a canvas card renderer descriptor */
  registerCanvasCard(card: CanvasCardContribution): Disposable
  /** Register a canvas ingestor descriptor */
  registerCanvasIngestor(ingestor: CanvasIngestorContribution): Disposable
  /** Register a canvas tool descriptor */
  registerCanvasTool(tool: CanvasToolContribution): Disposable
  /** Register a canvas layout descriptor */
  registerCanvasLayout(layout: CanvasLayoutContribution): Disposable
  /** Register a canvas edge relationship descriptor */
  registerCanvasEdge(edge: CanvasEdgeContribution): Disposable
  /** Register a canvas inspector descriptor */
  registerCanvasInspector(inspector: CanvasInspectorContribution): Disposable
  /** Register a canvas template descriptor */
  registerCanvasTemplate(template: CanvasTemplateContribution): Disposable
  /** Register a data-export / source importer (exploration 0189) */
  registerImporter(importer: ImporterContribution): Disposable
  /** Register a mention/typeahead provider (exploration 0194) */
  registerMentionProvider(provider: MentionProviderContribution): Disposable
  /** Register a model-facing agent tool (exploration 0196) */
  registerAgentTool(tool: AgentToolContribution): Disposable
  /** Register a shell slot view (exploration 0280) */
  registerSlotView(view: SlotContribution): Disposable
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
  /**
   * Declared capability grant (exploration 0192). When present, the plugin's
   * `store` handle is wrapped so writes outside `schemaWrite` throw — turning the
   * declaration into an enforced gate at the one choke point a plugin can't
   * route around. Absent/empty → the store is handed through unguarded.
   */
  capabilities?: ModuleCapabilities
}

/**
 * Create an ExtensionContext for a plugin
 */
export function createExtensionContext(options: CreateContextOptions): ExtensionContext {
  const { pluginId, contributions, platform, middlewareChain, capabilities } = options
  // Enforce the declared capability grant at the store boundary.
  const store = guardStore(options.store, capabilities, pluginId)
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
      // Schema registration is handled by @xnetjs/data's schemaRegistry
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

    registerFrameRenderer(renderer) {
      // Own-views-only (0346): namespace the id under this plugin and
      // refuse to shadow another provider's renderer.
      const namespacedId = renderer.id.startsWith(`${pluginId}:`)
        ? renderer.id
        : `${pluginId}:${renderer.id}`
      const existing = contributions.frameRenderers
        .getAll()
        .find((entry) => entry.id === namespacedId)
      if (existing) {
        throw new Error(`[Plugin ${pluginId}] frame renderer already registered: ${namespacedId}`)
      }
      const d = contributions.frameRenderers.register({ ...renderer, id: namespacedId })
      disposables.push(d)
      return d
    },

    registerWidget(widget) {
      const d = contributions.widgets.register(widget)
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

    registerCanvasCard(card) {
      const d = contributions.canvasCards.register(card)
      disposables.push(d)
      return d
    },

    registerCanvasIngestor(ingestor) {
      const d = contributions.canvasIngestors.register(ingestor)
      disposables.push(d)
      return d
    },

    registerCanvasTool(tool) {
      const d = contributions.canvasTools.register(tool)
      disposables.push(d)
      return d
    },

    registerCanvasLayout(layout) {
      const d = contributions.canvasLayouts.register(layout)
      disposables.push(d)
      return d
    },

    registerCanvasEdge(edge) {
      const d = contributions.canvasEdges.register(edge)
      disposables.push(d)
      return d
    },

    registerCanvasInspector(inspector) {
      const d = contributions.canvasInspectors.register(inspector)
      disposables.push(d)
      return d
    },

    registerCanvasTemplate(template) {
      const d = contributions.canvasTemplates.register(template)
      disposables.push(d)
      return d
    },

    registerImporter(importer) {
      const d = contributions.importers.register(importer)
      disposables.push(d)
      return d
    },

    registerMentionProvider(provider) {
      const d = contributions.mentionProviders.register(provider)
      disposables.push(d)
      return d
    },

    registerAgentTool(tool) {
      const d = contributions.agentTools.register(tool)
      disposables.push(d)
      return d
    },

    registerSlotView(view) {
      const d = contributions.slots.register(view)
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
