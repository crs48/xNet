/**
 * PluginRegistry - Central coordinator for plugin lifecycle
 */

import type { ModuleCapabilities } from './feature-module'
import type { XNetExtension } from './manifest'
import type { Platform, Disposable } from './types'
import type { NodeStore } from '@xnetjs/data'
import { createExtensionContext, type ExtensionContext } from './context'
import { ContributionRegistry } from './contributions'
import { isHostCompatible } from './ecosystem/compatibility'
import { evaluateInstallConsent, type ConsentDecision } from './ecosystem/consent'
import {
  findMissingDependencies,
  type DependencyNode,
  type MissingDependency
} from './ecosystem/dependencies'
import {
  deriveTrustTier,
  type InstallProvenance,
  type PluginTrustTier
} from './ecosystem/provenance-trust'
import { validateManifest, PluginValidationError, isPaidPricing } from './manifest'
import { MiddlewareChain } from './middleware'
import { PluginSchema } from './schemas/plugin'

// ─── Types ─────────────────────────────────────────────────────────────────

export type PluginStatus = 'installed' | 'active' | 'disabled' | 'error'

export interface RegisteredPlugin {
  manifest: XNetExtension
  status: PluginStatus
  context?: ExtensionContext
  error?: Error
  /** Where this plugin was installed from — derives its trust tier (0192). */
  provenance?: InstallProvenance
  /** Provenance-derived execution trust tier (0192). */
  trustTier?: PluginTrustTier
}

/**
 * Result of a paid-plugin license check (exploration 0196). The host wires this
 * to `@xnetjs/licenses`' `checkLicenseFor`; the plugin package stays free of a
 * hard dependency on the license verifier.
 */
export interface LicenseCheckResult {
  /** `true` if the buyer holds a valid license for this plugin. */
  ok: boolean
  /** Why it failed (`no-license`, `expired`, `bad-signature`, …) — surfaced to UI. */
  reason?: string
}

/** Options for {@link PluginRegistry.install} (all optional, back-compatible). */
export interface InstallOptions {
  /** Where the plugin came from. Drives trust tier + consent. Default `imported`. */
  provenance?: InstallProvenance
  /** Host app version, for the `xnetVersion` compatibility gate. Skipped if absent. */
  hostVersion?: string
  /**
   * Consent callback. Called only when provenance requires a re-prompt and the
   * plugin actually requests capabilities. Return `false` to abort the install.
   */
  onConsent?: (decision: ConsentDecision) => boolean | Promise<boolean>
  /**
   * Paid-license callback (exploration 0196). Called only when the manifest's
   * `pricing` is non-free. Return `{ ok: false }` to block the install with a
   * {@link LicenseRequiredError}. Absent ⇒ paid plugins are blocked (fail-closed).
   */
  checkLicense?: (manifest: XNetExtension) => LicenseCheckResult | Promise<LicenseCheckResult>
}

export class PluginError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PluginError'
  }
}

/** Thrown when a paid plugin is installed without a valid license (0196). */
export class LicenseRequiredError extends PluginError {
  constructor(
    public readonly pluginId: string,
    public readonly reason: string
  ) {
    super(`Plugin '${pluginId}' requires a valid license (${reason})`)
    this.name = 'LicenseRequiredError'
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
   * Install and activate a plugin.
   *
   * Beyond manifest/platform validation, install runs the 0192 trust gates:
   * host-version compatibility, dependency resolution, and (for non-local
   * provenance) capability consent. Provenance derives the plugin's trust tier.
   */
  async install(manifest: XNetExtension, options: InstallOptions = {}): Promise<void> {
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

    // 4. Host-version compatibility gate (0192)
    if (options.hostVersion && !isHostCompatible(manifest.xnetVersion, options.hostVersion)) {
      throw new PluginError(
        `Plugin '${manifest.id}' requires xNet ${manifest.xnetVersion} (current: ${options.hostVersion})`
      )
    }

    // 5. Dependency gate (0192)
    const missing = this.missingDependencies(manifest)
    if (missing.length > 0) {
      throw new PluginError(
        `Plugin '${manifest.id}' has unmet dependencies: ${formatMissing(missing)}`
      )
    }

    // 6. Capability consent gate (0192)
    const provenance: InstallProvenance = options.provenance ?? 'imported'
    const decision = evaluateInstallConsent(provenance, capabilitiesOf(manifest))
    if (decision.needsPrompt && options.onConsent) {
      const granted = await options.onConsent(decision)
      if (!granted) {
        throw new PluginError(`Plugin '${manifest.id}' install declined at capability consent`)
      }
    }

    // 6.5. Paid-license gate (0196). Fail-closed: a priced plugin with no
    // license provider wired in is blocked, never silently installed for free.
    if (isPaidPricing(manifest.pricing)) {
      const result = options.checkLicense
        ? await options.checkLicense(manifest)
        : { ok: false, reason: 'no-license-provider' }
      if (!result.ok) {
        throw new LicenseRequiredError(manifest.id, result.reason ?? 'no-license')
      }
    }

    // 7. Store plugin metadata as Node
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

    // 8. Register plugin
    this.plugins.set(manifest.id, {
      manifest,
      status: 'installed',
      provenance,
      trustTier: deriveTrustTier(provenance)
    })
    this.notify()

    // 9. Activate
    await this.activate(manifest.id)
  }

  /** Dependencies of `manifest` not satisfied by currently installed plugins. */
  private missingDependencies(manifest: XNetExtension): MissingDependency[] {
    const installed: DependencyNode[] = [...this.plugins.values()].map((p) => ({
      id: p.manifest.id,
      version: p.manifest.version,
      dependencies: p.manifest.dependencies
    }))
    return findMissingDependencies(
      { id: manifest.id, version: manifest.version, dependencies: manifest.dependencies },
      installed
    )
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
      // Create extension context (capabilities → enforced store guard, 0192)
      const context = createExtensionContext({
        pluginId,
        store: this.store,
        contributions: this.contributions,
        platform: this.platform,
        middlewareChain: this.middleware,
        capabilities: capabilitiesOf(plugin.manifest)
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
    if (c.widgets) {
      for (const widget of c.widgets) {
        ctx.registerWidget(widget)
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
    if (c.canvasCards) {
      for (const card of c.canvasCards) {
        ctx.registerCanvasCard(card)
      }
    }
    if (c.canvasIngestors) {
      for (const ingestor of c.canvasIngestors) {
        ctx.registerCanvasIngestor(ingestor)
      }
    }
    if (c.canvasTools) {
      for (const tool of c.canvasTools) {
        ctx.registerCanvasTool(tool)
      }
    }
    if (c.canvasLayouts) {
      for (const layout of c.canvasLayouts) {
        ctx.registerCanvasLayout(layout)
      }
    }
    if (c.canvasEdges) {
      for (const edge of c.canvasEdges) {
        ctx.registerCanvasEdge(edge)
      }
    }
    if (c.canvasInspectors) {
      for (const inspector of c.canvasInspectors) {
        ctx.registerCanvasInspector(inspector)
      }
    }
    if (c.canvasTemplates) {
      for (const template of c.canvasTemplates) {
        ctx.registerCanvasTemplate(template)
      }
    }
    if (c.importers) {
      for (const importer of c.importers) {
        ctx.registerImporter(importer)
      }
    }
    if (c.mentionProviders) {
      for (const provider of c.mentionProviders) {
        ctx.registerMentionProvider(provider)
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Read the declared capability grant off a manifest (FeatureModules carry it). */
function capabilitiesOf(manifest: XNetExtension): ModuleCapabilities | undefined {
  return (manifest as { capabilities?: ModuleCapabilities }).capabilities
}

/** Render unmet dependencies as a compact human string. */
function formatMissing(missing: MissingDependency[]): string {
  return missing
    .map((m) =>
      m.reason === 'not-installed'
        ? `${m.required}@${m.range} (not installed)`
        : `${m.required}@${m.range} (have ${m.installedVersion})`
    )
    .join(', ')
}
