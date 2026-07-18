/**
 * SplitPane — side-by-side without tab groups (exploration 0353).
 *
 * The tabless shell keeps a two-pane affordance, but it's a *layout*
 * concern, not a windowing one: the primary pane is always the router
 * outlet, and the secondary pane is a live frame (0346) over one picked
 * node. Nothing is "open" in the tab sense — closing the split leaves no
 * orphaned state, and durable side-by-side belongs on a page as frames.
 */
import { useNavigate } from '@tanstack/react-router'
import { getCommandRegistry } from '@xnetjs/plugins'
import { EntangleProvider } from '@xnetjs/react'
import { FrameHostProvider, FrameRenderer, type FrameDef } from '@xnetjs/views'
import { X } from 'lucide-react'
import { useCallback, useEffect, useMemo, type ReactNode } from 'react'
import '../lib/frame-renderers'
import { WORKBENCH_SAVED_VIEW_REGISTRY } from '../lib/saved-view-registry'
import { Hairline } from './Hairline'
import { navigateToNode } from './navigation'
import { useWorkbench, type TabNodeType } from './state'

/** Register the split commands; the store holds the target. */
function useSplitCommands(): void {
  useEffect(() => {
    const registry = getCommandRegistry()
    const disposables = [
      registry.register({
        id: 'workbench.splitView',
        title: 'View: Split with current',
        key: 'Mod-|',
        allowInInput: true,
        when: () => Boolean(useWorkbench.getState().splitTarget === null),
        run: () => {
          // Split with whatever the sidebar last surfaced as pinned/recent —
          // the working set is the picker (no tab to clone).
          const state = useWorkbench.getState()
          const recent = state.recents[0]
          if (recent) {
            state.setSplitTarget({ nodeId: recent.nodeId, nodeType: recent.nodeType })
          }
        }
      }),
      registry.register({
        id: 'workbench.closeSplit',
        title: 'View: Close split',
        run: () => useWorkbench.getState().setSplitTarget(null)
      })
    ]
    return () => {
      for (const disposable of disposables) disposable.dispose()
    }
  }, [])
}

export function SplitPane({ children }: { children: ReactNode }): React.JSX.Element {
  const navigate = useNavigate()
  const splitTarget = useWorkbench((state) => state.splitTarget)
  const setSplitTarget = useWorkbench((state) => state.setSplitTarget)
  useSplitCommands()

  const handleNavigate = useCallback(
    (href: string) => {
      const match = href.match(/^xnet:\/\/([a-z]+)\/(.+)$/)
      if (match) {
        navigateToNode(navigate, match[1] as TabNodeType, match[2])
        return
      }
      void navigate({ to: '/doc/$docId', params: { docId: href } })
    },
    [navigate]
  )

  const frame = useMemo<FrameDef | null>(
    () =>
      splitTarget
        ? {
            id: `split:${splitTarget.nodeId}`,
            source: { kind: 'node', nodeId: splitTarget.nodeId },
            viewType: splitTarget.nodeType === 'database' ? 'table' : 'page-preview',
            config: { promoted: true },
            tier: 'live',
            sortKey: ''
          }
        : null,
    [splitTarget]
  )

  if (!frame) return <>{children}</>

  return (
    <div className="flex h-full min-h-0 flex-row">
      <div className="min-w-0 flex-1">{children}</div>
      <Hairline orientation="horizontal" id="xnet-wb-split" />
      <aside
        data-wb-split-pane="true"
        className="flex h-full min-h-0 w-[420px] shrink-0 flex-col bg-canvas"
      >
        <div className="flex h-9 shrink-0 items-center justify-end px-2">
          <button
            type="button"
            onClick={() => setSplitTarget(null)}
            aria-label="Close split"
            title="Close split"
            className="flex h-6 w-6 items-center justify-center rounded border-none bg-transparent text-ink-3 hover:bg-background-muted hover:text-ink-1"
          >
            <X size={14} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <FrameHostProvider
            value={{
              onNavigate: handleNavigate,
              savedViewRegistry: WORKBENCH_SAVED_VIEW_REGISTRY
            }}
          >
            <EntangleProvider>
              <FrameRenderer frame={frame} className="min-h-0" />
            </EntangleProvider>
          </FrameHostProvider>
        </div>
      </aside>
    </div>
  )
}
