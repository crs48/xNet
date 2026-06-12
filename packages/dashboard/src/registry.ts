/**
 * WidgetRegistry - Runtime registry of widget types.
 *
 * Built-in widgets register at startup (registerBuiltinWidgets); plugin
 * widgets register through WidgetContribution with a host-assigned trust
 * tier; user-authored widgets register from the in-app editor.
 */

import type { AnyWidgetDefinition, WidgetDefinition } from './types'

export interface Disposable {
  dispose(): void
}

export class WidgetRegistry {
  private widgets = new Map<string, AnyWidgetDefinition>()
  private listeners = new Set<() => void>()

  register<C>(widget: WidgetDefinition<C>): Disposable {
    if (this.widgets.has(widget.type)) {
      console.warn(`[WidgetRegistry] Overriding existing widget type '${widget.type}'`)
    }
    this.widgets.set(widget.type, widget as AnyWidgetDefinition)
    this.notify()
    return {
      dispose: () => {
        this.widgets.delete(widget.type)
        this.notify()
      }
    }
  }

  get(type: string): AnyWidgetDefinition | undefined {
    return this.widgets.get(type)
  }

  getAll(): AnyWidgetDefinition[] {
    return [...this.widgets.values()]
  }

  has(type: string): boolean {
    return this.widgets.has(type)
  }

  get size(): number {
    return this.widgets.size
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  clear(): void {
    this.widgets.clear()
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (err) {
        console.error('[WidgetRegistry] Listener error:', err)
      }
    }
  }
}

/** Global widget registry instance. */
export const widgetRegistry = new WidgetRegistry()
