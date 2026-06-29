/**
 * Canvas — the calm shell's contextual right region (exploration 0250).
 *
 * Two faces, the Claude "artifact opens on the right" pattern:
 *
 *   • A content target (set via `openCanvas`, e.g. the agent drafts a page) →
 *     hosts that node's full, editable view through the shared {@link ViewHost},
 *     with a Focus button that expands it full-bleed (reusing zen) and a Close.
 *   • No target → the inspector: the existing {@link ContextPanel} (properties /
 *     comments / backlinks for the active surface), unchanged.
 *
 * Reuses the workbench's `right` panel state, so ⌘\ toggles it as before.
 */
import { Maximize2, X } from 'lucide-react'
import { ContextPanel } from '../ContextPanel'
import { tabIdFor, useWorkbench, type WorkbenchTab } from '../state'
import { ViewHost } from '../ViewHost'

function CanvasContent() {
  const target = useWorkbench((state) => state.canvasTarget)
  const closeCanvas = useWorkbench((state) => state.closeCanvas)
  const toggleZen = useWorkbench((state) => state.toggleZen)

  if (!target) return <ContextPanel />

  const tab: WorkbenchTab = {
    id: tabIdFor(target.nodeType, target.nodeId),
    nodeId: target.nodeId,
    nodeType: target.nodeType,
    title: target.title ?? '',
    pinned: false,
    preview: false
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-0">
      <header className="flex h-8 shrink-0 items-center gap-2 border-b border-hairline px-3">
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium uppercase tracking-wider text-ink-2">
          {target.title?.trim() || 'Artifact'}
        </span>
        <button
          type="button"
          title="Focus (full screen)"
          aria-label="Focus"
          onClick={toggleZen}
          className="flex cursor-pointer items-center border-none bg-transparent p-0.5 text-ink-3 hover:text-ink-1"
        >
          <Maximize2 size={12} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          title="Close canvas"
          aria-label="Close canvas"
          onClick={closeCanvas}
          className="flex cursor-pointer items-center border-none bg-transparent p-0.5 text-ink-3 hover:text-ink-1"
        >
          <X size={13} strokeWidth={1.5} />
        </button>
      </header>
      <div className="min-h-0 flex-1">
        <ViewHost tab={tab} />
      </div>
    </div>
  )
}

export function Canvas() {
  return (
    <aside
      data-wb-region="right"
      className="flex h-full min-h-0 w-[var(--canvas-width,24rem)] shrink-0 flex-col border-l border-hairline bg-surface-1"
    >
      <CanvasContent />
    </aside>
  )
}
