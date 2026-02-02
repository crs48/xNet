/**
 * PluginRegistry - Central coordinator for plugin lifecycle
 */

import type { NodeStore } from '@xnet/data'
import type { Platform, Disposable } from './types'
import type { XNetExtension } from './manifest'
import { validateManifest, PluginValidationError } from './manifest'
import { ContributionRegistry } from './contributions'
import { createExtensionContext, type ExtensionContext } from './context'
import { MiddlewareChain } from './middleware'
import { PluginSchema, type PluginNode } from './schemas/plugin'

// ─── Types ─────────────────────────────────────────────────────────────────

export type PluginStatus = 'installed' | 'active' | 'disabled' | 'error'

export interface RegisteredPlugin {
  manifest: XNetExtension
  status: PluginStatus
  context?: ExtensionContext
  error?: Error
}

export class PluginError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PluginError'
  }
}

// ─── Plugin Registry ───────────────────────────────────────────────────────

/**
 * Manages plugin lifecycle: install, activate, deactivate, uninstall
 */
export class PluginRegistry {
  private plugins = new Map<string, RegisteredPlugin>()
  private contributions = new ContributionRegistry()
  private middleware = new MiddlewareChain()
  private listeners = new Set<() => void>()

  constructor(
    private store: NodeStore,
    private platform: Platform
  ) {}

  // ─── Lifecycle ─────────────────────────────────────────────────────────

  /**
   * Install and activate a plugin
   */
  async install(manifest: XNetExtension): Promise<void> {
    // 1. Validate manifest
    try {
      validateManifest(manifest)
    } catch (err) {
      if (err instanceof PluginValidationError) {
        throw new PluginError(`Invalid manifest: ${err.issues.join(', ')}`)
      }
      throw err
    }

    // 2. Check platform compatibility
    if (manifest.platforms && !manifest.platforms.includes(this.platform)) {
      throw new PluginError(
        `Plugin '${manifest.id}' requires platforms: ${manifest.platforms.join(', ')} (current: ${this.platform})`
      )
    }

    // 3. Check for existing installation
    if (this.plugins.has(manifest.id)) {
      throw new PluginError(`Plugin '${manifest.id}' is already installed`)
    }

    // 4. Store plugin metadata as Node
    await this.store.create({
      schemaId: PluginSchema._schemaId,
      properties: {
        pluginId: manifest.id,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description ?? '',
        author: manifest.author ?? '',
        enabled: true,
        manifest: JSON.stringify(manifest),
        installedAt: Date.now()
      }
    })

    // 5. Register plugin
    this.plugins.set(manifest.id, { manifest, status: 'installed' })
    this.notify()

    // 6. Activate
    await this.activate(manifest.id)
  }

  /**
   * Activate an installed plugin
   */
  async activate(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) {
      throw new PluginError(`Plugin '${pluginId}' not found`)
    }
    if (plugin.status === 'active') {
      return // Already active
    }

    try {
      // Create extension context
      const context = createExtensionContext({
        pluginId,
        store: this.store,
        contributions: this.contributions,
        platform: this.platform,
        middlewareChain: this.middleware
      })

      // Register static contributions from manifest
      this.registerStaticContributions(plugin.manifest, context)

      // Call activate lifecycle hook
      if (plugin.manifest.activate) {
        await plugin.manifest.activate(context)
      }

      plugin.context = context
      plugin.status = 'active'
      plugin.error = undefined
      this.notify()
    } catch (err) {
      plugin.status = 'error'
      plugin.error = err instanceof Error ? err : new Error(String(err))
      console.error(`Plugin '${pluginId}' activation failed:`, err)
      this.notify()
      throw plugin.error
    }
  }

  /**
   * Deactivate an active plugin
   */
  async deactivate(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId)
    if (!plugin || plugin.status !== 'active') {
      return
    }

    // Call deactivate lifecycle hook (catch errors to ensure cleanup runs)
    if (plugin.manifest.deactivate) {
      try {
        await plugin.manifest.deactivate()
      } catch (err) {
        console.error(`Plugin '${pluginId}' deactivate error:`, err)
      }
    }

    // Always dispose subscriptions
    if (plugin.context) {
      for (const d of plugin.context.subscriptions) {
        try {
          d.dispose()
        } catch (err) {
          console.error(`Error disposing subscription for plugin '${pluginId}':`, err)
        }
      }
    }
    plugin.context = undefined
    plugin.status = 'disabled'
    this.notify()
  }

  /**
   * Uninstall a plugin (deactivates first if active)
   */
  async uninstall(pluginId: string): Promise<void> {
    await this.deactivate(pluginId)
    this.plugins.delete(pluginId)

    // Remove plugin Node from store
    const nodes = await this.store.list()
    const pluginNode = nodes.find(
      (n) =>
        n.schemaId === PluginSchema._schemaId &&
        (n.properties as Record<string, unknown>).pluginId === pluginId
    )
    if (pluginNode) {
      await this.store.delete(pluginNode.id)
    }

    this.notify()
  }

  // ─── Queries ───────────────────────────────────────────────────────────

  /**
   * Get all registered plugins
   */
  getAll(): RegisteredPlugin[] {
    return [...this.plugins.values()]
  }

  /**
   * Get a specific plugin
   */
  get(pluginId: string): RegisteredPlugin | undefined {
    return this.plugins.get(pluginId)
  }

  /**
   * Check if a plugin is installed
   */
  has(pluginId: string): boolean {
    return this.plugins.has(pluginId)
  }

  /**
   * Rehydrate a plugin loaded from store with a live manifest.
   *
   * When plugins are persisted via `install()`, the manifest is serialized
   * with `JSON.stringify()`, which strips non-serializable values like
   * TipTap Extension instances, React components, and functions. When
   * `loadFromStore()` deserializes with `JSON.parse()`, these values are
   * lost and the plugin's contributions (e.g., editor extensions) are broken.
   *
   * For bundled plugins, the `BundledPluginInstaller` has access to the live
   * manifest objects. This method replaces the deserialized manifest with the
   * live one and re-registers its static contributions so that extension
   * objects with methods (like `renderHTML`, `addNodeView`) are properly
   * available to the editor.
   */
  async rehydrate(liveManifest: XNetExtension): Promise<void> {
    const plugin = this.plugins.get(liveManifest.id)
    if (!plugin) return

    // Deactivate to clean up stale contributions from the deserialized manifest
    if (plugin.status === 'active') {
      await this.deactivate(liveManifest.id)
    }

    // Replace the deserialized manifest with the live one
    plugin.manifest = liveManifest
    plugin.status = 'installed'

    // Re-activate with the live manifest
    await this.activate(liveManifest.id)
  }

  /**
   * Get contribution registry
   */
  getContributions(): ContributionRegistry {
    return this.contributions
  }

  /**
   * Get middleware chain
   */
  getMiddleware(): MiddlewareChain {
    return this.middleware
  }

  // ─── Events ────────────────────────────────────────────────────────────

  /**
   * Subscribe to plugin changes
   */
  onChange(listener: () => void): Disposable {
    this.listeners.add(listener)
    return {
      dispose: () => this.listeners.delete(listener)
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (err) {
        console.error('[PluginRegistry] Listener error:', err)
      }
    }
  }

  // ─── Static Contributions ──────────────────────────────────────────────

  private registerStaticContributions(manifest: XNetExtension, ctx: ExtensionContext): void {
    const c = manifest.contributes
    if (!c) return

    if (c.views) {
      for (const view of c.views) {
        ctx.registerView(view)
      }
    }
    if (c.commands) {
      for (const cmd of c.commands) {
        ctx.registerCommand(cmd)
      }
    }
    if (c.slashCommands) {
      for (const cmd of c.slashCommands) {
        ctx.registerSlashCommand(cmd)
      }
    }
    if (c.sidebarItems) {
      for (const item of c.sidebarItems) {
        ctx.registerSidebarItem(item)
      }
    }
    if (c.editorExtensions) {
      for (const ext of c.editorExtensions) {
        ctx.registerEditorExtension(ext)
      }
    }
    if (c.propertyHandlers) {
      for (const h of c.propertyHandlers) {
        ctx.registerPropertyHandler(h.type, h.handler)
      }
    }
    if (c.blocks) {
      for (const block of c.blocks) {
        ctx.registerBlockType(block)
      }
    }
  }

  // ─── Load from Store ───────────────────────────────────────────────────

  /**
   * Load and activate plugins from stored Nodes
   */
  async loadFromStore(): Promise<void> {
    const nodes = await this.store.list()
    const pluginNodes = nodes.filter((n) => n.schemaId === PluginSchema._schemaId)

    for (const node of pluginNodes) {
      const props = node.properties as Record<string, unknown>
      if (!props.enabled) continue

      try {
        const manifest = JSON.parse(props.manifest as string) as XNetExtension

        // Skip if already installed
        if (this.plugins.has(manifest.id)) continue

        this.plugins.set(manifest.id, { manifest, status: 'installed' })
        await this.activate(manifest.id)
      } catch (err) {
        console.error(`Failed to load plugin '${props.pluginId}':`, err)
      }
    }
  }
}
