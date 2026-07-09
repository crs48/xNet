/**
 * ShellFrame — one renderer for every shell posture (exploration 0280).
 *
 * Walks the workbench store's {@link LayoutTree} and renders regions →
 * slots → views. The former shells are preset trees: what used to be the
 * CalmShell, the workbench grid and the quiet posture are now data-only
 * fixtures over this single component. ShellFrame never branches on which
 * preset is loaded — only on the tree's axes (chrome posture, slot tiers,
 * `surface.tabsEnabled`); the tripwire in layout-tree.test.ts enforces it.
 *
 * Behind `xnet:experiment:layout-tree` (see experiments.ts); the legacy
 * shells render by default until parity is proven.
 */
import { DemoBanner, useDemoMode } from '@xnetjs/react'
import { useState, type DragEvent, type ReactNode } from 'react'
import { Group, Panel, useDefaultLayout } from 'react-resizable-panels'
import { GlobalSearch } from '../components/GlobalSearch'
import { UndoToastProvider } from '../components/UndoToast'
import { WorkspaceCommands } from '../components/WorkspaceCommands'
import { ArrangeOverlay } from './ArrangeOverlay'
import { CalmSurface } from './calm/CalmSurface'
import { SurfaceDockLauncher } from './calm/SurfaceDock'
import { useShellEscape, useWorkbenchCommands, useZenEscape } from './commands'
import { EditorArea } from './EditorArea'
import { useFocusRing } from './focus'
import { Hairline } from './Hairline'
import { slotsIn, type LayoutTree, type RegionId } from './layout-tree'
import { PanelViewHost, SLOT_DRAG_TYPE } from './PanelViewHost'
import { useSlotDragActive, useSlotLanding } from './slot-drag'
import { getSlotView } from './slot-registry'
import { regionLabel } from './SlotAnnouncer'
import { useWorkbench, type PanelSide } from './state'

const FRAME =
  'mt-[var(--storage-banner-height,0px)] flex h-[calc(100dvh-var(--storage-banner-height,0px))] flex-col text-ink-1'

/**
 * Views that bring their own chrome render bare in a dock; everything else
 * goes through the PanelViewHost (header, panel tabs, move menu). Keyed by
 * view id — never by preset (the tripwire forbids that).
 */
const BARE_VIEW_IDS = new Set(['navigator', 'context', 'inspector'])

function FrameDemoBanner() {
  const { isDemo, limits } = useDemoMode()
  if (!isDemo || !limits) return null
  return <DemoBanner evictionHours={limits.evictionHours} />
}

/** Drop target props: the pointer road's landing zone for a dock (0280). */
function dropProps(region: RegionId) {
  return {
    onDragOver: (event: DragEvent) => {
      if (event.dataTransfer.types.includes(SLOT_DRAG_TYPE)) event.preventDefault()
    },
    onDrop: (event: DragEvent) => {
      const viewId = event.dataTransfer.getData(SLOT_DRAG_TYPE)
      if (viewId) useWorkbench.getState().moveSlot(viewId, region)
    }
  }
}

/**
 * Dress an OPEN dock as a live drop target while a slot drag is in
 * flight, plus the 700ms landing flash after any move (0282 phase 2 —
 * research patterns 3 and 7). Ring via ring utilities (transition, not
 * animation, so reduced-motion needs no special casing; the flash uses
 * the same mechanism and simply appears/disappears without motion).
 */
function DockDropDress({ region, children }: { region: RegionId; children: ReactNode }) {
  const dragging = useSlotDragActive() !== null
  const landed = useSlotLanding(region)
  const [hovered, setHovered] = useState(0)
  const ring = dragging
    ? hovered > 0
      ? 'rounded-md ring-2 ring-inset ring-accent-ink'
      : 'rounded-md ring-2 ring-inset ring-accent-ink/40'
    : landed
      ? 'rounded-md ring-2 ring-inset ring-accent-ink/70'
      : ''
  return (
    <div
      data-drop-active={dragging || undefined}
      className={`h-full min-h-0 transition-colors duration-normal ease-out ${ring}`}
      {...dropProps(region)}
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes(SLOT_DRAG_TYPE)) setHovered((n) => n + 1)
      }}
      onDragLeave={() => setHovered((n) => Math.max(0, n - 1))}
      onDropCapture={() => setHovered(0)}
    >
      {children}
    </div>
  )
}

/**
 * The edge strip a CLOSED dock materializes as during a slot drag —
 * without it, "pop this out and slot it in over there" silently no-ops
 * (0282's one mechanical bug). Dropping opens the dock with the view.
 */
function DockEdgeStrip({ region }: { region: RegionId }) {
  const side = region === 'dock.left' ? 'left-0' : region === 'dock.right' ? 'right-0' : ''
  const shape =
    region === 'dock.bottom'
      ? 'inset-x-16 bottom-0 h-12 rounded-t-lg'
      : `inset-y-16 ${side} w-12 ${region === 'dock.left' ? 'rounded-r-lg' : 'rounded-l-lg'}`
  return (
    <div
      data-wb-edge-strip={region}
      className={`fixed ${shape} z-50 flex items-center justify-center border-2 border-dashed
        border-accent-ink/50 bg-surface-1/90 backdrop-blur transition-colors duration-fast
        ease-out hover:border-accent-ink`}
      {...dropProps(region)}
      onDrop={(event) => {
        const viewId = event.dataTransfer.getData(SLOT_DRAG_TYPE)
        if (!viewId) return
        const state = useWorkbench.getState()
        state.moveSlot(viewId, region)
        // Open the dock so the landing (and its flash) is visible.
        const dockSide =
          region === 'dock.left' ? 'left' : region === 'dock.right' ? 'right' : 'bottom'
        state.showPanelView(dockSide, viewId)
      }}
    >
      <span
        className={`text-[10px] font-medium uppercase tracking-wider text-ink-2 ${
          region === 'dock.bottom' ? '' : '[writing-mode:vertical-rl]'
        }`}
      >
        {regionLabel(region)}
      </span>
    </div>
  )
}

/** The dock body: the active placement's view, bare or hosted. */
function DockBody({ tree, region, side }: { tree: LayoutTree; region: RegionId; side: PanelSide }) {
  const activeViewId = useWorkbench((state) => state[side].activeViewId)
  const placements = slotsIn(tree, region)
  const active = placements.find((placement) => placement.viewId === activeViewId) ?? placements[0]
  const view = active ? getSlotView(active.viewId) : undefined
  if (view && BARE_VIEW_IDS.has(view.id)) {
    const Bare = view.component
    return (
      <DockDropDress region={region}>
        <Bare />
      </DockDropDress>
    )
  }
  // Panel-view docks (the 0166 host: header, tabs, move menu).
  const slot = side === 'right' ? undefined : side
  return (
    <DockDropDress region={region}>
      {slot ? <PanelViewHost slot={slot} /> : view ? <view.component /> : null}
    </DockDropDress>
  )
}

function EdgeStrip({ tree, region }: { tree: LayoutTree; region: 'rail' | 'status' }) {
  const pinned = slotsIn(tree, region, 'pinned')
  return (
    <>
      {pinned.map((placement) => {
        const View = getSlotView(placement.viewId)?.component
        return View ? <View key={placement.viewId} /> : null
      })}
    </>
  )
}

/** Surface = the center region; tabs are a capability, not a shell. */
function Surface({ tree, children }: { tree: LayoutTree; children: ReactNode }) {
  if (tree.surface.tabsEnabled) return <EditorArea>{children}</EditorArea>
  return <CalmSurface>{children}</CalmSurface>
}

function ZenFrame({ tree, children }: { tree: LayoutTree; children: ReactNode }) {
  return (
    <div className={`${FRAME} bg-surface-0`}>
      <WorkspaceCommands />
      <GlobalSearch />
      <div className="min-h-0 flex-1">
        <Surface tree={tree}>{children}</Surface>
      </div>
    </div>
  )
}

/**
 * Pinned-chrome frame: resizable docks around the surface. Panel sizes are
 * device-local and keyed by the workspace id (0280 phase 3) — a saved bench
 * carries its placements everywhere, its pixel widths nowhere.
 */
function PinnedFrame({ tree, children }: { tree: LayoutTree; children: ReactNode }) {
  const left = useWorkbench((state) => state.left)
  const right = useWorkbench((state) => state.right)
  const bottom = useWorkbench((state) => state.bottom)

  const leftPlaced = slotsIn(tree, 'dock.left').length > 0
  const rightPlaced = slotsIn(tree, 'dock.right').length > 0
  const bottomPlaced = slotsIn(tree, 'dock.bottom').length > 0
  const leftOpen = leftPlaced && left.open
  const rightOpen = rightPlaced && right.open
  const bottomOpen = bottomPlaced && bottom.open
  const cornerPlaced = slotsIn(tree, 'dock.corner').length > 0

  // While a slot drag is live, closed docks materialize as edge strips
  // so every region is a target (0282 phase 2).
  const dragging = useSlotDragActive() !== null

  const horizontal = useDefaultLayout({
    id: `xnet:frame:h:${tree.workspaceId}`,
    panelIds: [...(leftOpen ? ['left'] : []), 'center', ...(rightOpen ? ['right'] : [])]
  })
  const vertical = useDefaultLayout({
    id: `xnet:frame:v:${tree.workspaceId}`,
    panelIds: ['editor', ...(bottomOpen ? ['bottom'] : [])]
  })

  return (
    <div className={`${FRAME} bg-surface-1`}>
      <WorkspaceCommands />
      <GlobalSearch />
      <FrameDemoBanner />

      <div className="relative flex min-h-0 flex-1">
        <EdgeStrip tree={tree} region="rail" />
        <Group
          orientation="horizontal"
          id="xnet-frame-h"
          defaultLayout={horizontal.defaultLayout}
          onLayoutChanged={horizontal.onLayoutChanged}
        >
          {leftOpen && (
            <>
              <Panel id="left" defaultSize={280} minSize={200} maxSize={420}>
                <DockBody tree={tree} region="dock.left" side="left" />
              </Panel>
              <Hairline orientation="horizontal" id="sep-left" />
            </>
          )}
          <Panel id="center" minSize="30%">
            <Group
              orientation="vertical"
              id="xnet-frame-v"
              defaultLayout={vertical.defaultLayout}
              onLayoutChanged={vertical.onLayoutChanged}
            >
              <Panel id="editor" minSize="30%">
                <Surface tree={tree}>{children}</Surface>
              </Panel>
              {bottomOpen && (
                <>
                  <Hairline orientation="vertical" id="sep-bottom" />
                  <Panel id="bottom" defaultSize={240} minSize={120} maxSize="60%">
                    <DockBody tree={tree} region="dock.bottom" side="bottom" />
                  </Panel>
                </>
              )}
            </Group>
          </Panel>
          {rightOpen && (
            <>
              <Hairline orientation="horizontal" id="sep-right" />
              <Panel id="right" defaultSize={320} minSize={240} maxSize={520}>
                <DockBody tree={tree} region="dock.right" side="right" />
              </Panel>
            </>
          )}
        </Group>
        {/* The corner dock renders wherever the tree places residents —
            pinned calm gains the same launcher quiet has (0280). */}
        {cornerPlaced && <SurfaceDockLauncher lit />}

        {dragging && !leftOpen && <DockEdgeStrip region="dock.left" />}
        {dragging && !rightOpen && <DockEdgeStrip region="dock.right" />}
        {dragging && !bottomOpen && <DockEdgeStrip region="dock.bottom" />}
      </div>

      <EdgeStrip tree={tree} region="status" />
    </div>
  )
}

export function ShellFrame({ children }: { children: ReactNode }) {
  useWorkbenchCommands()
  useZenEscape()
  useShellEscape()
  useFocusRing()

  const tree = useWorkbench((state) => state.tree)
  const mode = useWorkbench((state) => state.mode)
  const focus = useWorkbench((state) => state.focus)
  const arranging = useWorkbench((state) => state.arranging)

  // Focus mode (0284) hides all chrome so the surface owns the viewport — one
  // toggle that replaces the former zen `mode` and quiet posture. (`mode`
  // 'zen' is still honored during the transition; Stage 4 removes it.)
  if (focus || mode === 'zen') {
    return (
      <UndoToastProvider>
        <ZenFrame tree={tree}>{children}</ZenFrame>
      </UndoToastProvider>
    )
  }

  return (
    <UndoToastProvider>
      <div className="relative h-full min-h-0">
        <PinnedFrame tree={tree}>{children}</PinnedFrame>
        {/* Arrange mode (0282): the shell as an editable schematic. */}
        {arranging && <ArrangeOverlay />}
      </div>
    </UndoToastProvider>
  )
}
