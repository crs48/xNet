/**
 * Plugin system hooks for accessing the PluginRegistry and contributions
 */
import { createContext, useContext, useState, useEffect } from 'react'
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
  SettingContribution
} from '@xnet/plugins'

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
