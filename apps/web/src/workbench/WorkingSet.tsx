/**
 * WorkingSet — Pinned + Recents, always visible (exploration 0353).
 *
 * This is the tab strip's replacement. Tabs served three jobs badly at
 * once (reminder, place-saver, working memory); the split here is
 * explicit: **Pinned** is the durable tier the user curates, **Recents**
 * is the automatic tier that decays. Neither is destructive — nothing is
 * ever "closed" and lost, which is the answer to the hoarding reflex
 * (CMU's blackhole effect).
 *
 * Rows route through `navigateToNode`, so they work identically whether
 * tabs are on or off.
 */
import { useNavigate } from '@tanstack/react-router'
import { Pin, PinOff } from 'lucide-react'
import { useMemo } from 'react'
import { navigateToNode } from './navigation'
import { useWorkbench, type RecentEntry, type TabNodeType } from './state'
import { TAB_VIEWS } from './tabs'

const MAX_RECENT_ROWS = 6

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-ink-3">
      {children}
    </div>
  )
}

function WorkingSetRow({
  nodeId,
  nodeType,
  title,
  pinned
}: {
  nodeId: string
  nodeType: TabNodeType
  title: string
  pinned: boolean
}) {
  const navigate = useNavigate()
  const togglePinnedNode = useWorkbench((state) => state.togglePinnedNode)
  const entry = TAB_VIEWS[nodeType]
  const Icon = entry?.icon
  const label = title || entry?.label || 'Untitled'

  return (
    <div
      data-working-set-row={nodeId}
      className="group/row flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-ink-2 transition-colors hover:bg-accent hover:text-ink-1"
    >
      <button
        type="button"
        onClick={() => navigateToNode(navigate, nodeType, nodeId)}
        className="flex min-w-0 flex-1 items-center gap-1.5 border-none bg-transparent p-0 text-left text-inherit"
      >
        {Icon && <Icon size={14} strokeWidth={1.75} className="shrink-0 text-ink-3" />}
        <span className="truncate">{label}</span>
      </button>
      <button
        type="button"
        onClick={() => togglePinnedNode(nodeId)}
        aria-label={pinned ? `Unpin ${label}` : `Pin ${label}`}
        title={pinned ? 'Unpin' : 'Pin'}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-none bg-transparent text-ink-3 opacity-0 transition-opacity hover:text-ink-1 group-hover/row:opacity-100"
      >
        {pinned ? <PinOff size={12} /> : <Pin size={12} />}
      </button>
    </div>
  )
}

/**
 * The working set: pinned nodes (durable) above recents (decaying).
 * Recents already exclude anything pinned so the same node never
 * appears twice.
 */
export function WorkingSet(): React.JSX.Element | null {
  const pinnedNodeIds = useWorkbench((state) => state.pinnedNodeIds)
  const recents = useWorkbench((state) => state.recents)

  // Recents carry their own type/title; pinned ids resolve against them
  // (a pin always follows a visit, so the entry exists) and degrade to
  // a bare row otherwise.
  const byId = useMemo(() => {
    const map = new Map<string, RecentEntry>()
    for (const entry of recents) map.set(entry.nodeId, entry)
    return map
  }, [recents])

  const pinnedRows = useMemo(
    () =>
      pinnedNodeIds.map((nodeId) => {
        const entry = byId.get(nodeId)
        return {
          nodeId,
          nodeType: entry?.nodeType ?? ('page' as TabNodeType),
          title: entry?.title ?? ''
        }
      }),
    [pinnedNodeIds, byId]
  )

  const recentRows = useMemo(
    () =>
      recents.filter((entry) => !pinnedNodeIds.includes(entry.nodeId)).slice(0, MAX_RECENT_ROWS),
    [recents, pinnedNodeIds]
  )

  if (pinnedRows.length === 0 && recentRows.length === 0) return null

  return (
    <div data-working-set="true" className="flex flex-col px-1 pb-1">
      {pinnedRows.length > 0 && (
        <>
          <SectionLabel>Pinned</SectionLabel>
          {pinnedRows.map((row) => (
            <WorkingSetRow key={`pinned-${row.nodeId}`} {...row} pinned />
          ))}
        </>
      )}
      {recentRows.length > 0 && (
        <>
          <SectionLabel>Recent</SectionLabel>
          {recentRows.map((row) => (
            <WorkingSetRow
              key={`recent-${row.nodeId}`}
              nodeId={row.nodeId}
              nodeType={row.nodeType}
              title={row.title}
              pinned={false}
            />
          ))}
        </>
      )}
    </div>
  )
}
