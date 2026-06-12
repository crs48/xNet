/**
 * ContextPanel — the Right Panel (exploration 0166).
 *
 * Contextual to the active tab: views feed it sections via the
 * useContextPanel contribution (Phase 3). Phase 1 renders the frame
 * and an empty state.
 */
import { X } from 'lucide-react'
import { useWorkbench } from './state'

export function ContextPanel() {
  const setPanelOpen = useWorkbench((state) => state.setPanelOpen)

  return (
    <aside className="flex h-full min-h-0 flex-col bg-surface-1">
      <header className="flex h-8 shrink-0 items-center justify-between border-b border-hairline px-3">
        <span className="text-[11px] font-medium uppercase tracking-wider text-ink-2">Context</span>
        <button
          type="button"
          title="Close panel"
          aria-label="Close panel"
          onClick={() => setPanelOpen('right', false)}
          className="flex cursor-pointer items-center border-none bg-transparent p-0.5 text-ink-3 hover:text-ink-1"
        >
          <X size={13} strokeWidth={1.5} />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4 text-center text-xs text-ink-3">
        Properties, comments and backlinks for the active tab appear here.
      </div>
    </aside>
  )
}
