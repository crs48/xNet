/**
 * ContextPanel — the Right Panel (exploration 0166).
 *
 * Contextual to the active tab: views feed it sections via the
 * useContextPanel contribution. Sections render as panel-local tabs
 * (page → properties, comments, backlinks; database → row detail;
 * canvas → selection inspector; task → task detail).
 */
import { X } from 'lucide-react'
import { useMemo } from 'react'
import { useContextPanelStore } from './context-panel'
import { useWorkbench } from './state'

export function ContextPanel() {
  const setPanelOpen = useWorkbench((state) => state.setPanelOpen)
  const owners = useContextPanelStore((state) => state.owners)
  const sections = useMemo(() => Object.values(owners).flat(), [owners])
  const activeSectionId = useContextPanelStore((state) => state.activeSectionId)
  const setActiveSection = useContextPanelStore((state) => state.setActiveSection)

  const active = sections.find((section) => section.id === activeSectionId) ?? sections[0] ?? null

  return (
    <aside className="flex h-full min-h-0 flex-col bg-surface-1">
      <header className="flex h-8 shrink-0 items-center gap-3 border-b border-hairline px-3">
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto">
          {sections.length === 0 ? (
            <span className="text-[11px] font-medium uppercase tracking-wider text-ink-2">
              Context
            </span>
          ) : (
            sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                className={`flex shrink-0 cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-[11px] font-medium uppercase tracking-wider transition-colors ${
                  active?.id === section.id ? 'text-ink-1' : 'text-ink-3 hover:text-ink-2'
                }`}
              >
                {section.title}
                {typeof section.badge === 'number' && section.badge > 0 && (
                  <span className="rounded-full bg-surface-2 px-1 font-mono text-[10px] text-ink-2">
                    {section.badge}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
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
      <div className="min-h-0 flex-1 overflow-y-auto">
        {active ? (
          active.content
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-center text-xs text-ink-3">
            Properties, comments and backlinks for the active tab appear here.
          </div>
        )}
      </div>
    </aside>
  )
}
