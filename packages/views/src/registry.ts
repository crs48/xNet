/**
 * ViewRegistry - Dynamic view type registration for plugins
 *
 * Replaces hardcoded view type mappings with a runtime registry
 * that plugins can add views to.
 */

import type { ViewConfig, Disposable } from './types.js'
import type { Schema, SchemaIRI, NodeId } from '@xnetjs/data'
import type { ComponentType } from 'react'

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Platform identifiers for view compatibility
 */
export type Platform = 'web' | 'electron' | 'mobile'

/**
 * Configuration field types for view-specific settings
 */
export type ViewConfigFieldType = 'property-select' | 'select' | 'number' | 'checkbox' | 'text'

/**
 * A configuration field for view-specific settings
 */
export interface ViewConfigField {
  /** Field key in ViewConfig */
  key: string
  /** Display label */
  label: string
  /** Field type */
  type: ViewConfigFieldType
  /** Options for 'select' type */
  options?: Array<{ label: string; value: string }>
  /** Whether the field is required */
  required?: boolean
  /** Help text / description */
  description?: string
  /** Default value */
  defaultValue?: unknown
}

/**
 * Common row data structure
 */
export interface ViewRow {
  id: string
  [key: string]: unknown
}

/**
 * Standard props passed to all view components
 */
export interface ViewProps<TRow extends ViewRow = ViewRow> {
  /** Schema defining the data structure */
  schema: Schema
  /** View configuration */
  view: ViewConfig
  /** Data rows */
  data: TRow[]
  /** Callback when view config changes */
  onUpdateView?: (changes: Partial<ViewConfig>) => void
  /** Callback when a row is updated */
  onUpdateRow?: (rowId: string, propertyId: string, value: unknown) => void
  /** Callback when a row is deleted */
  onDeleteRow?: (rowId: NodeId) => void
  /** Callback when a row is created */
  onCreateRow?: (properties?: Record<string, unknown>) => void
  /** Callback when a row is clicked/selected */
  onRowClick?: (rowId: string) => void
  /** Whether data is loading */
  isLoading?: boolean
  /** Additional CSS class */
  className?: string
}

/**
 * A registered view type
 */
export interface ViewRegistration {
  /** Unique view type identifier (e.g., 'table', 'board', 'gantt') */
  type: string
  /** Display name for UI */
  name: string
  /** Icon name (Lucide icon) or React component */
  icon: string | ComponentType<Record<string, never>>
  /** The view component */
  component: ComponentType<ViewProps>
  /** View-specific configuration fields */
  configFields?: ViewConfigField[]
  /** Which schemas this view supports (default: all) */
  supportedSchemas?: SchemaIRI[] | '*'
  /** Which platforms this view supports (default: all) */
  platforms?: Platform[]
  /** Brief description of the view */
  description?: string
}

// ─── ViewRegistry Class ─────────────────────────────────────────────────────

/**
 * Registry for view types
 *
 * Plugins can register custom views that appear in the view switcher
 * alongside built-in views (table, board, gallery, etc.).
 *
 * @example
 * ```ts
 * viewRegistry.register({
 *   type: 'gantt',
 *   name: 'Gantt Chart',
 *   icon: 'bar-chart-horizontal',
 *   component: GanttView,
 *   configFields: [
 *     { key: 'startDateProperty', label: 'Start Date', type: 'property-select', required: true }
 *   ]
 * })
 * ```
 */
export class ViewRegistry {
  private views = new Map<string, ViewRegistration>()
  private listeners = new Set<() => void>()

  /**
   * Register a view type
   *
   * @param view - View registration
   * @returns Disposable to unregister the view
   */
  register(view: ViewRegistration): Disposable {
    if (this.views.has(view.type)) {
      console.warn(`[ViewRegistry] Overriding existing view type '${view.type}'`)
    }
    this.views.set(view.type, view)
    this.notify()
    return {
      dispose: () => {
        this.views.delete(view.type)
        this.notify()
      }
    }
  }

  /**
   * Get a view registration by type
   */
  get(type: string): ViewRegistration | undefined {
    return this.views.get(type)
  }

  /**
   * Get all registered views
   */
  getAll(): ViewRegistration[] {
    return [...this.views.values()]
  }

  /**
   * Get views compatible with a schema
   *
   * @param schemaIRI - Schema to filter by
   * @returns Views that support the schema
   */
  getForSchema(schemaIRI: SchemaIRI): ViewRegistration[] {
    return this.getAll().filter((v) => {
      if (!v.supportedSchemas || v.supportedSchemas === '*') return true
      return v.supportedSchemas.includes(schemaIRI)
    })
  }

  /**
   * Get views compatible with a platform
   *
   * @param platform - Platform to filter by
   * @returns Views that support the platform
   */
  getForPlatform(platform: Platform): ViewRegistration[] {
    return this.getAll().filter((v) => {
      if (!v.platforms) return true
      return v.platforms.includes(platform)
    })
  }

  /**
   * Check if a view type is registered
   */
  has(type: string): boolean {
    return this.views.has(type)
  }

  /**
   * Get the number of registered views
   */
  get size(): number {
    return this.views.size
  }

  /**
   * Subscribe to registry changes
   *
   * @param listener - Callback when views change
   * @returns Unsubscribe function
   */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Clear all registered views (mainly for testing)
   */
  clear(): void {
    this.views.clear()
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (err) {
        console.error('[ViewRegistry] Listener error:', err)
      }
    }
  }
}

// ─── Global Instance ────────────────────────────────────────────────────────

/**
 * Global view registry instance
 *
 * Use this for registering views. Built-in views are registered
 * via `registerBuiltinViews()`.
 */
export const viewRegistry = new ViewRegistry()
