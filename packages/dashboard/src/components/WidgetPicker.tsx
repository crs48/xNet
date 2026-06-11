/**
 * WidgetPicker - Catalog of registered widget types (built-in + plugin +
 * user-authored), grouped by trust tier. Widgets that declare permissions
 * (plugin tiers) show a confirmation step listing the requested access
 * before they can be added (0162 phase 4).
 */

import type { WidgetRegistry } from '../registry'
import type { AnyWidgetDefinition, WidgetTrustTier } from '../types'
import { Blocks, ShieldAlert, SquareCode } from 'lucide-react'
import { useCallback, useState, useSyncExternalStore } from 'react'
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
  /** Open the user widget editor (renders the "Create widget" entry) */
  onCreateWidget?: () => void
}

export function WidgetPicker({
  registry,
  onSelect,
  onClose,
  onCreateWidget
}: WidgetPickerProps): JSX.Element {
  const widgets = useRegisteredWidgets(registry)
  const tiers: WidgetTrustTier[] = ['first-party', 'user', 'marketplace']
  const [confirming, setConfirming] = useState<AnyWidgetDefinition | null>(null)

  const handlePick = (widget: AnyWidgetDefinition) => {
    if (widget.permissions && widget.permissions.length > 0) {
      setConfirming(widget)
      return
    }
    onSelect(widget)
  }

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
        {confirming ? (
          <div className="flex flex-col gap-3" data-widget-permission-prompt="true">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ShieldAlert size={16} className="text-amber-500" aria-hidden />“{confirming.name}”
              requests access
            </h2>
            <ul className="list-disc pl-5 text-sm text-foreground">
              {(confirming.permissions ?? []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              This widget runs in the {confirming.trustTier} sandbox tier. Only add widgets from
              sources you trust.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
                onClick={() => setConfirming(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                onClick={() => {
                  setConfirming(null)
                  onSelect(confirming)
                }}
              >
                Allow and add
              </button>
            </div>
          </div>
        ) : (
          <>
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
                        onClick={() => handlePick(widget)}
                      >
                        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <Blocks size={14} aria-hidden />
                          {widget.name}
                          {widget.permissions && widget.permissions.length > 0 ? (
                            <ShieldAlert size={12} className="text-amber-500" aria-hidden />
                          ) : null}
                        </span>
                        {widget.description ? (
                          <span className="text-xs text-muted-foreground">
                            {widget.description}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
            {onCreateWidget ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground hover:border-primary hover:text-foreground"
                onClick={onCreateWidget}
              >
                <SquareCode size={14} aria-hidden />
                Create your own widget…
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
