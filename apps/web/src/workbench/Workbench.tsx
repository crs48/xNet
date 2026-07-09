/**
 * Workbench — the single shell entry point (explorations 0166, 0280, 0284).
 *
 * One renderer for every posture: the desktop {@link ShellFrame} walks the
 * layout tree (regions → slots → views); phone-class widths get the
 * content-first {@link MobileShell}. The former quiet/calm/bench trichotomy
 * and its dual-renderer fork are gone (0284) — there is one composition, and
 * "focus" (hide chrome) is a store toggle, not a separate shell.
 */
import type { ReactNode } from 'react'
import { CoachmarkLayer } from '../coachmarks'
import { WinddownOverlay } from '../components/WinddownOverlay'
import { MobileShell } from './MobileShell'
import { ShellFrame } from './ShellFrame'
import { SlotAnnouncer } from './SlotAnnouncer'
import { useIsCompact } from './use-layout-mode'
import { registerBuiltinPanelViews } from './views/register'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'

registerBuiltinPanelViews()

export function Workbench({ children }: { children: ReactNode }) {
  const compact = useIsCompact()
  return (
    <>
      {compact ? <MobileShell>{children}</MobileShell> : <ShellFrame>{children}</ShellFrame>}
      {/* Workspace quick switcher + verbs (0280) — available in every shell. */}
      <WorkspaceSwitcher />
      {/* Slot-move announcements + landing flash + focus (0282). */}
      <SlotAnnouncer />
      {/* First-run coachmarks (0206) — portals to <body>, so position is moot. */}
      <CoachmarkLayer />
      {/* Opt-in "time well spent" wind-down (Charter §Calm, 0234); off by default. */}
      <WinddownOverlay />
    </>
  )
}
