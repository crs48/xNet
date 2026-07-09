/**
 * FloatingFrame — the "Floating Islands" desktop shell (exploration 0286).
 *
 * One warm `--canvas` surface (11px pad, 8px gaps) with all chrome floating on
 * top as rounded, softly-shadowed islands: two stacked sidebar islands, a right
 * context island, a status-bar island, and a bottom-center chat dock. The
 * editor is deliberately NOT an island — it shares the canvas colour so the
 * document reads as the brightest, most-forward plane.
 *
 * The store, views, tabs and hooks are unchanged; this is the pinned frame's
 * new paint. Focus mode still hands off to ShellFrame's ZenFrame.
 */
import type { ReactNode } from 'react'
import { useState } from 'react'
import { GlobalSearch } from '../components/GlobalSearch'
import { UndoToastProvider } from '../components/UndoToast'
import { WorkspaceCommands } from '../components/WorkspaceCommands'
import { ContextPanel } from './ContextPanel'
import { EditorArea } from './EditorArea'
import { EditorHeader } from './EditorHeader'
import { FloatingDock } from './FloatingDock'
import { FloatingMenus, type FloatingMenuName, type FloatingMenuState } from './FloatingMenus'
import { SidebarIslands } from './SidebarIslands'
import { useWorkbench } from './state'
import { StatusBar } from './StatusBar'

const ISLAND = 'overflow-hidden rounded-2xl border border-hairline bg-island-b shadow-isl'

export function FloatingFrame({ children }: { children: ReactNode }) {
  const sidebarCollapsed = useWorkbench((s) => s.sidebarCollapsed)
  const rightOpen = useWorkbench((s) => s.right.open)
  const [menu, setMenu] = useState<FloatingMenuState | null>(null)

  const openMenu = (name: FloatingMenuName) => (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setMenu((current) => (current?.name === name ? null : { name, rect }))
  }

  return (
    <UndoToastProvider>
      <div
        className="wb-root flex h-[100dvh] flex-col gap-2 overflow-hidden bg-canvas p-[11px] font-sans text-ink-1"
        data-wb-shell="floating"
      >
        <WorkspaceCommands />
        <GlobalSearch />

        {/* Body row: sidebar · editor (base surface) · right island */}
        <div className="relative flex min-h-0 flex-1 gap-2">
          {!sidebarCollapsed && <SidebarIslands openMenu={openMenu} />}

          {/* Editor — the base surface, NOT an island. */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas">
            <EditorHeader onOpenNotif={openMenu('notif')} />
            <div className="min-h-0 flex-1 border-t border-hairline">
              <EditorArea tabVariant="pill">{children}</EditorArea>
            </div>
          </div>

          {rightOpen && (
            <div className={`${ISLAND} w-[300px] shrink-0`}>
              <ContextPanel />
            </div>
          )}

          <FloatingDock />
        </div>

        {/* Status-bar island */}
        <div className={`h-8 shrink-0 rounded-[14px] border border-hairline bg-island-b shadow-isl`}>
          <StatusBar variant="island" />
        </div>

        <FloatingMenus menu={menu} onClose={() => setMenu(null)} />
      </div>
    </UndoToastProvider>
  )
}
