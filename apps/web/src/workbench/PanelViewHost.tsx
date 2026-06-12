/**
 * PanelViewHost — renders the active view of the Left or Bottom panel
 * (exploration 0166).
 *
 * Views are registered in a module-level registry so plugin
 * contributions can add panel views without touching the shell
 * (containers vs items — the VS Code model). The bottom slot renders
 * its registered views as panel-local tabs (the tray).
 */
import type { ComponentType } from 'react'
import { X } from 'lucide-react'
import { useWorkbench, type PanelSide } from './state'

export interface PanelViewDefinition {
  id: string
  title: string
  component: ComponentType
}

const registries: Record<'left' | 'bottom', Map<string, PanelViewDefinition>> = {
  left: new Map(),
  bottom: new Map()
}

export function registerPanelView(slot: 'left' | 'bottom', view: PanelViewDefinition): () => void {
  registries[slot].set(view.id, view)
  return () => {
    registries[slot].delete(view.id)
  }
}

export function getPanelViews(slot: 'left' | 'bottom'): PanelViewDefinition[] {
  return [...registries[slot].values()]
}

export function PanelViewHost({ slot }: { slot: 'left' | 'bottom' }) {
  const panel = useWorkbench((state) => state[slot as PanelSide])
  const setPanelOpen = useWorkbench((state) => state.setPanelOpen)

  const view = registries[slot].get(panel.activeViewId) ?? getPanelViews(slot)[0]

  if (!view) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-1 text-ink-3">
        No view registered
      </div>
    )
  }

  const View = view.component
  const views = getPanelViews(slot)
  const showTabs = slot === 'bottom' && views.length > 1

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface-1">
      <header className="flex h-8 shrink-0 items-center justify-between gap-3 border-b border-hairline px-3">
        {showTabs ? (
          <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto">
            {views.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => useWorkbench.getState().showPanelView(slot, entry.id)}
                className={`shrink-0 cursor-pointer border-none bg-transparent p-0 text-[11px] font-medium uppercase tracking-wider transition-colors ${
                  entry.id === view.id ? 'text-ink-1' : 'text-ink-3 hover:text-ink-2'
                }`}
              >
                {entry.title}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-[11px] font-medium uppercase tracking-wider text-ink-2">
            {view.title}
          </span>
        )}
        <button
          type="button"
          title="Close panel"
          aria-label="Close panel"
          onClick={() => setPanelOpen(slot, false)}
          className="flex cursor-pointer items-center border-none bg-transparent p-0.5 text-ink-3 hover:text-ink-1"
        >
          <X size={13} strokeWidth={1.5} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <View />
      </div>
    </section>
  )
}
