/**
 * WidgetPicker - Catalog of registered widget types (built-in + plugin +
 * user-authored), grouped by trust tier.
 */

import type { WidgetRegistry } from '../registry'
import type { AnyWidgetDefinition, WidgetTrustTier } from '../types'
import { Blocks } from 'lucide-react'
import { useCallback, useSyncExternalStore } from 'react'
import { widgetRegistry } from '../registry'

const TIER_LABELS: Record<WidgetTrustTier, string> = {
  'first-party': 'Built-in',
  user: 'My widgets',
  marketplace: 'Installed'
}

export function useRegisteredWidgets(
  registry: WidgetRegistry = widgetRegistry
): AnyWidgetDefinition[] {
  const subscribe = useCallback((listener: () => void) => registry.onChange(listener), [registry])
  // getAll() allocates; cache by registry size via a stable snapshot keyed on
  // change notifications.
  const getSnapshot = useCallback(() => registry.getAll().length, [registry])
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return registry.getAll()
}

export interface WidgetPickerProps {
  registry?: WidgetRegistry
  onSelect: (definition: AnyWidgetDefinition) => void
  onClose: () => void
}

export function WidgetPicker({ registry, onSelect, onClose }: WidgetPickerProps): JSX.Element {
  const widgets = useRegisteredWidgets(registry)
  const tiers: WidgetTrustTier[] = ['first-party', 'user', 'marketplace']

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-label="Add widget"
      onClick={onClose}
    >
      <div
        className="max-h-[70vh] w-[28rem] overflow-y-auto rounded-lg border border-border bg-background p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="mb-3 text-sm font-semibold text-foreground">Add widget</h2>
        {tiers.map((tier) => {
          const tierWidgets = widgets.filter((widget) => widget.trustTier === tier)
          if (tierWidgets.length === 0) return null

          return (
            <div key={tier} className="mb-4">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {TIER_LABELS[tier]}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {tierWidgets.map((widget) => (
                  <button
                    key={widget.type}
                    type="button"
                    className="flex flex-col items-start gap-1 rounded-md border border-border p-3 text-left hover:border-primary hover:bg-accent/50"
                    onClick={() => onSelect(widget)}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Blocks size={14} aria-hidden />
                      {widget.name}
                    </span>
                    {widget.description ? (
                      <span className="text-xs text-muted-foreground">{widget.description}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
