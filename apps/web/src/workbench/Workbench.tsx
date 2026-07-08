/**
 * Workbench — the fixed-region shell (exploration 0166).
 *
 * Rail · Left Panel · Editor Area · Right Panel · Bottom Panel ·
 * Status Bar. Every region except the editor area collapses; Cmd+.
 * toggles zen (chrome hidden, layout snapshot restored on exit).
 * Panel sizes persist via react-resizable-panels' useDefaultLayout;
 * everything else persists in the useWorkbench store.
 */
import type { ReactNode } from 'react'
import { DemoBanner, useDemoMode } from '@xnetjs/react'
import { Group, Panel, useDefaultLayout } from 'react-resizable-panels'
import { CoachmarkLayer } from '../coachmarks'
import { GlobalSearch } from '../components/GlobalSearch'
import { UndoToastProvider } from '../components/UndoToast'
import { WinddownOverlay } from '../components/WinddownOverlay'
import { WorkspaceCommands } from '../components/WorkspaceCommands'
import { CalmMobile } from './calm/CalmMobile'
import { CalmShell } from './calm/CalmShell'
import { useWorkbenchCommands, useZenEscape } from './commands'
import { ContextPanel } from './ContextPanel'
import { EditorArea } from './EditorArea'
import { isLayoutTreeEnabled } from './experiments'
import { useFocusRing } from './focus'
import { Hairline } from './Hairline'
import { MobileShell } from './MobileShell'
import { PanelViewHost } from './PanelViewHost'
import { Rail } from './Rail'
import { ShellFrame } from './ShellFrame'
import { SlotAnnouncer } from './SlotAnnouncer'
import { useWorkbench } from './state'
import { StatusBar } from './StatusBar'
import { useIsCompact } from './use-layout-mode'
import { registerBuiltinPanelViews } from './views/register'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'

registerBuiltinPanelViews()

/** Below the fixed storage banner, filling the rest of the viewport. */
const SHELL_FRAME =
  'mt-[var(--storage-banner-height,0px)] flex h-[calc(100dvh-var(--storage-banner-height,0px))] flex-col text-ink-1'

function useWorkbenchLayouts(leftOpen: boolean, rightOpen: boolean, bottomOpen: boolean) {
  const horizontal = useDefaultLayout({
    id: 'xnet:wb:layout-h',
    panelIds: [...(leftOpen ? ['left'] : []), 'center', ...(rightOpen ? ['right'] : [])]
  })
  const vertical = useDefaultLayout({
    id: 'xnet:wb:layout-v',
    panelIds: ['editor', ...(bottomOpen ? ['bottom'] : [])]
  })
  return { horizontal, vertical }
}

function ZenSurface({ children }: { children: ReactNode }) {
  return (
    <div className={`${SHELL_FRAME} bg-surface-0`}>
      <WorkspaceCommands />
      <GlobalSearch />
      <div className="min-h-0 flex-1">
        <EditorArea>{children}</EditorArea>
      </div>
    </div>
  )
}

/* Panel + separator pairs render as fragments, so the Panel divs stay
   direct DOM children of the Group as react-resizable-panels requires. */

function LeftPanelSlot({ open }: { open: boolean }) {
  if (!open) return null
  return (
    <>
      <Panel id="left" defaultSize={280} minSize={200} maxSize={420}>
        <PanelViewHost slot="left" />
      </Panel>
      <Hairline orientation="horizontal" id="sep-left" />
    </>
  )
}

function BottomPanelSlot({ open }: { open: boolean }) {
  if (!open) return null
  return (
    <>
      <Hairline orientation="vertical" id="sep-bottom" />
      <Panel id="bottom" defaultSize={240} minSize={120} maxSize="60%">
        <PanelViewHost slot="bottom" />
      </Panel>
    </>
  )
}

function RightPanelSlot({ open }: { open: boolean }) {
  if (!open) return null
  return (
    <>
      <Hairline orientation="horizontal" id="sep-right" />
      <Panel id="right" defaultSize={320} minSize={240} maxSize={520}>
        <ContextPanel />
      </Panel>
    </>
  )
}

function WorkbenchDemoBanner() {
  const { isDemo, limits } = useDemoMode()
  if (!isDemo || !limits) return null
  return <DemoBanner evictionHours={limits.evictionHours} />
}

/**
 * Workbench — the adaptive shell entry point (exploration 0196).
 *
 * On phone-class (compact) widths the desktop multi-pane grid can't
 * fit, so we render the content-first {@link MobileShell}. At medium
 * and expanded widths we render the desktop grid below, unchanged.
 */
export function Workbench({ children }: { children: ReactNode }) {
  const compact = useIsCompact()
  const layout = useWorkbench((state) => state.layout)
  const tabsEnabled = useWorkbench((state) => state.tree.surface.tabsEnabled)
  // 0280: behind the layout-tree flag the ShellFrame renders every posture
  // from the tree; the legacy fork below stays the default until parity.
  // Mobile projections read the tree's axes too (tabsEnabled, not layout).
  const treeShell = isLayoutTreeEnabled()
  return (
    <>
      {treeShell ? (
        compact ? (
          tabsEnabled ? (
            <MobileShell>{children}</MobileShell>
          ) : (
            <CalmMobile>{children}</CalmMobile>
          )
        ) : (
          <ShellFrame>{children}</ShellFrame>
        )
      ) : layout === 'calm' ? (
        // Everyperson shell (0250): the same three-mode grammar at every width —
        // CalmMobile reflows it to a bottom-tab phone layout (Phase 4), CalmShell
        // is the desktop/tablet composition.
        compact ? (
          <CalmMobile>{children}</CalmMobile>
        ) : (
          <CalmShell>{children}</CalmShell>
        )
      ) : compact ? (
        <MobileShell>{children}</MobileShell>
      ) : (
        <DesktopWorkbench>{children}</DesktopWorkbench>
      )}
      {/* Workspace quick switcher + verbs (0280) — commands exist in every shell. */}
      <WorkspaceSwitcher />
      {/* Slot-move announcements + landing flash + focus (0282). */}
      <SlotAnnouncer />
      {/* First-run coachmarks (0206) — portals to <body>, so position here is moot. */}
      <CoachmarkLayer />
      {/* Opt-in "time well spent" wind-down (Charter §Calm, 0234); off by default. */}
      <WinddownOverlay />
    </>
  )
}

function DesktopWorkbench({ children }: { children: ReactNode }) {
  const mode = useWorkbench((state) => state.mode)
  const left = useWorkbench((state) => state.left)
  const right = useWorkbench((state) => state.right)
  const bottom = useWorkbench((state) => state.bottom)

  useWorkbenchCommands()
  useZenEscape()
  useFocusRing()

  const { horizontal, vertical } = useWorkbenchLayouts(left.open, right.open, bottom.open)

  if (mode === 'zen') {
    return (
      <UndoToastProvider>
        <ZenSurface>{children}</ZenSurface>
      </UndoToastProvider>
    )
  }

  return (
    <UndoToastProvider>
      <div className={`${SHELL_FRAME} bg-surface-1`}>
        <WorkspaceCommands />
        <GlobalSearch />
        <WorkbenchDemoBanner />

        <div className="flex min-h-0 flex-1">
          <Rail />
          <Group
            orientation="horizontal"
            id="xnet-wb-h"
            defaultLayout={horizontal.defaultLayout}
            onLayoutChanged={horizontal.onLayoutChanged}
          >
            <LeftPanelSlot open={left.open} />
            <Panel id="center" minSize="30%">
              <Group
                orientation="vertical"
                id="xnet-wb-v"
                defaultLayout={vertical.defaultLayout}
                onLayoutChanged={vertical.onLayoutChanged}
              >
                <Panel id="editor" minSize="30%">
                  <EditorArea>{children}</EditorArea>
                </Panel>
                <BottomPanelSlot open={bottom.open} />
              </Group>
            </Panel>
            <RightPanelSlot open={right.open} />
          </Group>
        </div>

        <StatusBar />
      </div>
    </UndoToastProvider>
  )
}
