/**
 * ViewRegistry — runtime registration of database view types
 * (exploration 0339, reviving the 0267 "apps are views over your data"
 * seam on the V2 grid contract).
 *
 * Built-in views (board, gallery, calendar, timeline, list, map) register
 * through the same door plugins use, so the view switcher is one lookup:
 * `viewRegistry.get(activeView.type)`. Table and Form stay special-cased
 * in the database shell (the grid engine and the form share surface own
 * their chrome).
 */

import type { FieldType, SchemaIRI } from '@xnetjs/data'
import type { ComponentType } from 'react'
import type { DatabaseViewConfig, DatabaseViewProps } from './database-views/contract.js'
import type { Disposable } from './types.js'

// ─── Types ──────────────────────────────────────────────────────────────────

/** Platform identifiers for view compatibility */
export type Platform = 'web' | 'electron' | 'mobile'

/**
 * A per-view configuration field, rendered by the view-options bar:
 * `field-select` picks one of the database's fields (filtered by
 * `fieldTypes`), `select` picks from fixed options.
 */
export interface ViewConfigField {
  /** Key in DatabaseViewConfig this field edits */
  key: keyof DatabaseViewConfig & string
  /** Display label */
  label: string
  type: 'field-select' | 'select'
  /** For 'field-select': offer only these field types */
  fieldTypes?: FieldType[]
  /** For 'select': the fixed options */
  options?: Array<{ label: string; value: string }>
  /** The view is unusable until this is set (shown emphasized) */
  required?: boolean
  description?: string
}

/** A registered view type (V2 contract). */
export interface ViewRegistration {
  /** Unique view type identifier (e.g. 'board', 'map', plugin types) */
  type: string
  /** Display name for the view switcher */
  name: string
  /** Lucide icon name (or a component) */
  icon: string | ComponentType<Record<string, never>>
  /** The view component — receives the V2 DatabaseViewProps contract */
  component: ComponentType<DatabaseViewProps>
  /** View-specific configuration fields (view-options bar) */
  configFields?: ViewConfigField[]
  /** Which schemas this view supports (default: all) */
  supportedSchemas?: SchemaIRI[] | '*'
  /** Which platforms this view supports (default: all) */
  platforms?: Platform[]
  /** Brief description of the view */
  description?: string
}

// ─── ViewRegistry ───────────────────────────────────────────────────────────

/**
 * Registry for database view types. Plugins can register custom views
 * that appear in the view switcher alongside the built-ins.
 *
 * @example
 * ```ts
 * viewRegistry.register({
 *   type: 'gantt',
 *   name: 'Gantt',
 *   icon: 'bar-chart-horizontal',
 *   component: GanttView,
 *   configFields: [
 *     { key: 'dateField', label: 'Start', type: 'field-select', fieldTypes: ['date'], required: true }
 *   ]
 * })
 * ```
 */
export class ViewRegistry {
  private views = new Map<string, ViewRegistration>()
  private listeners = new Set<() => void>()

  /** Register a view type. Returns a Disposable that unregisters it. */
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

  get(type: string): ViewRegistration | undefined {
    return this.views.get(type)
  }

  getAll(): ViewRegistration[] {
    return [...this.views.values()]
  }

  /** Views compatible with a schema. */
  getForSchema(schemaIRI: SchemaIRI): ViewRegistration[] {
    return this.getAll().filter((v) => {
      if (!v.supportedSchemas || v.supportedSchemas === '*') return true
      return v.supportedSchemas.includes(schemaIRI)
    })
  }

  /** Views compatible with a platform. */
  getForPlatform(platform: Platform): ViewRegistration[] {
    return this.getAll().filter((v) => {
      if (!v.platforms) return true
      return v.platforms.includes(platform)
    })
  }

  has(type: string): boolean {
    return this.views.has(type)
  }

  get size(): number {
    return this.views.size
  }

  /** Subscribe to registry changes. Returns an unsubscribe function. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Clear all registered views (testing). */
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

// ─── Global instance ────────────────────────────────────────────────────────

/**
 * Global view registry. Built-in views register via
 * `registerBuiltinViews()`.
 */
export const viewRegistry = new ViewRegistry()
