/**
 * Plugin system hooks for accessing the PluginRegistry and contributions
 */
import { warnOnEditorSchemaRisks } from '@xnetjs/plugins'
import type {
  PluginRegistry,
  RegisteredPlugin,
  ContributionRegistry,
  ViewContribution,
  CommandContribution,
  SlashCommandContribution,
  SidebarContribution,
  EditorContribution,
  PropertyHandlerContribution,
  BlockContribution,
  SettingContribution,
  ImporterContribution
} from '@xnetjs/plugins'
import { createContext, useContext, useState, useEffect, useMemo } from 'react'

// ─── Context ────────────────────────────────────────────────────────────────

/**
 * Plugin registry context
 */
export const PluginRegistryContext = createContext<PluginRegistry | null>(null)

// ─── usePluginRegistry ──────────────────────────────────────────────────────

/**
 * Access the PluginRegistry instance
 *
 * @example
 * ```tsx
 * const registry = usePluginRegistry()
 * const plugins = registry.getAll()
 * ```
 *
 * @throws Error if used outside of XNetProvider with plugins enabled
 */
export function usePluginRegistry(): PluginRegistry {
  const registry = useContext(PluginRegistryContext)
  if (!registry) {
    throw new Error(
      'usePluginRegistry must be used within XNetProvider with plugins enabled. ' +
        "Ensure XNetProvider has platform: 'electron' or platform: 'web' in its config."
    )
  }
  return registry
}

/**
 * Safely access the PluginRegistry instance, returns null if not available
 *
 * Use this when you need to optionally access the plugin system without throwing.
 */
export function usePluginRegistryOptional(): PluginRegistry | null {
  return useContext(PluginRegistryContext)
}

// ─── usePlugins ─────────────────────────────────────────────────────────────

/**
 * Get all registered plugins with reactive updates
 *
 * @example
 * ```tsx
 * const plugins = usePlugins()
 * // Re-renders when plugins change
 * ```
 */
export function usePlugins(): RegisteredPlugin[] {
  const registry = usePluginRegistry()
  const [plugins, setPlugins] = useState(() => registry.getAll())

  useEffect(() => {
    // Initial load
    setPlugins(registry.getAll())

    // Subscribe to changes
    const disposable = registry.onChange(() => {
      setPlugins(registry.getAll())
    })

    return () => disposable.dispose()
  }, [registry])

  return plugins
}

// ─── useContributions ───────────────────────────────────────────────────────

/**
 * Contribution type to interface mapping
 */
type ContributionTypeMap = {
  views: ViewContribution
  commands: CommandContribution
  slashCommands: SlashCommandContribution
  sidebar: SidebarContribution
  editor: EditorContribution
  propertyHandlers: PropertyHandlerContribution
  blocks: BlockContribution
  settings: SettingContribution
  importers: ImporterContribution
}

/**
 * Get the typed registry for a contribution type
 */
function getTypedRegistry<K extends keyof ContributionTypeMap>(
  contributions: ContributionRegistry,
  type: K
) {
  switch (type) {
    case 'views':
      return contributions.views
    case 'commands':
      return contributions.commands
    case 'slashCommands':
      return contributions.slashCommands
    case 'sidebar':
      return contributions.sidebar
    case 'editor':
      return contributions.editor
    case 'propertyHandlers':
      return contributions.propertyHandlers
    case 'blocks':
      return contributions.blocks
    case 'settings':
      return contributions.settings
    case 'importers':
      return contributions.importers
    default:
      throw new Error(`Unknown contribution type: ${type}`)
  }
}

/**
 * Get contributions of a specific type with reactive updates
 *
 * @example
 * ```tsx
 * // Get all registered views
 * const views = useContributions('views')
 *
 * // Get all commands
 * const commands = useContributions('commands')
 * ```
 */
export function useContributions<K extends keyof ContributionTypeMap>(
  type: K
): ContributionTypeMap[K][] {
  const registry = usePluginRegistry()
  const contributions = registry.getContributions()
  const typedRegistry = getTypedRegistry(contributions, type)

  const [items, setItems] = useState(() => typedRegistry.getAll() as ContributionTypeMap[K][])

  useEffect(() => {
    // Initial load
    setItems(typedRegistry.getAll() as ContributionTypeMap[K][])

    // Subscribe to changes
    const unsubscribe = typedRegistry.onChange(() => {
      setItems(typedRegistry.getAll() as ContributionTypeMap[K][])
    })

    return unsubscribe
  }, [typedRegistry])

  return items
}

// ─── Convenience hooks ──────────────────────────────────────────────────────

/**
 * Get all registered views
 */
export function useViews(): ViewContribution[] {
  return useContributions('views')
}

/**
 * Get all registered commands
 */
export function useCommands(): CommandContribution[] {
  return useContributions('commands')
}

/**
 * Get all registered slash commands
 */
export function useSlashCommands(): SlashCommandContribution[] {
  return useContributions('slashCommands')
}

/**
 * Get all registered sidebar items
 */
export function useSidebarItems(): SidebarContribution[] {
  return useContributions('sidebar')
}

/**
 * Get all registered importer contributions (exploration 0189).
 *
 * Pair with `resolveImporters`/`importerAdapters` from `@xnetjs/plugins` to merge
 * plugin-contributed importers with a built-in set (e.g. the social importers).
 */
export function useImporters(): ImporterContribution[] {
  return useContributions('importers')
}

/**
 * Get all registered editor extensions
 *
 * @throws Error if plugin system is not enabled
 */
export function useEditorExtensions(): EditorContribution[] {
  return useContributions('editor')
}

/**
 * Get all registered editor extensions, returns empty array if plugin system is not available
 *
 * Safe version that doesn't throw if plugins aren't enabled.
 */
export function useEditorExtensionsSafe(): EditorContribution[] {
  const registry = usePluginRegistryOptional()
  const [items, setItems] = useState<EditorContribution[]>([])

  useEffect(() => {
    if (!registry) {
      setItems([])
      return
    }

    const contributions = registry.getContributions()
    const typedRegistry = contributions.editor

    // Initial load
    setItems(typedRegistry.getAll())

    // Subscribe to changes
    const unsubscribe = typedRegistry.onChange(() => {
      setItems(typedRegistry.getAll())
    })

    return unsubscribe
  }, [registry])

  return items
}

// ─── Merged editor specs (BlockNote, 0312) ─────────────────────────────────

/**
 * Plugin-contributed BlockNote specs and slash menu items, merged across
 * all editor contributions in priority order.
 */
export interface MergedEditorContributions {
  /** BlockNote block specs, keyed by block type name */
  blockSpecs: Record<string, unknown>
  /** BlockNote inline content specs, keyed by type name */
  inlineContentSpecs: Record<string, unknown>
  /** BlockNote style specs, keyed by style name */
  styleSpecs: Record<string, unknown>
  /** Behavior-only slash menu items (skew-safe) */
  slashMenuItems: SlashCommandContribution[]
}

/**
 * Merge editor contributions (priority order; lower = earlier, later wins
 * on spec-name collision) and run the schema-skew guard (0205/0312).
 *
 * `bundledSpecNames` is the host editor's statically bundled spec list
 * (`XNET_SCHEMA_SPEC_NAMES` from `@xnetjs/editor/react` — passed by the
 * caller because this package must not depend on the editor). Specs NOT in
 * that list change the persisted document schema for only some peers, so
 * they are warned about and excluded from the merge.
 */
export function mergeEditorContributions(
  contributions: readonly EditorContribution[],
  bundledSpecNames: readonly string[] = []
): MergedEditorContributions {
  // Skew-safety guard (0205): warn if a contribution adds persisted schema
  // beyond the statically bundled specs.
  const risks = warnOnEditorSchemaRisks('plugin-host', contributions, bundledSpecNames)
  const risky = new Set(risks.map((risk) => `${risk.kind}:${risk.name}`))

  const sorted = [...contributions].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))

  const merged: MergedEditorContributions = {
    blockSpecs: {},
    inlineContentSpecs: {},
    styleSpecs: {},
    slashMenuItems: []
  }

  for (const contribution of sorted) {
    for (const [name, spec] of Object.entries(contribution.blockSpecs ?? {})) {
      if (!risky.has(`block:${name}`)) merged.blockSpecs[name] = spec
    }
    for (const [name, spec] of Object.entries(contribution.inlineContentSpecs ?? {})) {
      if (!risky.has(`inlineContent:${name}`)) merged.inlineContentSpecs[name] = spec
    }
    for (const [name, spec] of Object.entries(contribution.styleSpecs ?? {})) {
      if (!risky.has(`style:${name}`)) merged.styleSpecs[name] = spec
    }
    if (contribution.slashMenuItems) {
      merged.slashMenuItems.push(...contribution.slashMenuItems)
    }
  }

  return merged
}

/**
 * Collect and merge all plugin editor contributions (BlockNote specs +
 * slash menu items) from the registry, with reactive updates. Safe when
 * the plugin system isn't enabled (returns empty results).
 *
 * @example
 * ```tsx
 * import { XNET_SCHEMA_SPEC_NAMES } from '@xnetjs/editor/react'
 *
 * const { slashMenuItems } = useMergedEditorContributions(XNET_SCHEMA_SPEC_NAMES)
 * ```
 */
export function useMergedEditorContributions(
  bundledSpecNames: readonly string[] = []
): MergedEditorContributions {
  const contributions = useEditorExtensionsSafe()
  return useMemo(
    () => mergeEditorContributions(contributions, bundledSpecNames),
    [contributions, bundledSpecNames]
  )
}

/**
 * Get a specific view by type
 */
export function useView(type: string): ViewContribution | undefined {
  const views = useViews()
  return views.find((v) => v.type === type)
}

/**
 * Get a specific command by ID
 */
export function useCommand(id: string): CommandContribution | undefined {
  const commands = useCommands()
  return commands.find((c) => c.id === id)
}
