/**
 * Built-in first-party widgets.
 */

import type { WidgetRegistry } from '../registry'
import { widgetRegistry } from '../registry'
import { metricWidget } from './metric-widget'
import { pageLinksWidget } from './page-links-widget'
import { recentItemsWidget } from './recent-items-widget'
import { savedViewWidget } from './saved-view-widget'
import { taskListWidget } from './task-list-widget'

let registered = false

/** Register the built-in widget set (idempotent on the global registry). */
export function registerBuiltinWidgets(registry: WidgetRegistry = widgetRegistry): void {
  if (registry === widgetRegistry) {
    if (registered) return
    registered = true
  }

  registry.register(metricWidget)
  registry.register(taskListWidget)
  registry.register(savedViewWidget)
  registry.register(pageLinksWidget)
  registry.register(recentItemsWidget)
}
