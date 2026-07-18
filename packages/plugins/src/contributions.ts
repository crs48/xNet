/**
 * Contribution types and registry for plugin-provided extensions
 */

import type { AgentToolContribution } from './agent-tools'
import type { AiJsonSchema, AiRiskLevel, AiScope } from './ai-surface/types'
import type { MentionProviderContribution } from './mention-providers'
import type { Disposable } from './types'
import type { ComponentType } from 'react'

/**
 * How a command opts in to being callable by the AI agent as a tool
 * (exploration 0194 Phase 2). Absent / `aiExposed:false` → the AI never sees it.
 */
export interface AiCommandExposure {
  /** Expose this command to the AI agent as a callable tool. Opt-in. */
  aiExposed?: boolean
  /** JSON schema for the tool's args (defaults to an empty object schema). */
  aiInputSchema?: {
    type: 'object'
    properties: Record<string, AiJsonSchema>
    required?: readonly string[]
  }
  /** Risk level surfaced to the agent + consent (default `medium`). */
  aiRisk?: AiRiskLevel
  /** AI scopes this command requires (checked against the plugin's grant; default none). */
  aiScopes?: AiScope[]
  /** Arg-taking AI invocation; falls back to `execute()` when absent. */
  aiInvoke?: (args: Record<string, unknown>) => unknown | Promise<unknown>
}

// ─── Contribution Types ────────────────────────────────────────────────────

export interface ViewContribution {
  /** Unique view type identifier */
  type: string
  /** Display name */
  name: string
  /** Icon (Lucide icon name or component) */
  icon?: string | ComponentType
  /** React component for rendering the view */
  component: ComponentType<ViewProps>
  /** Schema IRIs this view supports (empty = all) */
  supportedSchemas?: string[]
}

/**
 * A frame source renderer (0346): how a node of some schema renders as
 * a frame (document embeds, dashboard frame widgets, frame tabs). The
 * capability rule mirrors slots: a plugin registers renderers only under
 * its OWN id namespace and never replaces another provider's renderer —
 * enforced by `PluginContext.registerFrameRenderer`.
 */
export interface FrameRendererContribution {
  /** Renderer id — namespaced `${pluginId}:${name}` by the context. */
  id: string
  /** Schema IRIs this renderer can frame ('*' = any). */
  supportedSchemas: string[] | '*'
  /** Component receiving the host's NodeFrameProps contract. */
  component: ComponentType<never>
}

export interface ViewProps {
  nodeId: string
  schemaId: string
}

export interface CommandContribution extends AiCommandExposure {
  /** Unique command ID */
  id: string
  /** Display name */
  name: string
  /** Description for command palette */
  description?: string
  /** Keyboard shortcut (e.g., 'Mod-Shift-P') */
  keybinding?: string
  /** Search keywords for fuzzy matching */
  keywords?: string[]
  /** Icon (Lucide icon name) */
  icon?: string
  /** Command handler */
  execute: () => void | Promise<void>
  /** Whether command is currently enabled */
  when?: () => boolean
}

export interface SlashCommandContribution {
  /** Unique command ID */
  id: string
  /** Display name in slash menu */
  name: string
  /** Description shown in menu */
  description?: string
  /** Search aliases */
  aliases?: string[]
  /** Icon (Lucide icon name) */
  icon?: string
  /** Insert content or execute action */
  execute: (props: SlashCommandContext) => void
}

export interface SlashCommandContext {
  editor: unknown // BlockNote editor instance (0312)
  range: { from: number; to: number }
}

/**
 * Editor contribution (re-typed for the BlockNote editor, 0312).
 *
 * Plugins contribute BlockNote specs — `createReactBlockSpec` /
 * `createReactInlineContentSpec` / `createReactStyleSpec` results keyed by
 * spec name — plus behavior-only slash menu items. Spec values are opaque
 * here so this package needs no editor dependency.
 *
 * SCHEMA-SKEW WARNING (0205): block/inline/style specs define the
 * PERSISTED document schema. Under Yjs collaboration every peer must run
 * the identical schema; a spec only some peers have silently drops
 * content. `editor-schema-safety.ts` flags specs that aren't statically
 * bundled in @xnetjs/editor's schema.
 */
export interface EditorContribution {
  /** Unique contribution ID */
  id: string
  /** BlockNote block specs, keyed by block type name (skew-sensitive) */
  blockSpecs?: Record<string, unknown>
  /** BlockNote inline content specs, keyed by type name (skew-sensitive) */
  inlineContentSpecs?: Record<string, unknown>
  /** BlockNote style specs, keyed by style name (skew-sensitive) */
  styleSpecs?: Record<string, unknown>
  /** Behavior-only slash menu items (skew-safe) */
  slashMenuItems?: SlashCommandContribution[]
  /** Priority for ordering (lower = earlier, default: 100) */
  priority?: number
}

/**
 * Status bar item contributed by a plugin (0166 workbench).
 * Left side = workspace scope; right side = view scope.
 */
export interface StatusBarContribution {
  /** Unique item ID */
  id: string
  /** Static text, or a getter polled on render */
  text: string | (() => string)
  /** Which side of the status bar (default 'left') */
  side?: 'left' | 'right'
  /** Tooltip */
  tooltip?: string
  /** Command id (CommandRegistry) to run on click */
  command?: string
  /** Priority within the side (lower = earlier) */
  priority?: number
}

export interface SidebarContribution {
  /** Unique item ID */
  id: string
  /** Display name */
  name: string
  /** Icon (Lucide icon name or React component) */
  icon: string | ComponentType
  /** Position in sidebar: top, bottom, or within a section */
  position?: 'top' | 'bottom' | 'section'
  /** Section name for 'section' position */
  section?: string
  /** Priority within position (lower = higher) */
  priority?: number
  /** Dynamic badge (e.g., unread count) */
  badge?: () => string | number | null
  /** Click handler or route path */
  action: (() => void) | string
  /** Optional panel component to render */
  panel?: ComponentType
}

/**
 * Dashboard widget contribution (0162).
 *
 * Mirrors WidgetDefinition from @xnetjs/dashboard structurally (kept
 * dependency-free here, like ViewContribution). The host assigns the trust
 * tier from the plugin's install source — plugins never self-declare it —
 * and registers the widget into the dashboard WidgetRegistry.
 */
export interface WidgetContribution {
  /** Widget registry key, e.g. 'com.example.burndown' (plugin-scoped) */
  type: string
  /** Display name shown in the widget picker */
  name: string
  /** Lucide icon name or component */
  icon?: string | ComponentType
  /** Short description for the picker */
  description?: string
  /** Config fields driving the auto-generated editor */
  configFields?: WidgetContributionConfigField[]
  /** Default + minimum tile size in 12-column grid units */
  defaultSize: { w: number; h: number; minW?: number; minH?: number }
  /** Sensible defaults so a freshly added widget renders immediately */
  getStubConfig: (ctx: { schemas: string[] }) => {
    config: Record<string, unknown>
    query?: unknown
  }
  /** The renderer (runs in the tier-appropriate host) */
  component: ComponentType<WidgetContributionProps>
}

export interface WidgetContributionConfigField {
  key: string
  label: string
  type: 'property-select' | 'select' | 'number' | 'checkbox' | 'text' | 'color'
  options?: Array<{ label: string; value: string }>
  required?: boolean
  description?: string
  defaultValue?: unknown
}

export interface WidgetContributionProps {
  config: Record<string, unknown>
  data: {
    rows: Array<Record<string, unknown> & { id: string }>
    aggregates: unknown
    queries: Record<string, Array<Record<string, unknown> & { id: string }>>
    loading: boolean
    error: Error | null
  }
  width: number
  height: number
  variables: Readonly<Record<string, unknown>>
  onConfigChange?: (next: Record<string, unknown>) => void
  onOpenNode?: (nodeId: string, schemaId: string) => void
}

export interface PropertyHandlerContribution {
  /** Property type this handler manages */
  type: string
  /** Handler implementation */
  handler: PropertyHandler
}

export interface PropertyHandler {
  /** Render the property cell in table view */
  Cell: ComponentType<PropertyCellProps>
  /** Render the property editor */
  Editor: ComponentType<PropertyEditorProps>
  /** Parse string input to property value */
  parse?: (input: string) => unknown
  /** Format value for display */
  format?: (value: unknown) => string
  /** Validate value */
  validate?: (value: unknown) => boolean
}

export interface PropertyCellProps {
  value: unknown
  config?: Record<string, unknown>
}

export interface PropertyEditorProps {
  value: unknown
  onChange: (value: unknown) => void
  config?: Record<string, unknown>
}

export interface BlockContribution {
  /** Block type identifier */
  type: string
  /** Display name */
  name: string
  /** React component */
  component: ComponentType<BlockProps>
}

export interface BlockProps {
  node: unknown
  updateAttributes: (attrs: Record<string, unknown>) => void
}

export interface SettingContribution {
  /** Setting section ID */
  id: string
  /** Section title */
  title: string
  /** Description for the settings panel */
  description?: string
  /** Icon (Lucide icon name) */
  icon?: string
  /** Which settings section this belongs to */
  section?: 'general' | 'appearance' | 'plugins' | 'data' | 'network'
  /** Settings panel component */
  component: ComponentType<SettingsPanelProps>
}

export interface SettingsPanelProps {
  /** Plugin's key-value storage */
  storage: {
    get: <T>(key: string) => T | undefined
    set: <T>(key: string, value: T) => void
    keys: () => string[]
  }
}

export interface SchemaContribution {
  /** The schema definition */
  schema: unknown // DefinedSchema from @xnetjs/data
}

/**
 * Slot prominence (0273, generalized in 0280). `hero` views render in
 * their region's one-tap strip; `secondary` views live behind "More" and
 * the command palette. Same progressive-disclosure grammar as the devtools
 * panel registry (packages/devtools/src/panels/panel-registry.ts), lifted
 * to an app-level contribution point.
 */
export type SurfaceDockTier = 'hero' | 'secondary'

/**
 * The shell's region skeleton a slot view may occupy (exploration 0280).
 * Mirrors the app's LayoutTree regions: edge strips (`rail`, `status`)
 * and the four docks. The `surface` center is not a slot target — views
 * there are routes/tabs, not panels.
 */
export type SlotRegion =
  | 'rail'
  | 'status'
  | 'dock.left'
  | 'dock.right'
  | 'dock.bottom'
  | 'dock.corner'

/**
 * A view contributed to the shell's slot system (exploration 0280 —
 * generalizing the 0273 SurfaceDock contract to every region). Where the
 * view actually sits is the user's layout tree; `defaultRegion` only says
 * where it lands until the user (or their agent) moves it, and
 * `allowedRegions` bounds where it may go. A plugin places only its OWN
 * views; moving anyone else's is the user's (or consented agent's) call.
 */
export interface SlotContribution {
  /** Unique view ID, preferably plugin-scoped */
  id: string
  /** Display name in strips / menus / palette */
  label: string
  /** Lucide icon name or component */
  icon?: string | ComponentType
  /** Prominence within the region: hero = strip, secondary = More + palette */
  tier: SurfaceDockTier
  /** Grouping key for menus (e.g. 'capture', 'activity', 'tools') */
  group?: string
  /** Extra palette search terms */
  keywords?: string[]
  /** Short description for the palette */
  description?: string
  /** Ordering within the tier (lower = earlier) */
  priority?: number
  /** Dynamic badge (e.g. unread count); null hides it */
  badge?: () => string | number | null
  /** The view body, rendered inside its region's host */
  component: ComponentType
  /** Where the view lands if the user hasn't placed it (default: dock.corner) */
  defaultRegion?: SlotRegion
  /** Regions the view may occupy (empty/undefined = any region) */
  allowedRegions?: SlotRegion[]
}

/**
 * @deprecated Since 0280 — use {@link SlotContribution}. The dock was the
 * first slot region; the contract is now region-agnostic.
 */
export type SurfaceDockContribution = SlotContribution

export type CanvasPreviewTier = 'summary' | 'thumbnail' | 'shell' | 'live'

export type CanvasIngestInputKind = 'url' | 'file' | 'data-transfer' | 'text' | 'node' | 'custom'

export type CanvasToolGroup = 'select' | 'create' | 'connect' | 'annotate' | 'layout' | 'custom'

export type CanvasLayoutScope =
  | 'selection'
  | 'frame'
  | 'canvas'
  | 'query-results'
  | 'mind-map'
  | 'custom'

export type CanvasInspectorPlacement = 'popover' | 'side-panel' | 'bottom-panel'

export type CanvasTemplateCategory =
  | 'planning'
  | 'research'
  | 'operations'
  | 'diagramming'
  | 'erp'
  | 'custom'

export type CanvasContributionPermission =
  | 'canvas.read'
  | 'canvas.write'
  | 'canvas.ingest'
  | 'canvas.render'
  | 'canvas.layout'
  | 'network'
  | 'storage'
  | 'clipboard'

export interface CanvasContributionBase {
  /** Unique contribution ID, preferably plugin-scoped */
  id: string
  /** Contribution discriminator for validation and registry routing */
  type: string
  /** Display name shown in canvas menus, toolbars, or inspectors */
  name?: string
  /** Short help text for command palettes and plugin management */
  description?: string
  /** Lucide icon name or plugin-owned icon token */
  icon?: string
  /** Lower values win when multiple plugin contributions match */
  priority?: number
  /** Fine-grained capabilities requested by this canvas contribution */
  permissions?: CanvasContributionPermission[]
}

export interface CanvasCardContribution extends CanvasContributionBase {
  type: 'canvas.card'
  /** Source schema this card knows how to render */
  schemaId?: string
  /** External-reference provider ID, such as youtube, spotify, github, or crm */
  provider?: string
  /** Canvas object kinds supported by this card */
  canvasKinds?: string[]
  /** LOD tiers this card can satisfy */
  previewTiers?: CanvasPreviewTier[]
  /** Sandboxed renderer module/function ID */
  rendererEntrypoint: string
  /** Optional deterministic thumbnail/summary entrypoint */
  previewEntrypoint?: string
  /** Human-readable fallback label when renderer is unavailable */
  fallbackLabel?: string
}

export interface CanvasIngestorContribution extends CanvasContributionBase {
  type: 'canvas.ingestor'
  input: CanvasIngestInputKind
  /** MIME types accepted by file/data-transfer ingestors */
  mimeTypes?: string[]
  /** File extensions accepted by file ingestors */
  fileExtensions?: string[]
  /** URL patterns or provider tokens matched by URL ingestors */
  urlPatterns?: string[]
  /** Sandboxed matcher entrypoint */
  matchEntrypoint: string
  /** Sandboxed ingestion entrypoint */
  ingestEntrypoint: string
}

export interface CanvasToolContribution extends CanvasContributionBase {
  type: 'canvas.tool'
  group?: CanvasToolGroup
  keybinding?: string
  cursor?: string
  /** Sandboxed activation entrypoint that returns a tool controller */
  activationEntrypoint: string
}

export interface CanvasLayoutContribution extends CanvasContributionBase {
  type: 'canvas.layout'
  scope: CanvasLayoutScope
  supportedKinds?: string[]
  supportedSchemas?: string[]
  /** Sandboxed layout function entrypoint */
  applyEntrypoint: string
}

export interface CanvasEdgeContribution extends CanvasContributionBase {
  type: 'canvas.edge'
  label: string
  directed: boolean
  allowedSourceSchemas?: string[]
  allowedTargetSchemas?: string[]
  style?: 'solid' | 'dashed' | 'dotted'
}

export interface CanvasInspectorContribution extends CanvasContributionBase {
  type: 'canvas.inspector'
  placement: CanvasInspectorPlacement
  supportedKinds?: string[]
  supportedSchemas?: string[]
  supportedProviders?: string[]
  /** Sandboxed panel renderer entrypoint */
  panelEntrypoint: string
}

export interface CanvasTemplateContribution extends CanvasContributionBase {
  type: 'canvas.template'
  category: CanvasTemplateCategory
  tags?: string[]
  /** Sandboxed template instantiation entrypoint */
  instantiateEntrypoint: string
  /** Optional preview renderer entrypoint */
  previewEntrypoint?: string
}

export type CanvasContribution =
  | CanvasCardContribution
  | CanvasIngestorContribution
  | CanvasToolContribution
  | CanvasLayoutContribution
  | CanvasEdgeContribution
  | CanvasInspectorContribution
  | CanvasTemplateContribution

/**
 * Importer contribution (exploration 0189).
 *
 * A data-export / source importer — e.g. an Instagram or YouTube archive
 * importer. Mirrors `@xnetjs/social`'s `SocialImportAdapter` *structurally* so
 * the first-party social adapters can register through the plugin system
 * without `@xnetjs/plugins` depending on `@xnetjs/social` (dependency direction
 * stays social → plugins). The `adapter` is opaque to the registry; the consumer
 * (the import flow) casts it to its known importer shape. This is the same
 * "defined now, consumed later" pattern as the canvas contributions.
 */
export interface ImporterContribution {
  /** Unique importer ID, preferably plugin-scoped (e.g. 'fyi.xnet.import.instagram'). */
  id: string
  /** Source platform/system this importer handles (e.g. 'instagram', 'youtube'). */
  platform: string
  /** Importer version. */
  version: string
  /** Human-readable label for the import picker. */
  name?: string
  /** Lucide icon name. */
  icon?: string
  /** The importer adapter implementation (structurally a `SocialImportAdapter`). */
  adapter: unknown
}

// ─── Typed Registry ────────────────────────────────────────────────────────

/**
 * A registry for typed contributions with change notifications
 */
export class TypedRegistry<T extends { id?: string; type?: string }> {
  private items = new Map<string, T>()
  private listeners = new Set<() => void>()

  register(item: T): Disposable {
    const key =
      (item as { id?: string }).id ?? (item as { type?: string }).type ?? crypto.randomUUID()
    this.items.set(key, item)
    this.notify()
    return {
      dispose: () => {
        this.items.delete(key)
        this.notify()
      }
    }
  }

  unregister(key: string): boolean {
    const deleted = this.items.delete(key)
    if (deleted) this.notify()
    return deleted
  }

  get(key: string): T | undefined {
    return this.items.get(key)
  }

  getAll(): T[] {
    return [...this.items.values()]
  }

  has(key: string): boolean {
    return this.items.has(key)
  }

  get size(): number {
    return this.items.size
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (err) {
        console.error('[TypedRegistry] Listener error:', err)
      }
    }
  }

  clear(): void {
    this.items.clear()
    this.notify()
  }
}

// ─── Contribution Registry ─────────────────────────────────────────────────

/**
 * Central registry for all plugin contributions
 */
export class ContributionRegistry {
  readonly views = new TypedRegistry<ViewContribution>()
  readonly widgets = new TypedRegistry<WidgetContribution>()
  readonly commands = new TypedRegistry<CommandContribution>()
  readonly slashCommands = new TypedRegistry<SlashCommandContribution>()
  readonly sidebar = new TypedRegistry<SidebarContribution>()
  readonly statusBar = new TypedRegistry<StatusBarContribution>()
  readonly editor = new TypedRegistry<EditorContribution>()
  readonly propertyHandlers = new TypedRegistry<PropertyHandlerContribution>()
  readonly blocks = new TypedRegistry<BlockContribution>()
  readonly settings = new TypedRegistry<SettingContribution>()
  readonly canvasCards = new TypedRegistry<CanvasCardContribution>()
  readonly canvasIngestors = new TypedRegistry<CanvasIngestorContribution>()
  readonly canvasTools = new TypedRegistry<CanvasToolContribution>()
  readonly canvasLayouts = new TypedRegistry<CanvasLayoutContribution>()
  readonly canvasEdges = new TypedRegistry<CanvasEdgeContribution>()
  readonly canvasInspectors = new TypedRegistry<CanvasInspectorContribution>()
  readonly canvasTemplates = new TypedRegistry<CanvasTemplateContribution>()
  readonly importers = new TypedRegistry<ImporterContribution>()
  readonly mentionProviders = new TypedRegistry<MentionProviderContribution>()
  readonly agentTools = new TypedRegistry<AgentToolContribution>()
  readonly slots = new TypedRegistry<SlotContribution>()
  readonly frameRenderers = new TypedRegistry<FrameRendererContribution>()

  /** @deprecated Since 0280 — the dock registry is the slot registry. */
  get surfaceDock(): TypedRegistry<SlotContribution> {
    return this.slots
  }

  /**
   * Clear all registries (for cleanup/testing)
   */
  clear(): void {
    this.views.clear()
    this.widgets.clear()
    this.commands.clear()
    this.slashCommands.clear()
    this.sidebar.clear()
    this.statusBar.clear()
    this.editor.clear()
    this.propertyHandlers.clear()
    this.blocks.clear()
    this.settings.clear()
    this.canvasCards.clear()
    this.canvasIngestors.clear()
    this.canvasTools.clear()
    this.canvasLayouts.clear()
    this.canvasEdges.clear()
    this.canvasInspectors.clear()
    this.canvasTemplates.clear()
    this.importers.clear()
    this.mentionProviders.clear()
    this.agentTools.clear()
    this.slots.clear()
    this.frameRenderers.clear()
  }
}
