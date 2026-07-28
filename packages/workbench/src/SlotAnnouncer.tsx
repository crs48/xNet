/**
 * SlotAnnouncer — accessibility + feedback spine for slot moves (0282).
 *
 * Subscribes to the workbench store and DIFFS tree placements, so every
 * road that moves a view — drag, Move menu, ⌘K command, the companion's
 * agent tools — produces the same three effects with zero coupling:
 *
 *   1. an `aria-live=polite` announcement ("Explorer moved to right
 *      dock"), the Atlassian pragmatic-drag-and-drop guidance;
 *   2. the landing flash on the receiving dock (markSlotLanding);
 *   3. focus restored to the moved view's header, when it is rendered.
 *
 * Mounted once by the Workbench shell entry.
 */
import { useEffect, useState, type JSX } from 'react'
import { REGION_IDS, type LayoutTree, type RegionId } from './layout-tree'
import { markSlotLanding } from './slot-drag'
import { getSlotView } from './slot-registry'
import { useWorkbench } from './state'

const REGION_LABELS: Record<RegionId, string> = {
  surface: 'surface',
  rail: 'rail',
  status: 'status bar',
  'dock.left': 'left dock',
  'dock.right': 'right dock',
  'dock.bottom': 'bottom dock',
  'dock.corner': 'corner dock'
}

/** viewId → region for every placed view. */
function placements(tree: LayoutTree): Map<string, RegionId> {
  const map = new Map<string, RegionId>()
  for (const region of REGION_IDS) {
    for (const placement of tree.regions[region]) map.set(placement.viewId, region)
  }
  return map
}

export function SlotAnnouncer(): JSX.Element {
  const [message, setMessage] = useState('')

  useEffect(() => {
    let prev = placements(useWorkbench.getState().tree)
    return useWorkbench.subscribe((state) => {
      const next = placements(state.tree)
      for (const [viewId, region] of next) {
        const before = prev.get(viewId)
        if (before && before !== region) {
          const label = getSlotView(viewId)?.label ?? viewId
          setMessage(`${label} moved to ${REGION_LABELS[region]}`)
          markSlotLanding(region)
          // Focus the moved view's header once the dock has re-rendered.
          requestAnimationFrame(() => {
            document.querySelector<HTMLElement>(`[data-slot-view="${viewId}"] > header`)?.focus()
          })
        }
      }
      prev = next
    })
  }, [])

  return (
    <div aria-live="polite" role="status" className="sr-only">
      {message}
    </div>
  )
}

/** Test seam: the diff used by the announcer. */
export function diffPlacements(
  before: LayoutTree,
  after: LayoutTree
): Array<{ viewId: string; region: RegionId }> {
  const prev = placements(before)
  const moves: Array<{ viewId: string; region: RegionId }> = []
  for (const [viewId, region] of placements(after)) {
    const was = prev.get(viewId)
    if (was && was !== region) moves.push({ viewId, region })
  }
  return moves
}

/** Exposed for ShellFrame's edge strips. */
export function regionLabel(region: RegionId): string {
  return REGION_LABELS[region]
}
