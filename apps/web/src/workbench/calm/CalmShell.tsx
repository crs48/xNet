/**
 * CalmShell — the everyperson shell (exploration 0250).
 *
 * The Claude-desktop grammar: a slim ModeSwitch · a mode-dependent List · the
 * main Surface (the router outlet) · a contextual Canvas that opens only when
 * there's an artifact or inspector to show. No tab strip, no split groups, no
 * bottom tray, no status bar — the workbench's power is one toggle away
 * (`View: Switch layout`), not always on screen.
 *
 * It deliberately reuses the workbench's command/escape/focus wiring and its
 * `left`/`right` panel booleans (as List/Canvas) so ⌘B / ⌘\ / ⌘. all behave,
 * and every existing view renders unchanged in the Surface.
 */
import type { ReactNode } from 'react'
import { DemoBanner, useDemoMode } from '@xnetjs/react'
import { GlobalSearch } from '../../components/GlobalSearch'
import { UndoToastProvider } from '../../components/UndoToast'
import { WorkspaceCommands } from '../../components/WorkspaceCommands'
import { useWorkbenchCommands, useZenEscape } from '../commands'
import { useFocusRing } from '../focus'
import { useWorkbench } from '../state'
import { CalmSurface } from './CalmSurface'
import { Canvas } from './Canvas'
import { ListPane } from './ListPane'
import { ModeSwitch } from './ModeSwitch'

const CALM_FRAME =
  'mt-[var(--storage-banner-height,0px)] flex h-[calc(100dvh-var(--storage-banner-height,0px))] flex-col bg-surface-1 text-ink-1'

function CalmDemoBanner() {
  const { isDemo, limits } = useDemoMode()
  if (!isDemo || !limits) return null
  return <DemoBanner evictionHours={limits.evictionHours} />
}

export function CalmShell({ children }: { children: ReactNode }) {
  useWorkbenchCommands()
  useZenEscape()
  useFocusRing()

  const mode = useWorkbench((state) => state.mode)
  const calmMode = useWorkbench((state) => state.calmMode)
  const listOpen = useWorkbench((state) => state.left.open)
  const canvasOpen = useWorkbench((state) => state.right.open)

  // Focus (zen): chrome hidden, just the surface — same affordance as the
  // workbench, restored on exit.
  if (mode === 'zen') {
    return (
      <UndoToastProvider>
        <div className={`${CALM_FRAME} bg-surface-0`}>
          <WorkspaceCommands />
          <GlobalSearch />
          <div className="min-h-0 flex-1">
            <CalmSurface>{children}</CalmSurface>
          </div>
        </div>
      </UndoToastProvider>
    )
  }

  return (
    <UndoToastProvider>
      <div className={CALM_FRAME}>
        <WorkspaceCommands />
        <GlobalSearch />
        <CalmDemoBanner />

        <div className="flex min-h-0 flex-1">
          <ModeSwitch />
          {listOpen && <ListPane mode={calmMode} />}
          <CalmSurface>{children}</CalmSurface>
          {canvasOpen && <Canvas />}
        </div>
      </div>
    </UndoToastProvider>
  )
}
