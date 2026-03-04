/**
 * Contribution types and registry for plugin-provided extensions
 */

import type { Disposable } from './types'
import type { Extension } from '@tiptap/core'
import type { ComponentType } from 'react'

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

export interface ViewProps {
  nodeId: string
  schemaId: string
}

export interface CommandContribution {
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
  editor: unknown // TipTap editor instance
  range: { from: number; to: number }
}

/**
 * Toolbar button contribution for the editor
 */
export interface ToolbarContribution {
  /** Icon name (Lucide) or React component */
  icon: string | ComponentType
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

export interface EditorContribution {
  /** Unique extension ID */
  id: string
  /** TipTap extension (Extension, Node, or Mark) */
  extension: Extension
  /** Optional toolbar button for this extension */
  toolbar?: ToolbarContribution
  /** Priority for extension ordering (lower = earlier, default: 100) */
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
  readonly commands = new TypedRegistry<CommandContribution>()
  readonly slashCommands = new TypedRegistry<SlashCommandContribution>()
  readonly sidebar = new TypedRegistry<SidebarContribution>()
  readonly editor = new TypedRegistry<EditorContribution>()
  readonly propertyHandlers = new TypedRegistry<PropertyHandlerContribution>()
  readonly blocks = new TypedRegistry<BlockContribution>()
  readonly settings = new TypedRegistry<SettingContribution>()

  /**
   * Clear all registries (for cleanup/testing)
   */
  clear(): void {
    this.views.clear()
    this.commands.clear()
    this.slashCommands.clear()
    this.sidebar.clear()
    this.editor.clear()
    this.propertyHandlers.clear()
    this.blocks.clear()
    this.settings.clear()
  }
}
