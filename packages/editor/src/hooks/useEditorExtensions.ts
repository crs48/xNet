/**
 * Hook for collecting editor extensions and toolbar items from the plugin system.
 *
 * Transforms plugin EditorContributions into TipTap extensions and toolbar items
 * that can be passed to RichTextEditor.
 */
import type { ToolbarItemContribution } from '../components/FloatingToolbar'
import type { AnyExtension } from '@tiptap/core'
import type { Editor } from '@tiptap/react'
import { useState, useEffect, useMemo } from 'react'

/**
 * Editor contribution from the plugin system
 * (Matches @xnet/plugins EditorContribution)
 */
export interface EditorContribution {
  /** Unique extension ID */
  id: string
  /** TipTap extension */
  extension: AnyExtension
  /** Optional toolbar button for this extension */
  toolbar?: {
    /** Icon name (Lucide) or React component */
    icon: string | React.ComponentType
    /** Tooltip/title text */
    title: string
    /** Toolbar section: format, insert, block, or custom */
    group?: 'format' | 'insert' | 'block' | 'custom'
    /** Check if button should appear active */
    isActive?: (editor: unknown) => boolean
    /** Button click handler */
    action: (editor: unknown) => void
    /** Keyboard shortcut display (e.g., 'Mod-Shift-H') */
    shortcut?: string
  }
  /** Priority for extension ordering (lower = earlier, default: 100) */
  priority?: number
}

/**
 * Hook result containing extensions and toolbar items
 */
export interface UseEditorExtensionsResult {
  /** TipTap extensions to merge with built-in extensions */
  extensions: AnyExtension[]
  /** Toolbar items to add to the floating toolbar */
  toolbarItems: ToolbarItemContribution[]
}

/**
 * Options for useEditorExtensions hook
 */
export interface UseEditorExtensionsOptions {
  /**
   * Function to get all editor contributions.
   * Typically from useContributions('editor') in @xnet/react.
   */
  getContributions: () => EditorContribution[]
  /**
   * Subscribe to contribution changes.
   * Returns an unsubscribe function.
   */
  onContributionsChange?: (callback: () => void) => () => void
}

/**
 * Collect editor extensions and toolbar items from the plugin system.
 *
 * This hook transforms EditorContributions into the props needed by RichTextEditor.
 * It handles:
 * - Sorting extensions by priority
 * - Extracting TipTap extensions
 * - Converting toolbar contributions to ToolbarItemContributions
 *
 * @example
 * ```tsx
 * import { useContributions } from '@xnet/react'
 * import { useEditorExtensions, RichTextEditor } from '@xnet/editor/react'
 *
 * function Editor({ ydoc }) {
 *   const editorContributions = useContributions('editor')
 *
 *   const { extensions, toolbarItems } = useEditorExtensions({
 *     getContributions: () => editorContributions,
 *   })
 *
 *   return (
 *     <RichTextEditor
 *       ydoc={ydoc}
 *       extensions={extensions}
 *       toolbarItems={toolbarItems}
 *     />
 *   )
 * }
 * ```
 */
export function useEditorExtensions(
  options: UseEditorExtensionsOptions
): UseEditorExtensionsResult {
  const { getContributions, onContributionsChange } = options

  // Track contributions for reactive updates
  const [contributions, setContributions] = useState<EditorContribution[]>(() => getContributions())

  // Subscribe to changes if callback provided
  useEffect(() => {
    if (!onContributionsChange) return

    const unsubscribe = onContributionsChange(() => {
      setContributions(getContributions())
    })

    return unsubscribe
  }, [getContributions, onContributionsChange])

  // Sort and extract extensions/toolbar items
  const result = useMemo(() => {
    // Sort by priority (lower = earlier, default 100)
    const sorted = [...contributions].sort((a, b) => {
      const aPriority = a.priority ?? 100
      const bPriority = b.priority ?? 100
      return aPriority - bPriority
    })

    // Extract extensions
    const extensions: AnyExtension[] = sorted.map((c) => c.extension)

    // Extract toolbar items, converting the editor type
    const toolbarItems: ToolbarItemContribution[] = sorted
      .filter((c) => c.toolbar)
      .map((c) => {
        const toolbar = c.toolbar!
        return {
          icon: toolbar.icon,
          title: toolbar.title,
          group: toolbar.group,
          isActive: toolbar.isActive ? (editor: Editor) => toolbar.isActive!(editor) : undefined,
          action: (editor: Editor) => toolbar.action(editor),
          shortcut: toolbar.shortcut
        }
      })

    return { extensions, toolbarItems }
  }, [contributions])

  return result
}
