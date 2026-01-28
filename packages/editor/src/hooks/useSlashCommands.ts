/**
 * Hook for collecting slash commands from plugins and merging with built-in commands.
 *
 * Transforms plugin SlashCommandContributions into the editor's SlashCommandItem format
 * and combines them with the built-in commands.
 */
import { useState, useEffect, useMemo } from 'react'
import { getAllCommands, type SlashCommandItem } from '../extensions/slash-command/items'

/**
 * Slash command contribution from the plugin system.
 * (Matches @xnet/plugins SlashCommandContribution)
 */
export interface SlashCommandContribution {
  /** Unique command ID */
  id: string
  /** Display name in slash menu */
  name: string
  /** Description shown in menu */
  description?: string
  /** Search aliases */
  aliases?: string[]
  /** Icon (Lucide icon name or emoji) */
  icon?: string
  /** Insert content or execute action */
  execute: (props: { editor: unknown; range: { from: number; to: number } }) => void
}

/**
 * Options for useSlashCommands hook
 */
export interface UseSlashCommandsOptions {
  /**
   * Function to get all slash command contributions.
   * Typically from useContributions('slashCommands') in @xnet/react.
   */
  getContributions?: () => SlashCommandContribution[]
  /**
   * Subscribe to contribution changes.
   * Returns an unsubscribe function.
   */
  onContributionsChange?: (callback: () => void) => () => void
  /**
   * Whether to include built-in commands.
   * Default: true
   */
  includeBuiltins?: boolean
}

/**
 * Convert a plugin SlashCommandContribution to the editor's SlashCommandItem format
 */
function toSlashCommandItem(contribution: SlashCommandContribution): SlashCommandItem {
  return {
    title: contribution.name,
    description: contribution.description || '',
    icon: contribution.icon || '?',
    searchTerms: contribution.aliases,
    command: ({ editor, range }) => {
      contribution.execute({ editor, range })
    }
  }
}

/**
 * Collect and merge slash commands from plugins with built-in commands.
 *
 * This hook provides all available slash commands for the editor's command menu.
 * Plugin commands are appended after built-in commands.
 *
 * @example
 * ```tsx
 * import { useContributions } from '@xnet/react'
 * import { useSlashCommands } from '@xnet/editor/react'
 *
 * function Editor() {
 *   const pluginCommands = useContributions('slashCommands')
 *
 *   const allCommands = useSlashCommands({
 *     getContributions: () => pluginCommands,
 *   })
 *
 *   // Pass to editor...
 * }
 * ```
 *
 * @example Without plugins (built-in commands only)
 * ```tsx
 * const commands = useSlashCommands()
 * // Returns all built-in commands
 * ```
 */
export function useSlashCommands(options: UseSlashCommandsOptions = {}): SlashCommandItem[] {
  const { getContributions, onContributionsChange, includeBuiltins = true } = options

  // Track contributions for reactive updates
  const [contributions, setContributions] = useState<SlashCommandContribution[]>(
    () => getContributions?.() ?? []
  )

  // Subscribe to changes if callback provided
  useEffect(() => {
    if (!onContributionsChange) return

    const unsubscribe = onContributionsChange(() => {
      setContributions(getContributions?.() ?? [])
    })

    return unsubscribe
  }, [getContributions, onContributionsChange])

  // Update contributions when getContributions changes
  useEffect(() => {
    if (getContributions) {
      setContributions(getContributions())
    }
  }, [getContributions])

  // Merge built-in and plugin commands
  const commands = useMemo(() => {
    const result: SlashCommandItem[] = []

    // Add built-in commands if requested
    if (includeBuiltins) {
      result.push(...getAllCommands())
    }

    // Convert and add plugin commands
    for (const contribution of contributions) {
      result.push(toSlashCommandItem(contribution))
    }

    return result
  }, [contributions, includeBuiltins])

  return commands
}
