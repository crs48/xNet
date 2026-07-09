/**
 * ShellFrame — the desktop shell renderer (explorations 0280, 0284, 0286).
 *
 * At rest it renders the "Floating Islands" frame (0286): one warm canvas
 * surface with all chrome floating as rounded islands. Focus mode (0284) — and
 * the transitional zen `mode` — hand off to the bare {@link ZenFrame} so the
 * surface owns the whole viewport. Both walk the store's {@link LayoutTree}
 * only through its axes (never the preset identity — the tripwire enforces it).
 */
import type { ReactNode } from 'react'
import { GlobalSearch } from '../components/GlobalSearch'
import { UndoToastProvider } from '../components/UndoToast'
import { WorkspaceCommands } from '../components/WorkspaceCommands'
import { ArrangeOverlay } from './ArrangeOverlay'
import { CalmSurface } from './calm/CalmSurface'
import { useShellEscape, useWorkbenchCommands, useZenEscape } from './commands'
import { EditorArea } from './EditorArea'
import { FloatingFrame } from './FloatingFrame'
import { useFocusRing } from './focus'
import type { LayoutTree } from './layout-tree'
import { useWorkbench } from './state'

const FRAME =
  'mt-[var(--storage-banner-height,0px)] flex h-[calc(100dvh-var(--storage-banner-height,0px))] flex-col text-ink-1'

/** Surface = the center region; tabs are a capability, not a shell. */
function Surface({ tree, children }: { tree: LayoutTree; children: ReactNode }) {
  if (tree.surface.tabsEnabled) return <EditorArea>{children}</EditorArea>
  return <CalmSurface>{children}</CalmSurface>
}

/** Bare frame: no chrome, the surface owns the viewport (focus / zen). */
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
  // toggle that replaces the former zen `mode` and quiet posture.
  if (focus || mode === 'zen') {
    return (
      <UndoToastProvider>
        <ZenFrame tree={tree}>{children}</ZenFrame>
      </UndoToastProvider>
    )
  }

  return (
    <div className="relative h-full min-h-0">
      <FloatingFrame>{children}</FloatingFrame>
      {/* Arrange mode (0282): the shell as an editable schematic, on top. */}
      {arranging && <ArrangeOverlay />}
    </div>
  )
}
