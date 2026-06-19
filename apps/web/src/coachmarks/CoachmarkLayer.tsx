/**
 * CoachmarkLayer — mounts the first-run tip engine into the shell
 * (exploration 0206).
 *
 * Rendered once from the Workbench (covers desktop + mobile), it derives the
 * active view from the router, asks the engine for the one tip to show, waits
 * for that tip's anchor to exist, and portals a <Coachmark> next to it.
 *
 * Dormant until the user has finished first-run setup (`hasOnboarded()`), so
 * tips never pile on top of the welcome flow.
 */
import { useLocation } from '@tanstack/react-router'
import { hasOnboarded } from '../routes/welcome'
import { Coachmark } from './Coachmark'
import { useAnchorEl } from './useAnchorEl'
import { useCoachmarks } from './useCoachmarks'
import { viewIdForPath } from './views'
// Register the core seed tips at module load (side-effect import).
import './tips'

export function CoachmarkLayer() {
  const { pathname } = useLocation()
  const view = viewIdForPath(pathname)
  const { current, dismiss } = useCoachmarks(view, { enabled: hasOnboarded() })
  const anchor = useAnchorEl(current ? current.anchor : null)

  if (!current || !anchor) return null
  return <Coachmark tip={current} anchor={anchor} onDismiss={dismiss} />
}
