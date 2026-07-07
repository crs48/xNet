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
import type { ComponentType, ReactNode } from 'react'
import { DemoBanner, useDemoMode } from '@xnetjs/react'
import { Group, Panel, useDefaultLayout } from 'react-resizable-panels'
import { GlobalSearch } from '../components/GlobalSearch'
import { UndoToastProvider } from '../components/UndoToast'
import { WorkspaceCommands } from '../components/WorkspaceCommands'
import { CalmSurface } from './calm/CalmSurface'
import { Canvas } from './calm/Canvas'
import { ListPane } from './calm/ListPane'
import { ModeSwitch } from './calm/ModeSwitch'
import { QuietChrome } from './calm/QuietChrome'
import { SurfaceDockLauncher } from './calm/SurfaceDock'
import { useActiveCalmMode } from './calm/use-active-mode'
import { useWorkbenchCommands, useZenEscape } from './commands'
import { ContextPanel } from './ContextPanel'
import { EditorArea } from './EditorArea'
import { useFocusRing } from './focus'
import { Hairline } from './Hairline'
import { slotsIn, type LayoutTree, type RegionId } from './layout-tree'
import { PanelViewHost } from './PanelViewHost'
import { Rail } from './Rail'
import { useWorkbench, type CalmMode, type PanelSide } from './state'
import { StatusBar } from './StatusBar'

const FRAME =
  'mt-[var(--storage-banner-height,0px)] flex h-[calc(100dvh-var(--storage-banner-height,0px))] flex-col text-ink-1'

/**
 * Bare frame views: slot views that bring their own chrome, keyed by the
 * placement's viewId. Everything else falls back to the PanelViewHost
 * (header + registered panel views) for its dock.
 */
const BARE_VIEWS: Record<string, ComponentType<{ mode: CalmMode }>> = {
  navigator: ({ mode }) => <ListPane mode={mode} />,
  context: () => <Canvas />,
  inspector: () => <ContextPanel />
}

/** Rail-region views (edge strips, not dock panels). */
const RAIL_VIEWS: Record<string, ComponentType> = {
  modes: ModeSwitch,
  rail: Rail
}

/** Status-region views. */
const STATUS_VIEWS: Record<string, ComponentType> = {
  status: StatusBar
}

function FrameDemoBanner() {
  const { isDemo, limits } = useDemoMode()
  if (!isDemo || !limits) return null
  return <DemoBanner evictionHours={limits.evictionHours} />
}

/** The dock body: the active placement's view, bare or hosted. */
function DockBody({
  tree,
  region,
  side,
  mode
}: {
  tree: LayoutTree
  region: RegionId
  side: PanelSide
  mode: CalmMode
}) {
  const activeViewId = useWorkbench((state) => state[side].activeViewId)
  const placements = slotsIn(tree, region)
  const active = placements.find((placement) => placement.viewId === activeViewId) ?? placements[0]
  const Bare = active ? BARE_VIEWS[active.viewId] : undefined
  if (Bare) return <Bare mode={mode} />
  // Panel-view docks (the 0166 registries) — left and bottom hosts.
  if (side === 'left' || side === 'bottom') return <PanelViewHost slot={side} />
  return <Canvas />
}

function EdgeStrip({ tree, region }: { tree: LayoutTree; region: 'rail' | 'status' }) {
  const views = region === 'rail' ? RAIL_VIEWS : STATUS_VIEWS
  const pinned = slotsIn(tree, region, 'pinned')
  return (
    <>
      {pinned.map((placement) => {
        const View = views[placement.viewId]
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
  const mode = useActiveCalmMode()
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
                <DockBody tree={tree} region="dock.left" side="left" mode={mode} />
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
                    <DockBody tree={tree} region="dock.bottom" side="bottom" mode={mode} />
                  </Panel>
                </>
              )}
            </Group>
          </Panel>
          {rightOpen && (
            <>
              <Hairline orientation="horizontal" id="sep-right" />
              <Panel id="right" defaultSize={320} minSize={240} maxSize={520}>
                <DockBody tree={tree} region="dock.right" side="right" mode={mode} />
              </Panel>
            </>
          )}
        </Group>
        {/* The corner dock renders wherever the tree places residents —
            pinned calm gains the same launcher quiet has (0280). */}
        {cornerPlaced && <SurfaceDockLauncher lit />}
      </div>

      <EdgeStrip tree={tree} region="status" />
    </div>
  )
}

function QuietFrame({ tree, children }: { tree: LayoutTree; children: ReactNode }) {
  const mode = useActiveCalmMode()
  return (
    <div className={`${FRAME} bg-surface-0`}>
      <WorkspaceCommands />
      <GlobalSearch />
      <FrameDemoBanner />
      <QuietChrome activeMode={mode}>
        <Surface tree={tree}>{children}</Surface>
      </QuietChrome>
    </div>
  )
}

export function ShellFrame({ children }: { children: ReactNode }) {
  useWorkbenchCommands()
  useZenEscape()
  useFocusRing()

  const tree = useWorkbench((state) => state.tree)
  const mode = useWorkbench((state) => state.mode)

  if (mode === 'zen') {
    return (
      <UndoToastProvider>
        <ZenFrame tree={tree}>{children}</ZenFrame>
      </UndoToastProvider>
    )
  }

  return (
    <UndoToastProvider>
      {tree.chrome === 'quiet' ? (
        <QuietFrame tree={tree}>{children}</QuietFrame>
      ) : (
        <PinnedFrame tree={tree}>{children}</PinnedFrame>
      )}
    </UndoToastProvider>
  )
}
