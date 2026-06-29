/**
 * CompanionList — the calm shell's Companion-mode list (exploration 0250).
 *
 * The agent surface's left rail: a "New conversation" action plus the recently
 * opened workspace nodes, so you can pull a page/database into the conversation
 * as context. Full persisted AI-thread history is a later step (0250 Phase 5);
 * until then this stays an honest, small surface — the conversation itself
 * lives in the Companion surface.
 */
import { useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { navigateToNode } from '../navigation'
import { useWorkbench } from '../state'

export function CompanionList() {
  const navigate = useNavigate()
  const recents = useWorkbench((state) => state.recents)
  const closeCanvas = useWorkbench((state) => state.closeCanvas)

  return (
    <div className="flex min-h-0 flex-1 flex-col p-2">
      <button
        type="button"
        onClick={() => {
          closeCanvas()
          void navigate({ to: '/companion' })
        }}
        className="mb-2 flex items-center gap-2 rounded-lg border border-hairline bg-surface-0 px-2.5 py-2 text-[13px] font-medium text-ink-1 transition-colors hover:bg-surface-2 cursor-pointer"
      >
        <Plus size={15} strokeWidth={1.5} />
        New conversation
      </button>

      {recents.length > 0 && (
        <>
          <h2 className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-ink-3">
            Recent
          </h2>
          <ul className="flex min-h-0 flex-1 list-none flex-col gap-0.5 overflow-y-auto p-0">
            {recents.slice(0, 12).map((recent) => (
              <li key={`${recent.nodeType}:${recent.nodeId}`}>
                <button
                  type="button"
                  onClick={() => navigateToNode(navigate, recent.nodeType, recent.nodeId)}
                  className="w-full truncate rounded-lg border-none bg-transparent px-2 py-1.5 text-left text-[13px] text-ink-2 transition-colors hover:bg-surface-2/60 hover:text-ink-1 cursor-pointer"
                >
                  {recent.title || 'Untitled'}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
